"""Frostbite Peaks' kit (ticket 21): a snowed-in radar base on the plateau under the summit, its watchtower and its
stopped cableway, and the models the cover pass's pieces there wear. Builds apps/range/public/models/frostbite.glb:

    blender -b --factory-startup --python tools/map/build.py -- tools/map/regions/frostbite.py --export --preview DIR

The pieces' boxes come from tools/map/regions/frostbite.json, which the test writes from the plan
(apps/range/src/map/zero-island-frostbite-plan.ts; `UPDATE_KIT=1`). See tools/map/regionkit.py for the pattern.
Permanent dusk over snow: pale precast concrete banded olive, olive corrugated huts, white radome panels, red
cableway cars, blue-white ice heaved through the drifts, snow lying on every roof, sill and step, a few windows lit.
"""
import math
import os
import random
import sys

from mathutils import Matrix, Vector

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(HERE))
import regionkit  # noqa: E402

OUT = os.path.join(HERE, "..", "..", "..", "apps", "range", "public", "models", "frostbite.glb")
rk = regionkit.RegionKit(bkit, "frostbite", os.path.join(HERE, "frostbite.json"))  # noqa: F821
kit = rk.kit
box = rk.box

# Finishes: colour (sRGB) and the photo layer it wears.
concrete = rk.mat("fb.concrete", (176, 178, 180), "wall", 0.9)
concrete_dark = rk.mat("fb.concretedark", (96, 100, 104), "wall", 0.9)
slab = rk.mat("fb.slab", (138, 140, 142), "slab", 0.9)
olive = rk.mat("fb.olive", (88, 98, 70), "plate", 0.6, 0.3)
olive_dark = rk.mat("fb.olivedark", (58, 64, 48), "plate", 0.6, 0.3)
steel = rk.mat("fb.steel", (104, 108, 114), "steel", 0.55, 0.5)
steel_dark = rk.mat("fb.steeldark", (46, 48, 52), "steel", 0.6, 0.4)
grating = rk.mat("fb.grating", (34, 36, 40), None, 0.7, 0.4)
red = rk.mat("fb.red", (176, 38, 32), "plate", 0.45, 0.3)
orange = rk.mat("fb.orange", (210, 104, 30), "plate", 0.5, 0.2)
white = rk.mat("fb.white", (226, 228, 230), "plate", 0.5, 0.1)
seam = rk.mat("fb.seam", (150, 154, 160), None, 0.6)
yellow = rk.mat("fb.yellow", (214, 172, 40), "plate", 0.6, 0.1)
plank = rk.mat("fb.plank", (124, 96, 70), "plank", 0.85)
plank_dark = rk.mat("fb.plankdark", (82, 62, 46), "plank", 0.85)
glass = rk.mat("fb.glass", (24, 32, 44), None, 0.12, 0.3)
dark = rk.mat("fb.dark", (26, 28, 30), None, 0.9)
rubber = rk.mat("fb.rubber", (30, 30, 32), None, 0.95)
canvas = rk.mat("fb.canvas", (128, 120, 92), None, 0.95)
sandbag = rk.mat("fb.sandbag", (150, 136, 104), None, 0.95)
snow = rk.mat("fb.snow", (236, 240, 248), "snow", 0.8)
ice = rk.mat("fb.ice", (150, 204, 232), "ice", 0.15, glow=(0.03, 0.08, 0.12))
ice_deep = rk.mat("fb.icedeep", (84, 150, 196), "ice", 0.15, glow=(0.02, 0.06, 0.1))
drum_blue = rk.mat("fb.drumblue", (44, 78, 130), "steel", 0.5, 0.3)
drum_red = rk.mat("fb.drumred", (150, 40, 34), "steel", 0.5, 0.3)

# Light: a few windows lit warm, the obstruction beacons red.
lit_warm = rk.mat("fb.litwarm", (255, 204, 150), None, 0.4, glow=(1.0, 0.64, 0.3))
lit_cool = rk.mat("fb.litcool", (196, 224, 255), None, 0.4, glow=(0.42, 0.62, 0.95))
beacon = rk.mat("fb.beacon", (255, 40, 30), None, 0.4, glow=(1.4, 0.08, 0.05))

# What's picked by chance must be the same in a piece's model and its `-lod` twin: each box draws from a generator
# keyed by the piece and the box's place in it. `CUR` also tells a dresser where its box stands, for heights that
# hold across a wall's boxes (a band at the same height round the building).
CUR = {"name": "", "n": 0, "b": None}
_piece = rk.piece
_boxes = rk._boxes


def _keyed_piece(name, lod):
    CUR["name"], CUR["n"] = name, 0
    return _piece(name, lod)


def _tracked(boxes):
    for kind, b in _boxes(boxes):
        CUR["b"] = b
        CUR["n"] += 1
        yield kind, b


rk.piece = _keyed_piece
rk._boxes = _tracked


def R():
    return random.Random(f"{CUR['name']}:{CUR['n']}")


def base_y():
    """The piece-frame height of the current box's middle."""
    return CUR["b"]["c"][1]


def snow_cap(lo, hi, depth=0.08, inset=0.04):
    """A layer of snow lying on top of the box lo..hi: its top the box's, set in from the edges."""
    return box([lo[0] + inset, hi[1] - depth, lo[2] + inset], [hi[0] - inset, hi[1], hi[2] - inset], snow)


def thin_axis(s):
    return 0 if s[0] < s[2] else 2


def stack(s, cuts, mats, lod, joints=0.0):
    """A wall's box as courses one above another, cut at piece-frame heights `cuts`, each its own finish: no face
    of one lies on another's. `joints` > 0 bevels each course's long edges into joints."""
    hx, hy, hz = s[0] / 2, s[1] / 2, s[2] / 2
    y0 = base_y() - hy
    edges = [-hy] + [c - base_y() for c in cuts if -hy < c - base_y() < hy] + [hy]
    out = []
    for i, (a, b) in enumerate(zip(edges, edges[1:])):
        # The finish of the course this run of the box is in.
        mid = base_y() + (a + b) / 2
        k = sum(1 for c in cuts if c <= mid)
        out.append(box([-hx, a, -hz], [hx, b, hz], mats[k], 0 if lod else joints))
    return out


# ------------------------------------------------------------------ the ops building


