"""Umbra's ears: offline voice input on every system. whisper.cpp (the
same Whisper base.en model voxtype uses), installed on request: on Linux a
small Python environment in Umbra's data folder, on Windows inside the app.
Recording: PipeWire's pw-record on Linux, PortAudio (sounddevice) on Windows.
"""
import hashlib
import json
import os
import secrets
import subprocess
import sys
import threading
import urllib.request
import wave

ENGINE = ["pywhispercpp==1.5.1"]
MODEL = ("ggml-base.en-q5_1.bin", "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.en-q5_1.bin",
         59721011, "4baf70dd0d7c4247ba2b81fafd9c01005ac77c2f9ef064e00dcf195d0e2fdd2f")
DOWNLOAD_MB = 60


class Listen:
    def __init__(self, data_dir, windows=False):
        self.dir = os.path.join(data_dir, "listen")
        self.windows = windows
        self.state = {"active": False, "phase": "", "done": 0, "total": 0, "error": ""}
        self.proc = None
        self.inproc = None
        self.lock = threading.Lock()
        self.rec = None           # a recording in progress (Windows)

    # ---------------------------------------------------------- install
    def _python(self):
        if self.windows or getattr(sys, "frozen", False):
            return None
        return os.path.join(self.dir, "env", "bin", "python")

    def engine_ok(self):
        if self._python() is None:
            try:
                import pywhispercpp  # noqa: F401
                return True
            except Exception:
                return False
        return os.path.exists(os.path.join(self.dir, "env", ".engine-ok"))

    def model_path(self):
        return os.path.join(self.dir, MODEL[0])

    def installed(self):
        p = self.model_path()
        return self.engine_ok() and os.path.exists(p) and os.path.getsize(p) == MODEL[2]

    def status(self):
        return {"installed": self.installed(), "install": dict(self.state), "downloadMB": DOWNLOAD_MB}

    def install(self):
        if self.state["active"]:
            return self.status()
        self.state = {"active": True, "phase": "engine", "done": 0, "total": 0, "error": ""}
        threading.Thread(target=self._install, daemon=True).start()
        return self.status()

    def _install(self):
        try:
            os.makedirs(self.dir, exist_ok=True)
            if not self.engine_ok():
                if self._python() is None:
                    raise RuntimeError("This copy of Umbra doesn't include the listening engine.")
                env = os.path.join(self.dir, "env")
                if not os.path.exists(self._python()):
                    subprocess.run([sys.executable, "-m", "venv", env], check=True, capture_output=True, timeout=300)
                r = subprocess.run([self._python(), "-m", "pip", "install", "--disable-pip-version-check", "-q", *ENGINE],
                                   capture_output=True, text=True, timeout=1800)
                if r.returncode:
                    raise RuntimeError("Voice input couldn't be installed: " + (r.stderr.strip().splitlines() or ["no internet?"])[-1][:160])
                open(os.path.join(env, ".engine-ok"), "w").close()
            name, url, size, sha = MODEL
            path = self.model_path()
            if not (os.path.exists(path) and os.path.getsize(path) == size):
                self.state.update(phase="model", total=size, done=0)
                part = path + ".part"
                with urllib.request.urlopen(url, timeout=60) as r, open(part, "wb") as f:
                    while True:
                        chunk = r.read(1 << 20)
                        if not chunk:
                            break
                        f.write(chunk)
                        self.state["done"] += len(chunk)
                h = hashlib.sha256(open(part, "rb").read()).hexdigest()
                if os.path.getsize(part) != size or h != sha:
                    os.remove(part)
                    raise RuntimeError("The download was damaged. Please try again.")
                os.replace(part, path)
            self.state.update(active=False, phase="done")
        except Exception as exc:
            self.state.update(active=False, phase="error", error=str(exc)[:240])

    def remove(self):
        self._kill()
        import shutil
        shutil.rmtree(self.dir, ignore_errors=True)
        return self.status()

    # ----------------------------------------------------------- worker
    def _start(self):
        if self.inproc or (self.proc and self.proc.poll() is None):
            return True
        if not self.installed():
            return False
        if self._python() is None:
            try:
                import listen_worker
                self.inproc = listen_worker.Engine(self.model_path())
                return True
            except Exception:
                return False
        worker = os.path.join(os.path.dirname(os.path.abspath(__file__)), "listen_worker.py")
        try:
            self.proc = subprocess.Popen([self._python(), worker, self.model_path()], stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                                         stderr=subprocess.DEVNULL, text=True, bufsize=1)
        except OSError:
            return False
        if '"ready"' not in self.proc.stdout.readline():
            self._kill()
            return False
        return True

    def _kill(self):
        self.inproc = None
        p, self.proc = self.proc, None
        if p and p.poll() is None:
            try:
                p.kill()
            except OSError:
                pass

    def warm(self):
        """Load the model in the background, so the first words come back quickly."""
        threading.Thread(target=lambda: self.installed() and self._start(), daemon=True).start()

    def transcribe(self, wav):
        with self.lock:
            if not self._start():
                return ""
            if self.inproc:
                try:
                    return self.inproc.transcribe(wav)
                except Exception:
                    return ""
            try:
                rid = secrets.token_hex(4)
                self.proc.stdin.write(json.dumps({"id": rid, "wav": wav}) + "\n")
                self.proc.stdin.flush()
                ans = json.loads(self.proc.stdout.readline() or "{}")
                return ans.get("text", "") if ans.get("ok") else ""
            except (OSError, ValueError):
                self._kill()
                return ""

    # -------------------------------------------- recording on Windows
    def record_start(self, device=None):
        import sounddevice as sd
        frames = []
        stream = sd.InputStream(samplerate=16000, channels=1, dtype="int16", device=device,
                                callback=lambda data, n, t, status: frames.append(bytes(data)))
        stream.start()
        self.rec = (stream, frames)

    def recording(self):
        return self.rec is not None

    def record_stop(self, path):
        if not self.rec:
            return False
        stream, frames = self.rec
        self.rec = None
        try:
            stream.stop(); stream.close()
        except Exception:
            pass
        with wave.open(path, "wb") as w:
            w.setnchannels(1); w.setsampwidth(2); w.setframerate(16000)
            w.writeframes(b"".join(frames))
        return True
