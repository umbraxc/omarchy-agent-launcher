#!/usr/bin/env python3
"""Generate the original short, low steam-piston cue for Control tools.

No samples or third-party recordings are used. The two soft pressure bursts
are filtered deterministic noise over a damped low-frequency piston sound.
"""
import math
import random
import struct
import subprocess
import tempfile
import wave
from pathlib import Path

RATE = 24000
DURATION = 0.32
RNG = random.Random(8713)
DEST = Path(__file__).with_name("toolchuff.ogg")


def burst(t, at, length):
    u = t - at
    if not 0 <= u < length:
        return 0.0
    attack = min(1.0, u * 190)
    release = (1 - u / length) ** 2
    return attack * release


samples = []
filtered = 0.0
for i in range(round(RATE * DURATION)):
    t = i / RATE
    white = RNG.random() * 2 - 1
    filtered += 0.17 * (white - filtered)
    steam = white - filtered
    value = 0.0
    for at, length, pitch, strength in ((0.0, 0.15, 95, 0.16), (0.125, 0.18, 82, 0.13)):
        u = t - at
        env = burst(t, at, length)
        if env:
            piston = math.sin(2 * math.pi * (pitch * u + 22 * u * u))
            value += strength * env * (0.78 * piston + 0.22 * math.sin(2 * math.pi * pitch * 1.9 * u))
            value += 0.085 * env * steam  # brief pressure release, no shrill ratchet
    samples.append(struct.pack("<h", int(max(-0.95, min(0.95, value)) * 32767)))

with tempfile.NamedTemporaryFile(suffix=".wav") as source:
    with wave.open(source.name, "wb") as out:
        out.setnchannels(1)
        out.setsampwidth(2)
        out.setframerate(RATE)
        out.writeframes(b"".join(samples))
    subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-i", source.name,
                    "-c:a", "libvorbis", "-q:a", "3", str(DEST)], check=True)
print(DEST)
