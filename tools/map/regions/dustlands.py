"""The Dustlands' kit (ticket 18): a mining camp round a crashed cargo jet on the canyon floor, and the models the
cover pass's pieces there wear. Builds apps/range/public/models/dustlands.glb:

    blender -b --factory-startup --python tools/map/build.py -- tools/map/regions/dustlands.py --export --preview DIR

The pieces' boxes come from tools/map/regions/dustlands.json, which the test writes from the plan
(apps/range/src/map/zero-island-dustlands-plan.ts; `UPDATE_KIT=1`). See tools/map/regionkit.py for the pattern.
Permanent dusk over red rock: sun-bleached aluminium, sun-greyed planks, rusted tin, adobe, ochre dust in everything.
"""
import math
import os
import sys

import bmesh
from mathutils import Matrix

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(HERE))
import regionkit  # noqa: E402

OUT = os.path.join(HERE, "..", "..", "..", "apps", "range", "public", "models", "dustlands.glb")
rk = regionkit.RegionKit(bkit, "dustlands", os.path.join(HERE, "dustlands.json"))  # noqa: F821
kit = rk.kit
box = rk.box

# Finishes: colour (sRGB) and the photo layer it wears.
hull = rk.mat("dl.hull", (182, 178, 168), "plate", 0.5, 0.4)
stripe = rk.mat("dl.stripe", (72, 84, 100), "plate", 0.5, 0.3)
scorch = rk.mat("dl.scorch", (58, 52, 48), "plate", 0.8, 0.2)
plank = rk.mat("dl.plank", (156, 132, 106), "plank", 0.9)
timber = rk.mat("dl.timber", (112, 88, 64), "plank", 0.9)
tin = rk.mat("dl.tin", (158, 118, 90), "tin", 0.7, 0.3)
adobe = rk.mat("dl.adobe", (196, 156, 116), "adobe", 0.95)
rust = rk.mat("dl.rust", (136, 98, 70), "steel", 0.7, 0.3)
paint = rk.mat("dl.paint", (178, 104, 56), "steel", 0.6, 0.3)
olive = rk.mat("dl.olive", (98, 104, 72), "steel", 0.6, 0.3)
red = rk.mat("dl.red", (132, 46, 34), "steel", 0.6, 0.3)
stone = rk.mat("dl.stone", (172, 120, 84), "rock", 0.95)
ore = rk.mat("dl.ore", (120, 86, 66), "rock", 0.95)
dark = rk.mat("dl.dark", (30, 28, 26), None, 0.9)
glass = rk.mat("dl.glass", (24, 28, 32), None, 0.2)
tyre = rk.mat("dl.tyre", (34, 32, 30), None, 0.95)


def loft(rings, mat, segments, name="loft"):
    """A tube along game x through rings (x, centre y, radius), capped at both ends."""
    bm = bmesh.new()
    loops = []
    for x, cy, r in rings:
        loop = []
        for k in range(segments):
            a = 2 * math.pi * k / segments
            loop.append(bm.verts.new(kit.b((x, cy + r * math.cos(a), r * math.sin(a)))))
        loops.append(loop)
    for a, c in zip(loops, loops[1:]):
        for k in range(segments):
            bm.faces.new((a[k], a[(k + 1) % segments], c[(k + 1) % segments], c[k]))
    bm.faces.new(list(reversed(loops[0])))
    bm.faces.new(loops[-1])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    o = kit.obj(name, bm, mat, smooth=True)
    return o


# ------------------------------------------------------------------ the jet


