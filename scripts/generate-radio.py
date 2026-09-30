"""Render Umbra's original offline radio loops. Build-time only: needs numpy.

No recordings, samples, melodies, or third-party audio are used. Output is
stereo 22.05 kHz PCM WAV so the Linux backend can loop it without a decoder.
"""
from pathlib import Path
import wave
import numpy as np

RATE = 22050
ROOT = Path(__file__).resolve().parents[1] / "umbra-wiki" / "sounds" / "radio"
ROOT.mkdir(parents=True, exist_ok=True)
rng = np.random.default_rng(77031)


def mix(seconds):
    return np.zeros((round(seconds * RATE), 2), dtype=np.float32)


def add(out, start, signal, gain=1, pan=0):
    at = round(start * RATE)
    if at < 0:
        signal = signal[-at:]
        at = 0
    count = min(len(signal), len(out) - at)
    if count <= 0:
        return
    l, r = np.sqrt((1 - pan) / 2), np.sqrt((1 + pan) / 2)
    out[at:at + count, 0] += signal[:count] * gain * l
    out[at:at + count, 1] += signal[:count] * gain * r


def env(n, attack=.02, release=.25):
    e = np.ones(n, dtype=np.float32)
    a = min(n, round(attack * RATE)); z = min(n, round(release * RATE))
    if a: e[:a] = np.linspace(0, 1, a)
    if z: e[-z:] *= np.linspace(1, 0, z)
    return e


def tone(freq, seconds, kind="soft", decay=0):
    n = round(seconds * RATE); t = np.arange(n, dtype=np.float32) / RATE
    if kind == "piano":
        s = (np.sin(2 * np.pi * freq * t) + .37 * np.sin(2 * np.pi * 2 * freq * t)
             + .13 * np.sin(2 * np.pi * 3 * freq * t)) * np.exp(-2.7 * t / max(.15, seconds))
    elif kind == "bass":
        s = np.sin(2 * np.pi * freq * t) + .22 * np.sin(2 * np.pi * 2 * freq * t)
        s *= np.exp(-1.8 * t / max(.15, seconds))
    elif kind == "synth":
        s = .62 * np.sin(2 * np.pi * freq * t) + .22 * np.sin(2 * np.pi * freq * 1.005 * t)
        s += .16 * np.sin(2 * np.pi * 2 * freq * t)
    else:
        s = np.sin(2 * np.pi * freq * t) * (1 + .12 * np.sin(2 * np.pi * .17 * t))
    if decay: s *= np.exp(-decay * t)
    return (s * env(n, min(.12, seconds / 5), min(.5, seconds / 4))).astype(np.float32)


def noise(seconds, low=0):
    n = round(seconds * RATE); x = rng.standard_normal(n).astype(np.float32)
    if low:
        # A short moving average is a soft, natural low-pass filter.
        x = np.convolve(x, np.ones(low, dtype=np.float32) / low, mode="same")
    return x


def bird(seconds, base):
    n = round(seconds * RATE); t = np.arange(n, dtype=np.float32) / RATE
    f = base + 650 * np.sin(np.pi * t / seconds) + 170 * np.sin(2 * np.pi * 8 * t)
    phase = 2 * np.pi * np.cumsum(f) / RATE
    trill = .55 + .45 * np.sin(2 * np.pi * 12 * t) ** 2
    return np.sin(phase) * trill * env(n, .04, .12)


def forest():
    sec = 48; out = mix(sec); n = len(out); t = np.arange(n) / RATE
    breeze = noise(sec, 40); breeze /= max(.01, np.max(np.abs(breeze)))
    sway = .35 + .1 * np.sin(2 * np.pi * t / 17) + .05 * np.sin(2 * np.pi * t / 9)
    add(out, 0, breeze * sway, .5, -.2)
    leaves = noise(sec, 5); leaves /= max(.01, np.max(np.abs(leaves)))
    add(out, 0, leaves * (.14 + .04 * np.sin(2 * np.pi * t / 11)), .45, .35)
    for start in np.arange(1.8, sec - 1, 2.8):
        p = float(start + rng.uniform(-.8, .8))
        add(out, p, bird(float(rng.uniform(.3, .65)), float(rng.uniform(1000, 1900))), .10, float(rng.uniform(-.85, .85)))
    return out


