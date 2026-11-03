"""Ground Zero's kit (ticket 17): the crater's reactor, bunkers, cooling pipes and ruins, the factory and rail hub on
its rim, and the models the cover pass's pieces there wear. Builds apps/range/public/models/ground-zero.glb:

    blender -b --factory-startup --python tools/map/build.py -- tools/map/regions/ground_zero.py --export --preview DIR

The pieces' boxes come from tools/map/regions/ground-zero.json, which the test writes from the plan
(apps/range/src/map/zero-island-ground-zero-plan.ts; `UPDATE_KIT=1`). See tools/map/regionkit.py for the pattern.
Permanent dusk over a blast site: scorched concrete, rusted steel, soot-dark brick, the core's blue the only bright
thing.
"""
import math
import os
import sys

import bmesh
import bpy
from mathutils import Matrix

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(HERE))
import regionkit  # noqa: E402

OUT = os.path.join(HERE, "..", "..", "..", "apps", "range", "public", "models", "ground-zero.glb")
rk = regionkit.RegionKit(bkit, "ground-zero", os.path.join(HERE, "ground-zero.json"))  # noqa: F821
kit = rk.kit

# Finishes: colour (sRGB) and the photo layer it wears.
wall = rk.mat("gz.concrete", (156, 150, 140), "wall")
slab = rk.mat("gz.slab", (122, 116, 107), "slab")
scorch = rk.mat("gz.scorched", (92, 88, 84), "slab")
brick = rk.mat("gz.brick", (128, 76, 60), "wall")
hall = rk.mat("gz.hall", (138, 130, 118), "wall")
rust = rk.mat("gz.rust", (130, 96, 72), "steel", 0.7, 0.3)
# Only rust wears the rusted steel photo: its colour swings too far for paint. Paint, wood and soot wear grime.
paint = rk.mat("gz.paint", (86, 98, 94), "wall", 0.6, 0.2)
pale = rk.mat("gz.pipe", (164, 160, 148), "wall", 0.6, 0.2)
burnt = rk.mat("gz.burnt", (56, 48, 42), "slab", 0.8, 0.2)
wood = rk.mat("gz.wood", (120, 90, 62), "wall", 0.9)
glass = rk.mat("gz.glass", (24, 28, 32), None, 0.2)
yellow = rk.mat("gz.stripe", (190, 154, 46), None, 0.7)
rebar = rk.mat("gz.rebar", (84, 58, 44), None, 0.8, 0.4)
dark = rk.mat("gz.dark", (34, 32, 30), None, 0.9)
# The core: a cold blue, three times as bright as it is lit.
core = rk.mat("gz.core", (80, 170, 255), None, 0.3, glow=(0.3, 0.75, 1.0))
core.node_tree.nodes["Principled BSDF"].inputs["Emission Strength"].default_value = 3.0

box = rk.box


# ------------------------------------------------------------------ the reactor

def plinth(r, y0, y1, lod, rng):
    return [rk.octagon(r, y0, y1, scorch, 0 if lod else 0.06)]


def vessel(r, y0, y1, lod, rng):
    """The vessel: the core's glow behind concrete faces, a slot up the middle of each, steel bands round it."""
    out = [rk.octagon(r - 0.3, y0, y1, core)]
    slot = (-0.07, 0.07)
    lo, hi = y0 + 1.4, y1 - 1.4
    out += rk.faces(r, y0, y1, 0.3, wall, cuts=(slot,))
    # Across the slot, below and above it.
    w = 2 * r * math.tan(math.pi / 8)
    for k in range(8):
        for a, b in ((y0, lo), (hi, y1)):
            o = box([r - 0.3, a, slot[0] * w], [r, b, slot[1] * w], wall)
            o.data.transform(Matrix.Rotation(k * regionkit.EIGHTH, 4, "Z"))
            out.append(o)
    if not lod:
        for y in (y0 + 2.6, (y0 + y1) / 2, y1 - 2.6):
            out.append(rk.octagon(r + 0.04, y - 0.18, y + 0.18, rust))
    return out


def cap(r, y0, y1, lod, rng):
    out = [rk.octagon(r, y0, y1 - 0.4, rust, 0 if lod else 0.05), rk.octagon(r * 0.7, y1 - 0.4, y1, paint, 0 if lod else 0.04)]
    if not lod:
        # Bolts round the cap's lid.
        for k in range(16):
            a = k * math.pi / 8 + math.pi / 16
            o = kit.cylinder(0.09, y1 - 0.4, y1 - 0.3, (r * 0.82 * math.cos(a), 0, r * 0.82 * math.sin(a)), "y", dark, 8)
            out.append(o)
    return out