def ops_wall(s, lod, rng):
    """Precast panels, pale, on a dark plinth, an olive band under the roof; snow on every sill. The panels stand
    apart with a dark joint let in between each, so no face lies on another."""
    hx, hy, hz = s[0] / 2, s[1] / 2, s[2] / 2
    top = base_y() + hy
    sill = top < 3.9
    y_top = hy - (0.05 if sill else 0.0)
    cuts = [c - base_y() for c in (0.3, 3.3, 3.7)]
    edges = [-hy] + [c for c in cuts if -hy < c < y_top] + [y_top]
    mats = [concrete_dark, concrete, olive, concrete]
    t = thin_axis(s)
    th = s[t] / 2
    L = s[2 - t]
    out = []

    def part(u0, u1, y0, y1, d, m):
        lo, hi = [0, y0, 0], [0, y1, 0]
        lo[t], hi[t] = -th + d, th - d
        lo[2 - t], hi[2 - t] = u0, u1
        out.append(box(lo, hi, m))

    for a_, b_ in zip(edges, edges[1:]):
        k = sum(1 for c in cuts if c <= (a_ + b_) / 2)
        if lod or k != 1 or L < 2.0:
            part(-L / 2, L / 2, a_, b_, 0, mats[k])
            continue
        n = max(1, round(L / 1.5))
        for i in range(n):
            u0, u1 = -L / 2 + L * i / n, -L / 2 + L * (i + 1) / n
            part(u0 + (0.015 if i else 0), u1 - (0.015 if i < n - 1 else 0), a_, b_, 0, concrete)
            if i < n - 1:
                part(u1 - 0.015, u1 + 0.015, a_, b_, 0.012, seam)
    if sill:
        out.append(box([-hx, y_top, -hz], [hx, hy, hz], snow))
    return out


def inner_wall(s, lod, rng):
    return stack(s, [0.15], [concrete_dark, rk.mat("fb.plaster", (196, 190, 176), "wall", 0.9)], lod)


def roof(s, lod, rng):
    """The roof slab, its edge showing, snow lying on it."""
    hx, hy, hz = s[0] / 2, s[1] / 2, s[2] / 2
    out = [box([-hx, -hy, -hz], [hx, hy - 0.1, hz], concrete_dark), box([-hx + 0.05, hy - 0.1, -hz + 0.05], [hx - 0.05, hy, hz - 0.05], snow)]
    return out


def parapet(s, lod, rng):
    hx, hy, hz = s[0] / 2, s[1] / 2, s[2] / 2
    return [box([-hx, -hy, -hz], [hx, hy - 0.06, hz], concrete), box([-hx, hy - 0.06, -hz], [hx, hy, hz], snow)]


def step(s, lod, rng):
    """A concrete step, snow packed on its tread but for a trodden line up the middle."""
    hx, hy, hz = s[0] / 2, s[1] / 2, s[2] / 2
    out = [box([-hx, -hy, -hz], [hx, hy - 0.04, hz], concrete)]
    if lod:
        out.append(box([-hx, hy - 0.04, -hz], [hx, hy, hz], concrete))
        return out
    w = 0.45
    out.append(box([-hx, hy - 0.04, -hz], [hx, hy, -w], snow))
    out.append(box([-hx, hy - 0.04, -w], [hx, hy - 0.01, w], slab))
    out.append(box([-hx, hy - 0.04, w], [hx, hy, hz], snow))
    return out


def plant(s, lod, rng):
    """A plant unit: a steel cabinet, louvres down its sides, a fan in its top, snow drifted on it."""
    hx, hy, hz = s[0] / 2, s[1] / 2, s[2] / 2
    out = [box([-hx + 0.02, -hy, -hz + 0.02], [hx - 0.02, hy - 0.06, hz - 0.02], steel, 0 if lod else 0.02)]
    out.append(box([-hx + 0.3, hy - 0.06, -hz + 0.2], [hx - 0.3, hy, hz - 0.2], snow))
    if not lod:
        for i in range(8):
            y = -hy + 0.2 + i * 0.13
            for side in (-1, 1):
                z0, z1 = (hz - 0.02, hz) if side > 0 else (-hz, -hz + 0.02)
                out.append(box([-hx + 0.25, y, z0], [hx - 0.25, y + 0.05, z1], steel_dark))
        out.append(kit.cylinder(0.32, hy - 0.08, hy - 0.06, (-hx + 0.55, 0, 0), "y", grating, 16))
    return out


def mast(s, lod, rng):
    """The radio mast: a steel pole with its stays' collars, aerials and a red beacon at the top."""
    hx, hy, hz = s[0] / 2, s[1] / 2, s[2] / 2
    out = [kit.cylinder(0.09, -hy, hy - 0.2, (0, 0, 0), "y", steel, 8 if lod else 12)]
    out.append(kit.cylinder(0.12, hy - 0.2, hy, (0, 0, 0), "y", beacon, 8))
    if not lod:
        for y in (-hy + 2, -hy + 4, hy - 0.8):
            out.append(box([-hx, y, -0.03], [hx, y + 0.06, 0.03], steel))
            out.append(box([-0.03, y, -hz], [0.03, y + 0.06, hz], steel))
        out.append(kit.cylinder(0.14, -hy, -hy + 0.3, (0, 0, 0), "y", steel_dark, 12))
    return out


def desk(s, lod, rng):
    hx, hy, hz = s[0] / 2, s[1] / 2, s[2] / 2
    out = [box([-hx, hy - 0.05, -hz], [hx, hy, hz], plank)]
    out.append(box([-hx + 0.04, -hy, -hz + 0.04], [-hx + 0.6, hy - 0.05, hz - 0.04], steel))
    out.append(box([hx - 0.6, -hy, -hz + 0.04], [hx - 0.04, hy - 0.05, hz - 0.04], steel))
    return out


def locker(s, lod, rng):
    hx, hy, hz = s[0] / 2, s[1] / 2, s[2] / 2
    out = [box([-hx, -hy, -hz], [hx - 0.01, hy, hz], olive_dark)]
    if not lod:
        n = 4
        for i in range(n):
            z0 = -hz + s[2] * i / n
            out.append(box([hx - 0.01, -hy + 0.1, z0 + 0.03], [hx, hy - 0.05, z0 + s[2] / n - 0.03], olive))
            out.append(box([hx - 0.012, hy - 0.4, z0 + 0.1], [hx, hy - 0.25, z0 + 0.25], steel_dark))
    return out