def fuselage(s, lod, rng):
    """A length of fuselage along x, its top the box's: skin, a faded stripe and windows, both ends torn open."""
    hx, hy, r = s[0] / 2, s[1] / 2, s[2] / 2
    cy = hy - r
    seg = 12 if lod else 28
    out = [kit.cylinder(r, -hx, hx, (0, cy, 0), "x", hull, seg)]
    if lod:
        return out
    # The cheat line under the windows, and a row of windows each side.
    out.append(kit.cylinder(r + 0.015, -hx + 0.1, hx - 0.1, (0, cy, 0), "x", stripe, seg))
    out[-1].data.transform(Matrix.Translation(kit.b((0, cy, 0))) @ Matrix.Diagonal((1, 1, 0.12, 1)) @ Matrix.Translation(-kit.b((0, cy, 0))))
    out[-1].data.transform(Matrix.Translation(kit.b((0, 0.35, 0))))
    for side in (-1, 1):
        for i in range(int(s[0] / 1.1)):
            x = -hx + 0.6 + i * 1.1
            if x > hx - 0.5:
                break
            zs = math.sqrt(r * r - 0.975 ** 2)
            out.append(box([x - 0.18, cy + 0.75, side * (zs - 0.06)], [x + 0.18, cy + 1.2, side * (zs + 0.012)], glass))
    # Torn ends: the dark inside behind a ragged lip of skin.
    for end in (-1, 1):
        x = end * (hx - 0.04)
        out.append(kit.cylinder(r * 0.94, x - 0.03, x + 0.03, (0, cy, 0), "x", dark, seg))
        for k in range(10):
            a = 2 * math.pi * (k + rng.uniform(0, 0.6)) / 10
            w, l = rng.uniform(0.3, 0.6), rng.uniform(0.15, 0.4)
            y, z = cy + r * math.cos(a), r * math.sin(a)
            o = box([-l / 2, -0.02, -w / 2], [l / 2, 0.02, w / 2], hull)
            o.data.transform(Matrix.Translation(kit.b((x - end * l / 2, cy + (y - cy) * 0.98, z * 0.98))) @ Matrix.Rotation(a, 4, "X"))
            out.append(o)
    # Ribs showing where panels joined.
    for i in range(1, int(s[0] / 2.2)):
        x = -hx + i * 2.2
        out.append(kit.cylinder(r + 0.02, x - 0.04, x + 0.04, (0, cy, 0), "x", scorch if rng.random() < 0.3 else hull, seg))
    return out


def tail_cone(s, lod, rng):
    """The tail, narrowing aft (-x) and sweeping up to the fin: its top stays level with the fuselage's."""
    hx, hy, r = s[0] / 2, s[1] / 2, s[2] / 2
    top = hy
    n = 6 if lod else 12
    rings = []
    for i in range(n + 1):
        t = i / n
        rad = 0.55 + (r - 0.55) * math.sin(t * math.pi / 2) ** 0.8
        rings.append((-hx + s[0] * t, top - rad, rad))
    return [loft(rings, hull, 12 if lod else 24)]


def fin(s, lod, rng):
    hx, hy, hz = s[0] / 2, s[1] / 2, s[2] / 2
    t = min(hz, 0.16)
    profile = [(-hx, -hy), (hx, -hy), (hx - 1.0, -hy + 0.6), (-hx + 1.6, hy), (-hx, hy)]
    out = [kit.prism(profile, -t, t, hull, 0 if lod else 0.03)]
    if not lod:
        # The fin's painted band, and its rudder hinge line.
        band = [(-hx + 0.25, hy - 1.9), (hx - 2.3, hy - 1.9), (hx - 2.6, hy - 1.2), (-hx + 0.4, hy - 1.2)]
        out.append(kit.prism(band, -t - 0.01, t + 0.01, stripe))
        out.append(box([-hx + 0.6, -hy, -t - 0.012], [-hx + 0.66, hy - 0.1, t + 0.012], scorch))
    return out


def tailplane(s, lod, rng):
    hx, hy, hz = s[0] / 2, s[1] / 2, s[2] / 2
    outline = [(-hx, -hz), (-hx + 1.4, -hz), (hx, -1.2), (hx, 1.2), (-hx + 1.4, hz), (-hx, hz)]
    return [kit.plan(outline, -hy * 0.6, hy * 0.6, hull, 0 if lod else 0.03)]


