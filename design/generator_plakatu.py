# -*- coding: utf-8 -*-
"""MYJNIA PLANER — plakat HYDRO-RYTM (generator). Render 2x + LANCZOS."""
import math
import random
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont

FONTS = Path(r"C:\Users\lukasz.hormanski\.kilo\skills\canvas-design\canvas-fonts")
OUT = Path(__file__).parent

S = 2                      # supersampling
LW, LH = 1800, 2400        # logical canvas
W, H = LW * S, LH * S

# ---------------------------------------------------------------- palette ---
BG_TOP = (7, 42, 54)
BG_BOT = (3, 20, 27)
PANEL = (12, 61, 78)
FOAM = (236, 246, 244)
AQUA = (67, 224, 207)
AQUA_D = (31, 169, 156)
AMBER = (245, 184, 75)

MONO = "JetBrainsMono-Regular.ttf"
SANS_R = "Outfit-Regular.ttf"
SANS_B = "Outfit-Bold.ttf"


def F(name, size):
    return ImageFont.truetype(str(FONTS / name), int(round(size * S)))


def X(v):
    return int(round(v * S))


def XY(x, y):
    return (x * S, y * S)


def cubic(p0, c1, c2, p3, n=40):
    pts = []
    for i in range(n + 1):
        t = i / n
        mt = 1 - t
        x = mt**3 * p0[0] + 3 * mt**2 * t * c1[0] + 3 * mt * t**2 * c2[0] + t**3 * p3[0]
        y = mt**3 * p0[1] + 3 * mt**2 * t * c1[1] + 3 * mt * t**2 * c2[1] + t**3 * p3[1]
        pts.append(XY(x, y))
    return pts


def qbez(p0, c, p1, n=24):
    pts = []
    for i in range(n + 1):
        t = i / n
        mt = 1 - t
        x = mt**2 * p0[0] + 2 * mt * t * c[0] + t**2 * p1[0]
        y = mt**2 * p0[1] + 2 * mt * t * c[1] + t**2 * p1[1]
        pts.append(XY(x, y))
    return pts


def dashed(d, p1, p2, dash, gap, w, fill):
    x1, y1 = p1
    x2, y2 = p2
    dist = math.hypot(x2 - x1, y2 - y1)
    if dist == 0:
        return
    ux, uy = (x2 - x1) / dist, (y2 - y1) / dist
    t = 0.0
    while t < dist:
        e = min(t + dash, dist)
        d.line([XY(x1 + ux * t, y1 + uy * t), XY(x1 + ux * e, y1 + uy * e)],
               fill=fill, width=X(w))
        t += dash + gap


def tracked_center(d, cx, y, text, font, fill, tracking):
    widths = [d.textlength(ch, font=font) for ch in text]
    total = sum(widths) + X(tracking) * (len(text) - 1)
    x = X(cx) - total / 2
    for ch, wd in zip(text, widths):
        d.text((x, X(y)), ch, font=font, fill=fill, anchor="ls")
        x += wd + X(tracking)
    return total / S


# ------------------------------------------------------------------ base ----
random.seed(7)

img = Image.new("RGB", (W, H), BG_BOT).convert("RGBA")

grad = Image.new("RGB", (1, H))
for yy in range(H):
    t = yy / H
    t = t * t * (3 - 2 * t)
    grad.putpixel((0, yy), tuple(int(a + (b - a) * t) for a, b in zip(BG_TOP, BG_BOT)))
img.paste(grad.resize((W, H)), (0, 0))

# radial aqua glow behind the emblem
glow = Image.new("RGBA", (W, H), (0, 0, 0, 0))
gd = ImageDraw.Draw(glow)
ecx, ecy = 900, 700
R = 560
for i in range(90):
    f = i / 90
    rr = X(R * (1 - f))
    a = int(44 * (f ** 1.7))
    gd.ellipse([X(ecx) - rr, X(ecy) - rr, X(ecx) + rr, X(ecy) + rr], fill=AQUA + (a,))