def crate(s, lod, rng):
    """A stores crate, olive, its lid's battens and a stencilled patch."""
    hx, hy, hz = s[0] / 2, s[1] / 2, s[2] / 2
    i = 0.012
    out = [box([-hx + i, -hy, -hz + i], [hx - i, hy - 0.04, hz - i], olive, 0 if lod else 0.01)]
    out.append(box([-hx + i, hy - 0.04, -hz + i], [hx - i, hy, hz - i], snow))
    if not lod:
        for y in (-hy + 0.05, hy - 0.12):
            out.append(box([-hx, y, -hz], [hx, y + 0.05, -hz + i], olive_dark))
            out.append(box([-hx, y, hz - i], [hx, y + 0.05, hz], olive_dark))
            out.append(box([-hx, y, -hz + i], [-hx + i, y + 0.05, hz - i], olive_dark))
            out.append(box([hx - i, y, -hz + i], [hx, y + 0.05, hz - i], olive_dark))
        out.append(box([-hx * 0.5, -0.1, hz - i], [hx * 0.5, 0.12, hz - i + 0.004], yellow))
    return out


rk.dress("ops-wall", ops_wall)
rk.dress("inner-wall", inner_wall)
rk.dress("roof", roof)
rk.dress("parapet", parapet)
rk.dress("step", step)
rk.dress("plant", plant)
rk.dress("mast", mast)
rk.dress("desk", desk)
rk.dress("locker", locker)
rk.dress("crate", crate)

# ------------------------------------------------------------------ the barracks


def hut_wall(s, lod, rng):
    """Olive corrugated sheet on a dark sill rail: ribs proud of the sheet, snow on the sills under the windows."""
    hx, hy, hz = s[0] / 2, s[1] / 2, s[2] / 2
    t = thin_axis(s)
    th = s[t] / 2
    top = base_y() + hy
    sill = top < 2.9
    y_top = hy - (0.06 if sill else 0.0)
    d = 0 if lod else 0.02
    lo, hi = [-hx, -hy, -hz], [hx, y_top, hz]
    lo[t], hi[t] = -th + d, th - d
    out = [box(lo, hi, olive)]
    if sill:
        out.append(box([-hx, y_top, -hz], [hx, hy, hz], snow))
    if lod:
        return out
    L = s[2 - t]
    # The sill rail along the foot: the ribs stop at it.
    y_rail = 0.25 - base_y()
    spans = [(-hy, y_top - 0.01)]
    if -hy < y_rail < y_top - 0.15:
        out.append(box([-hx, y_rail, -hz], [hx, y_rail + 0.12, hz], olive_dark))
        spans = [(-hy, y_rail), (y_rail + 0.12, y_top - 0.01)]
    n = max(1, int(L / 0.2))
    for i in range(n):
        u = -L / 2 + (i + 0.5) * L / n
        for side in (-1, 1):
            a_, b_ = (th - 0.02, th) if side > 0 else (-th, -th + 0.02)
            for y0, y1 in spans:
                if y1 - y0 < 0.02:
                    continue
                rl, rh = [0, y0, 0], [0, y1, 0]
                rl[t], rh[t] = a_, b_
                rl[2 - t], rh[2 - t] = u - 0.035, u + 0.035
                out.append(box(rl, rh, olive))
    return out


def gable(s, lod, rng):
    """The gable roof: olive sheet, its ends closed, snow lying thick along both slopes."""
    hx, hy, hz = s[0] / 2, s[1] / 2, s[2] / 2
    d = 0.14
    inner = [(-hy, -hz), (-hy, hz), (hy - d, 0.0)]
    out = [kit.section(inner, -hx, hx, olive_dark)]
    # The snow: between the sheet's slope and the box's, set in a little at the ends.
    snow_shell = [(-hy + 0.02, -hz), (hy, 0.0), (-hy + 0.02, hz), (hy - d, 0.0)]
    o = kit.section([snow_shell[0], snow_shell[3], snow_shell[2], snow_shell[1]], -hx + 0.08, hx - 0.08, snow)
    out.append(o)
    return out


def bunk(s, lod, rng):
    """A steel bunk: posts, two mattresses with olive blankets, a ladder rung or two."""
    hx, hy, hz = s[0] / 2, s[1] / 2, s[2] / 2
    out = []
    for x in (-hx + 0.03, hx - 0.03):
        for z in (-hz + 0.03, hz - 0.03):
            out.append(box([x - 0.03, -hy, z - 0.03], [x + 0.03, hy, z + 0.03], steel_dark))
    for y in (-hy + 0.35, -hy + 1.25):
        out.append(box([-hx + 0.06, y, -hz + 0.02], [hx - 0.06, y + 0.06, hz - 0.02], steel_dark))
        out.append(box([-hx + 0.06, y + 0.06, -hz + 0.04], [hx - 0.06, y + 0.2, hz - 0.04], canvas))
        if not lod:
            out.append(box([-hx + 0.5, y + 0.2, -hz + 0.05], [hx - 0.08, y + 0.24, hz - 0.05], olive_dark))
    return out


rk.dress("hut-wall", hut_wall)
rk.dress("gable", gable)
rk.dress("bunk", bunk)

# ------------------------------------------------------------------ the radar plateau


def plinth(s, lod, rng):
    """The radome's plinth: board-marked concrete, a hazard edge, snow on its top but round the drum."""
    hx, hy, hz = s[0] / 2, s[1] / 2, s[2] / 2
    out = [box([-hx, -hy, -hz], [hx, hy - 0.06, hz], concrete, 0 if lod else 0.03)]
    out.append(box([-hx + 0.3, hy - 0.06, -hz + 0.3], [hx - 0.3, hy - 0.02, hz - 0.3], slab))
    for a, b in ((-hz, -hz + 0.3), (hz - 0.3, hz)):
        out.append(box([-hx, hy - 0.06, a], [hx, hy, b], yellow if not lod else concrete))
    for a, b in ((-hx, -hx + 0.3), (hx - 0.3, hx)):
        out.append(box([a, hy - 0.06, -hz + 0.3], [b, hy, hz - 0.3], yellow if not lod else concrete))
    if not lod:
        # Drifts against the plinth's top corners.
        for sx in (-1, 1):
            for sz in (-1, 1):
                x0, x1 = sorted((sx * (hx - 0.3), sx * (hx - 2.0)))
                z0, z1 = sorted((sz * (hz - 0.3), sz * (hz - 1.4)))
                out.append(box([x0, hy - 0.02, z0], [x1, hy, z1], snow))
    return out