def rain():
    sec = 44; out = mix(sec); n = len(out); t = np.arange(n) / RATE
    broad = noise(sec, 4); broad /= max(.01, np.max(np.abs(broad)))
    add(out, 0, broad * (.25 + .035 * np.sin(2 * np.pi * t / 19)), .7, -.25)
    patter = noise(sec); patter /= max(.01, np.max(np.abs(patter)))
    add(out, 0, patter * (.17 + .025 * np.sin(2 * np.pi * t / 13)), .65, .2)
    for p in rng.uniform(0, sec - .2, 650):
        duration = float(rng.uniform(.025, .1)); drops = noise(duration, 3)
        drops *= np.exp(-np.linspace(0, 6, len(drops)))
        add(out, float(p), drops, float(rng.uniform(.015, .045)), float(rng.uniform(-1, 1)))
    for p in [13, 35]:
        rumble = noise(4, 250); rumble /= max(.01, np.max(np.abs(rumble)))
        add(out, p, rumble * env(len(rumble), 1.5, 1.5), .1, -.35)
    return out


def hz(midi):
    return 440 * 2 ** ((midi - 69) / 12)


def jazz():
    bpm = 90; beat = 60 / bpm; sec = 64 * beat; out = mix(sec)
    # Original small-combo progression. Gentle electric-piano voicings,
    # walking bass and brush taps; no sampled jazz recording or melody.
    chords = [(50, [57, 60, 64, 69]), (55, [59, 62, 65, 69]),
              (48, [55, 59, 64, 69]), (53, [57, 60, 64, 69]),
              (50, [57, 60, 64, 69]), (55, [59, 62, 65, 69]),
              (48, [55, 59, 64, 67]), (48, [55, 59, 64, 69])]
    for bar in range(16):
        root, notes = chords[bar % len(chords)]; start = bar * 4 * beat
        for ix in [0, 2.5]:
            for note in notes:
                add(out, start + ix * beat, tone(hz(note), 1.75 * beat, "piano"), .033, (-.45 if ix == 0 else .3))
        for b in range(4):
            bass_note = root - 12 + [0, 7, 10, 7][b]
            add(out, start + b * beat, tone(hz(bass_note), .88 * beat, "bass"), .1, -.25)
            hiss = noise(.12, 3) * env(round(.12 * RATE), .002, .09)
            add(out, start + b * beat, hiss, .014, .55)
            if b in (1, 3):
                brush = noise(.18, 8) * env(round(.18 * RATE), .002, .14)
                add(out, start + b * beat, brush, .038, .3)
            add(out, start + (b + .5) * beat, noise(.06, 3) * env(round(.06 * RATE), .002, .04), .011, .55)
    return out


def grid():
    bpm = 100; beat = 60 / bpm; sec = 64 * beat; out = mix(sec)
    # Original restrained electronic pulse: low drones, gated notes and a
    # steady beat. It evokes a digital atmosphere without copying a score.
    roots = [45, 41, 48, 43]
    for bar in range(16):
        start = bar * 4 * beat; root = roots[(bar // 4) % 4]
        for note in [root, root + 7, root + 12]:
            add(out, start, tone(hz(note), 4 * beat, "synth"), .046, -.15 if note == root else .25)
        for step in range(8):
            note = root + [0, 7, 12, 7, 3, 7, 10, 7][step]
            add(out, start + step * beat / 2, tone(hz(note + 12), beat * .36, "synth", 6), .035, (-.35 if step % 2 else .35))
        for b in range(4):
            dur = .3; t = np.arange(round(dur * RATE)) / RATE
            f = 90 * np.exp(-12 * t) + 48
            kick = np.sin(2 * np.pi * np.cumsum(f) / RATE) * np.exp(-18 * t)
            add(out, start + b * beat, kick, .19, 0)
            hat = noise(.08) * env(round(.08 * RATE), .001, .065)
            add(out, start + (b + .5) * beat, hat, .018, .5)
    return out


def write(name, data):
    # Blend the end into the beginning so a repeated file has no edge click.
    fade = round(.7 * RATE)
    data[:fade] = data[:fade] * np.linspace(0, 1, fade)[:, None] + data[-fade:] * np.linspace(1, 0, fade)[:, None]
    peak = max(.001, float(np.max(np.abs(data))))
    data = np.clip(data * (.72 / peak), -.9, .9)
    pcm = (data * 32767).astype('<i2').tobytes()
    path = ROOT / (name + '.wav')
    with wave.open(str(path), 'wb') as f:
        f.setnchannels(2); f.setsampwidth(2); f.setframerate(RATE); f.writeframes(pcm)
    print(name, path.stat().st_size, 'bytes')


for name, render in [('forest', forest), ('rain', rain), ('jazz', jazz), ('grid', grid)]:
    write(name, render())
