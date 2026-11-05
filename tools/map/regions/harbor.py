"""Rogue Harbor's kit (ticket 19): a container port on the south coast, its quay and cranes, a cargo ship alongside,
warehouses, a hangar by the airstrip, and the models the cover pass's pieces there wear. Builds
apps/range/public/models/harbor.glb:

    blender -b --factory-startup --python tools/map/build.py -- tools/map/regions/harbor.py --export --preview DIR

The pieces' boxes come from tools/map/regions/harbor.json, which the test writes from the plan
(apps/range/src/map/zero-island-harbor-plan.ts; `UPDATE_KIT=1`). See tools/map/regionkit.py for the pattern.
Permanent dusk over the sea, the sun low behind the ship: salt-faded container paint in a dozen liveries, rust
running from every seam, crane yellow, white superstructure with its lights coming on, wet concrete.
"""
import math
import os
import sys

import bmesh
from mathutils import Matrix

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(HERE))
import regionkit  # noqa: E402

OUT = os.path.join(HERE, "..", "..", "..", "apps", "range", "public", "models", "harbor.glb")
rk = regionkit.RegionKit(bkit, "harbor", os.path.join(HERE, "harbor.json"))  # noqa: F821
kit = rk.kit
box = rk.box

# Finishes: colour (sRGB) and the photo layer it wears.
hull_dark = rk.mat("rh.hull", (44, 50, 60), "steel", 0.6, 0.3)
hull_red = rk.mat("rh.antifoul", (128, 46, 36), "steel", 0.7, 0.2)
deck_green = rk.mat("rh.deck", (78, 96, 80), "steel", 0.8, 0.2)
white = rk.mat("rh.white", (208, 206, 198), "plate", 0.5, 0.2)
funnel_blue = rk.mat("rh.funnel", (42, 74, 128), "plate", 0.5, 0.2)
black = rk.mat("rh.black", (26, 26, 28), None, 0.7)
crane_yellow = rk.mat("rh.crane", (204, 152, 44), "steel", 0.55, 0.3)
grey_steel = rk.mat("rh.steel", (104, 108, 112), "steel", 0.6, 0.4)
hazard = rk.mat("rh.hazard", (214, 170, 40), "plate", 0.6, 0.1)
sheet = rk.mat("rh.sheet", (150, 160, 166), "tin", 0.7, 0.3)
sheet_dark = rk.mat("rh.sheetdark", (104, 112, 100), "tin", 0.7, 0.3)
skylight = rk.mat("rh.skylight", (176, 184, 170), None, 0.4)
concrete = rk.mat("rh.concrete", (152, 148, 140), "wall", 0.9)
quay_top = rk.mat("rh.quaytop", (128, 126, 120), "slab", 0.9)
weed = rk.mat("rh.weed", (40, 50, 36), "rock", 0.9)
plank = rk.mat("rh.plank", (164, 134, 100), "plank", 0.9)
timber = rk.mat("rh.timber", (112, 86, 60), "plank", 0.9)
rubber = rk.mat("rh.rubber", (30, 30, 30), None, 0.95)
glass = rk.mat("rh.glass", (24, 30, 36), None, 0.15)
lit = rk.mat("rh.lit", (255, 196, 120), None, 0.4, glow=(1.0, 0.62, 0.28))
lifeboat = rk.mat("rh.lifeboat", (228, 106, 30), "plate", 0.5)
rack_blue = rk.mat("rh.rack", (40, 72, 140), "plate", 0.5, 0.3)
rack_orange = rk.mat("rh.beam", (210, 104, 30), "plate", 0.5, 0.3)
tarp = rk.mat("rh.tarp", (60, 84, 110), None, 0.9)
car_paint = rk.mat("rh.car", (150, 150, 140), "steel", 0.5, 0.3)
cab_paint = rk.mat("rh.cab", (176, 54, 40), "steel", 0.5, 0.3)

# Container liveries: the shipping lines' colours, faded by salt and sun.
LIVERY = {
    "maroon": rk.mat("rh.maroon", (128, 44, 36), "tin", 0.7, 0.3),
    "blue": rk.mat("rh.blue", (40, 78, 128), "tin", 0.7, 0.3),
    "teal": rk.mat("rh.teal", (36, 112, 112), "tin", 0.7, 0.3),
    "orange": rk.mat("rh.orange", (204, 112, 40), "tin", 0.7, 0.3),
    "green": rk.mat("rh.green", (62, 102, 60), "tin", 0.7, 0.3),
    "grey": rk.mat("rh.grey", (150, 150, 146), "tin", 0.7, 0.3),
    "yellow": rk.mat("rh.yellow", (200, 160, 50), "tin", 0.7, 0.3),
}


def moved(objs, x=0.0, y=0.0, z=0.0):
    for o in objs:
        o.data.transform(Matrix.Translation(kit.b((x, y, z))))
    return objs


def turned(objs, yaw):
    """Turned about game y, as a placed piece turns: +x toward (cos, -sin) in x, z."""
    for o in objs:
        o.data.transform(Matrix.Rotation(yaw, 4, "Z"))
    return objs


def strips(lo, hi, axis, pitch, width, mat, lod):
    """Vertical strips on a face: `lo`..`hi` the layer they fill, spaced along `axis` (0 x, 2 z)."""
    if lod:
        return []
    out = []
    n = max(1, int((hi[axis] - lo[axis]) / pitch))
    for i in range(n):
        c = lo[axis] + (i + 0.5) * (hi[axis] - lo[axis]) / n
        a, b = list(lo), list(hi)
        a[axis], b[axis] = c - width / 2, c + width / 2
        out.append(box(a, b, mat))
    return out


# ------------------------------------------------------------------ a container