def drum(r, y0, y1, lod, rng):
    """The radome's drum: an octagon of white panels, a door into it."""
    R8 = (r - 0.02) / math.cos(math.pi / 8)
    ring = [(R8 * math.cos(math.pi / 8 + k * math.pi / 4), R8 * math.sin(math.pi / 8 + k * math.pi / 4)) for k in range(8)]
    out = [kit.plan(ring, y0, y1, white)]
    out.append(box([r - 0.03, y0, -0.7], [r, y0 + 2.0, 0.7], steel_dark))
    if not lod:
        out.append(kit.plan([(x * 1.0025, z * 1.0025) for x, z in ring], y1 - 0.25, y1 - 0.18, seam))
    return out


def dome(s, lod, rng):
    """The radome: a white sphere's cap of panels, a seam every course, its top above the drum."""
    hy = s[1] / 2
    R = s[0] / 2 - 0.01
    n = 8 if lod else 16
    prof = []
    for i in range(n + 1):
        a = (math.pi / 2) * i / n
        prof.append((-hy + R * math.sin(a), R * math.cos(a)))
    out = [kit.lathe(prof, (0, 0, 0), white, 24 if lod else 48)]
    if not lod:
        for i in (3, 6, 9, 12):
            a0, a1 = (math.pi / 2) * (i - 0.06) / n, (math.pi / 2) * (i + 0.06) / n
            band = [(-hy + R * math.sin(a0), R * math.cos(a0) + 0.008), (-hy + R * math.sin(a1), R * math.cos(a1) + 0.008)]
            out.append(kit.lathe(band, (0, 0, 0), seam, 48, caps=False))
    return out


def rail(s, lod, rng):
    """A handrail: posts every metre and a half, a top rail and a knee rail, yellow."""
    hx, hy, hz = s[0] / 2, s[1] / 2, s[2] / 2
    t = thin_axis(s)
    L = s[2 - t]
    th = s[t] / 2
    out = []

    def run(u0, u1, y0, y1):
        lo, hi = [0, y0, 0], [0, y1, 0]
        lo[t], hi[t] = -th, th
        lo[2 - t], hi[2 - t] = u0, u1
        out.append(box(lo, hi, yellow))

    run(-L / 2, L / 2, hy - 0.06, hy)
    # A concrete upstand to the knee rail and balusters above it, close enough that what stops a body is what's seen.
    lo, hi = [0, -hy, 0], [0, -hy + 0.5, 0]
    lo[t], hi[t] = -th, th
    lo[2 - t], hi[2 - t] = -L / 2, L / 2
    out.append(box(lo, hi, concrete))
    run(-L / 2, L / 2, -hy + 0.5, -hy + 0.55)
    nb = max(1, round(L / 0.11))
    for i in range(nb):
        u = -L / 2 + (i + 0.5) * L / nb
        run(u - 0.012, u + 0.012, -hy + 0.55, hy - 0.06)
    n = max(1, round(L / 1.5))
    for i in range(n + 1):
        u = -L / 2 + 0.03 + (L - 0.06) * i / n
        run(u - 0.03, u + 0.03, -hy + 0.5, hy - 0.06)
    return out


def cabinet(s, lod, rng):
    hx, hy, hz = s[0] / 2, s[1] / 2, s[2] / 2
    out = [box([-hx + 0.01, -hy, -hz + 0.01], [hx - 0.01, hy - 0.05, hz - 0.01], steel)]
    out.append(box([-hx + 0.01, hy - 0.05, -hz + 0.01], [hx - 0.01, hy, hz - 0.01], snow))
    if not lod:
        for side in (-1, 1):
            if s[0] >= s[2]:
                z0, z1 = (hz - 0.01, hz) if side > 0 else (-hz, -hz + 0.01)
                out.append(box([-hx + 0.08, -hy + 0.1, z0], [-0.02, hy - 0.15, z1], steel_dark))
                out.append(box([0.02, -hy + 0.1, z0], [hx - 0.08, hy - 0.15, z1], steel_dark))
            else:
                x0, x1 = (hx - 0.01, hx) if side > 0 else (-hx, -hx + 0.01)
                out.append(box([x0, -hy + 0.1, -hz + 0.08], [x1, hy - 0.15, -0.02], steel_dark))
                out.append(box([x0, -hy + 0.1, 0.02], [x1, hy - 0.15, hz - 0.08], steel_dark))
    return out


def leg(s, lod, rng):
    """A steel leg: a square column, its bolted foot plate."""
    hx, hy, hz = s[0] / 2, s[1] / 2, s[2] / 2
    out = [box([-hx + 0.03, -hy, -hz + 0.03], [hx - 0.03, hy, hz - 0.03], steel, 0 if lod else 0.01)]
    if not lod:
        out.append(box([-hx, -hy, -hz], [hx, -hy + 0.75, hz], steel_dark))
    return out


def beam(s, lod, rng):
    hx, hy, hz = s[0] / 2, s[1] / 2, s[2] / 2
    out = [box([-hx, -hy + 0.04, -hz], [hx, hy - 0.04, hz], steel)]
    out.append(box([-hx, hy - 0.04, -hz], [hx, hy, hz], snow if not lod else steel))
    out.append(box([-hx, -hy, -hz], [hx, -hy + 0.04, hz], steel_dark))
    return out


def deck(s, lod, rng):
    """A steel deck: a frame round dark grating, snow lying in the corners."""
    hx, hy, hz = s[0] / 2, s[1] / 2, s[2] / 2
    out = [box([-hx, -hy, -hz], [hx, hy - 0.02, hz], steel_dark)]
    out.append(box([-hx + 0.15, hy - 0.02, -hz + 0.15], [hx - 0.15, hy - 0.005, hz - 0.15], grating))
    for a, b in ((-hz, -hz + 0.15), (hz - 0.15, hz)):
        out.append(box([-hx, hy - 0.02, a], [hx, hy, b], steel))
    for a, b in ((-hx, -hx + 0.15), (hx - 0.15, hx)):
        out.append(box([a, hy - 0.02, -hz + 0.15], [b, hy, hz - 0.15], steel))
    if not lod:
        out.append(box([-hx + 0.15, hy - 0.005, -hz + 0.15], [-hx + 1.2, hy, -hz + 0.9], snow))
        out.append(box([hx - 1.4, hy - 0.005, hz - 0.8], [hx - 0.15, hy, hz - 0.15], snow))
    return out