def nose(s, lod, rng):
    """The nose, rounding to its tip at +x, its top easing down; the cockpit's windows dark."""
    hx, hy, r = s[0] / 2, s[1] / 2, s[2] / 2
    top = hy
    n = 6 if lod else 12
    rings = []
    for i in range(n + 1):
        t = i / n
        rad = max(0.12, r * math.sqrt(max(0.0, 1 - t ** 2.2)))
        rings.append((-hx + (s[0] - 0.05) * t, top - r - (r - rad) * 0.35 + (0 if t < 1 else 0), rad))
    out = [loft(rings, hull, 12 if lod else 24)]
    if not lod:
        # Cockpit windows: dark panes down each side of the nose, on its skin.
        for i, t0 in enumerate((0.16, 0.3)):
            t1 = t0 + 0.11
            rad0 = r * math.sqrt(1 - t0 ** 2.2)
            rad1 = r * math.sqrt(1 - t1 ** 2.2)
            centre = top - r
            up = 0.95
            z_in = math.sqrt(max(rad1 ** 2 - up ** 2, 0.01))
            z_out = math.sqrt(max(rad0 ** 2 - up ** 2, 0.01))
            for side in (-1, 1):
                out.append(box([-hx + s[0] * t0, centre + up - 0.22, side * (z_in - 0.06)], [-hx + s[0] * t1, centre + up + 0.22, side * (z_out + 0.012)], glass))
    return out


def wing(s, lod, rng):
    """A swept wing panel: its leading edge (+x) sweeping back toward the tip (+z)."""
    hx, hy, hz = s[0] / 2, s[1] / 2, s[2] / 2
    lead = (hx, hx - s[0] * 0.45)
    trail = (-hx, -hx + s[0] * 0.15)
    outline = [(trail[0], -hz), (lead[0], -hz), (lead[1], hz), (trail[1], hz)]
    out = [kit.plan(outline, -hy, hy * 0.5, hull, 0 if lod else 0.03)]
    if not lod:
        # The upper skin, thinner toward the trailing edge, and the flaps' seams.
        top = [(trail[0] + 0.8, -hz + 0.05), (lead[0] - 0.05, -hz + 0.05), (lead[1] - 0.05, hz - 0.05), (trail[1] + 0.8, hz - 0.05)]
        out.append(kit.plan(top, hy * 0.5, hy, hull))
        out.append(kit.plan([(trail[0] + 0.7, -hz + 0.1), (trail[0] + 0.78, -hz + 0.1), (trail[1] + 0.78, hz - 0.1), (trail[1] + 0.7, hz - 0.1)], hy * 0.5, hy * 0.5 + 0.012, scorch))
    return out


def engine(s, lod, rng):
    """An engine pod on its pylon, its top the wing's underside: dark intake forward (+x), the exhaust aft."""
    hx, hy, hz = s[0] / 2, s[1] / 2, s[2] / 2
    r = hz - 0.12
    cy = hy - 0.32 - r
    seg = 12 if lod else 24
    out = [kit.lathe([(-hx, r * 0.6), (-hx + 0.6, r * 0.9), (-hx + 1.6, r), (hx - 0.2, r), (hx, r * 0.92)], (0, cy, 0), hull, seg, axis="x")]
    out.append(box([-hx + 0.8, cy + r * 0.6, -0.12], [hx - 0.6, hy, 0.12], hull))
    if not lod:
        out.append(kit.cylinder(r * 0.82, hx - 0.06, hx + 0.005, (0, cy, 0), "x", dark, seg))
        out.append(kit.cylinder(r * 0.42, -hx - 0.005, -hx + 0.05, (0, cy, 0), "x", scorch, seg))
    return out


def wing_off(s, lod, rng):
    """The torn-off wing, lying with its root dug in and its tip raised; a ragged root."""
    hx, hy, hz = s[0] / 2, s[1] / 2, s[2] / 2
    t = 0.32
    # (y, z) across, root (-z) low, tip (+z) high.
    profile = [(-hy + 0.05, -hz), (hy - t - 0.05, hz), (hy - 0.05, hz), (-hy + 0.05 + t, -hz)]
    out = [kit.section(profile, -hx, hx, hull, 0 if lod else 0.02)]
    if not lod:
        # Soot along its torn root.
        out.append(kit.section([(-hy + 0.04, -hz + 0.02), (-hy + 0.04 + t + 0.02, -hz + 0.02), (-hy + 0.04 + t + 0.02 + 0.06, -hz + 0.6), (-hy + 0.1, -hz + 0.6)], -hx + 0.05, hx - 0.05, scorch))
    return out