rk.dress("plinth", plinth)
rk.dress("vessel", vessel)
rk.dress("cap", cap)

# ------------------------------------------------------------------ bunkers, ruins, crates


def crate(s, lod, rng):
    hx, hy, hz = s[0] / 2, s[1] / 2, s[2] / 2
    out = [box([-hx + 0.03, -hy, -hz + 0.03], [hx - 0.03, hy - 0.03, hz - 0.03], wood, 0 if lod else 0.02)]
    if not lod:
        # Battens round its edges, proud of the boards.
        for y in (-hy + 0.04, hy - 0.08):
            out.append(box([-hx, y, -hz], [hx, y + 0.08, hz], wood, 0.01))
        for sx in (-1, 1):
            for sz in (-1, 1):
                out.append(box([sx * hx - (0.08 if sx > 0 else 0), -hy, sz * hz - (0.08 if sz > 0 else 0)], [sx * hx + (0 if sx > 0 else 0.08), hy, sz * hz + (0 if sz > 0 else 0.08)], wood, 0.01))
    return out


rk.dress("bunker-wall", lambda s, lod, rng: rk.panels(s, wall, 2.5, 0.05, lod))
rk.dress("bunker-roof", lambda s, lod, rng: rk.panels(s, scorch, 3.5, 0.08, lod))
rk.dress("crate", crate)
rk.dress("ruin-wall", lambda s, lod, rng: rk.broken(s, wall, rng, lod, rebar))
rk.dress("rubble", lambda s, lod, rng: rk.rubble(s, slab, rng, lod))
rk.dress("pipe", lambda s, lod, rng: rk.pipe(s, pale, slab, lod))

# ------------------------------------------------------------------ the factory


def hall_wall(s, lod, rng):
    if s[1] > 6:
        # A band of windows high up: 5.2 to 7.2 m over the floor, the box's foot 0.6 m under it.
        return rk.windows(s, hall, glass, rust, 5.8 - s[1] / 2, 7.8 - s[1] / 2, 3.2, 0.8, lod)
    return rk.panels(s, hall, 3.2, 0.04, lod)


def machine(s, lod, rng):
    hx, hy, hz = s[0] / 2, s[1] / 2, s[2] / 2
    out = [box([-hx, -hy, -hz], [hx, -hy + 0.25, hz], dark), box([-hx + 0.15, -hy + 0.25, -hz + 0.15], [hx - 0.15, hy - 0.35, hz - 0.15], paint, 0 if lod else 0.05)]
    out.append(box([-hx * 0.5, hy - 0.35, -hz * 0.6], [hx * 0.4, hy, hz * 0.6], paint, 0 if lod else 0.04))
    if not lod:
        r = min(hz - 0.15, hy) * 0.45
        out.append(kit.cylinder(r, hx * 0.45, hx, (0, -hy + 0.25 + r + 0.05, hz - 0.15 - r), "x", rust, 14))
        out.append(box([hx * 0.5, hy - 0.5, -hz + 0.2], [hx - 0.2, hy - 0.35, -hz + 0.6], dark))
    return out


def chimney(s, lod, rng):
    hy = s[1] / 2
    r = s[0] / 2
    profile = [(-hy, r), (-hy + 1.6, r), (-hy + 2.0, r * 0.9), (hy - 0.8, r * 0.72), (hy - 0.8, r * 0.82), (hy, r * 0.82)]
    out = [kit.lathe(profile, (0, 0, 0), brick, 10 if lod else 20)]
    if not lod:
        for t in (0.3, 0.55, 0.8):
            y = -hy + 2 + t * (s[1] - 2.8)
            rad = r * (0.9 - 0.18 * t) + 0.04
            out.append(kit.lathe([(y - 0.15, rad), (y + 0.15, rad)], (0, 0, 0), rust, 20))
    return out


rk.dress("hall-wall", hall_wall)
rk.dress("hall-roof", lambda s, lod, rng: rk.corrugated(s, rust, 0.6, lod))
rk.dress("machine", machine)
rk.dress("chimney", chimney)

# ------------------------------------------------------------------ the rail hub