def pedestal(s, lod, rng):
    hx, hy, hz = s[0] / 2, s[1] / 2, s[2] / 2
    out = [kit.cylinder(hx - 0.05, -hy, hy - 0.3, (0, 0, 0), "y", steel, 16)]
    out.append(box([-hx, hy - 0.3, -hz], [hx, hy, hz], steel_dark))
    return out


def dish(s, lod, rng):
    """The dish: a white paraboloid looking up and out along +x, its feed on a boom at the focus, a counterweight
    behind, tilted 32 degrees up on the pedestal at the box's foot."""
    hy = s[1] / 2
    R = 2.6
    depth = 0.7
    k = depth / (R * R)
    n = 6 if lod else 12
    front = [(k * (R * i / n) ** 2, R * i / n) for i in range(n + 1)]
    back = [(a - 0.07, r) for a, r in reversed(front)]
    parts = [kit.lathe(front + back, (0, 0, 0), white, 16 if lod else 40, axis="x")]
    focus = R * R / (4 * depth)
    parts.append(kit.cylinder(0.05, 0.0, focus, (0, 0, 0), "x", steel, 8))
    parts.append(kit.cylinder(0.16, focus, focus + 0.3, (0, 0, 0), "x", steel_dark, 12))
    parts.append(kit.cylinder(0.5, -0.07, -0.45, (0, 0, 0), "x", steel, 16))
    up = math.radians(32)
    # Game z is Blender -y: turning about it lifts +x toward game +y.
    tilt = Matrix.Rotation(up, 4, Vector((0, -1, 0)))
    place = Matrix.Translation(kit.b((-0.85, -hy + R * math.cos(up) + 0.06, 0)))
    for o in parts:
        o.data.transform(place @ tilt)
    # The yoke: a turntable on the pedestal (at the box's x -0.4) and two plates up to the hub's pivot.
    hub = (-0.85 - 0.26 * math.cos(up), -hy + R * math.cos(up) + 0.06 - 0.26 * math.sin(up))
    parts.append(box([-0.95, -hy, -0.7], [0.15, -hy + 0.25, 0.7], steel_dark))
    for z0, z1 in ((-0.7, -0.56), (0.56, 0.7)):
        parts.append(kit.prism([(-0.95, -hy + 0.25), (0.15, -hy + 0.25), (hub[0] + 0.3, hub[1] + 0.2), (hub[0] - 0.3, hub[1] + 0.2)], z0, z1, steel))
    parts.append(kit.cylinder(0.12, -0.75, 0.75, (hub[0], hub[1], 0), "z", steel_dark, 12))
    return parts


def equipment(s, lod, rng):
    """The dish's equipment hut: steel, a door, a vent, snow on its roof."""
    hx, hy, hz = s[0] / 2, s[1] / 2, s[2] / 2
    out = [box([-hx + 0.02, -hy, -hz + 0.02], [hx - 0.02, hy - 0.08, hz - 0.02], olive)]
    out.append(box([-hx, hy - 0.08, -hz], [hx, hy - 0.04, hz], steel_dark))
    out.append(box([-hx + 0.04, hy - 0.04, -hz + 0.04], [hx - 0.04, hy, hz - 0.04], snow))
    out.append(box([-0.45, -hy + 0.6, hz - 0.02], [0.45, -hy + 2.6 - 0.3, hz], steel_dark))
    if not lod:
        out.append(box([hx - 0.02, 0.2, -0.4], [hx, 0.6, 0.4], grating))
    return out


rk.dress("plinth", plinth)
rk.dress("drum", drum)
rk.dress("dome", dome)
rk.dress("rail", rail)
rk.dress("cabinet", cabinet)
rk.dress("leg", leg)
rk.dress("beam", beam)
rk.dress("deck", deck)
rk.dress("pedestal", pedestal)
rk.dress("dish", dish)
rk.dress("equipment", equipment)

# ------------------------------------------------------------------ the watchtower


def floor(s, lod, rng):
    hx, hy, hz = s[0] / 2, s[1] / 2, s[2] / 2
    out = [box([-hx, -hy, -hz], [hx, -hy + 0.12, hz], steel_dark)]
    n = 1 if lod else 16
    for i in range(n):
        x0 = -hx + s[0] * i / n
        out.append(box([x0 + (0 if lod else 0.006), -hy + 0.12, -hz], [x0 + s[0] / n - (0 if lod else 0.006), hy, hz], plank if i % 3 else plank_dark))
    return out


def cabin_wall(s, lod, rng):
    """Boards laid level, alternate ones proud: the cabin's waist-high wall, snow on its top board."""
    hx, hy, hz = s[0] / 2, s[1] / 2, s[2] / 2
    t = thin_axis(s)
    th = s[t] / 2
    n = 1 if lod else 6
    out = []
    for i in range(n):
        y0 = -hy + (s[1] - 0.05) * i / n
        y1 = -hy + (s[1] - 0.05) * (i + 1) / n
        d = 0 if (lod or i % 2 == 0) else 0.012
        lo, hi = [-hx, y0, -hz], [hx, y1, hz]
        lo[t], hi[t] = -th + d, th - d
        out.append(box(lo, hi, plank if i % 2 == 0 else plank_dark))
    out.append(box([-hx, hy - 0.05, -hz], [hx, hy, hz], snow))
    return out


def post(s, lod, rng):
    hx, hy, hz = s[0] / 2, s[1] / 2, s[2] / 2
    return [box([-hx, -hy, -hz], [hx, hy, hz], plank_dark, 0 if lod else 0.01)]


def cabin_roof(s, lod, rng):
    """The cabin's tin roof, overhanging, snow on it; a searchlight under the eave."""
    hx, hy, hz = s[0] / 2, s[1] / 2, s[2] / 2
    out = [box([-hx, -hy, -hz], [hx, -hy + 0.18, hz], steel_dark)]
    out.append(box([-hx + 0.06, -hy + 0.18, -hz + 0.06], [hx - 0.06, hy, hz - 0.06], snow))
    return out