def container(x0, x1, y0, y1, hz, livery, lod, doors=1):
    """One shipping container along x, from x0 to x1, y0 to y1, z within +-hz: corrugated sides (ribs on an inset
    shell), a frame at each end with its doors' locking bars at the `doors` end (+1 or -1). Nothing overlaps."""
    frame = 0.12
    rib = 0.03
    out = [box([x0 + frame, y0, -hz + rib], [x1 - frame, y1, hz - rib], livery)]
    for end in (-1, 1):
        xa, xb = (x0, x0 + frame) if end < 0 else (x1 - frame, x1)
        bar = 0.025 if (end == doors and not lod) else 0.0
        if end < 0:
            xa += bar
        else:
            xb -= bar
        out.append(box([xa, y0, -hz], [xb, y1, hz], livery))
        if bar:
            # The locking bars up the doors, and the seam between the two doors.
            xf = (x0, x0 + bar) if end < 0 else (x1 - bar, x1)
            for z in (-hz * 0.72, -hz * 0.28, hz * 0.28, hz * 0.72):
                out.append(box([xf[0], y0 + 0.08, z - 0.025], [xf[1], y1 - 0.08, z + 0.025], grey_steel))
            out.append(box([xf[0], y0 + 0.04, -0.012], [xf[1], y1 - 0.04, 0.012], black))
    if not lod:
        # The corrugation: ribs standing off the shell on both long sides, top and bottom rails between them.
        L = x1 - x0 - 2 * frame
        n = max(2, int(L / 0.6))
        for side in (-1, 1):
            za, zb = (hz - rib, hz) if side > 0 else (-hz, -hz + rib)
            for i in range(n):
                c = x0 + frame + (i + 0.5) * L / n
                out.append(box([c - 0.12, y0 + 0.12, za], [c + 0.12, y1 - 0.1, zb], livery))
            out.append(box([x0 + frame, y0, za], [x1 - frame, y0 + 0.12, zb], black))
            out.append(box([x0 + frame, y1 - 0.1, za], [x1 - frame, y1, zb], livery))
    return out


# ------------------------------------------------------------------ the ship


def hull(s, lod, rng):
    """The midships: anti-fouling red below the waterline, the topsides dark, a deck plate on top, seams and rust."""
    hx, hy, hz = s[0] / 2, s[1] / 2, s[2] / 2
    water = -hy + 1.6  # the waterline: 1.6 m over the hull's foot (the sea bed 0.6 m under the water, the foot 1 m under that)
    out = [
        box([-hx, -hy, -hz], [hx, water + 0.4, hz], hull_red),
        box([-hx, water + 0.4, -hz], [hx, hy - 0.04, hz], hull_dark),
        box([-hx, hy - 0.04, -hz], [hx, hy, hz], deck_green),
    ]
    if not lod:
        for side in (-1, 1):
            za, zb = (hz, hz + 0.012) if side > 0 else (-hz - 0.012, -hz)
            # A white boot line at the waterline, the frames' seams, and rust run down from the deck edge.
            out.append(box([-hx, water + 0.36, za], [hx, water + 0.46, zb], white))
            out += strips([-hx, water + 0.5, za], [hx, hy - 0.2, zb], 0, 3.2, 0.06, hull_dark, lod)
            for _ in range(10):
                x = rng.uniform(-hx + 0.5, hx - 0.5)
                out.append(box([x, hy - rng.uniform(1.5, 3.2), za], [x + rng.uniform(0.08, 0.25), hy - 0.15, zb], hull_red))
    return out


def stern(s, lod, rng):
    """The stern, rounded in plan aft (-x): the same bands as the midships, its name across the transom."""
    hx, hy, hz = s[0] / 2, s[1] / 2, s[2] / 2
    water = -hy + 1.6
    r = 3.0
    outline = [(hx, -hz), (hx, hz)]
    for k in range(9):
        a = math.pi / 2 + k * math.pi / 16
        outline.append((-hx + r + r * math.cos(a) * 1.0, (hz - r) + r * math.sin(a)))
    for k in range(9):
        a = math.pi + k * math.pi / 16
        outline.append((-hx + r + r * math.cos(a), -(hz - r) + r * math.sin(a)))
    # Dedupe the joint and keep it a clean loop.
    loop = []
    for p in outline:
        if not loop or (abs(p[0] - loop[-1][0]) > 1e-4 or abs(p[1] - loop[-1][1]) > 1e-4):
            loop.append(p)
    out = [
        kit.plan(loop, -hy, water + 0.4, hull_red),
        kit.plan(loop, water + 0.4, hy - 0.04, hull_dark),
        kit.plan(loop, hy - 0.04, hy, deck_green),
    ]
    return out


def bow(s, lod, rng):
    """The bow: the hull narrowing forward (+x) to its stem, the bulwark rising round the foredeck, hawse pipes."""
    hx, hy, hz = s[0] / 2, s[1] / 2, s[2] / 2
    water = -hy + 1.6
    deck = hy - 1.1
    half = [(-hx, hz), (-hx + 2.5, hz * 0.96), (-hx + 4.5, hz * 0.8), (-hx + 6.2, hz * 0.52), (-hx + 7.3, hz * 0.24), (hx, 0.0)]
    loop = half + [(x, -z) for x, z in reversed(half[:-1])]
    out = [
        kit.plan(loop, -hy, water + 0.4, hull_red),
        kit.plan(loop, water + 0.4, deck - 0.04, hull_dark),
        kit.plan(loop, deck - 0.04, deck, deck_green),
    ]
    # The bulwark round the foredeck: a plate along each edge of the outline, from the deck to the box's top.
    t = 0.15
    for side in (1, -1):
        for (xa, za), (xb, zb) in zip(half, half[1:]):
            L = math.hypot(xb - xa, zb - za)
            ang = math.atan2(-(zb - za) * side, xb - xa)
            # The plate on the inboard side of the edge.
            o = box([0, deck, -t], [L, hy, 0], hull_dark) if side > 0 else box([0, deck, 0], [L, hy, t], hull_dark)
            o.data.transform(Matrix.Translation(kit.b((xa, 0, za * side))) @ Matrix.Rotation(ang, 4, "Z"))
            out.append(o)
    if not lod:
        for side in (-1, 1):
            # The hawse pipes' openings, dark, high on the flare each side.
            x = hx - 2.2
            z = side * (hz * 0.36 + 0.012)
            out.append(box([x - 0.35, deck - 1.4, min(z, z + side * 0.012)], [x + 0.35, deck - 0.8, max(z, z + side * 0.012)], black))
    return out


