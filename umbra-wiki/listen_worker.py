"""Umbra's ears: offline speech to text with whisper.cpp (pywhispercpp),
in its own Python (the listening environment in Umbra's data folder) or
inside the app on Windows.

One JSON request per line on stdin: {"id": "…", "wav": "/path/clip.wav"};
one answer per line on stdout: {"id": "…", "ok": true, "text": "…"}.
"""
import json
import os
import sys
import wave

import numpy as np


def read_wav(path):
    """Mono 16 kHz float samples from a 16-bit WAV file (any rate or channel count)."""
    with wave.open(path) as w:
        sr, ch, n = w.getframerate(), w.getnchannels(), w.getnframes()
        x = np.frombuffer(w.readframes(n), dtype="<i2").astype(np.float32) / 32768
    if ch > 1:
        x = x.reshape(-1, ch).mean(axis=1)
    if sr != 16000 and len(x):
        x = np.interp(np.linspace(0, len(x) - 1, int(len(x) * 16000 / sr)), np.arange(len(x)), x).astype(np.float32)
    return x


class Engine:
    def __init__(self, model):
        from pywhispercpp.model import Model
        threads = max(1, min(8, (os.cpu_count() or 4) - 1))
        self.m = Model(model, n_threads=threads, print_progress=False, print_realtime=False, print_timestamps=False)

    def transcribe(self, path):
        x = read_wav(path)
        if len(x) < 16000 * 0.3 or float(np.max(np.abs(x)) if len(x) else 0) < 0.01:
            return ""   # too short or silent: nothing was said
        x = x / max(0.1, float(np.max(np.abs(x)))) * 0.9   # a quiet microphone still reads well
        text = " ".join(s.text.strip() for s in self.m.transcribe(x))
        # Whisper's notes for silence and noise are not words.
        import re
        text = re.sub(r"\[[^\]]*\]|\([^)]*\)|\*[^*]*\*", " ", text)
        return re.sub(r"\s+", " ", text).strip()


def main():
    engine = Engine(sys.argv[1])
    print(json.dumps({"ready": True}), flush=True)
    for line in sys.stdin:
        req = {}
        try:
            req = json.loads(line)
            print(json.dumps({"id": req.get("id"), "ok": True, "text": engine.transcribe(req["wav"])}), flush=True)
        except Exception as exc:
            print(json.dumps({"id": req.get("id"), "ok": False, "error": str(exc)[:200]}), flush=True)


if __name__ == "__main__":
    main()