def tread(s, lod, rng):
    """An open stair's tread: dark grating in a steel frame at the box's top, and a length of each stringer. The
    boxes meet corner to corner (each is as tall as the rise), so the lengths join into two sloped stringers that
    climb toward -x down to the ground."""
    hx, hy, hz = s[0] / 2, s[1] / 2, s[2] / 2
    t0 = hy - 0.09
    out = [box([-hx, t0, -hz + 0.1], [hx, hy - 0.01, hz - 0.1], grating)]
    out.append(box([-hx, t0 - 0.05, -hz + 0.1], [hx, t0, hz - 0.1], steel_dark))
    band = [(hx, -hy), (hx, -hy + 0.22), (-hx, hy), (-hx, hy - 0.22)]
    for z0, z1 in ((-hz, -hz + 0.1), (hz - 0.1, hz)):
        out.append(kit.prism(band, z0, z1, steel))
    if not lod:
        out.append(box([-hx, hy - 0.01, -hz + 0.1], [-hx + 0.12, hy, hz - 0.1], snow))
    return out


rk.dress("floor", floor)
rk.dress("cabin-wall", cabin_wall)
rk.dress("post", post)
rk.dress("cabin-roof", cabin_roof)
rk.dress("tread", tread)

# ------------------------------------------------------------------ the cableway


def platform(s, lod, rng):
    """The station's platform: concrete, a yellow line along each edge where the cars come in."""
    hx, hy, hz = s[0] / 2, s[1] / 2, s[2] / 2
    out = [box([-hx, -hy, -hz], [hx, hy - 0.01, hz], concrete, 0 if lod else 0.02)]
    out.append(box([-hx + 0.4, hy - 0.01, -hz + 0.4], [hx - 0.4, hy, hz - 0.4], slab))
    for a, b in ((-hz, -hz + 0.4), (hz - 0.4, hz)):
        out.append(box([-hx, hy - 0.01, a], [hx, hy, b], yellow))
    for a, b in ((-hx, -hx + 0.4), (hx - 0.4, hx)):
        out.append(box([a, hy - 0.01, -hz + 0.4], [b, hy, hz - 0.4], yellow))
    return out


def column(s, lod, rng):
    """A steel column painted red, its foot banded."""
    hx, hy, hz = s[0] / 2, s[1] / 2, s[2] / 2
    out = [box([-hx + 0.04, -hy + 0.5, -hz + 0.04], [hx - 0.04, hy, hz - 0.04], red, 0 if lod else 0.01)]
    out.append(box([-hx, -hy, -hz], [hx, -hy + 0.5, hz], steel_dark))
    return out


def station_wall(s, lod, rng):
    """The station's back wall: red corrugated sheet over a dark plinth, a lit board facing the platform."""
    hx, hy, hz = s[0] / 2, s[1] / 2, s[2] / 2
    d = 0 if lod else 0.02
    out = [box([-hx + d, -hy + 0.5, -hz], [hx - d, hy, hz], red)]
    out.append(box([-hx, -hy, -hz], [hx, -hy + 0.5, hz], concrete_dark))
    if lod:
        return out
    board = (hy - 1.1, hy - 0.5)
    n = int(s[2] / 0.2)
    for i in range(n):
        z = -hz + (i + 0.5) * s[2] / n
        for side in (-1, 1):
            a_, b_ = (hx - 0.02, hx) if side > 0 else (-hx, -hx + 0.02)
            spans = [(-hy + 0.5, hy - 0.01)] if side < 0 or abs(z) > 2.25 else [(-hy + 0.5, board[0]), (board[1], hy - 0.01)]
            for y0, y1 in spans:
                out.append(box([a_, y0, z - 0.035], [b_, y1, z + 0.035], red))
    out.append(box([hx - 0.012, board[0], -2.2], [hx, board[1], 2.2], lit_warm))
    return out


def station_roof(s, lod, rng):
    hx, hy, hz = s[0] / 2, s[1] / 2, s[2] / 2
    out = [box([-hx, -hy + 0.02, -hz], [hx, -hy + 0.18, hz], steel_dark)]
    out.append(box([-hx + 0.05, -hy + 0.18, -hz + 0.05], [hx - 0.05, hy, hz - 0.05], snow))
    for x in (-hx + 1.5, 0.0, hx - 1.5):
        out.append(box([x - 0.2, -hy, -hz + 0.4], [x + 0.2, -hy + 0.02, hz - 0.4], lit_warm))
    return out


def wheel(s, lod, rng):
    """A bullwheel: a steel rim round spokes on a hub, its axle up to the box's top."""
    hx, hy = s[0] / 2, s[1] / 2
    R = hx - 0.02
    seg = 24 if lod else 48
    y0, y1 = -hy, -hy + 0.3
    out = [kit.lathe([(y0, R - 0.18), (y0, R), (y1, R), (y1, R - 0.18), (y0, R - 0.18)], (0, 0, 0), steel, seg, smooth=False, caps=False)]
    out.append(kit.cylinder(0.32, y0, hy, (0, 0, 0), "y", steel_dark, 16))
    n = 4 if lod else 8
    for k in range(n):
        o = box([0.3, y0 + 0.08, -0.05], [R - 0.17, y0 + 0.2, 0.05], red)
        o.data.transform(Matrix.Rotation(2 * math.pi * k / n, 4, "Z"))
        out.append(o)
    return out


def rail_track(s, lod, rng):
    hx, hy, hz = s[0] / 2, s[1] / 2, s[2] / 2
    return [box([-hx, -hy, -hz], [hx, hy, hz], steel_dark)]