def rail(s, lod, rng):
    """The bulwark: steel plate to waist height, a capping rail, stays inside it."""
    hx, hy, hz = s[0] / 2, s[1] / 2, s[2] / 2
    along = 0 if s[0] >= s[2] else 2
    out = [box([-hx, -hy, -hz], [hx, hy - 0.06, hz], hull_dark), box([-hx, hy - 0.06, -hz], [hx, hy, hz], white)]
    if not lod and along == 0:
        out += strips([-hx, -hy, -hz - 0.02], [hx, hy - 0.06, -hz], 0, 1.6, 0.05, grey_steel, lod)
    return out


def house(s, lod, rng):
    """The accommodation house: five decks of white steel, rows of windows (some lit), the bridge's long window
    forward (+x) on top, deck lines between."""
    hx, hy, hz = s[0] / 2, s[1] / 2, s[2] / 2
    out = [box([-hx, -hy, -hz], [hx, hy, hz], white)]
    if lod:
        out.append(box([hx, hy - 1.6, -hz + 0.4], [hx + 0.02, hy - 0.6, hz - 0.4], glass))
        return out
    decks = 5
    h = s[1] / decks
    for d in range(decks):
        y0 = -hy + d * h
        if d < decks - 1:
            # Windows down both sides and across the front, a few lit.
            for side in (-1, 1):
                za, zb = (hz, hz + 0.02) if side > 0 else (-hz - 0.02, -hz)
                for i in range(int(s[0] / 1.8)):
                    x = -hx + 0.6 + i * 1.8
                    out.append(box([x, y0 + 0.9, za], [x + 0.9, y0 + 1.6, zb], lit if rng.random() < 0.35 else glass))
            for i in range(int(s[2] / 1.8)):
                z = -hz + 0.6 + i * 1.8
                out.append(box([hx, y0 + 0.9, z], [hx + 0.02, y0 + 1.6, z + 0.9], lit if rng.random() < 0.35 else glass))
        if d > 0:
            # The deck line: a lip all round.
            out.append(box([-hx - 0.03, y0 - 0.06, -hz - 0.03], [hx + 0.03, y0 + 0.06, hz + 0.03], white))
    # The bridge: one long band of glass forward and round the corners.
    y0 = hy - h
    out.append(box([hx, y0 + 0.7, -hz + 0.2], [hx + 0.03, y0 + 1.7, hz - 0.2], glass))
    for side in (-1, 1):
        za, zb = (hz, hz + 0.03) if side > 0 else (-hz - 0.03, -hz)
        out.append(box([hx - 2.5, y0 + 0.7, za], [hx - 0.2, y0 + 1.7, zb], glass))
    # A door onto the main deck each side, and the lit lamp over it.
    for side in (-1, 1):
        za, zb = (hz, hz + 0.02) if side > 0 else (-hz - 0.02, -hz)
        out.append(box([hx - 1.8, -hy, za], [hx - 0.9, -hy + 1.9, zb], grey_steel))
        out.append(box([hx - 1.5, -hy + 2.0, za], [hx - 1.2, -hy + 2.15, zb], lit))
    return out


def wing(s, lod, rng):
    hx, hy, hz = s[0] / 2, s[1] / 2, s[2] / 2
    out = [box([-hx, -hy, -hz], [hx, hy, hz], white)]
    out.append(box([hx, -hy + 0.7, -hz + 0.1], [hx + 0.02, hy - 0.3, hz - 0.1], glass))
    return out


def funnel(s, lod, rng):
    """The funnel: an oval stack in the line's blue with a white band, its top black with soot."""
    hx, hy, hz = s[0] / 2, s[1] / 2, s[2] / 2
    n = 12 if lod else 24
    ring = [(hx * math.cos(2 * math.pi * k / n), hz * math.sin(2 * math.pi * k / n)) for k in range(n)]
    out = [kit.plan(ring, -hy, hy - 1.6, funnel_blue), kit.plan(ring, hy - 1.6, hy - 0.8, white), kit.plan(ring, hy - 0.8, hy, black)]
    return out


def mast(s, lod, rng):
    hx, hy, hz = s[0] / 2, s[1] / 2, s[2] / 2
    out = [box([-0.1, -hy, -0.1], [0.1, hy - 0.5, 0.1], white), box([-hx, hy - 0.5, -hz], [hx, hy - 0.3, hz], white)]
    out.append(box([-0.12, hy - 0.3, -0.12], [0.12, hy, 0.12], lit))
    return out


def boat(s, lod, rng):
    """An enclosed lifeboat in its davits: an orange hull and canopy along x."""
    hx, hy, hz = s[0] / 2, s[1] / 2, s[2] / 2
    seg = 10 if lod else 18
    prof = [(-hx, 0.0), (-hx + 0.15, hz * 0.55), (-hx + 0.8, hz * 0.92), (hx - 0.8, hz * 0.92), (hx - 0.15, hz * 0.55), (hx, 0.0)]
    o = kit.lathe(prof, (0, 0, 0), lifeboat, seg, axis="x")
    o.data.transform(Matrix.Diagonal((1.0, 1.0, hy / hz, 1.0)))
    return [o]


def box_stack(s, lod, rng):
    """A row of containers on the hatch, k high, each its own livery."""
    hx, hy, hz = s[0] / 2, s[1] / 2, s[2] / 2
    k = max(1, round(s[1] / 2.6))
    h = s[1] / k
    out = []
    names = list(LIVERY)
    for i in range(k):
        out += container(-hx, hx, -hy + i * h, -hy + (i + 1) * h, hz, LIVERY[rng.choice(names)], lod, doors=-1)
    return out


def winch(s, lod, rng):
    """The windlass: two chain drums on their bedplate, the chain running off forward."""
    hx, hy, hz = s[0] / 2, s[1] / 2, s[2] / 2
    out = [box([-hx, -hy, -hz], [hx, -hy + 0.25, hz], grey_steel)]
    seg = 10 if lod else 16
    for z0, z1 in ((-hz + 0.1, -0.15), (0.15, hz - 0.1)):
        out.append(kit.cylinder(0.32, z0, z1, (0, -hy + 0.25 + 0.34, 0), "z", black, seg))
    out.append(box([-0.2, -hy + 0.25, -0.15], [0.2, hy, 0.15], grey_steel))
    return out


