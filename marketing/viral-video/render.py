"""THE MILLION DOLLAR DAY — procedural 9:16 short.

Renders frames with Pillow/numpy, synced to the voiceover timing JSON.
usage: python3 render.py <vo.json> <outdir>
"""
import json, math, os, sys
from multiprocessing import Pool

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
W, H, FPS = 1080, 1920, 30
F_MONT = f"{HERE}/fonts/Montserrat%5Bwght%5D.ttf"
F_INTER = f"{HERE}/fonts/Inter%5Bopsz,wght%5D.ttf"
F_MONO = f"{HERE}/fonts/JetBrainsMono.ttf"
F_EMOJI = "/usr/share/fonts/truetype/noto/NotoColorEmoji.ttf"

LINES = json.load(open(sys.argv[1]))
OUT = sys.argv[2]
T = [l["start"] for l in LINES]
DUR = LINES[-1]["end"] + 0.55
NFRAMES = int(math.ceil(DUR * FPS))

GREEN = (0, 230, 118)
RED = (255, 59, 59)
GREY = (138, 146, 160)
WHITE = (245, 247, 250)
YELLOW = (255, 212, 0)

_fonts = {}


def font(path, size, wght=None, opsz=None):
    key = (path, size, wght, opsz)
    if key not in _fonts:
        f = ImageFont.truetype(path, size)
        if wght is not None:
            vals = []
            for a in f.get_variation_axes():
                n = a["name"].decode() if isinstance(a["name"], bytes) else a["name"]
                v = (opsz or 32) if n.startswith("Optical") else wght
                vals.append(min(max(v, a["minimum"]), a["maximum"]))
            f.set_variation_by_axes(vals)
        _fonts[key] = f
    return _fonts[key]


# ----------------------------------------------------------------------------
# Story: the value series (ordinary arithmetic, deterministic noise)
# ----------------------------------------------------------------------------
SR = 60
ts = np.arange(0, DUR + 1, 1 / SR)
rng = np.random.default_rng(7)
walk = np.cumsum(rng.normal(0, 1, len(ts) + 400))
walk = (walk - np.convolve(walk, np.ones(90) / 90, mode="same"))[200:200 + len(ts)]  # high-passed wiggle
fine = rng.normal(0, 1, len(ts))


def smooth(x):
    x = min(max(x, 0.0), 1.0)
    return x * x * (3 - 2 * x)


CRASH_T = T[9] + 0.05      # "will cost you a million"
REWIND_T = T[6]            # "So take them now"
PEAK = 1_000_000.0


def value_at(i):
    t = ts[i]
    w, n = walk[i], fine[i]
    if t < T[3]:  # broke: nothing to lose
        return max(0.0, 18 + 9 * w + 2 * n)
    if t < T[5]:  # growing to a million
        p = smooth((t - T[3]) / (T[5] - 0.25 - T[3]))
        base = 20 + (PEAK - 20) * (p ** 2.2)
        return base * (1 + 0.004 * w)
    if t < REWIND_T:  # playing safe: dead flat
        return PEAK
    if t < REWIND_T + 0.55:  # rewind back to zero
        p = smooth((t - REWIND_T) / 0.55)
        return PEAK * (1 - p) + 25 * p
    if t < T[8]:  # broke again, but swinging hard
        p = (t - REWIND_T - 0.55) / (T[8] - REWIND_T - 0.55)
        return max(0.0, 25 + 1400 * p + 260 * w + 40 * n)
    if t < CRASH_T:  # one day... built back to a million
        p = smooth((t - T[8]) / (CRASH_T - 0.2 - T[8]))
        base = 1500 + (PEAK - 1500) * (p ** 1.8)
        return base * (1 + 0.006 * w)
    if t < CRASH_T + 0.4:  # the crash
        p = smooth((t - CRASH_T) / 0.4)
        return PEAK * (1 - p) + 900 * p
    if t < T[10]:
        return max(0.0, 900 + 120 * w)
    # getting back up
    p = smooth((t - T[10]) / (DUR - 0.3 - T[10]))
    base = 900 + (1_240_000 - 900) * (p ** 1.6)
    return base * (1 + 0.005 * w)


vals = np.array([value_at(i) for i in range(len(ts))])


def vidx(t):
    return min(max(int(round(t * SR)), 0), len(ts) - 1)


WINDOW = 5.0  # seconds of history on screen


