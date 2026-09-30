#!/usr/bin/env python3
"""Generate Umbra's original 0.42 s mechanical tool-bar transition sound.

The sound is synthesized locally from damped tones and deterministic noise;
there are no sampled or third-party recordings in toolshift.ogg.
"""
import math
import random
import struct
import subprocess
import tempfile
import wave
from pathlib import Path

RATE = 24000
DURATION = 0.42
RNG = random.Random(8713)
DEST = Path(__file__).with_name("toolshift.ogg")


def pulse(t, at, length, frequency, decay, noise=0):
    u = t - at
    if not 0 <= u < length:
        return 0.0
    envelope = math.exp(-decay * u) * min(1.0, u * 900)
    tone = math.sin(2 * math.pi * frequency * u) + 0.38 * math.sin(2 * math.pi * frequency * 2.71 * u)
    return envelope * (tone + noise * (RNG.random() * 2 - 1))


samples = []
for i in range(round(RATE * DURATION)):
    t = i / RATE
    # Three ratchet teeth, followed by a low metal latch settling into place.
    value = (0.18 * pulse(t, 0.0, 0.095, 920, 31, 0.8)
             + 0.17 * pulse(t, 0.072, 0.095, 790, 31, 0.75)
             + 0.16 * pulse(t, 0.144, 0.105, 670, 29, 0.7)
             + 0.25 * pulse(t, 0.218, 0.20, 310, 15, 0.35)
             + 0.085 * pulse(t, 0.22, 0.20, 1040, 19, 0.1))
    samples.append(struct.pack("<h", int(max(-0.98, min(0.98, value)) * 32767)))
with tempfile.NamedTemporaryFile(suffix=".wav") as source:
    with wave.open(source.name, "wb") as out:
        out.setnchannels(1)
        out.setsampwidth(2)
        out.setframerate(RATE)
        out.writeframes(b"".join(samples))
    subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-i", source.name,
                    "-c:a", "libvorbis", "-q:a", "3", str(DEST)], check=True)
print(DEST)