def gangway(s, lod, rng):
    """The gangway's head: a grated landing from the quay stair to the ship's rail."""
    hx, hy, hz = s[0] / 2, s[1] / 2, s[2] / 2
    out = [box([-hx, -hy, -hz], [hx, hy - 0.05, hz], grey_steel), box([-hx, hy - 0.05, -hz], [hx, hy, hz], black)]
    if not lod:
        out.append(box([-hx, hy - 0.05, -hz], [-hx + 0.08, hy, hz], hazard))
    return out


def step(s, lod, rng):
    """One flight's step: the stair tower is solid plate down to the quay, the tread dark, its nosing yellow."""
    hx, hy, hz = s[0] / 2, s[1] / 2, s[2] / 2
    out = [box([-hx, -hy, -hz], [hx, hy - 0.04, hz], grey_steel), box([-hx + 0.06, hy - 0.04, -hz], [hx, hy, hz], black)]
    out.append(box([-hx, hy - 0.04, -hz], [-hx + 0.06, hy, hz], hazard))
    return out


rk.dress("hull", hull)
rk.dress("stern", stern)
rk.dress("bow", bow)
rk.dress("rail", rail)
rk.dress("house", house)
rk.dress("wing", wing)
rk.dress("funnel", funnel)
rk.dress("mast", mast)
rk.dress("boat", boat)
rk.dress("box-stack", box_stack)
rk.dress("winch", winch)
rk.dress("gangway", gangway)
rk.dress("step", step)

# ------------------------------------------------------------------ the quay and its cranes


def quay_wall(s, lod, rng):
    """The quay's edge: precast concrete, a steel nosing and a painted line along its top edge (+z), its face
    dark with weed from the sea bed up past the waterline."""
    hx, hy, hz = s[0] / 2, s[1] / 2, s[2] / 2
    water = hy - 2.4  # the quay's top is 2.4 m over the water
    out = rk.panels([s[0], s[1] - 0.05, s[2] - 0.02], concrete, 6.0, 0.03, lod, y=(-hy, hy - 0.05))
    for o in out:
        o.data.transform(Matrix.Translation(kit.b((0, 0, -0.01))))
    out.append(box([-hx, hy - 0.05, -hz], [hx, hy, hz - 0.25], quay_top))
    out.append(box([-hx, hy - 0.05, hz - 0.25], [hx, hy, hz], grey_steel))
    if not lod:
        out.append(box([-hx, hy, hz - 0.6], [hx, hy + 0.004, hz - 0.45], hazard))
        out.append(box([-hx, -hy, hz - 0.02], [hx, water + 0.7, hz], weed))
    return out


def bollard(s, lod, rng):
    hx, hy, hz = s[0] / 2, s[1] / 2, s[2] / 2
    seg = 10 if lod else 16
    prof = [(0.0, 0.0), (0.0, hx), (0.1, hx), (0.14, hx * 0.62), (hy * 2 - 0.2, hx * 0.62), (hy * 2 - 0.12, hx), (hy * 2, hx * 0.9), (hy * 2, 0.0)]
    return [kit.lathe(prof, (0, -hy, 0), black, seg, "y")]


def fender(s, lod, rng):
    hx, hy, hz = s[0] / 2, s[1] / 2, s[2] / 2
    return [box([-hx, -hy, -hz], [hx, hy, hz], rubber, 0 if lod else 0.06)]


def leg(s, lod, rng):
    """A portal leg: a box-section column, its bogie of wheels on the rail at its foot, a ladder up one face."""
    hx, hy, hz = s[0] / 2, s[1] / 2, s[2] / 2
    out = [box([-hx + 0.05, -hy + 1.4, -hz + 0.05], [hx - 0.05, hy, hz - 0.05], crane_yellow), box([-hx, -hy, -hz], [hx, -hy + 1.4, hz], black)]
    if not lod:
        out += strips([-hx + 0.05, -hy + 1.6, hz - 0.05], [hx - 0.05, hy - 0.2, hz], 0, 0.3, 0.04, grey_steel, lod)
        for i in range(int((s[1] - 2) / 0.4)):
            y = -hy + 1.8 + i * 0.4
            out.append(box([-hx + 0.08, y, hz - 0.05], [hx - 0.08, y + 0.03, hz], grey_steel))
        out.append(box([-hx + 0.05, hy - 0.4, -hz], [hx - 0.05, hy - 0.2, -hz + 0.05], hazard))
    return out


def portal(s, lod, rng):
    hx, hy, hz = s[0] / 2, s[1] / 2, s[2] / 2
    along = 0 if s[0] >= s[2] else 2
    out = [box([-hx, -hy, -hz], [hx, hy, hz], crane_yellow)]
    if not lod:
        # Stiffeners down the girder's sides.
        if along == 0:
            for side in (-1, 1):
                za, zb = (hz, hz + 0.02) if side > 0 else (-hz - 0.02, -hz)
                out += strips([-hx, -hy, za], [hx, hy, zb], 0, 1.2, 0.06, crane_yellow, lod)
        else:
            for side in (-1, 1):
                xa, xb = (hx, hx + 0.02) if side > 0 else (-hx - 0.02, -hx)
                out += strips([xa, -hy, -hz], [xb, hy, hz], 2, 1.2, 0.06, crane_yellow, lod)
    return out


def turntable(s, lod, rng):
    hx, hy, hz = s[0] / 2, s[1] / 2, s[2] / 2
    seg = 16 if lod else 32
    return [kit.lathe([(0.0, 0.0), (0.0, hx - 0.05), (s[1] * 0.5, hx), (s[1], hx - 0.25), (s[1], 0.0)], (0, -hy, 0), black, seg, "y", smooth=False)]


