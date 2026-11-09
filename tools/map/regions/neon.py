"""Neon City's kit (ticket 20): a block of the old city on the island's east side, its walk-up and arcade open to go
into, the elevated highway over the avenue, the towers' shells round it, and the models the cover pass's pieces there
wear. Builds apps/range/public/models/neon.glb:

    blender -b --factory-startup --python tools/map/build.py -- tools/map/regions/neon.py --export --preview DIR

The pieces' boxes come from tools/map/regions/neon.json, which the test writes from the plan
(apps/range/src/map/zero-island-neon-plan.ts; `UPDATE_KIT=1`). See tools/map/regionkit.py for the pattern.
Permanent dusk under a violet sky: soot-dark brick and painted block, wet asphalt, signs in magenta, cyan, violet and
amber tubes, every third window lit warm or cold, the towers' glass dark above their lit floors.
"""
import math
import os
import random
import sys

from mathutils import Matrix

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(HERE))
import regionkit  # noqa: E402

OUT = os.path.join(HERE, "..", "..", "..", "apps", "range", "public", "models", "neon.glb")
rk = regionkit.RegionKit(bkit, "neon", os.path.join(HERE, "neon.json"))  # noqa: F821
kit = rk.kit
box = rk.box

# Finishes: colour (sRGB) and the photo layer it wears.
brick = rk.mat("nc.brick", (124, 72, 58), "brick", 0.9)
brick_dark = rk.mat("nc.brickdark", (84, 52, 46), "brick", 0.9)
block = rk.mat("nc.block", (66, 84, 96), "wall", 0.85)
block_pale = rk.mat("nc.blockpale", (150, 146, 136), "wall", 0.85)
concrete = rk.mat("nc.concrete", (132, 130, 128), "wall", 0.9)
slab = rk.mat("nc.slab", (112, 110, 108), "slab", 0.9)
tar = rk.mat("nc.tar", (40, 40, 44), "asphalt", 0.8)
asphalt = rk.mat("nc.asphalt", (62, 62, 66), "asphalt", 0.7)
line_white = rk.mat("nc.line", (206, 206, 196), None, 0.6)
line_yellow = rk.mat("nc.lineyellow", (204, 164, 44), None, 0.6)
steel = rk.mat("nc.steel", (84, 88, 94), "steel", 0.6, 0.5)
steel_dark = rk.mat("nc.steeldark", (38, 40, 44), "steel", 0.6, 0.4)
rust = rk.mat("nc.rust", (112, 64, 42), "steel", 0.8, 0.2)
plate = rk.mat("nc.plate", (96, 100, 108), "plate", 0.5, 0.4)
clad = rk.mat("nc.clad", (98, 104, 116), "plate", 0.5, 0.3)
clad_dark = rk.mat("nc.claddark", (54, 58, 68), "plate", 0.5, 0.3)
clad_warm = rk.mat("nc.cladwarm", (128, 112, 96), "wall", 0.8)
glass = rk.mat("nc.glass", (20, 26, 36), None, 0.12, 0.3)
glass_blue = rk.mat("nc.glassblue", (26, 40, 62), None, 0.12, 0.3)
black = rk.mat("nc.black", (24, 24, 26), None, 0.7)
rubber = rk.mat("nc.rubber", (28, 28, 28), None, 0.95)
wood = rk.mat("nc.wood", (118, 84, 58), "plank", 0.8)
wood_dark = rk.mat("nc.wooddark", (70, 50, 36), "plank", 0.8)
fabric = rk.mat("nc.fabric", (92, 40, 64), None, 0.95)
card = rk.mat("nc.card", (156, 120, 82), None, 0.95)
shutter = rk.mat("nc.shutter", (120, 124, 126), "tin", 0.6, 0.4)
crate_blue = rk.mat("nc.crateblue", (66, 98, 130), None, 0.6)
crate_red = rk.mat("nc.cratered", (146, 64, 52), None, 0.6)
hazard = rk.mat("nc.hazard", (214, 170, 40), "plate", 0.6, 0.1)

# Light: windows warm and cold, sodium lamps, and the tubes.
lit_warm = rk.mat("nc.litwarm", (255, 200, 140), None, 0.4, glow=(1.0, 0.62, 0.28))
lit_cool = rk.mat("nc.litcool", (190, 222, 255), None, 0.4, glow=(0.42, 0.66, 1.0))
lit_dim = rk.mat("nc.litdim", (150, 120, 96), None, 0.4, glow=(0.36, 0.22, 0.12))
sodium = rk.mat("nc.sodium", (255, 176, 80), None, 0.4, glow=(1.3, 0.7, 0.2))
beacon = rk.mat("nc.beacon", (255, 40, 30), None, 0.4, glow=(1.4, 0.08, 0.05))
NEON = [
    rk.mat("nc.magenta", (255, 40, 170), None, 0.3, glow=(1.3, 0.1, 0.75)),
    rk.mat("nc.cyan", (40, 230, 255), None, 0.3, glow=(0.1, 1.0, 1.3)),
    rk.mat("nc.violet", (150, 60, 255), None, 0.3, glow=(0.65, 0.18, 1.35)),
    rk.mat("nc.amber", (255, 150, 30), None, 0.3, glow=(1.35, 0.62, 0.08)),
]
magenta, cyan, violet, amber = NEON
# Screens and ads: lit fields, less hot than the tubes.
SCREEN = [
    rk.mat("nc.screenblue", (60, 120, 220), None, 0.3, glow=(0.18, 0.4, 0.9)),
    rk.mat("nc.screenpink", (220, 80, 150), None, 0.3, glow=(0.85, 0.22, 0.5)),
    rk.mat("nc.screengreen", (60, 200, 140), None, 0.3, glow=(0.15, 0.75, 0.45)),
    rk.mat("nc.screenwhite", (230, 230, 240), None, 0.3, glow=(0.8, 0.8, 0.9)),
]
PAINT = [
    rk.mat("nc.paintred", (130, 66, 54), "steel", 0.5, 0.3),
    rk.mat("nc.paintblue", (76, 90, 110), "steel", 0.5, 0.3),
    rk.mat("nc.paintgrey", (150, 150, 146), "steel", 0.5, 0.3),
    rk.mat("nc.paintblack", (36, 36, 40), "steel", 0.5, 0.3),
    rk.mat("nc.paintyellow", (184, 156, 86), "steel", 0.5, 0.3),
]
GRAFFITI = [
    rk.mat("nc.tagpink", (200, 60, 140), None, 0.8),
    rk.mat("nc.tagteal", (40, 150, 150), None, 0.8),
    rk.mat("nc.tagyellow", (210, 180, 50), None, 0.8),
    rk.mat("nc.tagwhite", (200, 200, 200), None, 0.8),
]