def panel(s, lod, rng):
    """A skin panel thrown clear, buckled across: two leaves of sheet meeting at a fold."""
    hx, hy, hz = s[0] / 2, s[1] / 2, s[2] / 2
    profile = [(-hy + 0.05, -hz), (hy - 0.05, -hz * 0.15), (hy - 0.05, -hz * 0.15 + 0.12), (-hy + 0.65, hz), (-hy + 0.55, hz), (-hy + 0.12, -hz + 0.02)]
    return [kit.section(profile, -hx, hx, hull if rng.random() < 0.6 else scorch, 0 if lod else 0.01)]


def crate(s, lod, rng):
    hx, hy, hz = s[0] / 2, s[1] / 2, s[2] / 2
    out = [box([-hx + 0.03, -hy, -hz + 0.03], [hx - 0.03, hy - 0.03, hz - 0.03], plank, 0 if lod else 0.02)]
    if not lod:
        for y in (-hy + 0.04, hy - 0.08):
            out.append(box([-hx, y, -hz], [hx, y + 0.08, hz], timber, 0.01))
        for sx in (-1, 1):
            for sz in (-1, 1):
                out.append(box([sx * hx - (0.08 if sx > 0 else 0), -hy, sz * hz - (0.08 if sz > 0 else 0)], [sx * hx + (0 if sx > 0 else 0.08), hy, sz * hz + (0 if sz > 0 else 0.08)], timber, 0.01))
    return out


rk.dress("fuselage", fuselage)
rk.dress("tail-cone", tail_cone)
rk.dress("fin", fin)
rk.dress("tailplane", tailplane)
rk.dress("nose", nose)
rk.dress("wing", wing)
rk.dress("engine", engine)
rk.dress("wing-off", wing_off)
rk.dress("panel", panel)
rk.dress("crate", crate)

# ------------------------------------------------------------------ shacks and the office


def plank_wall(s, lod, rng):
    """Boards on a frame: the photo's planks run up, a top plate and a sill board proud of them."""
    hx, hy, hz = s[0] / 2, s[1] / 2, s[2] / 2
    out = [box([-hx, -hy, -hz], [hx, hy, hz], plank, 0 if lod else 0.01)]
    if not lod and s[1] > 1.2:
        along = 0 if s[0] >= s[2] else 2
        for y in (hy - 0.16, -hy + 0.75):
            lo, hi = [-hx, y, -hz - 0.02], [hx, y + 0.12, hz + 0.02]
            if along == 2:
                lo, hi = [-hx - 0.02, y, -hz], [hx + 0.02, y + 0.12, hz]
            out.append(box(lo, hi, timber))
    return out


def adobe_wall(s, lod, rng):
    hx, hy, hz = s[0] / 2, s[1] / 2, s[2] / 2
    out = rk.panels(s, adobe, 4.5, 0.06, lod)
    if not lod and s[1] > 1.2 and hy - 0.3 > -hy + 3.0:
        # Roof beams' ends poking through, under the eaves.
        along = 0 if s[0] >= s[2] else 2
        L = s[along]
        for i in range(max(1, int(L / 1.4))):
            a = -L / 2 + (i + 0.5) * L / max(1, int(L / 1.4))
            lo, hi = ([a - 0.08, hy - 0.42, -hz - 0.03], [a + 0.08, hy - 0.26, hz + 0.03]) if along == 0 else ([-hx - 0.03, hy - 0.42, a - 0.08], [hx + 0.03, hy - 0.26, a + 0.08])
            out.append(box(lo, hi, timber))
    return out


def bench(s, lod, rng):
    hx, hy, hz = s[0] / 2, s[1] / 2, s[2] / 2
    out = [box([-hx, hy - 0.08, -hz], [hx, hy, hz], plank, 0 if lod else 0.01)]
    for x in (-hx + 0.1, hx - 0.2):
        out.append(box([x, -hy, -hz + 0.05], [x + 0.1, hy - 0.08, hz - 0.05], timber))
    return out


