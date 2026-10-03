"""Umbra's offline voice: Kokoro speech, installed on request, run in its own
process (speech_worker.py), spoken sentence by sentence while an answer is
still being written.

Linux: a small Python environment in Umbra's data folder holds the speech
engine (pip, once, with internet); the model files are downloaded and
checked. Clips are played by the backend (pw-play or paplay), like Umbra's
sounds. Windows: the engine ships inside the app; the window plays the clips.
"""
import hashlib
import json
import os
import queue
import re
import shutil
import subprocess
import sys
import threading
import time
import urllib.request

ENGINE = ["kokoro-onnx==0.4.7"]
FILES = {   # name: (url, size, sha256)
    "kokoro-v1.0.onnx": ("https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/kokoro-v1.0.onnx",
                         325532387, "7d5df8ecf7d4b1878015a32686053fd0eebe2bc377234608764cc0ef3636a6c5"),
    "voices-v1.0.bin": ("https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/voices-v1.0.bin",
                        28214398, "bca610b8308e8d99f32e6fe4197e7ec01679264efed0cac9140fe9c29f1fbf7d"),
}
DOWNLOAD_MB = round(sum(f[1] for f in FILES.values()) / 1e6)


def clean_for_speech(text):
    """What a listener should hear: no citations, markdown, links, code or
    stage symbols; the offer line read as a plain question."""
    t = re.sub(r"```.*?```", " ", str(text), flags=re.S)
    t = re.sub(r"`([^`]*)`", r"\1", t)
    t = re.sub(r"\[\d+(?:\s*[,–-]\s*\d+)*\]", "", t)                 # [1], [1, 5]
    t = re.sub(r"\[([^\]]+)\]\([^)]+\)", r"\1", t)                    # [text](url)
    t = re.sub(r"(?:\b(?:see|at|visit|on)\s+)?https?://\S+", "", t, flags=re.I)
    t = re.sub(r"^\s*NEXT:\s*", "", t, flags=re.M)
    t = re.sub(r"^\s*#{1,6}\s*", "", t, flags=re.M)
    t = re.sub(r"^\s*[-*•]\s+", "", t, flags=re.M)
    t = re.sub(r"[*_~>#|]", "", t)
    t = re.sub(r"[^\w\s.,;:!?'’\"“”()%°/&+-]", " ", t)                # glyphs and emoji
    t = re.sub(r"[ \t]+([.,;:!?])", r"\1", t)                         # "a minute ." → "a minute."
    t = re.sub(r"\s*\n\s*", "\n", t)
    return re.sub(r"[ \t]+", " ", t).strip()


def sentences(text):
    """Speakable pieces: sentences, short ones joined, long ones split at commas."""
    out, buf = [], ""
    for part in re.split(r"(?<=[.!?])\s+|\n+", clean_for_speech(text)):
        part = part.strip()
        if not part:
            continue
        buf = f"{buf} {part}".strip() if buf else part
        if len(buf) >= 28:
            while len(buf) > 320:
                cut = buf.rfind(",", 0, 300)
                cut = cut if cut > 80 else buf.rfind(" ", 0, 300)
                out.append(buf[:cut + 1].strip()); buf = buf[cut + 1:].strip()
            out.append(buf); buf = ""
    if buf:
        out.append(buf)
    return out