def machine_house(s, lod, rng):
    """The machinery house: clad in yellow sheet, a louvred band, a door at the back, its roof lipped."""
    hx, hy, hz = s[0] / 2, s[1] / 2, s[2] / 2
    out = [box([-hx, -hy, -hz], [hx, hy - 0.15, hz], crane_yellow), box([-hx, hy - 0.15, -hz], [hx, hy, hz], grey_steel)]
    if not lod:
        for side in (-1, 1):
            za, zb = (hz, hz + 0.02) if side > 0 else (-hz - 0.02, -hz)
            for i in range(5):
                y = 0.4 + i * 0.25
                out.append(box([-hx + 0.6, y, za], [hx - 0.6, y + 0.08, zb], grey_steel))
            out += strips([-hx, -hy, za], [hx, hy - 0.15, zb], 0, 1.0, 0.04, crane_yellow, lod)
        out.append(box([-hx - 0.02, -hy, -0.5], [-hx, -hy + 2.0, 0.5], grey_steel))
        out.append(box([-hx - 0.02, -hy + 2.1, -0.15], [-hx, -hy + 2.25, 0.15], lit))
    return out


def counterweight(s, lod, rng):
    hx, hy, hz = s[0] / 2, s[1] / 2, s[2] / 2
    return [box([-hx, -hy, -hz], [hx, hy, hz], concrete, 0 if lod else 0.04)]


def cab(s, lod, rng):
    """The driver's cab: glazed on three sides and down its front to see the hook."""
    hx, hy, hz = s[0] / 2, s[1] / 2, s[2] / 2
    out = [box([-hx, -hy, -hz], [hx - 0.04, hy, hz], crane_yellow)]
    out.append(box([hx - 0.04, -hy + 0.3, -hz + 0.1], [hx, hy - 0.2, hz - 0.1], glass))
    for side in (-1, 1):
        za, zb = (hz, hz + 0.02) if side > 0 else (-hz - 0.02, -hz)
        out.append(box([-hx + 0.3, -hy + 0.9, za], [hx - 0.15, hy - 0.2, zb], glass))
    return out


def tower(s, lod, rng):
    """The A-frame: two raked legs each side rising to the boom's heel, braced across."""
    hx, hy, hz = s[0] / 2, s[1] / 2, s[2] / 2
    out = []
    for x0, x1 in ((-hx, -hx + 0.35), (hx - 0.35, hx)):
        for side in (-1, 1):
            prof = [(-hy, side * hz), (-hy, side * (hz - 0.45)), (hy - 0.6, side * 0.05), (hy - 0.6, side * 0.5)]
            if side < 0:
                prof = list(reversed(prof))
            out.append(kit.section(prof, x0, x1, crane_yellow))
        out.append(box([x0, -hy + 2.2, -hz * 0.7], [x1, -hy + 2.5, hz * 0.7], crane_yellow))
    # The head: where the legs meet, the boom's pivot and its sheaves.
    out.append(box([-hx, hy - 0.6, -hz * 0.5], [hx, hy, hz * 0.5], crane_yellow))
    out.append(box([-hx + 0.35, -hy + 2.2, -0.15], [hx - 0.35, -hy + 2.5, 0.15], crane_yellow))
    return out


def boom(s, lod, rng):
    """A box-girder boom tapering to its tip (the long one forward, +x; the counter-jib aft, -x), latticed sides."""
    hx, hy, hz = s[0] / 2, s[1] / 2, s[2] / 2
    tip = 1 if s[0] > 10 else -1
    a, b = (-hx, hx) if tip > 0 else (hx, -hx)
    prof = [(a, -hy), (b, -hy + hy * 0.9), (b, hy), (a, hy)]
    if tip < 0:
        prof = list(reversed(prof))
    out = [kit.prism(prof, -hz + 0.05, hz - 0.05, crane_yellow)]
    if not lod:
        # Diagonal bracing on the sides, a walkway rail on top.
        n = int(s[0] / 1.6)
        for side in (-1, 1):
            za, zb = (hz - 0.05, hz) if side > 0 else (-hz, -hz + 0.05)
            for i in range(n):
                x0 = -hx + i * s[0] / n
                x1 = x0 + s[0] / n
                t0 = (x0 - a) / (b - a)
                t1 = (x1 - a) / (b - a)
                low0 = -hy + hy * 0.9 * t0
                low1 = -hy + hy * 0.9 * t1
                up = i % 2 == 0
                p = [(x0, low0 if up else hy - 0.12), (x0 + 0.12, low0 if up else hy - 0.12), (x1, hy - 0.12 if up else low1 + 0.0), (x1 - 0.12, hy - 0.12 if up else low1)]
                out.append(kit.prism(p, za, zb, crane_yellow))
            out.append(box([-hx, hy - 0.12, za], [hx, hy, zb], crane_yellow))
            out.append(box([-hx, -hy, za], [hx, -hy + 0.1, zb], crane_yellow))
        if tip > 0:
            # The lamp on the boom's tip.
            out.append(box([hx - 0.3, hy - 0.2, -0.15], [hx, hy, 0.15], lit))
    return out


rk.dress("quay-wall", quay_wall)
rk.dress("bollard", bollard)
rk.dress("fender", fender)
rk.dress("leg", leg)
rk.dress("portal", portal)
rk.dress("turntable", turntable)
rk.dress("machine-house", machine_house)
rk.dress("counterweight", counterweight)
rk.dress("cab", cab)
rk.dress("tower", tower)
rk.dress("boom", boom)

# ------------------------------------------------------------------ warehouses and the hangar


def shed_wall(s, lod, rng):
    """Steel sheeting on a frame: the photo's corrugation, girts across it, rust running from them."""
    hx, hy, hz = s[0] / 2, s[1] / 2, s[2] / 2
    along = 0 if s[0] >= s[2] else 2
    out = [box([-hx, -hy, -hz], [hx, hy, hz], sheet)]
    if not lod and s[1] > 1.0:
        for side in (-1, 1):
            if along == 0:
                za, zb = (hz, hz + 0.015) if side > 0 else (-hz - 0.015, -hz)
                lo, hi = [-hx, 0, za], [hx, 0, zb]
            else:
                xa, xb = (hx, hx + 0.015) if side > 0 else (-hx - 0.015, -hx)
                lo, hi = [xa, 0, -hz], [xb, 0, hz]
            for y in (-hy + 0.02, hy - 0.12):
                lo[1], hi[1] = y, y + 0.1
                out.append(box(list(lo), list(hi), grey_steel))
            for _ in range(int(s[along] / 4) + 1):
                c = rng.uniform(-s[along] / 2 + 0.2, s[along] / 2 - 0.3)
                a, b = list(lo), list(hi)
                a[along], b[along] = c, c + rng.uniform(0.1, 0.3)
                a[1], b[1] = max(-hy, hy - rng.uniform(1.0, 2.6)), hy - 0.12
                out.append(box(a, b, hull_red))
    return out