glow = glow.filter(ImageFilter.GaussianBlur(X(26)))
img.alpha_composite(glow)

# planner dot-grid
dots = Image.new("RGBA", (W, H), (0, 0, 0, 0))
dd = ImageDraw.Draw(dots)
step = X(60)
for gy in range(step // 2, H, step):
    for gx in range(step // 2, W, step):
        dd.ellipse([gx - X(1.2), gy - X(1.2), gx + X(1.2), gy + X(1.2)], fill=FOAM + (15,))
img.alpha_composite(dots)

# two vast structural arcs
arcs = Image.new("RGBA", (W, H), (0, 0, 0, 0))
ad = ImageDraw.Draw(arcs)
for rr, aa in ((1780, 12), (1980, 9)):
    ad.ellipse([X(2060) - X(rr), X(-320) - X(rr), X(2060) + X(rr), X(-320) + X(rr)],
               outline=FOAM + (aa,), width=X(2))
img.alpha_composite(arcs)

d = ImageDraw.Draw(img)

# ---------------------------------------------------------------- header ----
m1 = F(MONO, 19)
m2 = F(MONO, 16)
d.text(XY(150, 112), "MYJNIA PLANER — SYSTEM WIZUALNY", font=m1, fill=FOAM + (205,), anchor="lm")
d.text(XY(1650, 112), "HYDRO-RYTM · PLANSZA 01", font=m1, fill=FOAM + (205,), anchor="rm")
d.line([XY(150, 172), XY(1650, 172)], fill=FOAM + (70,), width=X(1.5))
d.rectangle([XY(150, 168), XY(158, 176)], fill=AQUA + (200,))

# ------------------------------------------------------------- emblem -------
r = 250
ccx, ccy = ecx, 720
apex = (ccx, ccy - r * 1.55)
bulb_c = (ccx, ccy + r * 0.10)
dist = math.hypot(apex[0] - bulb_c[0], apex[1] - bulb_c[1])
alpha_t = math.asin(r / dist)
ux, uy = (apex[0] - bulb_c[0]) / dist, (apex[1] - bulb_c[1]) / dist
ca, sa = math.cos(alpha_t), math.sin(alpha_t)
P1 = (bulb_c[0] + r * (ux * ca - uy * sa), bulb_c[1] + r * (ux * sa + uy * ca))
P2 = (bulb_c[0] + r * (ux * ca + uy * sa), bulb_c[1] + r * (-ux * sa + uy * ca))


def side_curve(T, Pt, sign):
    dx, dy = Pt[0] - T[0], Pt[1] - T[1]
    ln = math.hypot(dx, dy)
    nx, ny = sign * dy / ln, -sign * dx / ln
    c1 = (T[0] + dx * 0.35 + nx * ln * 0.16, T[1] + dy * 0.35 + ny * ln * 0.16)
    c2 = (T[0] + dx * 0.74 + nx * ln * 0.05, T[1] + dy * 0.74 + ny * ln * 0.05)
    return cubic(T, c1, c2, Pt)


th1 = math.atan2(P1[1] - bulb_c[1], P1[0] - bulb_c[0])
th2 = math.atan2(P2[1] - bulb_c[1], P2[0] - bulb_c[0])
while th2 <= th1:
    th2 += 2 * math.pi
arc_pts = [XY(bulb_c[0] + r * math.cos(th1 + (th2 - th1) * i / 90),
              bulb_c[1] + r * math.sin(th1 + (th2 - th1) * i / 90)) for i in range(91)]
drop_pts = side_curve(apex, P1, +1) + arc_pts + side_curve(P2, apex, -1)

mask = Image.new("L", (W, H), 0)
md = ImageDraw.Draw(mask)
md.polygon(drop_pts, fill=255)

panel = Image.new("RGBA", (W, H), PANEL + (255,))
panel.putalpha(mask)
img.alpha_composite(panel)

# interior planner grid (clipped)
grid = Image.new("RGBA", (W, H), (0, 0, 0, 0))
gld = ImageDraw.Draw(grid)
g0 = ccx - (int(r / 50)) * 50
for gx in range(g0, ccx + r + 1, 50):
    gld.line([XY(gx, ccy - r * 1.6), XY(gx, ccy + r * 1.2)], fill=FOAM + (26,), width=X(1.4))
for gy in range(ccy - 250, ccy + r + 1, 50):
    gld.line([XY(ccx - r - 4, gy), XY(ccx + r + 4, gy)], fill=FOAM + (26,), width=X(1.4))
ga = grid.getchannel("A")
from PIL import ImageChops
grid.putalpha(ImageChops.multiply(ga, mask))
img.alpha_composite(grid)

# waterline inside the drop
wave = Image.new("RGBA", (W, H), (0, 0, 0, 0))
wd = ImageDraw.Draw(wave)


def wave_poly(base_y, amp, wl, ph):
    pts = []
    xx = ccx - r - 40
    while xx <= ccx + r + 40:
        pts.append(XY(xx, base_y + amp * math.sin((xx / wl) * 2 * math.pi + ph)))
        xx += 8
    pts += [XY(ccx + r + 40, ccy + r + 40), XY(ccx - r - 40, ccy + r + 40)]
    return pts


wd.polygon(wave_poly(ccy + r * 0.16, 13, 150, 0.6), fill=AQUA + (44,))
wd.polygon(wave_poly(ccy + r * 0.34, 10, 190, 2.4), fill=AQUA_D + (34,))
wa = wave.getchannel("A")
wave.putalpha(ImageChops.multiply(wa, mask))
img.alpha_composite(wave)

# tiny bubbles rising in the water zone
for bxx, byy, br in ((ccx - 118, ccy + 168, 7), (ccx - 62, ccy + 205, 5),
                     (ccx + 84, ccy + 182, 8), (ccx + 142, ccy + 214, 4),
                     (ccx + 18, ccy + 232, 5)):
    d.ellipse([XY(bxx - br, byy - br), XY(bxx + br, byy + br)],
              outline=FOAM + (85,), width=X(1.6))

# the scheduled slot — one glowing cell
slot = (ccx - 125, ccy - 75, ccx - 75, ccy - 25)
d.rectangle([XY(slot[0], slot[1]), XY(slot[2], slot[3])], fill=AQUA + (215,))
d.rectangle([XY(slot[0] + 50, slot[1]), XY(slot[2] + 50, slot[3])],
            outline=FOAM + (80,), width=X(1.6))
d.text(XY((slot[0] + slot[2]) / 2, (slot[1] + slot[3]) / 2), "08:00",
       font=F(MONO, 15), fill=BG_BOT + (255,), anchor="mm")

# drop outline + glass highlight
d.line(drop_pts + [drop_pts[0]], fill=FOAM + (235,), width=X(4), joint="curve")
hl = [(bulb_c[0] - r * 0.86, bulb_c[1] - r * 0.28),
      (bulb_c[0] - r * math.cos(0.5), bulb_c[1] - r * math.sin(0.5))]
d.arc([XY(bulb_c[0] - r * 0.78, bulb_c[1] - r * 0.78),
       XY(bulb_c[0] + r * 0.78, bulb_c[1] + r * 0.78)], 118, 172,
      fill=FOAM + (70,), width=X(3))

# ripples
for fr, aa, cl in ((1.26, 120, AQUA), (1.5, 62, FOAM), (1.78, 32, FOAM), (2.06, 15, FOAM)):
    rr_ = X(r * fr)
    d.ellipse([X(ccx) - rr_, X(ccy) - rr_, X(ccx) + rr_, X(ccy) + rr_],
              outline=cl + (aa,), width=X(2))

# emblem annotation
d.text(XY(1252, 300), "KOMORA PLANU", font=F(MONO, 17), fill=FOAM + (185,), anchor="lm")
d.text(XY(1252, 326), "CYKL OPERACYJNY · 60 MIN", font=F(MONO, 14), fill=FOAM + (120,), anchor="lm")
d.line([XY(1244, 304), XY(1010, 428)], fill=FOAM + (95,), width=X(1.5))
d.ellipse([XY(1004, 422), XY(1016, 434)], outline=FOAM + (170,), width=X(1.6))

# ---------------------------------------------------------------- scene -----
scene = Image.new("RGBA", (W, H), (0, 0, 0, 0))
sd = ImageDraw.Draw(scene)
GND = 1545
CARX = 620


def G(x, h):
    return XY(CARX + x, GND - h)


# ground line + drainage loop
sd.line([XY(430, GND), XY(1380, GND)], fill=FOAM + (120,), width=X(2.5))
dashed(sd, (CARX + 20, GND + 3), (CARX + 520, GND + 3), 16, 11, 2, AQUA + (80,))
for ax in (566, 590):
    sd.line([XY(ax, GND - 7), XY(ax + 10, GND)], fill=AQUA + (95,), width=X(2))
    sd.line([XY(ax, GND + 7), XY(ax + 10, GND)], fill=AQUA + (95,), width=X(2))
for px, prx in ((740, 60), (1060, 46), (905, 30)):
    sd.ellipse([XY(px - prx, GND - 4), XY(px + prx, GND + 4)], outline=FOAM + (38,), width=X(1.5))

# wheels (under body)
for wx in (118, 440):
    cxw, cyw = CARX + wx, GND - 32
    sd.ellipse([XY(cxw - 32, cyw - 32), XY(cxw + 32, cyw + 32)],
               fill=(4, 24, 31, 255), outline=FOAM + (215,), width=X(3.5))
    sd.ellipse([XY(cxw - 13, cyw - 13), XY(cxw + 13, cyw + 13)],
               outline=FOAM + (170,), width=X(2.5))
    sd.ellipse([XY(cxw - 3, cyw - 3), XY(cxw + 3, cyw + 3)], fill=FOAM + (170,))
    sd.ellipse([XY(cxw - 41, GND - 6), XY(cxw + 41, GND + 6)], fill=(2, 12, 16, 150))

# body silhouette
top_segs = [
    ((8, 30), (2, 38), (2, 48), (4, 56)),
    ((4, 56), (30, 68), (92, 76), (150, 86)),
    ((150, 86), (196, 100), (212, 126), (232, 142)),
    ((232, 142), (264, 146), (302, 148), (334, 148)),
    ((334, 148), (362, 144), (382, 128), (398, 106)),
    ((398, 106), (424, 102), (448, 99), (470, 97)),
    ((470, 97), (492, 94), (510, 92), (521, 89)),
    ((521, 89), (526, 80), (527, 70), (527, 60)),
    ((527, 60), (527, 44), (522, 38), (512, 34)),
]
body_pts = []
for seg in top_segs:
    p0 = G(*seg[0]); c1 = G(*seg[1]); c2 = G(*seg[2]); p3 = G(*seg[3])
    body_pts += cubic(p0, c1, c2, p3)
body_pts += [G(498, 27), G(120, 27)]
body_pts.append(body_pts[0])

sd.polygon(body_pts[:-1], fill=PANEL + (255,))
sd.line(body_pts, fill=FOAM + (225,), width=X(3.5), joint="curve")

# windows
win = [G(240, 136), G(330, 142), G(384, 110), G(248, 102)]
sd.polygon(win, fill=AQUA + (58,), outline=FOAM + (150,))
sd.line([G(288, 104), G(286, 143)], fill=FOAM + (165,), width=X(3))
sd.line(qbez((302, 141), (308, 88), (298, 32)),
        fill=FOAM + (70,), width=X(1.8))
sd.rounded_rectangle([XY(CARX + 222, GND - 131), XY(CARX + 234, GND - 124)],
                     radius=X(3), fill=FOAM + (150,))
sd.polygon([G(6, 50), G(26, 57), G(24, 62), G(6, 58)], fill=FOAM + (125,))
sd.rectangle([XY(CARX + 521, GND - 86), XY(CARX + 527, GND - 74)], fill=AQUA + (135,))

# gantry frame
for gx0 in (430, 1346):
    sd.rectangle([XY(gx0, 1178), XY(gx0 + 34, GND)], fill=FOAM + (10,),
                 outline=FOAM + (205,), width=X(3))
    sd.line([XY(gx0 + 17, 1192), XY(gx0 + 17, GND - 8)], fill=FOAM + (45,), width=X(1.5))
    sd.rectangle([XY(gx0 - 10, GND - 8), XY(gx0 + 44, GND)], fill=FOAM + (60,))
sd.rectangle([XY(430, 1150), XY(1380, 1178)], fill=FOAM + (12,),
             outline=FOAM + (215,), width=X(3))
for xt in range(446, 1368, 26):
    sd.line([XY(xt, 1174), XY(xt + 10, 1154)], fill=FOAM + (30,), width=X(1.6))

# rinse manifold
for hx in (742, 1048):
    sd.line([XY(hx, 1178), XY(hx, 1210)], fill=FOAM + (150,), width=X(3))
sd.rounded_rectangle([XY(700, 1210), XY(1090, 1226)], radius=X(5),
                     fill=FOAM + (14,), outline=FOAM + (195,), width=X(2.5))
spray_pairs = [(732, (770, 1408)), (796, (836, 1396)), (860, (898, 1394)),
               (924, (962, 1396)), (988, (1026, 1402)), (1052, (1078, 1416))]
for nx, (tx, tyh) in spray_pairs:
    sd.polygon([XY(nx - 5, 1226), XY(nx + 5, 1226), XY(nx, 1234)],
               fill=FOAM + (175,))
    sd.line(qbez((nx, 1234), ((nx + tx) / 2, 1272), (tx, tyh)),
            fill=AQUA + (95,), width=X(2))
    sd.ellipse([XY(tx - 3, tyh - 3), XY(tx + 3, tyh + 3)], fill=AQUA + (160,))
for _ in range(46):
    mx = random.uniform(720, 1075)
    my = random.uniform(1240, 1385)
    sd.ellipse([XY(mx - 1.6, my - 1.6), XY(mx + 1.6, my + 1.6)],
               fill=AQUA + (random.randint(22, 60),))

# side brushes
for bx in (690, 1108):
    sd.line([XY(bx, 1178), XY(bx, 1240)], fill=FOAM + (150,), width=X(4))
    sd.rounded_rectangle([XY(bx - 23, 1240), XY(bx + 23, 1478)], radius=X(23),
                         fill=AQUA + (26,), outline=FOAM + (205,), width=X(3))
    for k in range(4):
        y0 = 1268 + k * 52
        sd.line(qbez((bx - 20, y0), (bx, y0 + 16), (bx + 20, y0 + 30)),
                fill=FOAM + (85,), width=X(2))

# dryer unit
for hx in (1206, 1240):
    sd.line([XY(hx, 1178), XY(hx, 1198)], fill=FOAM + (150,), width=X(3))
sd.rounded_rectangle([XY(1180, 1198), XY(1266, 1240)], radius=X(7),
                     fill=FOAM + (12,), outline=FOAM + (190,), width=X(2.5))
sd.line([XY(1190, 1240), XY(1256, 1252)], fill=FOAM + (120,), width=X(2.5))

# scene annotations
def note(text, tx, ty, anchor, px, py, elbow=None):
    fnt = F(MONO, 17)
    sd.text(XY(tx, ty), text, font=fnt, fill=FOAM + (185,), anchor=anchor)
    if anchor == "rm":
        lx = tx - sd.textlength(text, font=fnt) / S - 10
    else:
        lx = tx + sd.textlength(text, font=fnt) / S + 10
    ly = ty
    pts = [XY(lx, ly)]
    if elbow:
        pts.append(XY(*elbow))
    pts.append(XY(px, py))
    sd.line(pts, fill=FOAM + (90,), width=X(1.5))
    sd.ellipse([XY(px - 4, py - 4), XY(px + 4, py + 4)], outline=FOAM + (170,), width=X(1.6))


note("LUK MYCIA", 400, 1216, "rm", 700, 1218)
note("SZCZOTKI SPIRALNE", 400, 1352, "rm", 665, 1356)
note("STREFA SUSZENIA", 1450, 1216, "lm", 1268, 1218)
note("PETLA OBIEGU WODY", 400, 1470, "rm", 640, 1541)
note("KOMORA MYJNI", 1450, 1470, "lm", 1150, 1500, elbow=(1290, 1470))

img.alpha_composite(scene)

# reflection
box = (int(X(560)), int(X(1150)), int(X(1420)), int(X(GND)))
region = img.crop(box).transpose(Image.FLIP_TOP_BOTTOM)
rw, rh = region.size
fade = Image.new("L", (rw, rh), 0)
fdraw = ImageDraw.Draw(fade)
for yy in range(rh):
    v = max(0, 1 - yy / (rh * 0.62))
    fdraw.line([(0, yy), (rw, yy)], fill=int(52 * v * v))
img.paste(region, (int(X(560)), int(X(GND))), fade)

# ---------------------------------------------------------------- bubbles ---
bub = Image.new("RGBA", (W, H), (0, 0, 0, 0))
bd = ImageDraw.Draw(bub)


def bubble(bx, by, br, kind):
    if kind == "fill":
        bd.ellipse([XY(bx - br, by - br), XY(bx + br, by + br)], fill=AQUA + (26,))
        bd.ellipse([XY(bx - br, by - br), XY(bx + br, by + br)], outline=AQUA + (95,), width=X(1.8))
    elif kind == "amber":
        bd.ellipse([XY(bx - br, by - br), XY(bx + br, by + br)], fill=AMBER + (30,))
        bd.ellipse([XY(bx - br, by - br), XY(bx + br, by + br)], outline=AMBER + (170,), width=X(1.8))
    else:
        bd.ellipse([XY(bx - br, by - br), XY(bx + br, by + br)], outline=FOAM + (72,), width=X(1.8))
    bd.arc([XY(bx - br * 0.62, by - br * 0.62), XY(bx + br * 0.62, by + br * 0.62)],
           195, 300, fill=FOAM + (135,), width=X(1.6))


ann_rows = {215: {1216, 1352, 1470}, 1585: {1216}}
for colx in (215, 1585):
    for i, byy in enumerate(range(280, 1524, 74)):
        if i % 5 == 3:
            continue
        yy = byy + ((i * 53) % 29) - 14
        if any(abs(yy - ar) < 34 for ar in ann_rows[colx]):
            continue
        br = 9 + (i * 37) % 22
        kind = "fill" if i % 7 == 2 else "ring"
        bubble(colx + ((i * 71) % 23) - 11, yy, br, kind)
bubble(215, 985, 20, "amber")

img.alpha_composite(bub)

# -------------------------------------------------------------- wordmark ----
wm_r = F(SANS_R, 148)
wm_b = F(SANS_B, 148)
t1, t2 = "MYJNIA", "PLANER"
gap = 36
w1 = d.textlength(t1, font=wm_r) / S
w2 = d.textlength(t2, font=wm_b) / S
total_w = w1 + gap + w2
start_x = (LW - total_w) / 2
BASE = 1832
d.text(XY(start_x, BASE), t1, font=wm_r, fill=FOAM + (238,), anchor="ls")
d.text(XY(start_x + w1 + gap, BASE), t2, font=wm_b, fill=AQUA + (245,), anchor="ls")

tag = "ZAPLANUJ · UMYJ · BŁYSZCZ"
tag_w = tracked_center(d, 900, 1902, tag, F(MONO, 24), FOAM + (175,), 8)
d.line([XY(150, 1893), XY(900 - tag_w / 2 - 42, 1893)], fill=FOAM + (50,), width=X(1.5))
d.line([XY(900 + tag_w / 2 + 42, 1893), XY(1650, 1893)], fill=FOAM + (50,), width=X(1.5))

# divider
d.line([XY(150, 1948), XY(1650, 1948)], fill=FOAM + (42,), width=X(1.5))
d.polygon([XY(900, 1941), XY(907, 1948), XY(900, 1955), XY(893, 1948)], fill=FOAM + (130,))

# ---------------------------------------------------------------- timeline --
TL_Y = 2090
hours = list(range(8, 19))
xs = [150 + i * 150 for i in range(len(hours))]
d.line([XY(150, TL_Y), XY(1650, TL_Y)], fill=FOAM + (130,), width=X(2))
for i, hv in enumerate(hours):
    d.line([XY(xs[i], TL_Y - 14), XY(xs[i], TL_Y + 14)], fill=FOAM + (160,), width=X(2))
    lab = "%02d:00" % hv
    lx = min(max(xs[i], 190), 1610)
    d.text(XY(lx, TL_Y + 38), lab, font=F(MONO, 17), fill=FOAM + (145,), anchor="mm")
    if i < len(hours) - 1:
        mxh = (xs[i] + xs[i + 1]) / 2
        d.line([XY(mxh, TL_Y - 7), XY(mxh, TL_Y + 7)], fill=FOAM + (80,), width=X(1.5))

bar_x0, bar_x1 = xs[1], xs[3]
d.rounded_rectangle([XY(bar_x0, 2042), XY(bar_x1, 2056)], radius=X(7), fill=AQUA + (225,))
bw = d.textlength("ZAJĘTE · BOKS 02 · 09–12", font=F(MONO, 17)) / S
d.text(XY((bar_x0 + bar_x1) / 2, 2022), "ZAJĘTE · BOKS 02 · 09–12",
       font=F(MONO, 17), fill=AQUA + (200,), anchor="mm")

now_x = 150 + 5.5 * 150
dashed(d, (now_x, 1996), (now_x, TL_Y - 4), 7, 6, 2, AMBER + (215,))
d.polygon([XY(now_x - 8, TL_Y - 16), XY(now_x + 8, TL_Y - 16), XY(now_x, TL_Y - 2)],
          fill=AMBER + (235,))
d.text(XY(now_x, 1978), "TERAZ · 13:30", font=F(MONO, 16), fill=AMBER + (215,), anchor="mm")

# ----------------------------------------------------------------- footer ---
fm = F(MONO, 16)
d.text(XY(150, 2280), "© 2026 MYJNIA PLANER", font=fm, fill=FOAM + (125,), anchor="lm")
d.text(XY(1650, 2280), "RYTUAŁ CZYSTOŚCI / ARKUSZ 01", font=fm, fill=FOAM + (125,), anchor="rm")

# corner registration ticks
for cxx, cyy, dx, dy in ((60, 60, 1, 1), (1740, 60, -1, 1), (60, 2340, 1, -1), (1740, 2340, -1, -1)):
    d.line([XY(cxx, cyy), XY(cxx + 18 * dx, cyy)], fill=FOAM + (70,), width=X(2))
    d.line([XY(cxx, cyy), XY(cxx, cyy + 18 * dy)], fill=FOAM + (70,), width=X(2))

# ------------------------------------------------------------------- save ---
final = img.resize((LW, LH), Image.LANCZOS).convert("RGB")
final.save(OUT / "myjnia-planer-hydro-rytm.png", optimize=True)
print("saved", final.size)