def platform(s, lod, rng):
    hx, hy, hz = s[0] / 2, s[1] / 2, s[2] / 2
    out = rk.panels(s, slab, 4.0, 0.03, lod)
    if not lod and s[0] > 6:
        # The yellow line along the track's edge.
        out.append(box([-hx + 0.3, hy - 0.01, hz - 0.65], [hx - 0.3, hy + 0.01, hz - 0.5], yellow))
    return out


def post(s, lod, rng):
    hx, hy, hz = s[0] / 2, s[1] / 2, s[2] / 2
    if lod:
        return [box([-hx, -hy, -hz], [hx, hy, hz], rust)]
    t = 0.035
    return [box([-hx, -hy, -hz], [hx, hy, -hz + t], rust), box([-hx, -hy, hz - t], [hx, hy, hz], rust), box([-t / 2, -hy, -hz], [t / 2, hy, hz], rust)]


def canopy(s, lod, rng):
    hx, hy, hz = s[0] / 2, s[1] / 2, s[2] / 2
    out = rk.corrugated(s, rust, 0.4, lod, along=2)
    if not lod:
        out.append(box([-hx, -hy, hz - 0.08], [hx, hy, hz], paint))
    return out


def bench(s, lod, rng):
    hx, hy, hz = s[0] / 2, s[1] / 2, s[2] / 2
    out = []
    for i in range(1 if lod else 3):
        z0 = -hz + i * s[2] / 3
        out.append(box([-hx, hy - 0.06, z0 + 0.02], [hx, hy, z0 + s[2] / 3 - 0.02], wood, 0 if lod else 0.01))
    for x in (-hx + 0.15, hx - 0.25):
        out.append(box([x, -hy, -hz + 0.05], [x + 0.1, hy - 0.06, hz - 0.05], dark))
    return out


rk.dress("platform", platform)
rk.dress("post", post)
rk.dress("canopy", canopy)
rk.dress("bench", bench)
rk.dress("box-wall", lambda s, lod, rng: rk.panels(s, brick, 2.5, 0.03, lod))
rk.dress("box-roof", lambda s, lod, rng: rk.panels(s, scorch, 4.5, 0.05, lod))

# ------------------------------------------------------------------ the kit for the cover pass's pieces (unit boxes)


def wheel(x, y, z, rx, ry, width, m, segments=12):
    """A wheel on an axle along z, its radius rx along x and ry up: the unit model is stretched unevenly."""
    o = kit.cylinder(1.0, -width / 2, width / 2, (0, 0, 0), "z", m, segments)
    o.data.transform(Matrix.Translation(kit.b((x, y, z))) @ Matrix.Diagonal((rx, 1, ry, 1)))
    return o


def blastwall(lod, rng):
    """T-walls: a broad foot and a tapering stem, in six precast sections."""
    out = []
    n = 2 if lod else 6
    for i in range(n):
        x0, x1 = -0.5 + i / n + 0.004, -0.5 + (i + 1) / n - 0.004
        profile = [(0.0, -0.5), (0.0, 0.5), (0.32, 0.5), (0.36, 0.2), (1.0, 0.13), (1.0, -0.13), (0.36, -0.2), (0.32, -0.5)]
        out.append(kit.section(profile, x0, x1, wall, 0 if lod else 0.006))
    return out


def shed(lod, rng):
    """A concrete blockhouse: corner posts, a roof slab, a steel door and a shuttered window on its faces."""
    out = [box([-0.49, 0, -0.49], [0.49, 0.86, 0.49], wall), box([-0.5, 0.86, -0.5], [0.5, 1, 0.5], scorch, 0 if lod else 0.01)]
    if not lod:
        for sx in (-1, 1):
            for sz in (-1, 1):
                out.append(box([min(sx * 0.5, sx * 0.44), 0, min(sz * 0.5, sz * 0.44)], [max(sx * 0.5, sx * 0.44), 0.86, max(sz * 0.5, sz * 0.44)], wall))
        out.append(box([-0.16, 0.15, 0.49], [0.06, 0.66, 0.5], rust))
        out.append(box([0.18, 0.4, 0.49], [0.38, 0.62, 0.5], dark))
        out.append(box([-0.3, 0.4, -0.5], [0.1, 0.62, -0.49], dark))
    return out