def arch(s, axis, rise, lod, mat, bands=None):
    """A barrel roof's shell in its box: an arc across the span (z if `axis` is x, else x), 0.25 m thick, its eaves at
    the box's foot, its crown at its top; along `axis` in bands, a few of them skylights."""
    hx, hy, hz = s[0] / 2, s[1] / 2, s[2] / 2
    span = hz if axis == 0 else hx
    t = 0.25
    r = (span * span + rise * rise) / (2 * rise)
    n = 10 if lod else 24
    outer = []
    for k in range(n + 1):
        u = -span + 2 * span * k / n
        outer.append((u, hy - r + math.sqrt(max(r * r - u * u, 0.0))))
    inner = [(u, y - t) for u, y in reversed(outer)]
    prof = outer + inner
    length = s[axis]
    out = []
    edges = [-length / 2, length / 2] if lod or not bands else [-length / 2 + length * i / bands for i in range(bands + 1)]
    for i, (a, b) in enumerate(zip(edges, edges[1:])):
        m = skylight if (bands and i % 4 == 2) else mat
        if axis == 0:
            out.append(kit.section([(y, u) for u, y in prof], a, b, m))
        else:
            o = kit.prism([(u, y) for u, y in prof], a, b, m)
            out.append(o)
    return out, r


def gable_profile(width, y_bottom, top_at):
    """An end wall's outline under an arch: along its width, from its foot up to the arch's underside (`top_at`)."""
    n = 20
    pts = []
    for k in range(n + 1):
        u = -width / 2 + width * k / n
        pts.append((u, max(y_bottom + 0.02, top_at(u))))
    return [(-width / 2, y_bottom), (width / 2, y_bottom)] + list(reversed(pts))


WAREHOUSE_RISE = 3.2 - 0.25  # the roof's outer arc, from its eaves 0.25 m over the walls to the crown


def barrel_roof(s, lod, rng):
    out, _ = arch(s, 0, WAREHOUSE_RISE, lod, sheet_dark, bands=16)
    return out


def gable(s, lod, rng):
    """A warehouse's end wall above its eaves, up to the roof's underside (the roof box 0.1 m higher than this one's middle)."""
    hx, hy, hz = s[0] / 2, s[1] / 2, s[2] / 2
    span = 9.2
    r = (span * span + WAREHOUSE_RISE ** 2) / (2 * WAREHOUSE_RISE)
    # The roof's middle is 0.1 m above this box's, its half height 1.6.
    top = lambda u: 0.1 + 1.6 - r + math.sqrt(max(r * r - u * u, 0.0)) - 0.25 - 0.01  # noqa: E731
    prof = gable_profile(s[2], -hy, lambda u: min(hy, top(u)))
    o = kit.prism([(u, y) for u, y in prof], -hx, hx, sheet)
    o.data.transform(Matrix.Rotation(-math.pi / 2, 4, "Z"))
    return [o]


HANGAR_RISE = 4.6 - 0.25


def arch_roof(s, lod, rng):
    out, _ = arch(s, 2, HANGAR_RISE, lod, sheet_dark, bands=12)
    return out


def hangar_gable(s, lod, rng):
    """The hangar's ends under its arch: `s` along x; this box's middle `dy` below the roof's (0 at the back, 0.5 over the doors at the front)."""
    hx, hy, hz = s[0] / 2, s[1] / 2, s[2] / 2
    span = 13.0
    r = (span * span + HANGAR_RISE ** 2) / (2 * HANGAR_RISE)
    dy = 0.0 if s[1] > 4.0 else -0.5
    top = lambda u: dy + 2.3 - r + math.sqrt(max(r * r - u * u, 0.0)) - 0.25 - 0.01  # noqa: E731
    prof = gable_profile(s[0], -hy, lambda u: min(hy, top(u)))
    out = [kit.prism(prof, -hz, hz, sheet)]
    if dy < 0 and not lod:
        # Over the doors: a steel lintel, and the hangar's lamps.
        out.append(box([-hx + 2.7, -hy, hz], [hx - 2.7, -hy + 0.3, hz + 0.02], grey_steel))
        for x in (-6, 0, 6):
            out.append(box([x - 0.25, -hy + 0.35, hz], [x + 0.25, -hy + 0.5, hz + 0.03], lit))
    return out


def jamb(s, lod, rng):
    """A front jamb: the hangar's sliding doors parked against it."""
    hx, hy, hz = s[0] / 2, s[1] / 2, s[2] / 2
    out = [box([-hx, -hy, -hz], [hx, hy, hz - 0.08], sheet), box([-hx, -hy, hz - 0.08], [hx, hy, hz], sheet_dark)]
    if not lod:
        out += strips([-hx, -hy + 0.2, hz], [hx, hy - 0.2, hz + 0.015], 0, 0.9, 0.05, grey_steel, lod)
    return out


def rack(s, lod, rng):
    """Pallet racking: blue uprights, orange beams, three levels of wrapped pallets of goods filling the bays."""
    hx, hy, hz = s[0] / 2, s[1] / 2, s[2] / 2
    out = []
    bays = max(1, round(s[0] / 2.5))
    w = s[0] / bays
    levels = 3
    h = s[1] / levels
    for i in range(bays + 1):
        x = -hx + i * w
        xa, xb = max(-hx, x - 0.05), min(hx, x + 0.05)
        out.append(box([xa, -hy, -hz], [xb, hy, hz], rack_blue))
    for i in range(bays):
        xa, xb = -hx + i * w + 0.05, -hx + (i + 1) * w - 0.05
        for j in range(levels):
            y0 = -hy + j * h
            out.append(box([xa, y0, -hz], [xb, y0 + 0.12, hz], rack_orange))
            g = rng.uniform(0.55, 0.95) * (h - 0.16)
            m = rng.choice([plank, tarp, sheet, plank])
            out.append(box([xa + 0.05, y0 + 0.12, -hz + 0.05], [xb - 0.05, y0 + 0.12 + g, hz - 0.05], m, 0 if lod else 0.02))
    return out