def state_at(t):
    if t < T[3]:
        return "NOTHING TO LOSE", GREEN, WHITE
    if t < T[5]:
        return "GROWING", GREEN, GREEN
    if t < REWIND_T:
        return "PLAYING IT SAFE", GREY, GREY
    if t < REWIND_T + 0.55:
        return "REWIND", WHITE, WHITE
    if t < T[8]:
        return "NOTHING TO LOSE", GREEN, GREEN
    if t < CRASH_T:
        return "ONE DAY...", YELLOW, GREEN
    if t < T[10]:
        return "MARKET CRASH", RED, RED
    return "GETTING BACK UP", GREEN, GREEN


# per-frame smoothed y-scale (sequential, so precomputed)
def frame_scales():
    out, lo, hi = [], None, None
    for f in range(NFRAMES):
        t = f / FPS
        a, b = vidx(max(0, t - WINDOW)), vidx(t)
        seg = vals[a:b + 1]
        tlo, thi = float(seg.min()), float(seg.max())
        span = max(thi - tlo, 60.0, 0.02 * thi)
        tlo, thi = tlo - 0.12 * span, thi + 0.18 * span
        if lo is None:
            lo, hi = tlo, thi
        k = 0.35 if (CRASH_T <= t < CRASH_T + 0.6) else 0.18
        lo += (tlo - lo) * k
        hi += (thi - hi) * k
        lo, hi = min(lo, float(seg.min())), max(hi, float(seg.max()))
        out.append((lo, hi))
    return out


SCALES = frame_scales()