def chunk(lod, rng):
    """A slab torn off a building: corners broken off, every one its own way."""
    corners = [(-0.5, -0.5), (0.5, -0.5), (0.5, 0.5), (-0.5, 0.5)]
    outline = []
    for i, (cx, cz) in enumerate(corners):
        (px, pz), (nx, nz) = corners[i - 1], corners[(i + 1) % 4]
        a, b = rng.uniform(0.04, 0.22), rng.uniform(0.04, 0.22)
        # Round the square, each corner cut off along its two sides.
        outline += [(cx + (px - cx) * a, cz + (pz - cz) * a), (cx + (nx - cx) * b, cz + (nz - cz) * b)]
    out = [kit.plan(outline, 0, 0.82, slab, 0 if lod else 0.02)]
    top = [(x * 0.9, z * 0.9) for x, z in outline]
    out.append(kit.plan(top, 0.82, 1.0, slab, 0 if lod else 0.02))
    return out


def footing(lod, rng):
    out = [box([-0.5, 0, -0.5], [0.5, 0.7, 0.5], slab, 0 if lod else 0.01)]
    out.append(kit.plan([(-0.42, -0.42), (0.42, -0.42), (0.42, 0.42), (-0.42, 0.42)], 0.7, 1.0, slab))
    if not lod:
        for sx in (-1, 1):
            for sz in (-1, 1):
                out.append(kit.cylinder(0.025, 0.95, 1.0, (sx * 0.3, 0, sz * 0.3), "y", dark, 6))
    return out


def mast(lod, rng):
    """A concrete pole, tapering, with its cross-arm and insulators at the top."""
    out = [kit.lathe([(0, 0.42), (0.93, 0.24)], (0, 0, 0), wall, 4 if lod else 8, smooth=False)]
    out[0].data.transform(Matrix.Rotation(math.pi / 8 if not lod else math.pi / 4, 4, "Z"))
    out.append(box([-0.5, 0.93, -0.12], [0.5, 0.96, 0.12], rust))
    if not lod:
        for x in (-0.4, 0, 0.4):
            out.append(kit.cylinder(0.06, 0.96, 1.0, (x, 0, 0), "y", glass, 8))
    return out


def wreck(lod, rng):
    """A burnt-out car: its body and cabin as one side profile, its wheels sagged, its windows gone."""
    out = [kit.prism([(-0.5, 0.16), (0.5, 0.16), (0.5, 0.42), (0.44, 0.5), (-0.5, 0.52)], -0.46, 0.46, burnt, 0 if lod else 0.01)]
    out.append(kit.prism([(-0.44, 0.5), (0.24, 0.5), (0.08, 0.93), (-0.3, 0.95), (-0.42, 0.56)], -0.42, 0.42, burnt))
    if not lod:
        # Empty window holes, dark, on either side.
        for z in (-0.43, 0.43):
            out.append(kit.prism([(-0.36, 0.6), (0.14, 0.6), (0.05, 0.88), (-0.27, 0.89)], z - 0.012, z + 0.012, dark))
    for x in (-0.32, 0.32):
        for z in (-0.4, 0.4):
            out.append(wheel(x, 0.18, z, 0.075, 0.18, 0.12, dark, 8 if lod else 14))
    return out


def wagon(lod, rng):
    """A rusted boxcar: ribbed sides, a sliding door, its underframe on two bogies."""
    out = [box([-0.5, 0.22, -0.47], [0.5, 0.97, 0.47], rust), box([-0.49, 0.97, -0.45], [0.49, 1.0, 0.45], rust)]
    out.append(box([-0.48, 0.12, -0.4], [0.48, 0.22, 0.4], dark))
    if not lod:
        for i in range(13):
            x = -0.48 + i * 0.08
            for z in (-0.5, 0.47):
                out.append(box([x, 0.23, z], [x + 0.008, 0.96, z + 0.03], rust))
        for z in (-0.5, 0.47):
            out.append(box([-0.1, 0.25, z], [0.1, 0.92, z + 0.03], paint))
    for x in (-0.36, 0.36):
        out.append(box([x - 0.08, 0.02, -0.38], [x + 0.08, 0.12, 0.38], dark))
        for dx in (-0.045, 0.045):
            for z in (-0.33, 0.33):
                out.append(wheel(x + dx, 0.07, z, 0.03, 0.07, 0.06, dark, 8 if lod else 12))
    return out


rk.unit("gz-blastwall", blastwall)
rk.unit("gz-shed", shed)
rk.unit("gz-slab", chunk)
rk.unit("gz-footing", footing)
rk.unit("gz-mast", mast)
rk.unit("gz-wreck", wreck)
rk.unit("gz-wagon", wagon)

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