def crate(s, lod, rng):
    hx, hy, hz = s[0] / 2, s[1] / 2, s[2] / 2
    out = [box([-hx + 0.03, -hy, -hz + 0.03], [hx - 0.03, hy - 0.03, hz - 0.03], plank, 0 if lod else 0.02)]
    if not lod:
        out.append(box([-hx, hy - 0.03, -hz], [hx, hy, hz], timber))
        for sx in (-1, 1):
            for sz in (-1, 1):
                out.append(box([sx * hx - (0.06 if sx > 0 else 0), -hy, sz * hz - (0.06 if sz > 0 else 0)], [sx * hx + (0 if sx > 0 else 0.06), hy - 0.03, sz * hz + (0 if sz > 0 else 0.06)], timber))
    return out


def bench(s, lod, rng):
    hx, hy, hz = s[0] / 2, s[1] / 2, s[2] / 2
    out = [box([-hx, hy - 0.08, -hz], [hx, hy, hz], timber, 0 if lod else 0.01)]
    for x in (-hx + 0.1, hx - 0.2):
        out.append(box([x, -hy, -hz + 0.05], [x + 0.1, hy - 0.08, hz - 0.05], grey_steel))
    out.append(box([-hx + 0.25, -hy + 0.2, -hz + 0.1], [hx - 0.25, -hy + 0.25, hz - 0.1], grey_steel))
    return out


rk.dress("shed-wall", shed_wall)
rk.dress("barrel-roof", barrel_roof)
rk.dress("gable", gable)
rk.dress("arch-roof", arch_roof)
rk.dress("hangar-gable", hangar_gable)
rk.dress("jamb", jamb)
rk.dress("rack", rack)
rk.dress("crate", crate)
rk.dress("bench", bench)

# ------------------------------------------------------------------ the kit for the cover pass's pieces (unit boxes)


def shrink(out, size):
    m = Matrix.Diagonal((1 / size[0], 1 / size[2], 1 / size[1], 1.0))
    for o in out:
        o.data.transform(m)
    return out


BURY = 0.6  # a stretched piece's foot is sunk this far under the ground at its lowest corner


def one_container(livery):
    def build(lod, rng):
        # Drawn in metres: a 40 ft box, 12 by 2.5 by 2.6 over its sunk foot.
        out = [box([-6, 0, -1.2], [6, BURY, 1.2], black)]
        out += container(-6, 6, BURY, BURY + 2.6, 1.25, livery, lod)
        return shrink(out, (12, BURY + 2.6, 2.5))

    return build


def two_containers(low, high):
    def build(lod, rng):
        out = [box([-6, 0, -1.2], [6, BURY, 1.2], black)]
        out += container(-6, 6, BURY, BURY + 2.6, 1.25, low, lod)
        out += container(-6, 6, BURY + 2.6, BURY + 5.2, 1.25, high, lod, doors=-1)
        return shrink(out, (12, BURY + 5.2, 2.5))

    return build


OFFICE = (8.0, 3.4 + BURY, 6.0)


def office(lod, rng):
    """A dock shed: sheeted walls on a concrete upstand, a roller door in one long side, a door and windows in the
    other, a light over the door, a roof sloping a little behind a fascia."""
    hx, hz = OFFICE[0] / 2, OFFICE[2] / 2
    top = OFFICE[1]
    out = [box([-hx, 0, -hz], [hx, BURY + 0.4, hz], concrete), box([-hx + 0.02, BURY + 0.4, -hz + 0.02], [hx - 0.02, top - 0.3, hz - 0.02], sheet)]
    out.append(box([-hx, top - 0.3, -hz], [hx, top, hz], grey_steel))
    if not lod:
        # The roller door (+z), slatted.
        for i in range(10):
            y = BURY + 0.45 + i * 0.25
            out.append(box([-2.8, y, hz - 0.02], [0.2, y + 0.2, hz], grey_steel))
        # The door and windows (-z), one lit.
        out.append(box([1.8, BURY + 0.4, -hz], [2.8, BURY + 2.5, -hz + 0.02], timber))
        out.append(box([-2.6, BURY + 1.3, -hz], [-1.0, BURY + 2.3, -hz + 0.02], lit))
        out.append(box([-0.6, BURY + 1.3, -hz], [1.0, BURY + 2.3, -hz + 0.02], glass))
        out.append(box([2.1, BURY + 2.6, -hz], [2.5, BURY + 2.75, -hz + 0.03], lit))
        # Rust from the fascia, a stencilled number board.
        for x in (-3.2, 0.8, 3.4):
            out.append(box([x, top - 1.5, hz - 0.02], [x + 0.18, top - 0.3, hz], hull_red))
        out.append(box([-hx, BURY + 1.2, -1.0], [-hx + 0.02, BURY + 2.0, 1.0], white))
    return shrink(out, OFFICE)


WALL = (11.0, 2.6 + BURY, 0.8)