def car(s, lod, rng):
    """A cableway car: red below, a band of dark glass between its corner pillars, a grey roof stepping in."""
    hx, hy, hz = s[0] / 2, s[1] / 2, s[2] / 2
    out = [box([-hx, -hy, -hz], [hx, -hy + 1.05, hz], red, 0 if lod else 0.04)]
    g0, g1 = -hy + 1.05, hy - 0.45
    out.append(box([-hx + 0.03, g0, -hz + 0.03], [hx - 0.03, g1, hz - 0.03], glass))
    p = 0.14
    for sx in (-1, 1):
        for sz in (-1, 1):
            x0, x1 = sorted((sx * hx, sx * (hx - p)))
            z0, z1 = sorted((sz * hz, sz * (hz - p)))
            out.append(box([x0, g0, z0], [x1, g1, z1], red))
    out.append(box([-hx, g1, -hz], [hx, g1 + 0.2, hz], red))
    out.append(box([-hx + 0.25, g1 + 0.2, -hz + 0.25], [hx - 0.25, hy - 0.06, hz - 0.25], steel))
    out.append(box([-hx + 0.3, hy - 0.06, -hz + 0.3], [hx - 0.3, hy, hz - 0.3], snow))
    if not lod:
        # The doors' seam down the glass.
        out.append(box([-0.02, g0, hz - 0.03], [0.02, g1, hz - 0.01], dark))
    return out


def hanger(s, lod, rng):
    """The hanger up from a car's roof, and its grip on the rope or rail."""
    hx, hy, hz = s[0] / 2, s[1] / 2, s[2] / 2
    out = [box([-0.05, -hy, -0.05], [0.05, hy - 0.12, 0.05], steel_dark)]
    out.append(box([-hx, hy - 0.12, -hz], [hx, hy, hz], steel))
    return out


def rope(s, lod, rng):
    hx = s[0] / 2
    return [kit.cylinder(0.035, -hx, hx, (0, 0, 0), "x", steel_dark, 6, smooth=True)]


def crossarm(s, lod, rng):
    """The pylon's crossarm: a steel box girder, its sheave trains at the ends, a red beacon."""
    hx, hy, hz = s[0] / 2, s[1] / 2, s[2] / 2
    out = [box([-hx + 0.4, -hy, -hz], [hx - 0.4, hy, hz], steel, 0 if lod else 0.02)]
    for z in (-hz + 0.35, hz - 0.35):
        out.append(box([-hx, -hy + 0.05, z - 0.25], [-hx + 0.4, hy - 0.05, z + 0.25], steel_dark))
        out.append(box([hx - 0.4, -hy + 0.05, z - 0.25], [hx, hy - 0.05, z + 0.25], steel_dark))
    return out


rk.dress("platform", platform)
rk.dress("column", column)
rk.dress("station-wall", station_wall)
rk.dress("station-roof", station_roof)
rk.dress("wheel", wheel)
rk.dress("car", car)
rk.dress("hanger", hanger)
rk.dress("rope", rope)
rk.dress("crossarm", crossarm)
# The station's overhead rail is the radome's `rail`'s name in another piece: the dresser tells them apart by size.
_rail = rail


def rail_any(s, lod, rng):
    return rail_track(s, lod, rng) if s[1] < 0.5 else _rail(s, lod, rng)


rk.dress("rail", rail_any)

# ------------------------------------------------------------------ the kit for the cover pass's pieces (unit boxes)


def hut(lod, rng):
    """A prefab hut: olive panels on a dark sill, a door and a window, a roof slab with snow lying on it."""
    out = [box([-0.49, 0, -0.49], [0.49, 0.82, 0.49], olive), box([-0.5, 0.82, -0.5], [0.5, 0.9, 0.5], olive_dark)]
    out.append(box([-0.49, 0.9, -0.49], [0.49, 1.0, 0.49], snow))
    if not lod:
        out.append(box([-0.5, 0, -0.5], [0.5, 0.08, 0.5], concrete_dark))
        out.append(box([-0.16, 0.08, 0.49], [0.06, 0.66, 0.5], steel_dark))
        out.append(box([0.18, 0.4, 0.49], [0.38, 0.62, 0.5], lit_warm))
        out.append(box([-0.3, 0.4, -0.5], [0.0, 0.62, -0.49], glass))
        out.append(box([-0.5, 0.4, -0.2], [-0.49, 0.62, 0.12], glass))
        for x in (-0.4, 0.15, 0.4):
            out.append(box([x - 0.01, 0.08, -0.5], [x + 0.01, 0.82, -0.49], olive_dark))
    return out


def icewall(lod, rng):
    """Ice heaved up through the snow: a blue-white slab, its top broken into leaning shards, drifts at its foot."""
    out = [box([-0.5, 0, -0.42], [0.5, 0.62, 0.42], ice_deep)]
    x = -0.5
    while x < 0.5 - 1e-6:
        w = min(0.5 - x, rng.uniform(0.07, 0.16))
        t0, t1 = rng.uniform(0.75, 1.0), rng.uniform(0.75, 1.0)
        tm = min(1.0, max(t0, t1) + rng.uniform(0.0, 0.08))
        z0, z1 = -rng.uniform(0.3, 0.42), rng.uniform(0.3, 0.42)
        g = 0 if lod else 0.004
        profile = [(x + g, 0.62), (x + w - g, 0.62), (x + w - g, t1), (x + w * 0.5, tm), (x + g, t0)]
        out.append(kit.prism(profile, z0, z1, ice if rng.random() < 0.7 else ice_deep))
        x += w
    # The drifts banked against both faces, and the faces' fractures: deeper ice let in.
    for sz in (-1, 1):
        lo, hi = (0.42, 0.5) if sz > 0 else (-0.5, -0.42)
        out.append(kit.prism([(-0.5, 0), (0.5, 0), (0.5, 0.1), (0.3, 0.16), (-0.1, 0.12), (-0.5, 0.15)], lo, hi, snow))
        if not lod:
            for k in range(5):
                x0 = rng.uniform(-0.45, 0.35)
                y0 = rng.uniform(0.18, 0.5)
                out.append(box([x0, y0, lo if sz > 0 else hi - 0.012], [x0 + rng.uniform(0.04, 0.12), y0 + rng.uniform(0.05, 0.12), lo + 0.012 if sz > 0 else hi], ice))
    return out