# ----------------------------------------------------------------------------
# Captions: word timing proportional to letters inside each spoken line
# ----------------------------------------------------------------------------
WORDS = []  # (start, end, word, chunk_id)
chunk_id = 0
for li, l in enumerate(LINES):
    ws = l["text"].replace("...", "…").split()
    weights = [len(w.strip(",.…'")) + 2.5 for w in ws]
    tot, acc = sum(weights), 0.0
    dur = l["end"] - l["start"]
    n = len(ws)
    sizes = [3] * (n // 3) + ([n % 3] if n % 3 else [])
    if len(sizes) > 1 and sizes[-1] == 1:
        sizes[-2] -= 1
        sizes[-1] += 1
    k = 0
    for s in sizes:
        for _ in range(s):
            a = l["start"] + dur * acc / tot
            acc += weights[k]
            b = l["start"] + dur * acc / tot
            WORDS.append((a, b, ws[k], chunk_id))
            k += 1
        chunk_id += 1

CHUNKS = {}
for a, b, w, c in WORDS:
    CHUNKS.setdefault(c, []).append((a, b, w))
CHUNK_SPAN = []
cids = sorted(CHUNKS)
for j, c in enumerate(cids):
    a = CHUNKS[c][0][0]
    b = CHUNKS[c][-1][1]
    nxt = CHUNKS[cids[j + 1]][0][0] if j + 1 < len(cids) else DUR
    CHUNK_SPAN.append((a, min(nxt, b + 0.35), c))

# ----------------------------------------------------------------------------
# Static layers
# ----------------------------------------------------------------------------
def make_bg():
    y, x = np.mgrid[0:H, 0:W].astype(np.float32)
    d = np.sqrt(((x - W / 2) / W) ** 2 + ((y - H * 0.45) / H) ** 2)
    v = np.clip(1 - d * 1.5, 0, 1)
    base = np.array([7, 9, 13], np.float32)
    lift = np.array([16, 20, 28], np.float32)
    img = base + lift * v[..., None]
    return img


BG = make_bg()
GRAIN = [np.random.default_rng(s).normal(0, 7, (H // 2, W // 2)).astype(np.float32) for s in range(6)]


def draw_text_stroked(d, xy, text, f, fill, stroke=6, anchor="mm", stroke_fill=(0, 0, 0)):
    d.text(xy, text, font=f, fill=fill, anchor=anchor, stroke_width=stroke, stroke_fill=stroke_fill)


def emoji_img(ch, size):
    f = ImageFont.truetype(F_EMOJI, 109)
    im = Image.new("RGBA", (136, 128), (0, 0, 0, 0))
    ImageDraw.Draw(im).text((0, 0), ch, font=f, embedded_color=True)
    im = im.crop(im.getbbox())
    return im.resize((size, int(size * im.height / im.width)), Image.LANCZOS)


def make_hook():
    im = Image.new("RGBA", (W, 330), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    f = font(F_MONT, 66, 800)
    draw_text_stroked(d, (W // 2, 105), "nobody tells you this", f, WHITE, 7)
    line2 = "about losing money"
    draw_text_stroked(d, (W // 2 - 40, 195), line2, f, WHITE, 7)
    tw = d.textlength(line2, font=f)
    e = emoji_img("\U0001F4C9", 74)
    im.alpha_composite(e, (int(W // 2 - 40 + tw / 2 + 14), 195 - e.height // 2))
    return im


HOOK = make_hook()

# ----------------------------------------------------------------------------
# Frame
# ----------------------------------------------------------------------------
CX0, CX1, CY0, CY1 = 70, 990, 790, 1330


def money(v):
    return f"${v:,.2f}"


def render(fi):
    t = fi / FPS
    label, pill_col, num_col = state_at(t)
    v = vals[vidx(t)]

    # background tint by state
    tint = np.zeros(3, np.float32)
    if pill_col == RED:
        tint = np.array([26, 0, 0], np.float32)
    elif num_col == GREEN:
        tint = np.array([0, 9, 4], np.float32)
    bg = BG + tint
    img = Image.fromarray(np.clip(bg, 0, 255).astype(np.uint8), "RGB").convert("RGBA")

    # --- panel layer (gets punch-in zoom + shake) ---
    panel = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(panel)

    # header row
    d.text((CX0, 470), "NET WORTH", font=font(F_INTER, 34, 650, 32), fill=GREY, anchor="lm")
    pf = font(F_INTER, 30, 750, 32)
    pw = d.textlength(label, font=pf)
    blink = (math.sin(t * 2 * math.pi * 1.6) > -0.3)
    px1 = CX1
    px0 = px1 - pw - 70
    d.rounded_rectangle((px0, 446, px1, 494), radius=24, fill=(*pill_col, 34), outline=(*pill_col, 160), width=2)
    if label == "REWIND":
        d.text((px0 + 22, 470), "◀◀", font=font(F_INTER, 24, 800, 32), fill=pill_col, anchor="lm")
    elif blink:
        d.ellipse((px0 + 20, 462, px0 + 36, 478), fill=pill_col)
    d.text((px0 + 48, 471), label, font=pf, fill=pill_col, anchor="lm")

    # big number
    nf = font(F_MONO, 112, 800)
    d.text((CX0 - 4, 590), money(v), font=nf, fill=num_col, anchor="lm")

    # delta vs 2s ago — plain arithmetic
    v0 = vals[vidx(max(0, t - 2.0))]
    if label == "MARKET CRASH":  # drawdown from the recent peak
        v0 = float(vals[vidx(max(0, t - 2.0)):vidx(t) + 1].max())
    dv = v - v0
    pct = (dv / v0 * 100) if v0 > 1 else 0.0
    dcol = GREEN if dv > 0.5 else RED if dv < -0.5 else GREY
    sign = "+" if dv >= 0 else "−"
    dtxt = f"{sign}{money(abs(dv))}"
    if abs(pct) < 1000 and v0 > 1:
        dtxt += f"  ({sign}{abs(pct):.1f}%)"
    d.text((CX0, 690), dtxt, font=font(F_MONO, 40, 700), fill=dcol, anchor="lm")

    # chart
    lo, hi = SCALES[fi]
    a = max(0.0, t - WINDOW)
    n = 260
    tt = np.linspace(t - WINDOW, t, n)
    pts = []
    for x_t in tt:
        vv = vals[vidx(max(0.0, x_t))] if x_t >= 0 else vals[0]
        x = CX0 + (x_t - (t - WINDOW)) / WINDOW * (CX1 - 60 - CX0)
        y = CY1 - (vv - lo) / (hi - lo) * (CY1 - CY0)
        pts.append((x, y))
    # grid
    for gy in range(5):
        y = CY0 + gy * (CY1 - CY0) / 4
        d.line((CX0, y, CX1, y), fill=(255, 255, 255, 14), width=2)
    # fill
    lc = num_col if num_col != WHITE else GREY
    fill_poly = pts + [(pts[-1][0], CY1), (pts[0][0], CY1)]
    fl = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    ImageDraw.Draw(fl).polygon(fill_poly, fill=(*lc, 255))
    grad = np.linspace(70, 0, CY1 - CY0 + 1).astype(np.uint8)
    mask = np.zeros((H, W), np.uint8)
    mask[CY0:CY1 + 1, :] = grad[:, None]
    fa = np.array(fl)
    fa[..., 3] = (fa[..., 3].astype(np.uint16) * mask // 255).astype(np.uint8)
    panel.alpha_composite(Image.fromarray(fa, "RGBA"))
    # glow + line
    gl = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    ImageDraw.Draw(gl).line(pts, fill=(*lc, 200), width=16, joint="curve")
    gl = gl.crop((0, CY0 - 120, W, CY1 + 40)).filter(ImageFilter.GaussianBlur(14))
    panel.alpha_composite(gl, (0, CY0 - 120))
    d.line(pts, fill=(*lc, 255), width=6, joint="curve")
    # head dot + pulse
    hx, hy = pts[-1]
    pr = 12 + 14 * ((t * 1.4) % 1)
    pa = int(160 * (1 - (t * 1.4) % 1))
    d.ellipse((hx - pr, hy - pr, hx + pr, hy + pr), outline=(*lc, pa), width=3)
    d.ellipse((hx - 11, hy - 11, hx + 11, hy + 11), fill=WHITE)
    d.ellipse((hx - 6, hy - 6, hx + 6, hy + 6), fill=lc)

    # crash stamp
    if CRASH_T + 0.2 <= t < T[10]:
        k = min(1.0, (t - CRASH_T - 0.2) / 0.12)
        sf = font(F_MONT, int(150 - 30 * k), 900)
        draw_text_stroked(d, (W // 2, (CY0 + CY1) // 2 - 40), "−$1,000,000", sf, RED, 8)

    # punch-in zoom per spoken line + crash shake
    li = max([i for i, s in enumerate(T) if s <= t] or [0])
    zp = (t - T[li])
    zoom = 1.0 + 0.035 * min(zp / 1.6, 1.0)
    ox = oy = 0.0
    if CRASH_T <= t < CRASH_T + 0.7:
        amp = 26 * (1 - (t - CRASH_T) / 0.7)
        r = np.random.default_rng(fi)
        ox, oy = r.uniform(-amp, amp, 2)
    if zoom != 1.0:
        zw, zh = int(W * zoom), int(H * zoom)
        panel = panel.resize((zw, zh), Image.BICUBIC).crop(
            ((zw - W) // 2, int((zh - H) * 0.33), (zw - W) // 2 + W, int((zh - H) * 0.33) + H))
    img.alpha_composite(panel, (int(ox), int(oy)))

    # --- hook (fixed, like a clip title) ---
    img.alpha_composite(HOOK, (0, 120))

    # --- captions ---
    d2 = ImageDraw.Draw(img)
    for (ca, cb, c) in CHUNK_SPAN:
        if ca <= t < cb:
            words = CHUNKS[c]
            cf = font(F_MONT, 84, 900)
            texts = [w.upper() for _, _, w in words]
            space = d2.textlength(" ", font=cf)
            widths = [d2.textlength(x, font=cf) for x in texts]
            total = sum(widths) + space * (len(texts) - 1)
            scale_in = min(1.0, (t - ca) / 0.08)
            x = W / 2 - total / 2
            y = 1545 - 10 * (1 - scale_in)
            for (wa, wb, _), txt, ww in zip(words, texts, widths):
                active = wa <= t < max(wb, wa + 0.12) or (t >= wb and (wa, wb) == words[-1][:2])
                col = YELLOW if active else WHITE
                d2.text((x + ww / 2, y), txt, font=cf, fill=col, anchor="mm", stroke_width=9, stroke_fill=(0, 0, 0))
                x += ww + space
            break

    # --- post: crash flash, rewind glitch, grain, vignette ---
    arr = np.asarray(img.convert("RGB")).astype(np.float32)
    if CRASH_T <= t < CRASH_T + 0.5:
        k = 1 - (t - CRASH_T) / 0.5
        arr = arr * (1 - 0.45 * k) + np.array(RED, np.float32) * 0.45 * k
    if REWIND_T <= t < REWIND_T + 0.55:
        r = np.random.default_rng(fi)
        for _ in range(14):
            y0 = r.integers(0, H - 60)
            hgt = r.integers(8, 60)
            arr[y0:y0 + hgt] = np.roll(arr[y0:y0 + hgt], r.integers(-60, 60), axis=1)
        arr[..., 0] = np.roll(arr[..., 0], 6, axis=1)
        arr[..., 2] = np.roll(arr[..., 2], -6, axis=1)
        arr *= 0.92
    g = GRAIN[fi % len(GRAIN)]
    g = np.repeat(np.repeat(g, 2, axis=0), 2, axis=1)
    arr += g[..., None]
    out = Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8), "RGB")
    out.save(f"{OUT}/f{fi:05d}.png", compress_level=1)
    return fi


if __name__ == "__main__":
    os.makedirs(OUT, exist_ok=True)
    only = [int(x) for x in sys.argv[3].split(",")] if len(sys.argv) > 3 else range(NFRAMES)
    with Pool(os.cpu_count()) as p:
        for _ in p.imap_unordered(render, only, chunksize=4):
            pass
    print("frames", NFRAMES, "dur", round(DUR, 2), "crash", round(CRASH_T, 2))