# A piece's look must be the same in its model and its `-lod` twin, so what's picked by chance (a sign's colour, which
# windows are lit) comes from a draw keyed by the piece and the box's order in it, not the build's shared draw.
_at = {"name": "", "n": 0}
_piece = rk.piece


def _keyed_piece(name, lod):
    _at["name"], _at["n"] = name, 0
    # The towers are hundreds of small boxes already: no splitting their faces for the occlusion.
    keep = kit.densify
    if name.startswith("nc-tower"):
        kit.densify = lambda o, longest=0: None
    try:
        return _piece(name, lod)
    finally:
        kit.densify = keep


rk.piece = _keyed_piece


def keyed():
    _at["n"] += 1
    return random.Random(f"{_at['name']}/{_at['n']}")


def turned(objs, yaw):
    """Turned about game y, as a placed piece turns: +x toward (cos, -sin) in x, z."""
    for o in objs:
        o.data.transform(Matrix.Rotation(yaw, 4, "Z"))
    return objs


def moved(objs, x=0.0, y=0.0, z=0.0):
    for o in objs:
        o.data.transform(Matrix.Translation(kit.b((x, y, z))))
    return objs


def thin_axis(s):
    return 0 if s[0] < s[2] else 2


def fbox(thin, u0, u1, v0, v1, n0, n1, mat):
    """A box on a face: u along the face, v up, n across it (on the thin axis)."""
    if thin == 2:
        return box([u0, v0, n0], [u1, v1, n1], mat)
    return box([n0, v0, u0], [n1, v1, u1], mat)


# ------------------------------------------------------------------ tube lettering

# Seven strokes a letter: top, upper right, lower right, bottom, lower left, upper left, middle.
GLYPH = {
    "A": "0124 56", "B": "23456", "C": "0345", "D": "12346", "E": "03456", "F": "0456", "G": "02345", "H": "12456",
    "I": "45", "L": "345", "N": "246", "O": "012345", "P": "01456", "R": "46", "S": "02356", "T": "3456", "U": "12345",
    "Y": "12356", "K": "12456", "M": "246", "W": "12345", "X": "12456", "Z": "01346", "V": "2346",
}
WORDS = ["ARCADE", "HOTEL", "NOODLES", "OPEN", "CLUB", "BAR", "CAFE", "PHO", "LAUNDRY", "PAWN", "GOLD", "DELI",
         "SUSHI", "KARAOKE", "TATTOO", "DINER", "LOANS", "PHONES", "RAMEN", "BOOKS", "MOTEL", "CASINO", "SAKE", "ZONE"]


def glyph(thin, u, v, cw, ch, t, n0, n1, letter, mat):
    segs = GLYPH.get(letter, "0123456").replace(" ", "")
    h = ch / 2
    spans = {
        "0": (u, u + cw, v + ch - t, v + ch), "3": (u, u + cw, v, v + t), "6": (u, u + cw, v + h - t / 2, v + h + t / 2),
        "1": (u + cw - t, u + cw, v + h, v + ch), "2": (u + cw - t, u + cw, v, v + h),
        "4": (u, u + t, v, v + h), "5": (u, u + t, v + h, v + ch),
    }
    return [fbox(thin, a, b, c, d, n0, n1, mat) for a, b, c, d in (spans[k] for k in segs)]


def lettering(thin, u0, u1, v0, v1, n0, n1, mat, rng, vertical=False):
    """A word in tubes, centred in u0..u1 by v0..v1 on a face, standing n0..n1 off it."""
    W, H = u1 - u0, v1 - v0
    if vertical:
        cw = W
        ch = min(cw * 1.25, H)
        gap = ch * 0.3
        n = max(1, int((H + gap) / (ch + gap)))
    else:
        ch = H
        cw = ch * 0.62
        gap = cw * 0.35
        n = max(1, int((W + gap) / (cw + gap)))
    fits = [w for w in WORDS if len(w) <= n] or ["OPEN"[:n]]
    word = rng.choice(fits)
    t = max(0.05, min(cw, ch) * 0.13)
    out = []
    if vertical:
        total = len(word) * ch + (len(word) - 1) * gap
        v = v1 - (H - total) / 2 - ch
        for c in word:
            out += glyph(thin, u0, v, cw, ch, t, n0, n1, c, mat)
            v -= ch + gap
    else:
        total = len(word) * cw + (len(word) - 1) * gap
        u = u0 + (W - total) / 2
        for c in word:
            out += glyph(thin, u, v0, cw, ch, t, n0, n1, c, mat)
            u += cw + gap
    return out


def both_faces(r, face):
    """A sign's face drawn on its +thin side, and again turned half round onto the other, so it reads the right way from both."""
    state = r.getstate()
    front = face()
    r.setstate(state)
    return front + turned(face(), math.pi)


def border(thin, u0, u1, v0, v1, n0, n1, t, mat):
    return [
        fbox(thin, u0, u1, v0, v0 + t, n0, n1, mat), fbox(thin, u0, u1, v1 - t, v1, n0, n1, mat),
        fbox(thin, u0, u0 + t, v0 + t, v1 - t, n0, n1, mat), fbox(thin, u1 - t, u1, v0 + t, v1 - t, n0, n1, mat),
    ]


# ------------------------------------------------------------------ the walk-up and the arcade


def wall_of(face, trim):
    def dress(s, lod, rng):
        """A span of wall between openings: its top a sill or coping, its foot (if it hangs over an opening) a lintel."""
        hy = s[1] / 2
        thin = thin_axis(s)
        L, T = s[2 - thin], s[thin]
        bottom = -hy
        out = []
        top = hy - (0 if lod or s[1] < 0.5 else 0.12)
        foot = bottom + (0.18 if s[1] < 3.0 and not lod else 0)
        if top < hy:
            out.append(fbox(thin, -L / 2, L / 2, top, hy, -T / 2, T / 2, trim))
        if foot > bottom:
            out.append(fbox(thin, -L / 2, L / 2, bottom, foot, -T / 2, T / 2, trim))
        n = 1 if lod else max(1, round(L / 4))
        for i in range(n):
            a, b = -L / 2 + L * i / n, -L / 2 + L * (i + 1) / n
            out.append(fbox(thin, a, b, foot, top, -T / 2, T / 2, face))
        return out

    return dress


def floor_slab(s, lod, rng):
    hx, hy, hz = s[0] / 2, s[1] / 2, s[2] / 2
    return [box([-hx, -hy, -hz], [hx, hy - 0.04, hz], concrete), box([-hx, hy - 0.04, -hz], [hx, hy, hz], wood_dark)]