def wall(lod, rng):
    """A precast wall: concrete panels between their posts, a coping on top, the bottom painted in hazard bands."""
    hx, hz = WALL[0] / 2, WALL[2] / 2
    top = WALL[1]
    panels = 4
    out = []
    w = WALL[0] / panels
    for i in range(panels):
        x0, x1 = -hx + i * w, -hx + (i + 1) * w
        out.append(box([x0 + 0.2, 0, -hz + 0.06], [x1 - 0.2, top - 0.15, hz - 0.06], concrete, 0 if lod else 0.02))
        out.append(box([x0, 0, -hz], [x0 + 0.2, top - 0.15, hz], concrete, 0 if lod else 0.02))
        out.append(box([x1 - 0.2, 0, -hz], [x1, top - 0.15, hz], concrete, 0 if lod else 0.02))
    out.append(box([-hx, top - 0.15, -hz], [hx, top, hz], concrete))
    if not lod:
        for i in range(int(WALL[0] / 0.6)):
            x = -hx + 0.2 + i * 0.6
            m = hazard if i % 2 == 0 else black
            for side in (-1, 1):
                za, zb = (hz - 0.06, hz - 0.05) if side > 0 else (-hz + 0.05, -hz + 0.06)
                if any(abs(x - (-hx + k * w)) < 0.45 for k in range(panels + 1)):
                    continue
                out.append(box([x, BURY, za], [x + 0.3, BURY + 0.5, zb], m))
    return shrink(out, WALL)


def crates(lod, rng):
    """A load on the quay: two big crates, a smaller one on top, and a pallet of sacks under a strapped tarp beside.
    Every part its own closed shape, none inside another."""
    out = []

    def one(x0, z0, x1, z1, y0, y1, m=plank):
        i = 0.012
        out.append(box([x0 + i, y0, z0 + i], [x1 - i, y1, z1 - i], m, 0 if lod else 0.004))
        if not lod:
            for y in (y0 + 0.02, y1 - 0.05):
                out.append(box([x0, y, z0 + i], [x0 + i, y + 0.03, z1 - i], timber))
                out.append(box([x1 - i, y, z0 + i], [x1, y + 0.03, z1 - i], timber))
                out.append(box([x0, y, z0], [x1, y + 0.03, z0 + i], timber))
                out.append(box([x0, y, z1 - i], [x1, y + 0.03, z1], timber))

    one(-0.5, -0.5, 0.0, 0.5, 0, 0.6)
    one(0.02, -0.5, 0.5, -0.02, 0, 0.52, tarp)
    one(0.04, 0.02, 0.48, 0.46, 0, 0.45)
    one(-0.4, -0.38, 0.1, 0.36, 0.6, 1.0)
    return out


CAR = (4.3, 1.5, 1.9)


def car(lod, rng):
    """An abandoned hatchback, faded and salt-rusted, drawn in metres at the wrecks' size and shrunk into the unit box.
    The body and glasshouse are one closed outline, so the fitter's box for it stands on the ground."""
    hx, hz = CAR[0] / 2, CAR[2] / 2
    out = [box([-1.7, 0.3, -0.6], [1.7, 0.55, 0.6], black)]
    out.append(kit.prism([(-2.13, 0.55), (2.13, 0.55), (2.13, 0.9), (1.2, 1.0), (0.4, 1.48), (-1.6, 1.48), (-2.1, 1.05), (-2.13, 0.9)], -0.9, 0.9, car_paint))
    for x, z in ((1.35, 0.72), (1.35, -0.72), (-1.35, 0.72), (-1.35, -0.72)):
        r = 0.32
        if lod:
            out.append(kit.cylinder(r, z - 0.11, z + 0.11, (x, r, z), "z", rubber, 10))
        else:
            out += kit.wheel(x, r, z, r, 0.22, rubber, grey_steel, black, 14, 0.6, 1 if z > 0 else -1)
    if not lod:
        out.append(kit.prism([(1.18, 1.02), (1.2, 1.02), (0.42, 1.46), (0.4, 1.46)], -0.78, 0.78, glass))
        for s in (-1, 1):
            lo, hi = (0.9, 0.912) if s > 0 else (-0.912, -0.9)
            out.append(kit.prism([(-1.55, 1.05), (1.0, 1.05), (0.42, 1.42), (-1.55, 1.42)], lo, hi, glass))
        out.append(box([2.13, 0.6, -0.86], [2.15, 0.82, 0.86], grey_steel))
        out.append(box([-2.15, 0.6, -0.86], [-2.13, 0.82, 0.86], grey_steel))
        out.append(kit.prism([(-2.06, 1.1), (-2.08, 1.1), (-1.66, 1.46), (-1.64, 1.46)], -0.6, 0.6, glass))
    return shrink(out, CAR)


TRUCK = (6.0, 2.6, 2.5)


def truck(lod, rng):
    """A cab-over box truck: the cab forward (+x), a container-like box body behind, three axles."""
    out = [box([-2.9, 0.45, -0.5], [2.6, 0.75, 0.5], black)]
    out.append(box([1.7, 0.75, -1.15], [2.95, 2.4, 1.15], cab_paint, 0 if lod else 0.04))
    out.append(box([2.95, 0.5, -1.15], [3.0, 0.8, 1.15], grey_steel))
    out += container(-2.95, 1.6, 0.8, 2.6, 1.22, LIVERY["grey"], lod, doors=-1)
    for x in (2.2, -1.6, -2.4):
        for z in (-0.95, 0.95):
            r = 0.45
            if lod:
                out.append(kit.cylinder(r, z - 0.14, z + 0.14, (x, r, z), "z", rubber, 10))
            else:
                out += kit.wheel(x, r, z, r, 0.28, rubber, grey_steel, black, 14, 0.55, 1 if z > 0 else -1)
    if not lod:
        out.append(box([2.95, 1.55, -1.0], [2.97, 2.25, 1.0], glass))
        for s in (-1, 1):
            lo, hi = (1.15, 1.165) if s > 0 else (-1.165, -1.15)
            out.append(box([2.1, 1.55, lo], [2.85, 2.2, hi], glass))
        out.append(box([2.97, 0.95, -1.0], [2.99, 1.4, 1.0], black))
    return shrink(out, TRUCK)


rk.unit("rh-container", one_container(LIVERY["maroon"]))
rk.unit("rh-container-b", one_container(LIVERY["blue"]))
rk.unit("rh-stack", two_containers(LIVERY["teal"], LIVERY["orange"]))
rk.unit("rh-stack-b", two_containers(LIVERY["green"], LIVERY["grey"]))
rk.unit("rh-office", office)
rk.unit("rh-wall", wall)
rk.unit("rh-crates", crates)
rk.unit("rh-car", car)
rk.unit("rh-truck", truck)

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