class Speech:
    def __init__(self, data_dir, cache_dir, settings, player, windows=False):
        self.dir = os.path.join(data_dir, "speech")
        self.cache = os.path.join(cache_dir, "speech-clips")
        self.settings = settings            # () -> dict of voice settings
        self.player = player                # (path, volume) -> command, or None (the window plays)
        self.windows = windows
        self.lock = threading.Lock()
        self.state = {"active": False, "phase": "", "done": 0, "total": 0, "error": ""}
        self.proc = None
        self.inproc = None                  # the engine loaded in this process (Windows build)
        self.answers = {}
        self.gen = 0                        # bumps on stop: older sentences are dropped
        self.todo = queue.Queue()
        self.ready = queue.Queue()
        self.pending = []                   # clips for the window to play (Windows)
        self.playing = None
        self.speaking = False
        threading.Thread(target=self._synth_loop, daemon=True).start()
        threading.Thread(target=self._play_loop, daemon=True).start()

    # ---------------------------------------------------------- install
    def _python(self):
        if self.windows or getattr(sys, "frozen", False):
            return None   # in-app engine (Windows build)
        return os.path.join(self.dir, "env", "bin", "python")

    def engine_ok(self):
        if self.windows:
            try:
                import kokoro_onnx  # noqa: F401
                return True
            except Exception:
                return False
        py = self._python()
        return bool(py and os.path.exists(py) and os.path.exists(os.path.join(self.dir, "env", ".engine-ok")))

    def files_ok(self):
        return all(os.path.exists(os.path.join(self.dir, n)) and os.path.getsize(os.path.join(self.dir, n)) == f[1] for n, f in FILES.items())

    def installed(self):
        return self.engine_ok() and self.files_ok()

    def status(self):
        s = self.settings()
        return {"installed": self.installed(), "install": dict(self.state), "downloadMB": DOWNLOAD_MB,
                "speaking": self.speaking or not self.todo.empty() or not self.ready.empty(),
                "windowPlays": self.player("", 1) is None, **s}

    def install(self):
        with self.lock:
            if self.state["active"]:
                return self.status()
            self.state = {"active": True, "phase": "engine", "done": 0, "total": 0, "error": ""}
        threading.Thread(target=self._install, daemon=True).start()
        return self.status()

    def _install(self):
        try:
            os.makedirs(self.dir, exist_ok=True)
            if not self.engine_ok():
                if self.windows:
                    raise RuntimeError("This copy of Umbra doesn't include the voice engine.")
                env = os.path.join(self.dir, "env")
                if not os.path.exists(self._python()):
                    subprocess.run([sys.executable, "-m", "venv", env], check=True, capture_output=True, timeout=300)
                r = subprocess.run([self._python(), "-m", "pip", "install", "--disable-pip-version-check", "-q", *ENGINE],
                                   capture_output=True, text=True, timeout=1800)
                if r.returncode:
                    raise RuntimeError("The voice engine couldn't be installed: " + (r.stderr.strip().splitlines() or ["no internet?"])[-1][:160])
                open(os.path.join(env, ".engine-ok"), "w").close()
            self.state.update(phase="model", total=sum(f[1] for f in FILES.values()), done=0)
            base = 0
            for name, (url, size, sha) in FILES.items():
                path = os.path.join(self.dir, name)
                if not (os.path.exists(path) and os.path.getsize(path) == size):
                    self._download(url, path, size, sha, base)
                base += size
                self.state["done"] = base
            self.state.update(active=False, phase="done")
            self.start()
        except Exception as exc:
            self.state.update(active=False, phase="error", error=str(exc)[:240])

    def _download(self, url, path, size, sha, base):
        part = path + ".part"
        have = os.path.getsize(part) if os.path.exists(part) else 0
        req = urllib.request.Request(url, headers={"Range": f"bytes={have}-"} if have else {})
        with urllib.request.urlopen(req, timeout=60) as r, open(part, "ab" if have and r.status == 206 else "wb") as f:
            if r.status != 206:
                have = 0
            while True:
                chunk = r.read(1 << 20)
                if not chunk:
                    break
                f.write(chunk)
                have += len(chunk)
                self.state["done"] = base + have
        h = hashlib.sha256()
        with open(part, "rb") as f:
            for chunk in iter(lambda: f.read(1 << 20), b""):
                h.update(chunk)
        if os.path.getsize(part) != size or h.hexdigest() != sha:
            os.remove(part)
            raise RuntimeError("The voice download was damaged. Please try again.")
        os.replace(part, path)

    def remove(self):
        self.stop()
        self._kill()
        shutil.rmtree(self.dir, ignore_errors=True)
        return self.status()

    # ----------------------------------------------------------- worker
    def start(self):
        if self.proc and self.proc.poll() is None or self.inproc:
            return True
        if not self.installed():
            return False
        if self._python() is None:   # no separate Python (Windows build): load it here
            try:
                import speech_worker
                self.inproc = speech_worker.Engine(os.path.join(self.dir, "kokoro-v1.0.onnx"), os.path.join(self.dir, "voices-v1.0.bin"))
                return True
            except Exception:
                return False
        model, voices = os.path.join(self.dir, "kokoro-v1.0.onnx"), os.path.join(self.dir, "voices-v1.0.bin")
        worker = os.path.join(os.path.dirname(os.path.abspath(__file__)), "speech_worker.py")
        cmd = [self._python() or sys.executable, worker, model, voices]
        try:
            self.proc = subprocess.Popen(cmd, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
                                         text=True, bufsize=1, **({"creationflags": 0x08000000} if self.windows else {}))
        except OSError:
            return False
        first = self.proc.stdout.readline()
        if '"ready"' not in first:
            self._kill()
            return False
        threading.Thread(target=self._read_loop, args=(self.proc,), daemon=True).start()
        return True

    def _kill(self):
        self.inproc = None
        p, self.proc = self.proc, None
        if p and p.poll() is None:
            try:
                p.kill()
            except OSError:
                pass

    def _read_loop(self, proc):
        for line in proc.stdout:
            try:
                msg = json.loads(line)
            except ValueError:
                continue
            ev = self.answers.get(msg.get("id"))
            if ev:
                ev[1].update(msg)
                ev[0].set()
        # The worker ended (or crashed): nobody waits for it any longer.
        for ev in list(self.answers.values()):
            ev[0].set()

    def _render(self, text, spec):
        """A clip for one sentence (cached: the same words in the same voice are made once)."""
        os.makedirs(self.cache, exist_ok=True)
        key = hashlib.sha1(json.dumps([text, spec], sort_keys=True).encode()).hexdigest()[:20]
        out = os.path.join(self.cache, key + ".wav")
        if os.path.exists(out):
            return out
        if not self.start():
            return None
        if self.inproc:
            try:
                self.inproc.render({"text": text, "out": out, **spec})
                return out
            except Exception:
                return None
        ev = (threading.Event(), {})
        self.answers[key] = ev
        try:
            self.proc.stdin.write(json.dumps({"id": key, "text": text, "out": out, **spec}) + "\n")
            self.proc.stdin.flush()
        except (OSError, AttributeError, ValueError):
            self._kill()
            return None
        ev[0].wait(60)
        self.answers.pop(key, None)
        if self.proc and self.proc.poll() is not None:
            self.proc = None   # it'll be started again for the next sentence
        self._trim()
        return out if ev[1].get("ok") and os.path.exists(out) else None

    def _trim(self):
        try:
            clips = sorted((os.path.join(self.cache, f) for f in os.listdir(self.cache) if f.endswith(".wav")), key=os.path.getmtime)
            for f in clips[:-300]:
                os.remove(f)
        except OSError:
            pass

    # ----------------------------------------------------------- speech
    def say(self, text, spec, new=True):
        """Queue speech. new: a fresh utterance (stops what was being said)."""
        if new:
            self.stop()
        gen = self.gen
        for s in sentences(text):
            self.todo.put((gen, s, spec))
        return gen

    def feed(self, piece, spec, gen):
        """Part of an answer as it streams in: whole sentences go to the queue."""
        if gen == self.gen:
            for s in sentences(piece):
                self.todo.put((gen, s, spec))

    def stop(self):
        self.gen += 1
        for q in (self.todo, self.ready):
            while not q.empty():
                try:
                    q.get_nowait()
                except queue.Empty:
                    break
        self.pending.clear()
        p = self.playing
        if p and p.poll() is None:
            try:
                p.terminate()
            except OSError:
                pass

    def _synth_loop(self):
        while True:
            gen, text, spec = self.todo.get()
            if gen != self.gen:
                continue
            self.speaking = True
            clip = self._render(text, spec)
            if clip and gen == self.gen:
                self.ready.put((gen, clip))
            if self.todo.empty() and self.ready.empty() and not self.playing:
                self.speaking = False

    def _play_loop(self):
        while True:
            gen, clip = self.ready.get()
            if gen != self.gen:
                continue
            vol = self.settings().get("voiceVolume", 0.85)
            cmd = self.player(clip, vol)
            if cmd is None:   # the window plays it
                self.pending.append({"gen": gen, "url": "/api/voice/clip?id=" + os.path.basename(clip)[:-4]})
                continue
            try:
                self.playing = subprocess.Popen(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
                self.playing.wait()
            except OSError:
                pass
            self.playing = None
            if self.todo.empty() and self.ready.empty():
                self.speaking = False

    def take_pending(self):
        out, self.pending = self.pending, []
        return [c for c in out if c["gen"] == self.gen]

    def clip_path(self, cid):
        if not re.fullmatch(r"[0-9a-f]{20}", cid or ""):
            return None
        p = os.path.join(self.cache, cid + ".wav")
        return p if os.path.exists(p) else None