def roof_slab(s, lod, rng):
    hx, hy, hz = s[0] / 2, s[1] / 2, s[2] / 2
    return [box([-hx, -hy, -hz], [hx, hy - 0.05, hz], concrete), box([-hx, hy - 0.05, -hz], [hx, hy, hz], tar)]


def step(s, lod, rng):
    """A stair's step, solid to the floor under it: concrete, a steel nosing along its tread."""
    hx, hy, hz = s[0] / 2, s[1] / 2, s[2] / 2
    out = [box([-hx, -hy, -hz], [hx, hy - 0.04, hz], concrete), box([-hx, hy - 0.04, -hz], [hx, hy, hz], slab)]
    if not lod:
        out.append(box([-hx, hy - 0.04, -hz], [-hx + 0.06, hy, hz], steel))
        out.append(box([hx - 0.06, hy - 0.04, -hz], [hx, hy, hz], steel))
    return out


def fire_step(s, lod, rng):
    """The arcade's outside stair: painted block under steel treads."""
    hx, hy, hz = s[0] / 2, s[1] / 2, s[2] / 2
    out = [box([-hx, -hy, -hz], [hx, hy - 0.05, hz], block), box([-hx, hy - 0.05, -hz], [hx, hy, hz], plate)]
    if not lod:
        out.append(box([-hx, hy - 0.05, -hz], [-hx + 0.05, hy, hz], hazard))
    return out


def landing(s, lod, rng):
    """A stair's landing on its tower of concrete, solid to the street."""
    hx, hy, hz = s[0] / 2, s[1] / 2, s[2] / 2
    out = [box([-hx + 0.02, -hy, -hz + 0.02], [hx - 0.02, hy - 0.2, hz - 0.02], concrete), box([-hx, hy - 0.2, -hz], [hx, hy, hz], slab)]
    if not lod:
        r = keyed()
        for k in range(2):
            m = r.choice(GRAFFITI)
            w = r.uniform(0.6, min(s[0], s[2]) - 0.3)
            y = -hy + r.uniform(0.6, 1.4)
            side = r.choice((-1, 1))
            if k == 0:
                out.append(box([-w / 2, y, side * hz - (0.02 if side > 0 else 0)], [w / 2, y + r.uniform(0.4, 0.9), side * hz + (0 if side > 0 else 0.02)], m))
            else:
                out.append(box([side * hx - (0.02 if side > 0 else 0), y, -w / 2], [side * hx + (0 if side > 0 else 0.02), y + r.uniform(0.4, 0.9), w / 2], m))
    else:
        keyed()
    return out


def rail(s, lod, rng):
    """A landing's guard: posts, a steel top rail and a perforated panel under it."""
    hx, hy, hz = s[0] / 2, s[1] / 2, s[2] / 2
    thin = thin_axis(s)
    L, T = s[2 - thin], s[thin]
    out = [fbox(thin, -L / 2, L / 2, hy - 0.06, hy, -T / 2, T / 2, steel)]
    out.append(fbox(thin, -L / 2, L / 2, -hy, hy - 0.06, -T / 4, T / 4, steel_dark))
    if not lod:
        n = max(1, round(L / 1.2))
        for i in range(n + 1):
            u = -L / 2 + L * i / n
            out.append(fbox(thin, max(-L / 2, u - 0.03), min(L / 2, u + 0.03), -hy, hy - 0.06, -T / 2, T / 2, steel))
    return out


def counter(s, lod, rng):
    hx, hy, hz = s[0] / 2, s[1] / 2, s[2] / 2
    out = [box([-hx + 0.03, -hy, -hz + 0.03], [hx - 0.03, hy - 0.05, hz - 0.03], wood), box([-hx, hy - 0.05, -hz], [hx, hy, hz], wood_dark)]
    if not lod:
        out.append(box([-hx + 0.03, -hy, hz - 0.03], [hx - 0.03, -hy + 0.12, hz], black))
    return out


def shelf(s, lod, rng):
    """Shop shelving against the wall: uprights, four boards, stock in colours on them."""
    hx, hy, hz = s[0] / 2, s[1] / 2, s[2] / 2
    out = []
    for z in (-hz, hz - 0.05):
        out.append(box([-hx, -hy, z], [hx, hy, z + 0.05], wood_dark))
    r = keyed()
    for j in range(4):
        y = -hy + 0.1 + j * (s[1] - 0.15) / 4
        out.append(box([-hx, y, -hz + 0.05], [hx, y + 0.04, hz - 0.05], wood_dark))
        if lod:
            continue
        z = -hz + 0.08
        while z < hz - 0.4:
            w = r.uniform(0.2, 0.45)
            out.append(box([-hx + 0.05, y + 0.04, z], [hx - 0.08, y + 0.04 + r.uniform(0.15, 0.35), z + w], r.choice([card, crate_blue, crate_red, line_white, card])))
            z += w + 0.04
    return out


def sofa(s, lod, rng):
    hx, hy, hz = s[0] / 2, s[1] / 2, s[2] / 2
    return [
        box([-hx + 0.2, -hy, -hz + 0.25], [hx - 0.2, -hy + 0.45, hz], fabric, 0 if lod else 0.04),
        box([-hx, -hy, -hz], [hx, hy, -hz + 0.25], fabric, 0 if lod else 0.04),
        box([-hx, -hy, -hz + 0.25], [-hx + 0.2, -hy + 0.62, hz], fabric, 0 if lod else 0.03),
        box([hx - 0.2, -hy, -hz + 0.25], [hx, -hy + 0.62, hz], fabric, 0 if lod else 0.03),
    ]


def table(s, lod, rng):
    hx, hy, hz = s[0] / 2, s[1] / 2, s[2] / 2
    out = [box([-hx, hy - 0.05, -hz], [hx, hy, hz], wood)]
    for sx in (-1, 1):
        for sz in (-1, 1):
            x, z = sx * (hx - 0.08), sz * (hz - 0.08)
            out.append(box([x - 0.05, -hy, z - 0.05], [x + 0.05, hy - 0.05, z + 0.05], steel_dark))
    return out


def sign(s, lod, rng):
    """A shop's sign over its front (+z): a dark box, a word in tubes on it and a border of another colour."""
    hx, hy, hz = s[0] / 2, s[1] / 2, s[2] / 2
    r = keyed()
    a, b = r.sample(NEON, 2)
    out = [box([-hx, -hy, -hz], [hx, hy, hz - 0.05], black)]
    out += lettering(2, -hx + 0.35, hx - 0.35, -hy + 0.3, hy - 0.3, hz - 0.05, hz, a, r)
    out += border(2, -hx + 0.06, hx - 0.06, -hy + 0.06, hy - 0.06, hz - 0.05, hz, 0.06, b)
    return out