def desk(s, lod, rng):
    hx, hy, hz = s[0] / 2, s[1] / 2, s[2] / 2
    out = [box([-hx, hy - 0.06, -hz], [hx, hy, hz], timber, 0 if lod else 0.01)]
    for sx in (-1, 1):
        out.append(box([sx * hx - (0.4 if sx > 0 else 0), -hy, -hz + 0.05], [sx * hx + (0 if sx > 0 else 0.4), hy - 0.06, hz - 0.05], plank))
    return out


def post(s, lod, rng):
    hx, hy, hz = s[0] / 2, s[1] / 2, s[2] / 2
    return [box([-hx, -hy, -hz], [hx, hy, hz], timber, 0 if lod else 0.02)]


def tank(s, lod, rng):
    """A water tank on the roof: a riveted drum with hoops, on a timber cradle."""
    hx, hy, hz = s[0] / 2, s[1] / 2, s[2] / 2
    r = min(hx, hz)
    seg = 12 if lod else 24
    out = [box([-hx, -hy, -0.15], [hx, -hy + 0.25, 0.15], timber), box([-0.15, -hy, -hz], [0.15, -hy + 0.25, hz], timber)]
    out.append(kit.lathe([(-hy + 0.25, r * 0.98), (hy - 0.3, r * 0.98), (hy - 0.05, r * 0.7), (hy, 0.3)], (0, 0, 0), rust, seg))
    if not lod:
        for y in (-hy + 0.7, 0.1, hy - 0.7):
            out.append(kit.lathe([(y - 0.04, r), (y + 0.04, r)], (0, 0, 0), dark, seg))
    return out


rk.dress("plank-wall", plank_wall)
rk.dress("adobe-wall", adobe_wall)
rk.dress("tin-roof", lambda s, lod, rng: rk.corrugated(s, tin, 0.3, lod))
rk.dress("awning", lambda s, lod, rng: rk.corrugated(s, tin, 0.3, lod, along=2))
rk.dress("bench", bench)
rk.dress("desk", desk)
rk.dress("post", post)
rk.dress("tank", tank)

# ------------------------------------------------------------------ the ore hopper


def leg(s, lod, rng):
    hx, hy, hz = s[0] / 2, s[1] / 2, s[2] / 2
    out = [box([-hx + 0.02, -hy, -hz + 0.02], [hx - 0.02, hy, hz - 0.02], timber, 0 if lod else 0.02)]
    if not lod:
        # Steel fish plates bolted on where the posts were spliced.
        for y in (-hy + 2.4, -hy + 5.6):
            out.append(box([-hx, y, -hz], [hx, y + 0.5, hz], rust))
    return out


def bin_(s, lod, rng):
    """The bin: planked sides tapering down to its gate, a steel rim round its top."""
    hx, hy, hz = s[0] / 2, s[1] / 2, s[2] / 2
    bm = bmesh.new()
    top = [(-hx, hy, -hz), (hx, hy, -hz), (hx, hy, hz), (-hx, hy, hz)]
    mid = [(-hx, hy - 1.6, -hz), (hx, hy - 1.6, -hz), (hx, hy - 1.6, hz), (-hx, hy - 1.6, hz)]
    low = [(-0.7, -hy + 0.6, -0.7), (0.7, -hy + 0.6, -0.7), (0.7, -hy + 0.6, 0.7), (-0.7, -hy + 0.6, 0.7)]
    rings = [[bm.verts.new(kit.b(p)) for p in ring] for ring in (top, mid, low)]
    for a, c in zip(rings, rings[1:]):
        for k in range(4):
            bm.faces.new((a[k], a[(k + 1) % 4], c[(k + 1) % 4], c[k]))
    bm.faces.new(rings[0])
    bm.faces.new(list(reversed(rings[-1])))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    out = [kit.obj("bin", bm, plank)]
    out.append(box([-0.5, -hy, -0.5], [0.5, -hy + 0.62, 0.5], rust))
    if not lod:
        out.append(box([-hx, hy - 0.2, -hz], [hx, hy, -hz + 0.12], rust))
        out.append(box([-hx, hy - 0.2, hz - 0.12], [hx, hy, hz], rust))
        out.append(box([-hx, hy - 0.2, -hz], [-hx + 0.12, hy, hz], rust))
        out.append(box([hx - 0.12, hy - 0.2, -hz], [hx, hy, hz], rust))
    return out


