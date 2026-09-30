"""Render Umbra's original offline radio pieces. Build-time only: needs numpy.

Every melody is written here; no recordings or third-party audio are used. Output is
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
    elif kind == "bell":
        s = np.sin(2 * np.pi * freq * t) + .28 * np.sin(2 * np.pi * freq * 2.01 * t)
        s += .12 * np.sin(2 * np.pi * freq * 3.91 * t)
        s *= np.exp(-2.2 * t / max(.2, seconds))
    elif kind == "pluck":
        s = np.sin(2 * np.pi * freq * t) + .4 * np.sin(2 * np.pi * 2 * freq * t)
        s += .16 * np.sin(2 * np.pi * 3 * freq * t)
        s *= np.exp(-3.4 * t / max(.2, seconds))
    elif kind == "pad":
        s = .55 * np.sin(2 * np.pi * freq * t) + .25 * np.sin(2 * np.pi * freq * 1.003 * t)
        s += .08 * np.sin(2 * np.pi * freq * 2 * t)
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
    sec = 192; out = mix(sec); n = len(out); t = np.arange(n) / RATE
    breeze = noise(sec, 40); breeze /= max(.01, np.max(np.abs(breeze)))
    sway = .35 + .1 * np.sin(2 * np.pi * t / 17) + .05 * np.sin(2 * np.pi * t / 9)
    add(out, 0, breeze * sway, .5, -.2)
    leaves = noise(sec, 5); leaves /= max(.01, np.max(np.abs(leaves)))
    add(out, 0, leaves * (.14 + .04 * np.sin(2 * np.pi * t / 11)), .45, .35)
    # A slower brook and several sparse bird calls keep the scene moving
    # without making a short, obvious repeating pattern.
    brook = noise(sec, 12); brook /= max(.01, np.max(np.abs(brook)))
    add(out, 0, brook * (.11 + .035 * np.sin(2 * np.pi * t / 29)), .45, .65)
    p = 2.0
    while p < sec - 2:
        for chirp in range(int(rng.integers(1, 4))):
            add(out, p + chirp * float(rng.uniform(.18, .38)),
                bird(float(rng.uniform(.18, .63)), float(rng.uniform(950, 2300))),
                float(rng.uniform(.035, .085)), float(rng.uniform(-.85, .85)))
        p += float(rng.uniform(3, 9))
    score(out, 80, 64, [45, 52, 48, 50], FOREST_MOTIFS, "pluck", .038, "ambient")
    return out


def rain():
    sec = 640 / 3; out = mix(sec); n = len(out); t = np.arange(n) / RATE
    broad = noise(sec, 4); broad /= max(.01, np.max(np.abs(broad)))
    add(out, 0, broad * (.25 + .035 * np.sin(2 * np.pi * t / 19)), .7, -.25)
    patter = noise(sec); patter /= max(.01, np.max(np.abs(patter)))
    add(out, 0, patter * (.17 + .025 * np.sin(2 * np.pi * t / 13)), .65, .2)
    for p in rng.uniform(0, sec - .2, 1450):
        duration = float(rng.uniform(.025, .1)); drops = noise(duration, 3)
        drops *= np.exp(-np.linspace(0, 6, len(drops)))
        add(out, float(p), drops, float(rng.uniform(.015, .045)), float(rng.uniform(-1, 1)))
    for p in [17, 48, 79]:
        rumble = noise(4, 250); rumble /= max(.01, np.max(np.abs(rumble)))
        add(out, p, rumble * env(len(rumble), 1.5, 1.5), .1, -.35)
    score(out, 72, 64, [48, 43, 45, 41], RAIN_MOTIFS, "piano", .038, "ambient")
    return out


def hz(midi):
    return 440 * 2 ** ((midi - 69) / 12)


# Four authored phrases per station, 16 scale offsets each. Sections combine
# them in a different order; the accompaniment changes density and voicing.
FOREST_MOTIFS = [
    [0, 4, 7, 9, 7, 4, 2, 0, 4, 7, 12, 9, 7, 4, 2, 4],
    [7, 9, 12, 14, 12, 9, 7, 4, 2, 4, 7, 9, 7, 4, 2, 0],
    [4, 7, 9, 12, 9, 7, 4, 2, 0, 2, 4, 7, 9, 7, 4, 2],
    [12, 9, 7, 4, 7, 9, 4, 2, 0, 4, 7, 9, 12, 9, 7, 4],
]
RAIN_MOTIFS = [
    [0, 3, 7, 10, 7, 3, 0, -2, 0, 5, 7, 10, 7, 5, 3, 0],
    [5, 7, 10, 12, 10, 7, 5, 3, 0, 3, 5, 7, 5, 3, 0, -2],
    [7, 10, 12, 15, 12, 10, 7, 5, 3, 5, 7, 10, 7, 5, 3, 0],
    [3, 0, -2, 0, 3, 5, 7, 10, 12, 10, 7, 5, 3, 0, -2, 0],
]
JAZZ_MOTIFS = [
    [0, 4, 7, 11, 9, 7, 4, 2, 0, 2, 4, 7, 9, 7, 4, 2],
    [7, 9, 11, 14, 11, 9, 7, 4, 2, 4, 7, 9, 11, 9, 7, 4],
    [4, 7, 9, 11, 14, 11, 9, 7, 4, 2, 0, 2, 4, 7, 9, 11],
    [12, 11, 9, 7, 4, 7, 9, 11, 14, 11, 9, 7, 4, 2, 0, 4],
]
GRID_MOTIFS = [
    [0, 7, 12, 15, 12, 7, 3, 7, 0, 3, 7, 10, 12, 10, 7, 3],
    [12, 15, 19, 15, 12, 10, 7, 3, 0, 3, 7, 12, 15, 12, 10, 7],
    [7, 10, 12, 15, 19, 15, 12, 10, 7, 3, 0, 3, 7, 10, 12, 15],
    [15, 12, 10, 7, 12, 15, 19, 15, 12, 7, 3, 0, 3, 7, 10, 12],
]
EMBER_MOTIFS = [
    [0, 4, 7, 12, 9, 7, 4, 0, 2, 4, 7, 9, 7, 4, 2, 0],
    [7, 12, 14, 12, 9, 7, 4, 2, 4, 7, 9, 12, 9, 7, 4, 2],
    [0, 2, 4, 7, 12, 9, 7, 4, 2, 4, 7, 9, 12, 14, 12, 9],
    [12, 9, 7, 4, 2, 0, 2, 4, 7, 9, 12, 14, 12, 9, 7, 4],
]
LUNAR_MOTIFS = [
    [0, 2, 7, 9, 7, 2, 0, -3, 0, 5, 7, 9, 12, 9, 7, 5],
    [7, 9, 12, 14, 12, 9, 7, 5, 2, 5, 7, 9, 12, 9, 7, 2],
    [0, 5, 7, 12, 14, 12, 9, 7, 5, 7, 9, 12, 14, 17, 14, 12],
    [14, 12, 9, 7, 5, 2, 0, 2, 5, 7, 9, 12, 9, 7, 5, 2],
]


def score(out, bpm, bars, roots, motifs, instrument, level, style):
    beat = 60 / bpm
    sections = [0, 1, 2, 0, 3, 2, 1, 3, 0]
    for bar in range(bars):
        start = bar * 4 * beat
        section = min(8, bar // 8)
        root = roots[(bar // 4 + (1 if section in (3, 5) else 0)) % len(roots)]
        phrase = motifs[sections[section]]
        lift = 12 if section in (4, 6) and bar % 4 == 3 else 0
        density = .35 if section == 0 else .65 if section in (5, 8) else 1
        chord = [root, root + 7, root + 12, root + (16 if style != "electronic" else 15)]
        for i, note in enumerate(chord):
            at = start + (.08 if i % 2 else 0)
            add(out, at, tone(hz(note), 3.7 * beat, "pad" if style != "jazz" else "piano"),
                level * (.48 if style == "ambient" else .8) * density, -.35 + i * .23)
        if bar % 2 == 0 or style != "ambient":
            for b in range(4):
                note = root - 12 + [0, 7, 12, 7][b]
                if style == "ambient" and b % 2: continue
                add(out, start + b * beat, tone(hz(note), .88 * beat, "bass"),
                    level * (1.1 if style == "jazz" else .68) * density, -.25)
        for m in range(2):
            if section in (0, 8) and (bar + m) % 3: continue
            ix = (bar % 8) * 2 + m
            note = root + 12 + phrase[ix] + lift
            at = start + (0.5 if m == 0 else 2.25 + (bar % 2) * .15) * beat
            add(out, at, tone(hz(note), (1.4 if m == 0 else .9) * beat, instrument),
                level * (1.1 if section in (4, 6) else .9) * density, .25 if m == 0 else -.2)
        if style in ("jazz", "electronic", "acoustic"):
            for b in range(4):
                if style == "electronic":
                    dur=.25; tt=np.arange(round(dur*RATE))/RATE
                    f=95*np.exp(-13*tt)+48
                    kick=np.sin(2*np.pi*np.cumsum(f)/RATE)*np.exp(-17*tt)
                    add(out,start+b*beat,kick,.12*density)
                elif b in (1,3):
                    brush=noise(.16,8)*env(round(.16*RATE),.002,.13)
                    add(out,start+b*beat,brush,.018*density,.3)
                if style != "acoustic":
                    hat=noise(.07,3)*env(round(.07*RATE),.001,.05)
                    add(out,start+(b+.5)*beat,hat,.008*density,.55)


def jazz():
    bpm = 88; bars = 72; out = mix(bars * 4 * 60 / bpm)
    score(out, bpm, bars, [50, 55, 48, 53, 45, 50, 43, 48], JAZZ_MOTIFS, "piano", .058, "jazz")
    # Eight-bar solo passages answer the main melody with syncopated phrases.
    beat = 60 / bpm
    for bar in range(16, 64):
        if bar // 8 not in (2, 4, 7): continue
        root = [50, 55, 48, 53, 45, 50, 43, 48][(bar // 4) % 8]
        line = JAZZ_MOTIFS[(bar // 8) % 4]
        for i, offset in enumerate([.35, 1.2, 2.65, 3.4]):
            note = root + 24 + line[(bar * 3 + i) % 16]
            add(out, (bar * 4 + offset) * beat, tone(hz(note), .55 * beat, "piano"), .018, .55)
    return out


def grid():
    bpm = 100; bars = 72; out = mix(bars * 4 * 60 / bpm)
    score(out, bpm, bars, [45, 41, 48, 43], GRID_MOTIFS, "synth", .058, "electronic")
    beat = 60 / bpm
    for bar in range(bars):
        root = [45, 41, 48, 43][(bar // 4) % 4]
        if bar // 8 in (0, 5, 8): continue
        for step, iv in enumerate(([0, 7, 12, 7, 3, 7, 10, 7] if bar % 2 else [0, 3, 7, 12, 10, 7, 3, 7])):
            add(out, (bar * 4 + step * .5) * beat, tone(hz(root + 24 + iv), .32 * beat, "synth", 6), .023, -.35 if step % 2 else .35)
    return out


def ember():
    bpm = 84; bars = 64; out = mix(bars * 4 * 60 / bpm)
    score(out, bpm, bars, [50, 57, 53, 55], EMBER_MOTIFS, "pluck", .055, "acoustic")
    # A soft counterline enters late, then recedes for the outro.
    beat = 60 / bpm
    for bar in range(24, 56):
        root = [50, 57, 53, 55][(bar // 4) % 4]
        for step, note in enumerate([0, 7, 4, 9]):
            add(out, (bar * 4 + step) * beat, tone(hz(root + 24 + note), .75 * beat, "bell"), .014, .55)
    return out


def lunar():
    bpm = 72; bars = 64; out = mix(bars * 4 * 60 / bpm)
    score(out, bpm, bars, [41, 48, 45, 43], LUNAR_MOTIFS, "bell", .055, "ambient")
    beat = 60 / bpm
    for bar in range(8, 56):
        root = [41, 48, 45, 43][(bar // 4) % 4]
        if bar % 2: continue
        add(out, bar * 4 * beat, tone(hz(root + 19), 7.5 * beat, "pad"), .027, -.55)
    return out


def write(name, data):
    # Join the tail to the head across a short overlap. The file's last sample
    # then continues into its first sample, instead of jumping at the loop.
    fade = round(.7 * RATE)
    head, tail = data[:fade].copy(), data[-fade:].copy()
    data = data[:-fade].copy()
    blend = np.linspace(0, 1, fade, dtype=np.float32)[:, None]
    data[:fade] = tail * (1 - blend) + head * blend
    peak = max(.001, float(np.max(np.abs(data))))
    data = np.clip(data * (.72 / peak), -.9, .9)
    pcm = (data * 32767).astype('<i2').tobytes()
    path = ROOT / (name + '.wav')
    with wave.open(str(path), 'wb') as f:
        f.setnchannels(2); f.setsampwidth(2); f.setframerate(RATE); f.writeframes(pcm)
    print(name, path.stat().st_size, 'bytes')


for name, render in [('forest', forest), ('rain', rain), ('jazz', jazz), ('grid', grid), ('ember', ember), ('lunar', lunar)]:
    write(name, render())
