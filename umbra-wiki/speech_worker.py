"""Umbra's voice worker: turns sentences into speech with Kokoro, offline.

Runs in its own Python (the voice environment in Umbra's data folder, or
inside the app on Windows), so the main app never loads the speech model.
One JSON request per line on stdin, one JSON answer per line on stdout:

  {"id": "…", "text": "…", "mix": [["af_heart", 1.0]], "speed": 1.0,
   "pitch": 1.0, "fx": "", "out": "/path/clip.wav"}
  → {"id": "…", "ok": true, "seconds": 2.4}

A voice is a blend of Kokoro's voices; pitch is applied by playing the clip
faster or slower (and speaking slower or faster to keep the pace); fx adds a
character: "radio" (a band-limited transmitter), "robot" (a metallic ring)
or "hall" (a soft echo).
"""
import json
import os
import sys
import wave

import numpy as np


def bandpass(x, sr, lo, hi):
    spec = np.fft.rfft(x)
    f = np.fft.rfftfreq(len(x), 1 / sr)
    spec[(f < lo) | (f > hi)] *= 0.04
    return np.fft.irfft(spec, n=len(x))


def effect(x, sr, fx):
    if fx == "radio":
        x = bandpass(x, sr, 320, 3200)
        x = np.tanh(x * 2.2) / np.tanh(2.2)                       # a little drive
        x = x + np.random.default_rng(7).normal(0, 0.006, len(x))  # a breath of static
    elif fx == "robot":
        t = np.arange(len(x)) / sr
        x = 0.55 * x + 0.45 * x * np.sin(2 * np.pi * 52 * t)       # ring modulation
        x = np.round(x * 48) / 48                                   # a touch of grit
    elif fx == "warm":   # softer highs, a fuller low end: close and kind
        spec = np.fft.rfft(x); f = np.fft.rfftfreq(len(x), 1 / sr)
        spec *= np.where(f > 4500, 0.55, 1.0) * np.where(f < 320, 1.18, 1.0)
        x = np.fft.irfft(spec, n=len(x))
    elif fx == "bright":   # presence: energetic and forward
        spec = np.fft.rfft(x); f = np.fft.rfftfreq(len(x), 1 / sr)
        spec *= np.where((f > 2000) & (f < 6000), 1.3, 1.0)
        x = np.fft.irfft(spec, n=len(x))
    elif fx == "hall":
        out = x.copy()
        for delay, gain in ((0.09, 0.22), (0.17, 0.12), (0.29, 0.06)):
            d = int(sr * delay)
            out[d:] += x[:-d] * gain
        x = out
    return x


class Engine:
    """Kokoro, loaded once; render() makes one clip."""
    def __init__(self, model, voices):
        from kokoro_onnx import Kokoro
        config = None
        try:
            # The phoneme library can't read its data from a long folder path
            # (over about 150 characters, links resolved): it then gets a copy
            # next to the model, which has a short path.
            import espeakng_loader
            from kokoro_onnx.config import EspeakConfig
            data = espeakng_loader.get_data_path()
            if len(data) > 140:
                import shutil
                short = os.path.join(os.path.dirname(os.path.abspath(model)), "espeak-ng-data")
                if not os.path.exists(os.path.join(short, "phontab")):
                    shutil.copytree(data, short, dirs_exist_ok=True)
                if len(short) <= 140:
                    config = EspeakConfig(lib_path=espeakng_loader.get_library_path(), data_path=short)
        except Exception:
            config = None
        self.k = Kokoro(model, voices, espeak_config=config) if config else Kokoro(model, voices)
        self.styles = {}

    def style(self, name):
        if name not in self.styles:
            self.styles[name] = self.k.get_voice_style(name)
        return self.styles[name]

    def render(self, req):
        mix = [(n, float(w)) for n, w in req.get("mix") or [["af_heart", 1.0]]]
        total = sum(w for _, w in mix) or 1.0
        voice = sum(self.style(n) * (w / total) for n, w in mix)
        # A voice with feeling moves: each sentence a little higher or lower,
        # a little quicker or slower (the same sentence always the same way).
        import zlib
        vary = min(0.12, max(0.0, float(req.get("vary", 0.0))))
        r = (zlib.crc32(str(req["text"]).encode()) % 2001) / 1000 - 1
        pitch = min(1.25, max(0.8, float(req.get("pitch", 1.0)) * (1 + vary * r)))
        speed = min(1.5, max(0.6, float(req.get("speed", 1.0)) * (1 - vary * 0.6 * r))) / pitch
        samples, sr = self.k.create(str(req["text"])[:600], voice=voice, speed=speed, lang="en-us")
        x = np.asarray(samples, dtype=np.float64)
        x = effect(x, sr, req.get("fx") or "")
        peak = np.max(np.abs(x)) or 1.0
        x = np.clip(x / max(peak, 0.85) * 0.92, -1, 1)
        pause = min(1.2, max(0.0, float(req.get("pause", 0.0))))   # a breath after the sentence
        if pause:
            x = np.concatenate([x, np.zeros(int(sr * pause))])
        pcm = (x * 32767).astype("<i2").tobytes()
        out = req["out"]
        tmp = out + ".part"
        with wave.open(tmp, "wb") as w:
            w.setnchannels(1)
            w.setsampwidth(2)
            w.setframerate(int(round(sr * pitch)))
            w.writeframes(pcm)
        os.replace(tmp, out)
        return round(len(x) / (sr * pitch), 2)


def main():
    engine = Engine(sys.argv[1], sys.argv[2])
    print(json.dumps({"ready": True}), flush=True)
    for line in sys.stdin:
        try:
            req = json.loads(line)
        except ValueError:
            continue
        rid = req.get("id", "")
        try:
            print(json.dumps({"id": rid, "ok": True, "seconds": engine.render(req)}), flush=True)
        except Exception as exc:   # one bad sentence never stops the voice
            print(json.dumps({"id": rid, "ok": False, "error": str(exc)[:200]}), flush=True)


if __name__ == "__main__":
    main()