def heap(s, lod, rng):
    """Ore tipped from the gate: a heap of broken rock, higher in the middle."""
    return rk.rubble(s, ore, rng, lod)


def deck(s, lod, rng):
    """Timber cribbing under a board deck: solid to the ground."""
    hx, hy, hz = s[0] / 2, s[1] / 2, s[2] / 2
    out = [box([-hx + 0.04, -hy, -hz + 0.04], [hx - 0.04, hy - 0.1, hz - 0.04], timber)]
    n = 1 if lod else max(1, int(s[0] / 0.3))
    for i in range(n):
        x0 = -hx + s[0] * i / n
        out.append(box([x0 + (0 if lod else 0.01), hy - 0.1, -hz], [x0 + s[0] / n - (0 if lod else 0.01), hy, hz], plank))
    if not lod:
        for y in (-hy + 0.9, hy - 0.5):
            out.append(box([-hx, y, -hz], [hx, y + 0.2, -hz + 0.04], timber))
            out.append(box([-hx, y, hz - 0.04], [hx, y + 0.2, hz], timber))
    return out


rk.dress("leg", leg)
rk.dress("beam", lambda s, lod, rng: [box([-s[0] / 2, -s[1] / 2, -s[2] / 2], [s[0] / 2, s[1] / 2, s[2] / 2], timber, 0 if lod else 0.02)])
rk.dress("bin", bin_)
rk.dress("ore", heap)
rk.dress("deck", deck)

# ------------------------------------------------------------------ the kit for the cover pass's pieces (unit boxes)


def wheel(x, y, z, rx, ry, width, m, segments=12):
    """A wheel on an axle along z, its radius rx along x and ry up: the unit model is stretched unevenly."""
    o = kit.cylinder(1.0, -width / 2, width / 2, (0, 0, 0), "z", m, segments)
    o.data.transform(Matrix.Translation(kit.b((x, y, z))) @ Matrix.Diagonal((rx, 1, ry, 1)))
    return o


def hut(lod, rng):
    """A plank hut: board walls, a tin roof, a door and a shuttered window."""
    out = [box([-0.49, 0, -0.49], [0.49, 0.86, 0.49], plank), box([-0.5, 0.86, -0.5], [0.5, 1, 0.5], tin, 0 if lod else 0.004)]
    if not lod:
        for sx in (-1, 1):
            for sz in (-1, 1):
                out.append(box([min(sx * 0.5, sx * 0.46), 0, min(sz * 0.5, sz * 0.46)], [max(sx * 0.5, sx * 0.46), 0.86, max(sz * 0.5, sz * 0.46)], timber))
        out.append(box([-0.16, 0.15, 0.49], [0.06, 0.7, 0.5], timber))
        out.append(box([0.18, 0.42, 0.49], [0.38, 0.64, 0.5], dark))
        out.append(box([-0.3, 0.42, -0.5], [0.0, 0.64, -0.49], dark))
        out.append(box([-0.5, 0.42, -0.2], [-0.49, 0.64, 0.12], dark))
    return out


PICKUP = (4.4, 1.7, 2.0)  # the wrecks' solids, metres: the pickup is drawn at that size and shrunk into the unit box