def blade(s, lod, rng):
    """A blade sign standing out from the front: letters down both faces."""
    hx, hy, hz = s[0] / 2, s[1] / 2, s[2] / 2
    thin = thin_axis(s)
    L, T = s[2 - thin], s[thin]
    r = keyed()
    a, b = r.sample(NEON, 2)
    out = [fbox(thin, -L / 2, L / 2, -hy, hy, -T / 2 + 0.05, T / 2 - 0.05, black)]
    n0, n1 = T / 2 - 0.05, T / 2

    def face():
        return lettering(thin, -L / 2 + 0.25, L / 2 - 0.25, -hy + 0.25, hy - 0.25, n0, n1, a, r, vertical=True) + border(thin, -L / 2 + 0.04, L / 2 - 0.04, -hy + 0.04, hy - 0.04, n0, n1, 0.05, b)

    return out + both_faces(r, face)


def billboard(s, lod, rng):
    """A roof billboard, an ad on both faces: lit fields, a stripe, a word, in a steel frame."""
    hy = s[1] / 2
    thin = thin_axis(s)
    L, T = s[2 - thin], s[thin]
    r = keyed()
    ground, field = r.sample(SCREEN, 2)
    word = r.choice(NEON)
    out = [fbox(thin, -L / 2, L / 2, -hy, hy, -T / 2 + 0.06, T / 2 - 0.06, steel_dark)]
    n = (T / 2 - 0.06, T / 2 - 0.03)
    f = (T / 2 - 0.03, T / 2)

    def face():
        o = border(thin, -L / 2, L / 2, -hy, hy, *n, 0.12, steel)
        o.append(fbox(thin, -L / 2 + 0.12, L / 2 - 0.12, -hy + 0.12, hy - 0.12, *n, ground))
        if not lod:
            o.append(fbox(thin, -L / 2 + 0.12, -L / 2 + 0.12 + L * 0.38, -hy + 0.12, hy - 0.12, *f, field))
            o.append(fbox(thin, -L / 2 + L * 0.5, L / 2 - 0.3, -hy + 0.35, -hy + 0.5, *f, word))
        return o + lettering(thin, -L / 2 + L * 0.5, L / 2 - 0.3, -hy + 0.7, -hy + 0.7 + s[1] * 0.3, *f, word, r)

    return out + both_faces(r, face)


def ac(s, lod, rng):
    hx, hy, hz = s[0] / 2, s[1] / 2, s[2] / 2
    out = [box([-hx, -hy, -hz], [hx, -hy + 0.12, hz], steel_dark), box([-hx + 0.04, -hy + 0.12, -hz + 0.04], [hx - 0.04, hy - 0.04, hz - 0.04], plate, 0 if lod else 0.02)]
    out.append(kit.cylinder(min(hx, hz) - 0.15, hy - 0.04, hy, (0, 0, 0), "y", black, 10 if lod else 20))
    if not lod:
        for i in range(8):
            y = -hy + 0.25 + i * 0.12
            out.append(box([-hx + 0.1, y, hz - 0.04], [hx - 0.1, y + 0.04, hz], steel))
    return out


def tank(s, lod, rng):
    """A water tank on a steel stand."""
    hx, hy, hz = s[0] / 2, s[1] / 2, s[2] / 2
    r = min(hx, hz) - 0.02
    seg = 12 if lod else 24
    out = [box([-hx + 0.1, -hy + 0.3, -hz + 0.1], [hx - 0.1, -hy + 0.4, hz - 0.1], steel_dark)]
    for sx in (-1, 1):
        for sz in (-1, 1):
            x, z = sx * (hx - 0.4), sz * (hz - 0.4)
            out.append(box([x - 0.06, -hy, z - 0.06], [x + 0.06, -hy + 0.3, z + 0.06], steel_dark))
    out.append(kit.cylinder(r, -hy + 0.4, hy - 0.3, (0, 0, 0), "y", rust, seg))
    out.append(kit.cylinder(r, hy - 0.3, hy, (0, 0, 0), "y", rust, seg, r2=0.2))
    if not lod:
        for y in (-hy + 0.8, 0.0, hy - 0.6):
            out.append(kit.cylinder(r - 0.01, y - 0.04, y + 0.04, (0, 0, 0), "y", steel_dark, seg))
    return out


def cabinet(s, lod, rng):
    """An arcade cabinet, its front +z: control panel, raked screen and marquee lit, art down its sides."""
    hx, hy, hz = s[0] / 2, s[1] / 2, s[2] / 2
    r = keyed()
    body = r.choice([black, PAINT[3], PAINT[1], PAINT[0]])
    scr = r.choice(SCREEN)
    tube = r.choice(NEON)
    # The side (y, z): from its back at the floor, up its front, over the panel, back up the screen, out under the marquee.
    prof = [(-hy, -hz), (-hy, 0.28), (0.0, 0.28), (0.02, hz), (0.1, hz), (0.12, 0.28), (0.62, 0.1), (0.66, 0.3), (hy, 0.3), (hy, -hz)]
    out = [kit.section(prof, -hx + 0.01, hx - 0.01, body)]
    # The screen on the rake, just proud of it.
    (y0, z0), (y1, z1) = (0.12, 0.28), (0.62, 0.1)
    ny, nz = (z1 - z0), -(y1 - y0)
    k = math.hypot(ny, nz)
    ny, nz = -ny / k * 0.015, -nz / k * 0.015
    a = lambda t: (y0 + (y1 - y0) * t, z0 + (z1 - z0) * t)  # noqa: E731
    p0, p1 = a(0.08), a(0.92)
    out.append(kit.section([p0, p1, (p1[0] + ny, p1[1] + nz), (p0[0] + ny, p0[1] + nz)], -hx + 0.08, hx - 0.08, scr))
    out.append(box([-hx + 0.04, 0.68, 0.3], [hx - 0.04, hy - 0.04, 0.32], tube))
    if not lod:
        for x in (-0.18, 0.0, 0.18):
            out.append(box([x - 0.03, 0.1, 0.36], [x + 0.03, 0.13, 0.42], r.choice(NEON)))
        # A stripe of art down each side.
        for side in (-1, 1):
            xa, xb = (hx - 0.01, hx) if side > 0 else (-hx, -hx + 0.01)
            out.append(box([xa, -0.1, -0.35], [xb, 0.0, 0.2], tube))
            out.append(box([xa, 0.3, -0.35], [xb, 0.36, 0.0], tube))
    return out


