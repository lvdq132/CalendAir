"""Procedural score + SFX synced to the voiceover. usage: audio.py vo.json vo.wav out.wav"""
import json, sys
import numpy as np
import soundfile as sf

LINES = json.load(open(sys.argv[1]))
vo, vsr = sf.read(sys.argv[2])
SR = 48000
T = [l["start"] for l in LINES]
DUR = LINES[-1]["end"] + 0.55
CRASH = T[9] + 0.05
REW = T[6]
N = int(DUR * SR)
t = np.arange(N) / SR
rng = np.random.default_rng(3)


def env(a, b, fade=0.05):
    e = np.clip((t - a) / fade, 0, 1) * np.clip((b - t) / fade, 0, 1)
    return e


def lp(x, cutoff):
    a = np.exp(-2 * np.pi * cutoff / SR)
    y = np.empty_like(x)
    acc = 0.0
    for i in range(len(x)):  # one-pole, fine for this length via chunks below
        acc = (1 - a) * x[i] + a * acc
        y[i] = acc
    return y


def lp_fast(x, cutoff):
    # one-pole low-pass via scipy-free IIR using cumulative trick on blocks
    from numpy.lib.stride_tricks import sliding_window_view  # noqa
    a = np.exp(-2 * np.pi * cutoff / SR)
    k = int(5 / (1 - a)) + 1
    kern = (1 - a) * a ** np.arange(k)
    L = len(x) + k
    nf = 1 << (L - 1).bit_length()
    return np.fft.irfft(np.fft.rfft(x, nf) * np.fft.rfft(kern, nf), nf)[: len(x)]


def saw(f, phase=0.0):
    p = (t * f + phase) % 1.0
    return 2 * p - 1


def pad(freqs, a, b, gain, cutoff=900, fade=0.6):
    x = np.zeros(N)
    for f in freqs:
        for det in (-0.12, 0.0, 0.13):
            x += saw(f * 2 ** (det / 12), rng.random())
    x = lp_fast(x / (len(freqs) * 3), cutoff)
    lfo = 0.85 + 0.15 * np.sin(2 * np.pi * 0.25 * t)
    return x * lfo * env(a, b, fade) * gain


def hz(n):  # midi -> Hz
    return 440 * 2 ** ((n - 69) / 12)


mus = np.zeros(N)
# dark A-minor bed until the rewind
mus += pad([hz(45), hz(57), hz(60), hz(64)], 0, REW, 0.55, 700, 0.8)
mus += 0.35 * np.sin(2 * np.pi * hz(33) * t) * env(0, REW, 0.8)
# flatline section: thinner, colder
mus *= np.where((t > T[5]) & (t < REW), 0.55, 1.0)
# broke-but-swinging: F major-ish lift
mus += pad([hz(41), hz(53), hz(57), hz(60)], REW + 0.5, T[8], 0.5, 1100, 0.3)
# one day...: tension pad
mus += pad([hz(40), hz(52), hz(55), hz(59)], T[8], CRASH - 0.15, 0.5, 1300, 0.2)
# after crash: just sub drone + heartbeat
mus += 0.4 * np.sin(2 * np.pi * hz(33) * t) * env(CRASH + 0.4, T[10], 0.4)
# getting back up: C major, brighter
mus += pad([hz(48), hz(55), hz(60), hz(64), hz(67)], T[10], DUR, 0.6, 2200, 0.25)


def add(x, at, gain=1.0):
    i = int(at * SR)
    if i >= N:
        return
    j = min(N, i + len(x))
    mus[i:j] += x[: j - i] * gain


def tick(g=0.25):
    n = int(0.03 * SR)
    tt = np.arange(n) / SR
    return g * np.sin(2 * np.pi * 3200 * tt) * np.exp(-tt * 180)


def kick(g=0.9):
    n = int(0.35 * SR)
    tt = np.arange(n) / SR
    f = 50 + 110 * np.exp(-tt * 30)
    return g * np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-tt * 9)


def heartbeat():
    return np.concatenate([kick(0.7), np.zeros(int(0.02 * SR))])[: int(0.2 * SR)]


# clock ticks: opening and the flatline
for a, b in ((0, T[3]), (T[5], REW)):
    x = a
    while x < b:
        add(tick(), x)
        x += 0.5
# pulse on growth sections
bpm = 100
for a, b in ((T[3], T[5]), (REW + 0.55, T[8]), (T[10], DUR - 0.2)):
    x = a
    while x < b:
        add(kick(), x)
        x += 60 / bpm
# accelerating kicks into the crash
x, step = T[8], 0.5
while x < CRASH - 0.2:
    add(kick(0.8), x)
    x += step
    step = max(0.12, step * 0.86)
# heartbeat after the crash
x = CRASH + 0.7
while x < T[10]:
    add(heartbeat(), x)
    add(heartbeat(), x + 0.22)
    x += 0.9

# tape rewind
n = int(0.6 * SR)
tt = np.arange(n) / SR
f = 1800 * np.exp(-tt * 3) + 200
rew = 0.25 * np.sign(np.sin(2 * np.pi * np.cumsum(f * (1 + 0.3 * np.sin(2 * np.pi * 23 * tt))) / SR))
rew = lp_fast(rew, 3000) + 0.08 * rng.normal(0, 1, n)
add(rew * np.minimum(1, (0.6 - tt) * 10), REW - 0.02)

# riser into the crash
a = T[8]
n = int((CRASH - 0.12 - a) * SR)
tt = np.arange(n) / SR
p = tt / tt[-1]
noise = rng.normal(0, 1, n)
riser = (1 - p ** 2) * lp_fast(noise, 600) + p ** 2 * lp_fast(noise, 8000) - lp_fast(noise, 150)  # opening up
riser = 0.18 * riser * p ** 2 + 0.12 * np.sin(2 * np.pi * np.cumsum(150 + 1100 * p ** 2) / SR) * p ** 1.5
add(riser, a)
# silence gap right before impact
mus *= np.where((t > CRASH - 0.12) & (t < CRASH), 0.0, 1.0)

# impact
n = int(2.2 * SR)
tt = np.arange(n) / SR
boom = np.sin(2 * np.pi * np.cumsum(32 + 90 * np.exp(-tt * 8)) / SR) * np.exp(-tt * 1.6)
boom = np.tanh(2.5 * boom) * 0.9
crack = lp_fast(rng.normal(0, 1, n), 2500) * np.exp(-tt * 7) * 0.7
add(boom + crack, CRASH)

# final swell
n = int(1.2 * SR)
tt = np.arange(n) / SR
sw = lp_fast(rng.normal(0, 1, n), 5000) * (tt / tt[-1]) ** 3 * 0.12
add(sw, DUR - 1.2)

# --- mix ---
if vsr != SR:
    idx = np.arange(int(len(vo) * SR / vsr)) * vsr / SR
    vo = np.interp(idx, np.arange(len(vo)), vo)
voice = np.zeros(N)
voice[: min(N, len(vo))] = vo[:N]
voice /= np.max(np.abs(voice)) + 1e-9
mus /= np.max(np.abs(mus)) + 1e-9
# duck music under the voice
vel = lp_fast(np.abs(voice), 8)
vel /= vel.max()
duck = 1 - 0.45 * np.clip(vel * 4, 0, 1)
mix = 0.95 * voice + 0.42 * mus * duck
mix /= np.max(np.abs(mix)) + 1e-9
mix *= 0.95
sf.write(sys.argv[3], np.stack([mix, mix], 1), SR)
print("audio", round(DUR, 2))