def pickup(lod, rng):
    """A burnt-out mine pickup, drawn in metres at the wrecks' size: a closed cab, its glass smoked black, a load
    roped under a tarp in the bed, one tyre burst flat. Its parts meet without overlapping, so the solid fitter's
    columns read it right, and the cab and the load stand to head height: it hides a body as a wreck should."""
    out = [
        # The chassis between the wheels, and the body over them.
        box([-2.0, 0.34, -0.55], [2.05, 0.8, 0.55], dark),
        # The body and the cab in one piece (its windscreen raked back), so the fitter's box for the cab stands on the ground.
        kit.prism([(-2.2, 0.8), (2.2, 0.8), (2.2, 1.0), (0.98, 1.0), (0.98, 1.14), (0.6, 1.7), (-0.45, 1.7), (-0.45, 1.0), (-2.2, 1.0)], -0.95, 0.95, paint),
        # The bonnet, scorched, sloping down to the grille.
        kit.prism([(2.2, 1.0), (0.98, 1.0), (0.98, 1.14), (2.2, 1.08)], -0.9, 0.9, scorch),
        # The bed's sides and tailgate, and the load under its tarp.
        box([-2.2, 1.0, -0.95], [-0.5, 1.42, -0.87], paint),
        box([-2.2, 1.0, 0.87], [-0.5, 1.42, 0.95], paint),
        box([-2.2, 1.0, -0.87], [-2.12, 1.42, 0.87], paint),
        kit.prism([(-2.1, 1.0), (-0.52, 1.0), (-0.52, 1.5), (-0.8, 1.6), (-1.9, 1.58), (-2.1, 1.44)], -0.86, 0.86, olive),
    ]
    for x, z, flat in ((1.45, 0.78, True), (1.45, -0.78, False), (-1.45, 0.78, False), (-1.45, -0.78, False)):
        r = 0.4
        if lod:
            parts = [kit.cylinder(r, z - 0.15, z + 0.15, (x, r, z), "z", tyre, 10)]
        else:
            parts = kit.wheel(x, r, z, r, 0.3, tyre, rust, dark, 16, 0.55, 1 if z > 0 else -1)
        if flat:
            for o in parts:
                o.data.transform(Matrix.Translation(kit.b((x, 0, 0))) @ Matrix.Diagonal((1.0, 1.0, 0.8, 1.0)) @ Matrix.Translation(-kit.b((x, 0, 0))))
        out += parts
    if not lod:
        # Smoked glass: the windscreen, the side windows and the back window, just proud of the cab.
        out.append(kit.prism([(0.99, 1.16), (1.01, 1.16), (0.63, 1.66), (0.61, 1.66)], -0.78, 0.78, glass))
        for s in (-1, 1):
            lo, hi = (0.95, 0.96) if s > 0 else (-0.96, -0.95)
            out.append(kit.prism([(-0.3, 1.18), (0.86, 1.18), (0.56, 1.6), (-0.3, 1.6)], lo, hi, glass))
        out.append(box([-0.46, 1.25, -0.6], [-0.45, 1.6, 0.6], glass))
        # Bumpers, grille, lamps, the ropes over the tarp.
        out.append(box([2.05, 0.5, -0.9], [2.2, 0.72, 0.9], rust))
        out.append(box([-2.2, 0.5, -0.9], [-2.05, 0.72, 0.9], rust))
        out.append(box([2.2 - 0.001, 0.82, -0.6], [2.2, 0.98, 0.6], dark))
        for x in (-1.75, -1.15):
            out.append(box([x, 1.55, -0.86], [x + 0.05, 1.6, 0.86], dark))
    shrink = Matrix.Diagonal((1 / PICKUP[0], 1 / PICKUP[2], 1 / PICKUP[1], 1.0))
    for o in out:
        o.data.transform(shrink)
    return out


def orecar(lod, rng):
    """An ore wagon: a steel tub, its lower sides sloping in to the doors, on two bogies."""
    out = [kit.section([(0.38, -0.47), (0.38, 0.47), (0.97, 0.47), (0.97, -0.47)], -0.5, 0.5, rust)]
    out.append(kit.section([(0.2, -0.36), (0.2, 0.36), (0.38, 0.47), (0.38, -0.47)], -0.47, 0.47, rust))
    out.append(box([-0.48, 0.12, -0.38], [0.48, 0.2, 0.38], dark))
    if not lod:
        for i in range(9):
            x = -0.48 + i * 0.12
            for z in (-0.5, 0.47):
                out.append(box([x, 0.4, z], [x + 0.012, 0.97, z + 0.03], rust))
        out.append(box([-0.47, 0.97, -0.45], [0.47, 1.0, 0.45], ore))
    for x in (-0.36, 0.36):
        out.append(box([x - 0.08, 0.02, -0.38], [x + 0.08, 0.12, 0.38], dark))
        for dx in (-0.045, 0.045):
            for z in (-0.33, 0.33):
                out.append(wheel(x + dx, 0.07, z, 0.03, 0.07, 0.06, dark, 8 if lod else 12))
    return out