rk.dress("brick-wall", wall_of(brick, concrete))
rk.dress("block-wall", wall_of(block, block_pale))
rk.dress("floor-slab", floor_slab)
rk.dress("roof-slab", roof_slab)
rk.dress("step", step)
rk.dress("fire-step", fire_step)
rk.dress("landing", landing)
rk.dress("rail", rail)
rk.dress("counter", counter)
rk.dress("shelf", shelf)
rk.dress("sofa", sofa)
rk.dress("table", table)
rk.dress("sign", sign)
rk.dress("blade", blade)
rk.dress("billboard", billboard)
rk.dress("ac", ac)
rk.dress("tank", tank)
rk.dress("cabinet", cabinet)

# ------------------------------------------------------------------ the towers


def faces4(fn):
    """fn() draws the +z face of a square box; the four faces, turned round."""
    out = []
    for k in range(4):
        out += turned(fn(k), k * math.pi / 2)
    return out


def podium(s, lod, rng):
    """A tower's foot: shopfronts lit behind concrete columns, a fascia with a tube along it, a dark mezzanine."""
    hx, hy = s[0] / 2, s[1] / 2
    r = keyed()
    g = -hy + 0.6
    # The shopfronts stand back no further than a solid may stand proud of a model (5 cm, corners too).
    inset = 0.035
    tube = r.choice(NEON)
    out = [box([-hx, -hy, -hx], [hx, g + 0.3, hx], concrete)]
    out.append(box([-hx + inset, g + 0.3, -hx + inset], [hx - inset, hy - 0.4, hx - inset], glass))
    out.append(box([-hx + 0.03, g + 3.8, -hx + 0.03], [hx - 0.03, g + 4.6, hx - 0.03], clad_dark))
    out.append(box([-hx, hy - 0.4, -hx], [hx, hy, hx], concrete))
    cols = max(2, round(s[0] / 4))
    w = s[0] / cols
    lit = [[r.random() < 0.7 for _ in range(cols)] for _ in range(4)]
    tint = [[r.choice((lit_warm, lit_warm, lit_cool)) for _ in range(cols)] for _ in range(4)]

    def face(k):
        o = []
        for i in range(cols + 1):
            u = -hx + i * w
            o.append(box([max(-hx, u - 0.3), g + 0.3, hx - inset], [min(hx, u + 0.3), g + 3.8, hx], concrete))
            o.append(box([max(-hx, u - 0.2), g + 4.6, hx - inset], [min(hx, u + 0.2), hy - 0.4, hx], clad_dark))
        for i in range(cols):
            u0, u1 = -hx + i * w + 0.3, -hx + (i + 1) * w - 0.3
            if lit[k][i]:
                o.append(box([u0, g + 0.3, hx - inset], [u1, g + 3.5, hx - inset + 0.015], tint[k][i]))
            if not lod:
                o.append(box([u0, g + 3.45, hx - inset], [u1, g + 3.6, hx], steel_dark))
        o.append(box([-hx + 1.0, g + 4.1, hx - 0.03], [hx - 1.0, g + 4.3, hx], tube))
        return o

    return out + faces4(face)


def tower_body(s, lod, rng):
    """A tower's floors: slab edges round each, fins between the bays, dark glass behind and a share of its windows lit."""
    hx, hy = s[0] / 2, s[1] / 2
    r = keyed()
    style = r.choice(("grid", "glass", "grid"))
    band_mat = r.choice((clad, clad_warm, clad_dark)) if style == "grid" else clad_dark
    core = glass if style == "grid" else glass_blue
    fh = 3.6
    floors = max(1, round(s[1] / fh))
    fh = s[1] / floors
    band = 0.9 if style == "grid" else 0.3
    fin = 0.4 if style == "grid" else 0.12
    # The glass stands back of the fins and slab edges no further than a solid may stand proud of a model.
    inset = 0.035
    bays = max(2, round(s[0] / (3.0 if style == "grid" else 1.8)))
    bw = s[0] / bays
    share = r.uniform(0.22, 0.4)
    out = [box([-hx + inset, -hy, -hx + inset], [hx - inset, hy - 0.5, hx - inset], core)]
    for j in range(floors):
        y = -hy + j * fh
        out.append(box([-hx, y, -hx], [hx, y + band, hx], band_mat))
    out.append(box([-hx, hy - 0.5, -hx], [hx, hy, hx], band_mat))
    # Lit rooms: runs of a few bays on a floor, warm or cold, the same plan on every face turned.
    lit = []
    for k in range(4):
        for j in range(floors):
            i = 0
            while i < bays:
                if r.random() < share:
                    n = r.randint(1, 3)
                    lit.append((k, j, i, min(bays, i + n), r.choice((lit_warm, lit_warm, lit_cool, lit_dim))))
                    i += n
                i += 1

    def face(k):
        o = []
        for j in range(floors):
            y0 = -hy + j * fh + band
            y1 = min(-hy + (j + 1) * fh, hy - 0.5)
            if not lod or style == "grid":
                for i in range(1, bays):
                    u = -hx + i * bw
                    o.append(box([u - fin / 2, y0, hx - inset], [u + fin / 2, y1, hx], band_mat if style == "grid" else steel))
        for kk, j, i0, i1, m in lit:
            if kk != k:
                continue
            y0 = -hy + j * fh + band
            y1 = min(-hy + (j + 1) * fh, hy - 0.5)
            o.append(box([max(-hx + inset, -hx + i0 * bw + fin / 2), y0, hx - inset], [min(hx - inset, -hx + i1 * bw - fin / 2), y1, hx - inset + 0.015], m))
        return o

    return out + faces4(face)


def crown(s, lod, rng):
    """A tower's top: plant behind louvres, a lit ring, a mast with its beacon."""
    hx, hy = s[0] / 2, s[1] / 2
    r = keyed()
    out = [box([-hx + 0.2, -hy, -hx + 0.2], [hx - 0.2, -hy + 3.0, hx - 0.2], steel_dark)]
    out.append(box([-hx, -hy + 3.0, -hx], [hx, -hy + 3.4, hx], r.choice(NEON)))
    out.append(box([-hx * 0.6, -hy + 3.4, -hx * 0.6], [hx * 0.6, -hy + 4.2, hx * 0.6], plate))
    out.append(kit.cylinder(0.12, -hy + 4.2, hy - 0.3, (0, 0, 0), "y", steel, 8))
    out.append(box([-0.18, hy - 0.3, -0.18], [0.18, hy, 0.18], beacon))
    if not lod:
        def face(k):
            o = []
            for i in range(10):
                y = -hy + 0.3 + i * 0.27
                o.append(box([-hx + 0.3, y, hx - 0.2], [hx - 0.3, y + 0.08, hx], steel))
            return o

        out += faces4(face)
    return out