def sandbags(lod, rng):
    """A sandbag wall: four courses of bags laid in stretcher bond round a core, snow on the top course."""
    out = [box([-0.5, 0, -0.4], [0.5, 0.94, 0.4], sandbag)]
    courses = [(0.0, 0.24), (0.24, 0.48), (0.48, 0.72), (0.72, 0.94)]
    for c, (y0, y1) in enumerate(courses):
        x = -0.5 + (0.0 if c % 2 == 0 else -0.07)
        while x < 0.5 - 1e-6:
            a, b = max(x, -0.5), min(x + 0.17, 0.5)
            g = 0 if lod else 0.006
            for sz in (-1, 1):
                lo, hi = (0.4, 0.4 + rng.uniform(0.07, 0.1)) if sz > 0 else (-0.4 - rng.uniform(0.07, 0.1), -0.4)
                out.append(box([a + g, y0 + g, lo], [b - g, y1 - g, hi], sandbag))
            x += 0.17
    out.append(box([-0.48, 0.94, -0.38], [0.48, 1.0, 0.38], snow))
    return out


def stores(lod, rng):
    """A stack of stores crates: two side by side, a smaller one on top, snow on each lid."""
    out = []

    def one(x0, z0, x1, z1, y0, y1, m):
        i = 0.012
        out.append(box([x0 + i, y0, z0 + i], [x1 - i, y1 - 0.03, z1 - i], m, 0 if lod else 0.004))
        out.append(box([x0 + i, y1 - 0.03, z0 + i], [x1 - i, y1, z1 - i], snow))
        if not lod:
            for y in (y0 + 0.03, y1 - 0.09):
                out.append(box([x0, y, z0 + i], [x0 + i, y + 0.03, z1 - i], olive_dark))
                out.append(box([x1 - i, y, z0 + i], [x1, y + 0.03, z1 - i], olive_dark))
                out.append(box([x0, y, z0], [x1, y + 0.03, z0 + i], olive_dark))
                out.append(box([x0, y, z1 - i], [x1, y + 0.03, z1], olive_dark))
            out.append(box([(x0 + x1) / 2 - 0.08, (y0 + y1) / 2 - 0.05, z1 - i], [(x0 + x1) / 2 + 0.08, (y0 + y1) / 2 + 0.05, z1 - i + 0.004], yellow))

    one(-0.5, -0.5, 0.02, 0.5, 0, 0.58, olive)
    one(0.04, -0.46, 0.5, 0.4, 0, 0.58, olive_dark)
    one(-0.36, -0.34, 0.24, 0.3, 0.58, 1.0, olive)
    return out


def drums(lod, rng):
    """Fuel drums, blue and red, three standing and one lying across the front, snow on their lids."""
    out = []
    seg = 10 if lod else 18
    r, h = 0.24, 0.98

    def profile():
        prof = [(0.0, 0.0), (0.0, r - 0.01), (0.012, r)]
        if not lod:
            for y in (0.32, 0.66):
                prof += [(y - 0.015, r), (y - 0.012, r + 0.01), (y + 0.012, r + 0.01), (y + 0.015, r)]
        return prof + [(h - 0.03, r), (h - 0.03, 0.0)]

    for (x, z), m in (((-0.24, -0.24), drum_blue), ((0.25, -0.22), drum_red), ((-0.245, 0.245), drum_blue)):
        out.append(kit.lathe(profile(), (x, 0, z), m, seg, "y"))
        out.append(kit.cylinder(r - 0.02, h - 0.03, h, (x, 0, z), "y", snow, seg))
    out.append(kit.cylinder(0.22, 0.03, 0.49, (0.26, 0.22, 0.26), "z", drum_red, seg))
    return out


SNOWCAT = (4.4, 2.3, 2.2)  # the snowcats' solids, metres: drawn at that size and shrunk into the unit box


def snowcat(lod, rng):
    """A snowcat, drawn in metres: two broad tracks, an orange hull and cab with dark glass, a cargo box behind
    under a tarp and snow. Its parts meet without overlapping, so the solid fitter's columns read it right."""
    out = []
    track = [(-2.2, 0.18), (-1.95, 0.0), (1.95, 0.0), (2.2, 0.18), (2.2, 0.55), (1.95, 0.75), (-1.95, 0.75), (-2.2, 0.55)]
    for z0, z1 in ((-1.1, -0.6), (0.6, 1.1)):
        out.append(kit.prism(track, z0, z1, rubber, 0 if lod else 0.03))
    out.append(box([-2.0, 0.3, -0.6], [2.0, 0.75, 0.6], dark))
    out.append(box([-2.15, 0.75, -1.08], [2.15, 1.2, 1.08], orange, 0 if lod else 0.03))
    out.append(kit.prism([(0.1, 1.2), (2.1, 1.2), (2.1, 1.45), (1.6, 2.24), (0.1, 2.24)], -1.0, 1.0, orange, 0 if lod else 0.03))
    out.append(box([-2.1, 1.2, -1.05], [-0.05, 1.75, 1.05], olive_dark))
    out.append(kit.prism([(-2.05, 1.75), (-0.1, 1.75), (-0.1, 1.85), (-0.4, 1.95), (-1.8, 1.95), (-2.05, 1.85)], -1.0, 1.0, canvas))
    out.append(box([0.15, 2.24, -0.95], [1.55, 2.3, 0.95], snow))
    if not lod:
        out.append(kit.prism([(2.1, 1.48), (2.11, 1.48), (1.63, 2.2), (1.62, 2.2)], -0.9, 0.9, glass))
        for side in (-1, 1):
            lo, hi = (1.0, 1.01) if side > 0 else (-1.01, -1.0)
            out.append(kit.prism([(0.3, 1.5), (1.9, 1.5), (1.5, 2.15), (0.3, 2.15)], lo, hi, glass))
        out.append(box([2.15, 0.85, -0.9], [2.19, 1.1, 0.9], steel_dark))
        out.append(box([2.15, 1.0, -0.8], [2.2, 1.08, -0.6], lit_warm))
        out.append(box([2.15, 1.0, 0.6], [2.2, 1.08, 0.8], lit_warm))
        out.append(box([-1.8, 1.95, -0.9], [-0.4, 1.99, 0.9], snow))
    shrink = Matrix.Diagonal((1 / SNOWCAT[0], 1 / SNOWCAT[2], 1 / SNOWCAT[1], 1.0))
    for o in out:
        o.data.transform(shrink)
    return out


rk.unit("fb-hut", hut)
rk.unit("fb-icewall", icewall)
rk.unit("fb-sandbags", sandbags)
rk.unit("fb-crates", stores)
rk.unit("fb-drums", drums)
rk.unit("fb-snowcat", snowcat)

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