def stonewall(lod, rng):
    """A dry-stone wall: courses of rough blocks, each its own size, a capping course on top."""
    out = [box([-0.5, 0, -0.42], [0.5, 0.7, 0.42], stone)]
    if lod:
        out.append(box([-0.5, 0.7, -0.38], [0.5, 1.0, 0.38], stone))
        return out
    x = -0.5
    while x < 0.5:
        w = min(0.5 - x, rng.uniform(0.09, 0.18))
        top = rng.uniform(0.9, 1.0)
        out.append(box([x + 0.003, 0.7, -0.38 - rng.uniform(0, 0.06)], [x + w - 0.003, top, 0.38 + rng.uniform(0, 0.06)], stone, 0.006))
        x += w
    # Faces of the courses below, proud by a little, so the wall's sides aren't flat.
    for y0, y1 in ((0.0, 0.24), (0.24, 0.47), (0.47, 0.7)):
        x = -0.5
        while x < 0.5:
            w = min(0.5 - x, rng.uniform(0.08, 0.16))
            for sz in (-1, 1):
                d = rng.uniform(0.01, 0.06)
                lo, hi = (0.42, 0.42 + d) if sz > 0 else (-0.42 - d, -0.42)
                out.append(box([x + 0.003, y0 + 0.004, lo], [x + w - 0.003, y1 - 0.004, hi], stone))
            x += w
    return out


def crates(lod, rng):
    """A stack: two big crates side by side, a smaller one on top. Every part its own closed shape, none inside
    another, so the solid fitter's columns read the stack right: the bands are strips on the crates' faces."""
    out = []

    def one(x0, z0, x1, z1, y0, y1):
        i = 0.012
        out.append(box([x0 + i, y0, z0 + i], [x1 - i, y1, z1 - i], plank, 0 if lod else 0.004))
        if not lod:
            for y in (y0 + 0.02, y1 - 0.05):
                out.append(box([x0, y, z0 + i], [x0 + i, y + 0.03, z1 - i], timber))
                out.append(box([x1 - i, y, z0 + i], [x1, y + 0.03, z1 - i], timber))
                out.append(box([x0, y, z0], [x1, y + 0.03, z0 + i], timber))
                out.append(box([x0, y, z1 - i], [x1, y + 0.03, z1], timber))

    one(-0.5, -0.5, 0.02, 0.5, 0, 0.58)
    one(0.04, -0.46, 0.5, 0.4, 0, 0.58)
    one(-0.36, -0.34, 0.24, 0.3, 0.58, 1.0)
    return out


def drums(lod, rng):
    """Oil drums: three standing, one lying across the front. Each drum is one closed lathe, its rolling hoops
    in its outline, so nothing overlaps for the solid fitter."""
    out = []
    seg = 10 if lod else 18
    r, h = 0.24, 0.98

    def profile():
        prof = [(0.0, 0.0), (0.0, r - 0.01), (0.012, r)]
        if not lod:
            for y in (0.32, 0.66):
                prof += [(y - 0.015, r), (y - 0.012, r + 0.01), (y + 0.012, r + 0.01), (y + 0.015, r)]
        return prof + [(h - 0.012, r), (h, r - 0.01), (h, 0.0)]

    for (x, z), m in (((-0.24, -0.24), red), ((0.25, -0.22), olive), ((-0.245, 0.245), rust)):
        out.append(kit.lathe(profile(), (x, 0, z), m, seg, "y"))
    out.append(kit.cylinder(0.22, 0.03, 0.49, (0.26, 0.22, 0.26), "z", red, seg))
    return out


rk.unit("dl-hut", hut)
rk.unit("dl-pickup", pickup)
rk.unit("dl-orecar", orecar)
rk.unit("dl-stonewall", stonewall)
rk.unit("dl-crates", crates)
rk.unit("dl-drums", drums)

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