def vsign(s, lod, rng):
    """A tall sign on a tower's corner: a word down both faces, a border in another colour."""
    hy = s[1] / 2
    thin = thin_axis(s)
    L, T = s[2 - thin], s[thin]
    r = keyed()
    a, b = r.sample(NEON, 2)
    out = [fbox(thin, -L / 2, L / 2, -hy, hy, -T / 2 + 0.06, T / 2 - 0.06, black)]
    n = (T / 2 - 0.06, T / 2)

    def face():
        return lettering(thin, -L / 2 + 0.35, L / 2 - 0.35, -hy + 0.5, hy - 0.5, *n, a, r, vertical=True) + border(thin, -L / 2 + 0.05, L / 2 - 0.05, -hy + 0.05, hy - 0.05, *n, 0.1, b)

    return out + both_faces(r, face)


rk.dress("podium", podium)
rk.dress("tower-body", tower_body)
rk.dress("crown", crown)
rk.dress("vsign", vsign)

# ------------------------------------------------------------------ the highway


def deck(s, lod, rng):
    """A span of the deck: asphalt on a concrete box, lane lines, a steel expansion joint at each end."""
    hx, hy, hz = s[0] / 2, s[1] / 2, s[2] / 2
    out = [box([-hx, -hy, -hz + 0.01], [hx, hy - 0.2, hz - 0.01], concrete), box([-hx, hy - 0.2, -hz], [hx, hy - 0.01, hz], asphalt)]
    if not lod:
        for z in (-2.0, 2.0):
            for k in range(int(s[0] / 4)):
                x = -hx + 1.0 + k * 4.0
                out.append(box([x, hy - 0.01, z - 0.08], [x + 2.0, hy, z + 0.08], line_white))
        for z in (-4.9, 4.9):
            out.append(box([-hx, hy - 0.01, z - 0.08], [hx, hy, z + 0.08], line_yellow))
        out.append(box([hx - 0.12, hy - 0.2, -hz], [hx, hy - 0.005, hz], steel_dark))
        # Stains down the deck's edges from its drains.
        for x in (-hx + 3.0, hx - 5.0):
            for side in (-1, 1):
                za, zb = (hz - 0.01, hz) if side > 0 else (-hz, -hz + 0.01)
                out.append(box([x, -hy, za], [x + 0.6, hy - 0.2, zb], tar))
    return out


def pier(s, lod, rng):
    """A pier under the deck: a concrete column, a cap, a tag or two at head height."""
    hx, hy, hz = s[0] / 2, s[1] / 2, s[2] / 2
    r = keyed()
    out = [box([-hx + 0.02, -hy, -hz + 0.02], [hx - 0.02, hy - 0.5, hz - 0.02], concrete, 0 if lod else 0.04), box([-hx, hy - 0.5, -hz], [hx, hy, hz], concrete)]
    for side in (-1, 1):
        xa, xb = (hx - 0.02, hx) if side > 0 else (-hx, -hx + 0.02)
        m = r.choice(GRAFFITI)
        w = r.uniform(0.8, 1.9)
        y = -hy + r.uniform(0.8, 1.6)
        out.append(box([xa, y, -w / 2], [xb, y + r.uniform(0.5, 1.1), w / 2], m))
    return out


def parapet(s, lod, rng):
    """The deck's parapet: concrete panels, a steel rail on top, a lit strip along both faces."""
    hy = s[1] / 2
    thin = thin_axis(s)
    L, T = s[2 - thin], s[thin]
    out = []
    n = 1 if lod else max(1, round(L / 4))
    for i in range(n):
        a, b = -L / 2 + L * i / n, -L / 2 + L * (i + 1) / n
        out.append(fbox(thin, a, b, -hy, hy - 0.12, -T / 2 + 0.02, T / 2 - 0.02, concrete))
    out.append(fbox(thin, -L / 2, L / 2, hy - 0.12, hy, -T / 2 + 0.08, T / 2 - 0.08, steel))
    for side in (-1, 1):
        nn = (T / 2 - 0.02, T / 2) if side > 0 else (-T / 2, -T / 2 + 0.02)
        out.append(fbox(thin, -L / 2, L / 2, hy - 0.4, hy - 0.32, *nn, cyan))
    return out


def jersey(s, lod, rng):
    """A jersey barrier: its sloped profile along its length, in two-metre sections."""
    thin = thin_axis(s)
    L = s[2 - thin]
    hy = s[1] / 2
    t = s[thin] / 2
    prof = [(-hy, -t), (-hy + 0.08, -t), (-hy + 0.25, -t * 0.6), (hy, -t * 0.27), (hy, t * 0.27), (-hy + 0.25, t * 0.6), (-hy + 0.08, t), (-hy, t)]
    n = 1 if lod else max(1, round(L / 2))
    out = []
    for i in range(n):
        a, b = -L / 2 + L * i / n + (0 if lod else 0.01), -L / 2 + L * (i + 1) / n - (0 if lod else 0.01)
        out.append(kit.section(prof, a, b, concrete))
    if thin == 0:
        turned(out, math.pi / 2)
    return out


CAR = (4.3, 1.5, 1.9)


def car_metres(paint, lod):
    """A hatchback, abandoned, drawn in metres from the ground up: body and glasshouse one closed outline."""
    out = [box([-1.7, 0.3, -0.6], [1.7, 0.55, 0.6], black)]
    out.append(kit.prism([(-2.13, 0.55), (2.13, 0.55), (2.13, 0.9), (1.2, 1.0), (0.4, 1.48), (-1.6, 1.48), (-2.1, 1.05), (-2.13, 0.9)], -0.9, 0.9, paint))
    for x, z in ((1.35, 0.72), (1.35, -0.72), (-1.35, 0.72), (-1.35, -0.72)):
        r = 0.32
        if lod:
            out.append(kit.cylinder(r, z - 0.11, z + 0.11, (x, r, z), "z", rubber, 10))
        else:
            out += kit.wheel(x, r, z, r, 0.22, rubber, steel, black, 14, 0.6, 1 if z > 0 else -1)
    if not lod:
        out.append(kit.prism([(1.18, 1.02), (1.2, 1.02), (0.42, 1.46), (0.4, 1.46)], -0.78, 0.78, glass))
        for s in (-1, 1):
            lo, hi = (0.9, 0.912) if s > 0 else (-0.912, -0.9)
            out.append(kit.prism([(-1.55, 1.05), (1.0, 1.05), (0.42, 1.42), (-1.55, 1.42)], lo, hi, glass))
        out.append(box([2.13, 0.6, -0.86], [2.15, 0.82, 0.86], steel))
        out.append(box([-2.15, 0.6, -0.86], [-2.13, 0.82, 0.86], steel))
        out.append(kit.prism([(-2.06, 1.1), (-2.08, 1.1), (-1.66, 1.46), (-1.64, 1.46)], -0.6, 0.6, glass))
        # Tail lights still faintly lit on one in three: the battery not dead yet.
        out.append(box([-2.15, 0.85, -0.8], [-2.13, 0.98, -0.55], crate_red))
        out.append(box([-2.15, 0.85, 0.55], [-2.13, 0.98, 0.8], crate_red))
    return out


