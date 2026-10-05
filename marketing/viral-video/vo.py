import json, soundfile as sf, numpy as np
from kokoro_onnx import Kokoro
k = Kokoro("kokoro.onnx", "voices.bin")
LINES = [
 "Here's what nobody tells you.",
 "The broke version of you...",
 "is the only version that isn't scared to lose.",
 "The second you have something,",
 "you start protecting it.",
 "You stop taking shots.",
 "So take them now.",
 "While losing costs you nothing.",
 "Because one day, losing a single day",
 "will cost you a million.",
 "And you'd better already know",
 "how to get back up.",
]
import sys
voice = sys.argv[1] if len(sys.argv) > 1 else "am_michael"
out, meta, t, sr = [], [], 0.0, 24000
for i, line in enumerate(LINES):
    s, sr = k.create(line, voice=voice, speed=0.95, lang="en-us")
    # trim leading/trailing silence
    a = np.abs(s); idx = np.where(a > 0.01)[0]
    s = s[max(idx[0]-240,0):idx[-1]+480]
    gap = 0.12 if line.endswith(",") or line.endswith("...") else 0.32
    if i in (0,): gap = 0.45
    if i == len(LINES)-1: gap = 0.2
    meta.append({"text": line, "start": t, "end": t + len(s)/sr})
    out.append(s); out.append(np.zeros(int(gap*sr), dtype=s.dtype))
    t += len(s)/sr + gap
sf.write(f"vo_{voice}.wav", np.concatenate(out), sr)
json.dump(meta, open(f"vo_{voice}.json","w"), indent=1)
print(voice, round(t,2))