def hw_car(s, lod, rng):
    r = keyed()
    return moved(car_metres(r.choice(PAINT), lod), y=-s[1] / 2)


def bus(s, lod, rng):
    """A city bus left across the lanes: its body, a band of dark windows, a livery stripe, the destination lit."""
    hx, hy, hz = s[0] / 2, s[1] / 2, s[2] / 2
    out = [box([-hx + 0.6, 0.3, -hz + 0.35], [hx - 0.6, 0.6, hz - 0.35], black)]
    bz = hz - 0.05
    out.append(kit.prism([(-hx + 0.05, 0.6), (hx - 0.05, 0.6), (hx - 0.05, 2.7), (hx - 0.3, 2.95), (-hx + 0.3, 2.95), (-hx + 0.05, 2.7)], -bz, bz, PAINT[2]))
    for x in (-hx + 2.4, hx - 2.4):
        for z in (-hz + 0.35, hz - 0.35):
            rr = 0.5
            if lod:
                out.append(kit.cylinder(rr, z - 0.15, z + 0.15, (x, rr, z), "z", rubber, 10))
            else:
                out += kit.wheel(x, rr, z, rr, 0.3, rubber, steel, black, 16, 0.6, 1 if z > 0 else -1)
    for side in (-1, 1):
        za, zb = (bz, hz) if side > 0 else (-hz, -bz)
        out.append(box([-hx + 0.6, 1.5, za], [hx - 0.9, 2.5, zb], glass))
        out.append(box([-hx + 0.3, 1.0, za], [hx - 0.3, 1.25, zb], PAINT[0]))
    out.append(box([hx - 0.05, 1.3, -bz + 0.1], [hx, 2.5, bz - 0.1], glass))
    out.append(box([hx - 0.05, 2.55, -bz + 0.3], [hx, 2.8, bz - 0.3], amber))
    return moved(out, y=-hy)


def lamp(s, lod, rng):
    """A lamp post on the parapet, its sodium head lit."""
    hx, hy, hz = s[0] / 2, s[1] / 2, s[2] / 2
    return [
        box([-0.15, -hy, -0.15], [0.15, -hy + 0.1, 0.15], steel_dark),
        kit.cylinder(0.07, -hy + 0.1, hy - 0.3, (0, 0, 0), "y", steel, 8),
        box([-hx, hy - 0.3, -hz], [hx, hy, hz], steel_dark),
        box([-hx + 0.04, hy - 0.32, -hz + 0.04], [hx - 0.04, hy - 0.3, hz - 0.04], sodium),
    ]


rk.dress("deck", deck)
rk.dress("pier", pier)
rk.dress("parapet", parapet)
rk.dress("jersey", jersey)
rk.dress("hw-car", hw_car)
rk.dress("bus", bus)
rk.dress("lamp", lamp)

# ------------------------------------------------------------------ the kit for the cover pass's pieces (unit boxes)


def shrink(out, size):
    m = Matrix.Diagonal((1 / size[0], 1 / size[2], 1 / size[1], 1.0))
    for o in out:
        o.data.transform(m)
    return out


BURY = 0.6  # a stretched piece's foot is sunk this far under the ground at its lowest corner

SHOP = (11.0, 8.0 + BURY, 10.0)


def shop(lod, rng):
    """A two-storey corner shop: brick over a shuttered front (+z), one bay still lit, a sign over it, windows above,
    a cornice, a pipe down the back. Everything within the walls' face or on it."""
    hx, hz = SHOP[0] / 2, SHOP[2] / 2
    top = SHOP[1]
    g = BURY
    i = 0.04
    r = random.Random("nc-shop")
    out = [box([-hx, 0, -hz], [hx, g + 0.3, hz], concrete)]
    out.append(box([-hx + i, g + 0.3, -hz + i], [hx - i, top - 0.4, hz - i], brick))
    out.append(box([-hx, top - 0.4, -hz], [hx, top, hz], concrete))
    out.append(box([-hx, g + 3.6, -hz], [hx, g + 4.0, hz], concrete))
    # The front: three bays between brick piers, two shuttered, one lit glass, the sign over all.
    bays = [(-hx + 0.5, -2.0), (-1.5, 1.5), (2.0, hx - 0.5)]
    for k, (a, b) in enumerate(bays):
        if k == 1:
            out.append(box([a, g + 0.3, hz - i], [b, g + 3.0, hz - i + 0.02], lit_warm))
        else:
            out.append(box([a, g + 0.3, hz - i], [b, g + 3.0, hz - 0.012], shutter))
            if not lod:
                for j in range(9):
                    y = g + 0.4 + j * 0.3
                    out.append(box([a, y, hz - 0.012], [b, y + 0.03, hz - 0.004], steel_dark))
                m = r.choice(GRAFFITI)
                out.append(box([a + 0.4, g + 0.6, hz - 0.012], [a + 0.4 + r.uniform(1.0, 2.2), g + 1.5, hz], m))
    out.append(box([-hx + 0.6, g + 3.05, hz - i], [hx - 0.6, g + 3.55, hz - 0.012], black))
    out.append(box([-hx + 0.8, g + 3.15, hz - 0.012], [hx - 0.8, g + 3.45, hz], magenta))
    # Windows above on all four sides, a third lit.
    n = 0
    for side in range(4):
        L = SHOP[0] if side % 2 == 0 else SHOP[2]
        cnt = 3 if L > 9 else 2
        for j in range(cnt):
            u = -L / 2 + (j + 0.5) * L / cnt
            m = (lit_warm, glass, lit_cool, glass, glass)[n % 5]
            n += 1
            a, b = u - 0.8, u + 0.8
            if side == 0:
                parts = [box([a, g + 4.6, hz - i], [b, g + 6.6, hz - i + 0.02], m)]
                if not lod:
                    parts.append(box([a - 0.1, g + 4.45, hz - i], [b + 0.1, g + 4.6, hz], concrete))
            elif side == 2:
                parts = [box([a, g + 4.6, -hz + i - 0.02], [b, g + 6.6, -hz + i], m)]
            elif side == 1:
                parts = [box([hx - i, g + 4.6, a], [hx - i + 0.02, g + 6.6, b], m)]
            else:
                parts = [box([-hx + i - 0.02, g + 4.6, a], [-hx + i, g + 6.6, b], m)]
            out += parts
    if not lod:
        out.append(box([hx - 1.0, g + 0.3, -hz], [hx - 0.85, top - 0.4, -hz + i], steel_dark))
        out.append(box([-hx + 1.2, g + 7.0, -hz], [-hx + 2.6, g + 7.4, -hz + i], cyan))
    return shrink(out, SHOP)


BARRIER = (11.0, 3.2 + BURY, 0.7)


def barrier(lod, rng):
    """A street's concrete barrier wall: panels between posts, a coping, tags and paste-ups on both faces."""
    hx, hz = BARRIER[0] / 2, BARRIER[2] / 2
    top = BARRIER[1]
    r = random.Random("nc-barrier")
    panels = 4
    w = BARRIER[0] / panels
    out = []
    for k in range(panels):
        x0, x1 = -hx + k * w, -hx + (k + 1) * w
        out.append(box([x0 + 0.2, 0, -hz + 0.06], [x1 - 0.2, top - 0.15, hz - 0.06], concrete, 0 if lod else 0.02))
        out.append(box([x0, 0, -hz], [x0 + 0.2, top - 0.15, hz], concrete, 0 if lod else 0.02))
        out.append(box([x1 - 0.2, 0, -hz], [x1, top - 0.15, hz], concrete, 0 if lod else 0.02))
    out.append(box([-hx, top - 0.15, -hz], [hx, top, hz], concrete))
    for k in range(panels):
        x0 = -hx + k * w + 0.35
        for side in (-1, 1):
            if r.random() < 0.75:
                za, zb = (hz - 0.06, hz - 0.045) if side > 0 else (-hz + 0.045, -hz + 0.06)
                m = r.choice(GRAFFITI + [line_white, crate_red])
                y = BURY + r.uniform(0.2, 0.8)
                out.append(box([x0, y, za], [x0 + r.uniform(1.0, w - 0.7), y + r.uniform(0.6, 1.6), zb], m))
    return shrink(out, BARRIER)


NCCAR = (4.4, 1.6, 2.0)


def nc_car(paint):
    def build(lod, rng):
        return shrink(car_metres(paint, lod), NCCAR)

    return build


def boxes(lod, rng):
    """A pallet-load of goods left on the pavement, square and flat-topped to climb onto: two tiers of cartons and
    plastic crates packed tight on a pallet, strapped round, a shipping label on each side. One closed block under a
    skin of carton faces (no two faces of it meet face to face), so the solid fitter reads it as the one box it is."""
    out = [box([-0.48, 0, -0.48], [0.48, 0.99, 0.48], card)]
    # Each carton's colour by tier and quadrant; a face shows the cartons behind it.
    mats = {0: (card, crate_blue, card, crate_red), 1: (crate_red, card, crate_blue, card)}
    quad = lambda x, z: (1 if x > 0 else 0) + (2 if z > 0 else 0)  # noqa: E731
    tiers = ((0, 0.09, 0.535), (1, 0.545, 0.99))
    g = 0.004
    for side in range(4):
        for t, y0, y1 in tiers:
            for h in (-1, 1):
                u0, u1 = (-0.48, -g) if h < 0 else (g, 0.48)
                if side == 0:
                    lo, hi, q = [u0, y0, 0.481], [u1, y1, 0.49], quad(h, 1)
                elif side == 1:
                    lo, hi, q = [u0, y0, -0.49], [u1, y1, -0.481], quad(h, -1)
                elif side == 2:
                    lo, hi, q = [0.481, y0, u0], [0.49, y1, u1], quad(1, h)
                else:
                    lo, hi, q = [-0.49, y0, u0], [-0.481, y1, u1], quad(-1, h)
                out.append(box(lo, hi, mats[t][q]))
        # The pallet's edge boards.
        lo, hi = ([-0.5, 0, 0.481], [0.5, 0.08, 0.5]) if side == 0 else ([-0.5, 0, -0.5], [0.5, 0.08, -0.481]) if side == 1 else ([0.481, 0, -0.48], [0.5, 0.08, 0.48]) if side == 2 else ([-0.5, 0, -0.48], [-0.481, 0.08, 0.48])
        out.append(box(lo, hi, wood))
    for hx_ in (-1, 1):
        for hz_ in (-1, 1):
            x0, x1 = (-0.48, -g) if hx_ < 0 else (g, 0.48)
            z0, z1 = (-0.48, -g) if hz_ < 0 else (g, 0.48)
            out.append(box([x0, 0.991, z0], [x1, 1.0, z1], mats[1][quad(hx_, hz_)]))
    if not lod:
        # Two straps round the load, and a label on each face.
        for x in (-0.26, 0.24):
            for side in (-1, 1):
                za, zb = (0.49, 0.5) if side > 0 else (-0.5, -0.49)
                out.append(box([x - 0.025, 0.08, za], [x + 0.025, 1.0, zb], black))
        out.append(box([-0.3, 0.62, 0.49], [-0.1, 0.78, 0.5], line_white))
        out.append(box([0.1, 0.2, -0.5], [0.3, 0.36, -0.49], line_white))
        out.append(box([0.49, 0.62, -0.2], [0.5, 0.78, 0.0], line_white))
        out.append(box([-0.5, 0.2, 0.0], [-0.49, 0.36, 0.2], line_white))
    return out


rk.unit("nc-shop", shop)
rk.unit("nc-barrier", barrier)
rk.unit("nc-car", nc_car(PAINT[1]))
rk.unit("nc-car-b", nc_car(PAINT[0]))
rk.unit("nc-boxes", boxes)

missing = sorted({b["part"] for p in rk.plan["pieces"].values() for b in p} - rk.dressers.keys()) + sorted(set(rk.plan["kit"]) - rk.units.keys())
if missing:
    raise RuntimeError(f"nothing dresses {missing}")

built = rk.build()
strays = rk.strays(built)
result = {
    "assets": {o.name: {"tris": kit.tris(o), "size": [round(d, 2) for d in o.dimensions], "stray": strays[o.name]} for o in built},
    "worst": max(strays.values()),
}
if ARGS.get("export", False):  # noqa: F821
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    kit.export(built, OUT)
    result["glb"] = {"path": os.path.abspath(OUT), "bytes": os.path.getsize(OUT)}
