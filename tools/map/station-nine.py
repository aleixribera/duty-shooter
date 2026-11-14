"""Build Station Nine's models: the camera towers and their ladders, the
camera housings and siren posts on the decks, the bunker's recorder racks and
console, the cable reels, instrument piers, sandbag walls, crates, drums,
blast shields, range containers, the generator sets, the fuel tanks, the
instrument trailers and huts, and the caged work lamps; and, beyond the
barrier, the shot tower, the cable line's poles and the other stations'
bunkers, which are only looked at.

Run in its own Blender (see tools/map/build.py):
    blender -b --factory-startup --python tools/map/build.py -- tools/map/station-nine.py [--export] [--preview DIR]

Each asset is one object, named as apps/range/src/map/station-nine.ts places
it, with its origin where the placement's position goes (on the ground, or the
deck or roof it stands on, under its middle), its length along game +x and
game z across it. The model draws the collision solids the map ties it to, so
it stays within 5 cm of them (`SOLIDS`, in the map's numbers); the scenery
beyond the barrier has no solids and is not checked.

Materials are named after the station's finishes (FINISHES in station-nine.ts),
which the client looks up to colour them.
"""
import importlib
import math
import os
import sys

import bmesh
from mathutils import Vector, noise

sys.path.insert(0, os.path.dirname(__file__))
import mapkit  # noqa: E402

importlib.reload(mapkit)

EXPORT = ARGS.get("export", False)  # noqa: F821 (ARGS comes from bkit.run)
OUT = os.path.join(os.path.dirname(__file__), "..", "..", "apps", "range", "public", "models", "station-nine.glb")
kit = mapkit.Kit(bkit, "station-nine")  # noqa: F821


def M(name, rgb, roughness=0.6, metallic=0.0, emission=None):
    return mapkit.material(bkit, name, ((rgb >> 16) & 255, (rgb >> 8) & 255, rgb & 255), roughness, metallic, emission)  # noqa: F821


# Finishes, coloured as the map's (Workbench previews show these).
TOWER = M("tower", 0xC4522F, 0.55, 0.2)
DECK = M("tower.deck", 0x6E6A65, 0.6, 0.4)
HAZARD = M("hazard", 0xDFAE2E, 0.5)
STEEL = M("steel", 0x3E4143, 0.55, 0.4)
LADDER = M("ladder", 0xCFCABD, 0.5, 0.2)
CAMERA = M("camera", 0xDCD6C6, 0.45, 0.2)
LENS = M("lens", 0x1A2630, 0.1)
SIREN = M("siren", 0xB9B4A6, 0.4, 0.4)
REEL = M("reel", 0x8F6C45, 0.85)
CABLE = M("cable", 0x26282A, 0.7)
PIER = M("pier", 0xA39B8D, 0.9)
SAND = M("sandbag", 0xB9A37F, 0.95)
RACK = M("rack", 0x5D6A5E, 0.5, 0.2)
CONSOLE = M("console", 0x8C9187, 0.5, 0.2)
TRIM = M("trim", 0xE4DCCB, 0.6)
CRATE = M("crate", 0xA7865A, 0.8)
CRATE_FRAME = M("crate.frame", 0x7A5F3E, 0.8)
SHIELD = M("shield", 0x67635D, 0.5, 0.5)
DRUM = M("drum", 0x2F5A7A, 0.45, 0.3)
DRUM_RED = M("drum.red", 0x9A3A2A, 0.45, 0.3)
PAINTS = {p: M(f"container.{p}", rgb, 0.55, 0.3) for p, rgb in (("olive", 0x5D6642), ("white", 0xD4D0C4), ("orange", 0xB8622C))}
GENERATOR = M("generator", 0x4F6B4C, 0.5, 0.2)
TANK = M("tank", 0xE3DDCE, 0.4, 0.2)
TRAILER = M("trailer", 0xD9D3C4, 0.5, 0.2)
STRIPE = M("trailer.stripe", 0xC4522F, 0.5)
TYRE = M("tyre", 0x1E1F21, 0.9)
WINDOW = M("window", 0x1F2D36, 0.1)
HUT = M("hut", 0xB4AB9B, 0.9)
CAGE = M("lamp.cage", 0x3B3F3A, 0.5, 0.3)
GLOW = M("lamp.glow", 0xFFD9A0, 0.3, 0.0, emission=(1.0, 0.8, 0.5))
HOUSE = M("house", 0xD8D2C3, 0.5, 0.3)
ROOF = M("roof.flat", 0x5B5650, 0.9)
PAD = M("pad", 0xBDB5A6, 0.9)
BUNKER = M("bunker", 0xAEA697, 0.9)
LAND = M("land", 0xC0A47C, 0.95)
POLE = M("pole", 0x6A5440, 0.9)
INSULATOR = M("insulator", 0x5F8A7F, 0.2)

# The map's numbers (apps/range/src/map/station-nine.ts).
DECK_Y = 5.0  # TOWER.deck
TOWER_HALF = 2.0  # the tower is 4 m square
LEG = 0.3
BEAM = (2.4, 2.55)
RAIL_H = 1.0
LADDER_GAP = 0.55  # the gap in the outer rail, either side of the ladder
TANK_AXIS, TANK_R = 1.75, 1.3
TANK_STEPS = ((0.5, 1.3), (0.85, 1.2), (1.1, 0.99))
CRATES = [(1.2, 1.2, 1.35), (1.2, 1.2, 1.1), (1.2, 1.2, 1.0), (1.2, 1.2, 1.4), (1.2, 1.2, 1.2), (2.4, 3.8, 2.2), (2.4, 3.6, 2.2), (2.4, 3.2, 2.2)]
SANDBAGS = [(3.0, 0.9, 0.5), (2.4, 0.9, 0.5), (3.0, 0.7, 0.45)]
LADDERS = (6.05, 4.25)
SHOT_TOWER_H = 100.0


def fmt(v):
    """A size in an asset's name, in whole centimetres (three.js turns dots in node names into underscores)."""
    return str(round(v * 100))


def crate_name(w, d, h):
    return f"crate-{fmt(w)}x{fmt(d)}x{fmt(h)}"


# ---------------------------------------------------------------- helpers

def squash(o, centre, sx=1.0, sy=1.0, sz=1.0):
    """Scales a part's mesh about game point `centre` by (sx, sy, sz) along game x, y and z."""
    c = kit.b(centre)
    for v in o.data.vertices:
        d = v.co - c
        v.co = c + Vector((d.x * sx, d.y * sz, d.z * sy))
    return o


def beam(p0, p1, w, mat, d=None):
    """A square-section member `w` wide (and `d` deep) from game point p0 to p1, at any angle."""
    a, c = kit.b(p0), kit.b(p1)
    v = c - a
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    bmesh.ops.scale(bm, vec=(v.length, w, d or w), verts=bm.verts)
    rot = Vector((1, 0, 0)).rotation_difference(v.normalized()).to_matrix().to_4x4()
    bmesh.ops.transform(bm, matrix=rot, verts=bm.verts)
    bmesh.ops.translate(bm, vec=(a + c) / 2, verts=bm.verts)
    return kit.obj("beam", bm, mat)


def frustum(lo, hi, y0, y1, mat, bevel=0.0):
    """A block whose footprint narrows from rect `lo` (x0, x1, z0, z1) at y0 to rect `hi` at y1: a berm, a tapered base."""
    bm = bmesh.new()
    ring = lambda r, y: [bm.verts.new(kit.b(p)) for p in ((r[0], y, r[2]), (r[1], y, r[2]), (r[1], y, r[3]), (r[0], y, r[3]))]
    a, c = ring(lo, y0), ring(hi, y1)
    bm.faces.new(list(reversed(a)))
    bm.faces.new(c)
    for k in range(4):
        bm.faces.new((a[k], a[(k + 1) % 4], c[(k + 1) % 4], c[k]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return kit.obj("frustum", bm, mat, bevel)


def ring(x, y, z, r, t, axis, mat, segments=16):
    """A thin band (a hoop, a weld seam) of radius r and width t round game axis `axis` through (x, y, z)."""
    return kit.lathe([(-t / 2, r - 0.01), (-t / 2, r), (t / 2, r), (t / 2, r - 0.01)], (x, y, z), mat, segments, axis, caps=False)


# ---------------------------------------------------------------- the camera towers

def camera_tower():
    """A 4 m steel camera tower: four box-section legs on footings, a ring beam halfway, a grated deck at 5 m, and a
    sheet-steel parapet a metre high, open at +x where the ladder comes up."""
    h, i = TOWER_HALF, TOWER_HALF - LEG
    parts = []
    for sx in (-1, 1):
        for sz in (-1, 1):
            x0, x1 = sorted((sx * i, sx * h))
            z0, z1 = sorted((sz * i, sz * h))
            parts.append(kit.box((x0, 0.12, z0), (x1, DECK_Y - 0.2, z1), TOWER, 0.012, 1))
            parts.append(kit.box((x0 - 0.03, 0, z0 - 0.03), (x1 + 0.03, 0.12, z1 + 0.03), PIER, 0.01, 1))
            parts.append(kit.box((x0 - 0.02, 0.12, z0 - 0.02), (x1 + 0.02, 0.15, z1 + 0.02), STEEL))
            # Bolted splice plates where the legs meet the ring beam.
            parts.append(kit.box((x0 - 0.01, BEAM[0] - 0.2, z0 - 0.01), (x1 + 0.01, BEAM[1] + 0.2, z1 + 0.01), TOWER))
    for s in (-1, 1):
        z0, z1 = sorted((s * i, s * h))
        parts.append(kit.box((-i, BEAM[0], z0 + 0.03), (i, BEAM[1], z1 - 0.03), TOWER, 0.01, 1))
        parts.append(kit.box((-i, BEAM[0], z0), (i, BEAM[0] + 0.02, z1), TOWER))
        parts.append(kit.box((-i, BEAM[1] - 0.02, z0), (i, BEAM[1], z1), TOWER))
        x0, x1 = sorted((s * i, s * h))
        parts.append(kit.box((x0 + 0.03, BEAM[0], -i), (x1 - 0.03, BEAM[1], i), TOWER, 0.01, 1))
        parts.append(kit.box((x0, BEAM[0], -i), (x1, BEAM[0] + 0.02, i), TOWER))
        parts.append(kit.box((x0, BEAM[1] - 0.02, -i), (x1, BEAM[1], i), TOWER))
    # The deck: an edge channel, joists under it and a grating on them.
    y0 = DECK_Y - 0.2
    for s in (-1, 1):
        z0, z1 = sorted((s * h, s * (h - 0.12)))
        parts.append(kit.box((-h, y0, z0), (h, DECK_Y - 0.03, z1), TOWER, 0.01, 1))
        x0, x1 = sorted((s * h, s * (h - 0.12)))
        parts.append(kit.box((x0, y0, -h + 0.12), (x1, DECK_Y - 0.03, h - 0.12), TOWER, 0.01, 1))
    for k in range(5):
        x = -1.4 + k * 0.7
        parts.append(kit.box((x - 0.05, y0 + 0.04, -h + 0.12), (x + 0.05, DECK_Y - 0.03, h - 0.12), STEEL))
    parts.append(kit.box((-h + 0.02, DECK_Y - 0.03, -h + 0.02), (h - 0.02, DECK_Y, h - 0.02), DECK))
    for k in range(13):
        z = -h + 0.15 + k * 0.3
        parts.append(kit.box((-h + 0.1, DECK_Y - 0.035, z - 0.012), (h - 0.1, DECK_Y - 0.005, z + 0.012), STEEL))
    # The parapet: sheet panels on the outer faces, a toe board striped yellow, a tube cap and posts.
    top = DECK_Y + RAIL_H

    def panel(x0, x1, z0, z1):
        parts.append(kit.box((x0, DECK_Y, z0), (x1, top - 0.04, z1), DECK, 0.004, 1))
        if x1 - x0 > z1 - z0:
            zc = (z0 + z1) / 2
            parts.append(kit.cylinder(0.03, x0, x1, (0, top - 0.03, zc), "x", TOWER, 10))
        else:
            xc = (x0 + x1) / 2
            parts.append(kit.cylinder(0.03, z0, z1, (xc, top - 0.03, 0), "z", TOWER, 10))

    for s in (-1, 1):
        z0, z1 = sorted((s * h, s * (h - 0.04)))
        panel(-h, h, z0, z1)
        parts.append(kit.box((-h + 0.055, DECK_Y, s * (h + 0.003)), (h - 0.055, DECK_Y + 0.12, s * (h - 0.055)), HAZARD))
    panel(-h, -h + 0.04, -h + 0.04, h - 0.04)
    parts.append(kit.box((-h - 0.003, DECK_Y, -h + 0.055), (-h + 0.055, DECK_Y + 0.12, h - 0.055), HAZARD))
    for s in (-1, 1):
        z0, z1 = sorted((s * LADDER_GAP, s * (h - 0.04)))
        panel(h - 0.04, h, z0, z1)
        parts.append(kit.box((h - 0.055, DECK_Y, z0), (h + 0.003, DECK_Y + 0.12, z1), HAZARD))
        # Posts at the ladder gap.
        pz0, pz1 = sorted((s * LADDER_GAP, s * (LADDER_GAP + 0.06)))
        parts.append(kit.box((h - 0.05, DECK_Y, pz0), (h, top, pz1), TOWER, 0.006, 1))
    for sx in (-1, 1):
        for sz in (-1, 1):
            x0, x1 = sorted((sx * h, sx * (h - 0.06)))
            z0, z1 = sorted((sz * h, sz * (h - 0.06)))
            parts.append(kit.box((x0, DECK_Y, z0), (x1, top, z1), TOWER, 0.006, 1))
    return kit.asset("camera-tower", parts, smooth_angle=40)


def camera_housing():
    """A high-speed camera on a pan-tilt pedestal, its lens toward +x: a box body with a film magazine on top."""
    parts = [kit.box((-0.3, 0, -0.3), (0.3, 0.04, 0.3), STEEL, 0.008, 1)]
    for a in range(3):
        ang = a * 2 * math.pi / 3
        parts.append(kit.box((math.cos(ang) * 0.24 - 0.04, 0.0, math.sin(ang) * 0.24 - 0.04), (math.cos(ang) * 0.24 + 0.04, 0.06, math.sin(ang) * 0.24 + 0.04), STEEL))
    parts.append(kit.cylinder(0.07, 0.04, 0.55, (0, 0, 0), "y", STEEL, 14))
    parts.append(kit.cylinder(0.1, 0.5, 0.56, (0, 0, 0), "y", STEEL, 16))
    parts.append(kit.box((-0.14, 0.56, -0.16), (0.14, 0.64, 0.16), STEEL, 0.01, 1))
    parts.append(kit.box((-0.1, 0.62, -0.2), (0.1, 0.72, -0.17), STEEL))
    parts.append(kit.box((-0.1, 0.62, 0.17), (0.1, 0.72, 0.2), STEEL))
    # The body, its lens barrel and hood, and the round film magazine.
    parts.append(kit.box((-0.46, 0.64, -0.17), (0.28, 0.98, 0.17), CAMERA, 0.025, 2))
    parts.append(kit.box((-0.48, 0.7, -0.12), (-0.46, 0.92, 0.12), STEEL))
    parts.append(kit.cylinder(0.11, 0.28, 0.44, (0, 0.81, 0), "x", STEEL, 20))
    parts.append(kit.lathe([(0.42, 0.0), (0.42, 0.13), (0.54, 0.15), (0.54, 0.135), (0.45, 0.115), (0.45, 0.0)], (0, 0.81, 0), CAMERA, 20, "x"))
    parts.append(kit.cylinder(0.09, 0.44, 0.46, (0, 0.81, 0), "x", LENS, 20))
    parts.append(kit.cylinder(0.13, -0.11, 0.11, (-0.2, 1.0 - 0.0, 0), "z", CAMERA, 22))
    parts.append(kit.cylinder(0.05, -0.12, 0.12, (-0.2, 1.0, 0), "z", STEEL, 12))
    parts.append(kit.box((-0.06, 0.98, -0.05), (0.18, 1.04, 0.05), STEEL))
    # A cable off the back, down the pedestal.
    parts.append(kit.cylinder(0.018, -0.52, -0.46, (0, 0.75, 0.08), "x", CABLE, 8))
    parts.append(kit.cylinder(0.018, 0.05, 0.75, (-0.52, 0, 0.08), "y", CABLE, 8))
    return kit.asset("camera-housing", parts, smooth_angle=45)


def siren_post():
    """A motor siren on an H-section post: a junction box on the web, the motor, the slotted rotor drum and a domed cap."""
    parts = [kit.box((-0.09, 0, -0.16), (0.09, 0.02, 0.16), STEEL)]
    for s in (-1, 1):
        z0, z1 = sorted((s * 0.12, s * 0.14))
        parts.append(kit.box((-0.06, 0.02, z0), (0.06, 1.5, z1), SIREN, 0.004, 1))
    parts.append(kit.box((-0.01, 0.02, -0.12), (0.01, 1.5, 0.12), SIREN))
    parts.append(kit.box((0.01, 0.9, -0.09), (0.06, 1.2, 0.09), STEEL, 0.006, 1))
    parts.append(kit.cylinder(0.012, 0.0, 0.9, (0.04, 0, 0.0), "y", CABLE, 8))
    parts.append(kit.box((-0.18, 1.5, -0.18), (0.18, 1.52, 0.18), STEEL))
    parts.append(kit.lathe([(1.52, 0.0), (1.52, 0.1), (1.55, 0.12), (1.7, 0.12), (1.72, 0.1), (1.72, 0.0)], (0, 0, 0), SIREN, 20, "y"))
    parts.append(kit.cylinder(0.18, 1.72, 1.86, (0, 0, 0), "y", SIREN, 24))
    # The rotor's ports: dark slots round the drum.
    for k in range(8):
        a = k * math.pi / 4
        c, s = math.cos(a), math.sin(a)
        parts.append(beam((c * 0.168, 1.79, s * 0.168), (c * 0.183, 1.79, s * 0.183), 0.07, STEEL, 0.1))
    parts.append(kit.lathe([(1.86, 0.0), (1.86, 0.19), (1.88, 0.19), (1.92, 0.14), (1.95, 0.05), (1.95, 0.0)], (0, 0, 0), SIREN, 24, "y"))
    return kit.asset("siren-post", parts, smooth_angle=45)


def ladder(top):
    """A steel ladder `top` high: flat-bar rails at ±0.45 and round rungs every 0.3 m from 0.3 m up, a foot under each rail."""
    parts = []
    for s in (-1, 1):
        z0, z1 = sorted((s * 0.415, s * 0.485))
        parts.append(kit.box((-0.03, 0, z0), (0.03, top - 0.03, z1), LADDER, 0.006, 1))
        parts.append(kit.cylinder(0.035, -0.03, 0.03, (0, top - 0.035, s * 0.45), "x", LADDER, 12))
        parts.append(kit.box((-0.04, 0, s * 0.45 - 0.05), (0.04, 0.02, s * 0.45 + 0.05), STEEL))
    y = 0.3
    while y < top - 0.2:
        parts.append(kit.cylinder(0.02, -0.415, 0.415, (0, y + 0.025, 0), "z", LADDER, 8))
        y += 0.3
    return kit.asset(f"ladder-{fmt(top)}", parts, smooth_angle=45)


# ---------------------------------------------------------------- props

def cable_reel():
    """A wooden cable drum on its side, axle along x: two plank flanges, black cable wound on the barrel, a steel hub."""
    r, w = 0.8, 0.5
    parts = []
    for s in (-1, 1):
        x0, x1 = sorted((s * w, s * (w - 0.06)))
        parts.append(kit.lathe([(x0, 0.0), (x0, r - 0.02), (x0 + 0.01, r), (x1 - 0.01, r), (x1, r - 0.02), (x1, 0.0)], (0, r, 0), REEL, 28, "x"))
        # Plank joints and bolts on the outer face.
        xo = s * (w + 0.004)
        for k in (-1, 1):
            parts.append(kit.box((min(xo, s * w), r - 0.76, k * 0.25 - 0.004), (max(xo, s * w), r + 0.76, k * 0.25 + 0.004), CRATE_FRAME))
        for k in range(8):
            a = k * math.pi / 4
            parts.append(kit.cylinder(0.022, min(s * w, xo + s * 0.01), max(s * w, xo + s * 0.01), (0, r + math.sin(a) * 0.32, math.cos(a) * 0.32), "x", STEEL, 6))
    # The cable: a fat wound barrel with a slight ripple of turns, its loose end trailing to the ground.
    prof = [(-w + 0.06, 0.0), (-w + 0.06, 0.6)]
    n = 12
    for k in range(n + 1):
        x = -w + 0.08 + k * (2 * (w - 0.08)) / n
        prof.append((x, 0.6 + (0.012 if k % 2 else 0.0)))
    prof += [(w - 0.06, 0.6), (w - 0.06, 0.0)]
    parts.append(kit.lathe(prof, (0, r, 0), CABLE, 28, "x"))
    parts.append(kit.cylinder(0.12, -w - 0.03, w + 0.03, (0, r, 0), "x", STEEL, 16))
    parts.append(kit.cylinder(0.06, -w - 0.035, w + 0.035, (0, r, 0), "x", CABLE, 12))
    return kit.asset("cable-reel", parts, smooth_angle=50)


def instrument_pier():
    """A cast concrete instrument pier, waist high: a chamfered block, a steel bed plate, a gauge box and its conduit."""
    parts = [kit.box((-0.58, 0, -0.58), (0.58, 1.02, 0.58), PIER, 0.04, 2)]
    parts.append(kit.box((-0.6, 0, -0.6), (0.6, 0.08, 0.6), PIER, 0.01, 1))
    parts.append(kit.box((-0.42, 1.02, -0.42), (0.42, 1.05, 0.42), STEEL, 0.006, 1))
    for sx in (-1, 1):
        for sz in (-1, 1):
            parts.append(kit.cylinder(0.025, 1.05, 1.09, (sx * 0.34, 0, sz * 0.34), "y", STEEL, 6))
    parts.append(kit.box((-0.18, 1.05, -0.12), (0.14, 1.2, 0.12), CONSOLE, 0.01, 1))
    parts.append(kit.cylinder(0.06, 0.14, 0.16, (0, 1.13, 0), "x", LENS, 14))
    parts.append(kit.box((-0.12, 1.19, -0.09), (0.1, 1.2, -0.05), HAZARD))
    parts.append(kit.cylinder(0.022, 0.0, 1.0, (-0.1, 0, 0.6), "y", STEEL, 8))
    parts.append(kit.cylinder(0.022, 0.6 - 0.02, 0.62 - 0.02, (-0.1, 1.0, 0), "z", STEEL, 8))
    return kit.asset("instrument-pier", parts, smooth_angle=45)


def sandbag(cx, y0, cz, along, width, height, wiggle=0.0):
    """One sandbag lying across the wall (its length along z), `width` along x and `height` high, resting at y0."""
    r = width / 2
    centre = (cx, y0 + height / 2, cz)
    h = along / 2
    o = kit.lathe([(-h, 0.0), (-h + 0.03, r * 0.7), (-h + 0.09, r), (h - 0.09, r), (h - 0.03, r * 0.7), (h, 0.0)], centre, SAND, 8, "z")
    squash(o, centre, sy=height / width)
    if wiggle:
        # Slumped a touch to one side, so the courses don't read as machined.
        c = kit.b(centre)
        for v in o.data.vertices:
            v.co.z += (v.co.x - c.x) * wiggle
    return o


def sandbags(length, height, depth):
    """A wall of sandbags laid across it in staggered courses, `length` long along x, `height` high and `depth` deep."""
    courses = max(4, round(height / 0.15))
    ch = height / courses
    n = max(2, round(length / 0.31))
    bw = length / n
    parts = []
    for k in range(courses):
        y0 = k * ch - (0.012 if k else 0.0)
        bh = ch + (0.012 if k else 0.0)
        xs = [(-length / 2 + (i + 0.5) * bw, bw) for i in range(n)] if k % 2 == 0 else \
            [(-length / 2 + bw / 4, bw / 2)] + [(-length / 2 + (i + 1) * bw, bw) for i in range(n - 1)] + [(length / 2 - bw / 4, bw / 2)]
        for i, (x, w) in enumerate(xs):
            jit = math.sin(k * 5.3 + i * 2.1)
            parts.append(sandbag(x, y0, jit * 0.012, depth - 0.03 - abs(jit) * 0.02, w + 0.01, bh, 0.03 * jit))
    return kit.asset(f"sandbags-{fmt(length)}x{fmt(height)}", parts, smooth_angle=70)


def instrument_racks():
    """A row of seven equipment racks 4.6 m long (along z), 2 m high, their fronts toward -x: grille doors and open
    racks of recorders, scopes and patch panels, a cable tray along the top."""
    d0, d1 = -0.325, 0.325
    n = 7
    w = 4.6 / n
    parts = [kit.box((d0 + 0.02, 0, -2.3), (d1, 0.08, 2.3), STEEL)]
    for i in range(n):
        z0, z1 = -2.3 + i * w + 0.006, -2.3 + (i + 1) * w - 0.006
        parts.append(kit.box((d0 + 0.03, 0.08, z0), (d1, 1.92, z1), RACK, 0.01, 1))
        fx = d0
        if i % 3 == 1:
            # A grille door with its handle and a label.
            parts.append(kit.box((fx, 0.12, z0 + 0.03), (fx + 0.03, 1.88, z1 - 0.03), RACK, 0.006, 1))
            parts.append(kit.box((fx - 0.004, 0.3, z0 + 0.1), (fx + 0.01, 1.7, z1 - 0.1), STEEL))
            parts.append(kit.box((fx - 0.02, 0.9, z1 - 0.1), (fx, 1.15, z1 - 0.07), STEEL))
            parts.append(kit.box((fx - 0.006, 1.74, z0 + 0.12), (fx + 0.01, 1.82, z1 - 0.12), TRIM))
        else:
            # Open: equipment units stacked in the frame.
            y = 0.14
            units = [(0.3, "scope"), (0.18, "panel"), (0.42, "recorder"), (0.18, "panel"), (0.3, "scope"), (0.22, "panel")] if i % 2 == 0 else \
                [(0.42, "recorder"), (0.22, "panel"), (0.3, "scope"), (0.42, "recorder"), (0.18, "panel")]
            for uh, kind in units:
                if y + uh > 1.86:
                    break
                parts.append(kit.box((fx + 0.01, y, z0 + 0.04), (fx + 0.04, y + uh - 0.01, z1 - 0.04), CONSOLE, 0.004, 1))
                zc = (z0 + z1) / 2
                if kind == "scope":
                    parts.append(kit.box((fx, y + 0.06, z0 + 0.08), (fx + 0.012, y + uh - 0.07, zc + 0.02), LENS))
                    for k in range(3):
                        parts.append(kit.cylinder(0.018, fx - 0.015, fx + 0.01, (0, y + 0.08 + k * 0.07, zc + 0.12), "x", STEEL, 8))
                elif kind == "recorder":
                    for zz in (zc - 0.13, zc + 0.13):
                        parts.append(kit.cylinder(0.11, fx - 0.012, fx + 0.012, (0, y + uh / 2 + 0.02, zz), "x", STEEL, 16))
                        parts.append(kit.cylinder(0.03, fx - 0.02, fx, (0, y + uh / 2 + 0.02, zz), "x", TRIM, 8))
                else:
                    for k in range(5):
                        parts.append(kit.box((fx - 0.008, y + 0.06, z0 + 0.08 + k * 0.08), (fx + 0.01, y + 0.1, z0 + 0.12 + k * 0.08), TRIM if k % 2 else HAZARD))
                y += uh
    parts.append(kit.box((d0 + 0.03, 1.92, -2.3), (d1, 1.94, 2.3), STEEL))
    # The cable tray, with a loom of cable in it.
    parts.append(kit.box((-0.2, 1.94, -2.3), (0.2, 1.96, 2.3), STEEL))
    for s in (-1, 1):
        x0, x1 = sorted((s * 0.2, s * 0.18))
        parts.append(kit.box((x0, 1.94, -2.3), (x1, 2.0, 2.3), STEEL))
    parts.append(kit.cylinder(0.035, -2.28, 2.28, (0.0, 1.985, 0), "z", CABLE, 10))
    parts.append(kit.cylinder(0.025, -2.28, 2.28, (0.09, 1.98, 0), "z", CABLE, 10))
    return kit.asset("instrument-racks", parts, smooth_angle=40)


def recorder_console():
    """The recording desk, 2.8 m long, its operator's side toward +z: two pedestals, a desk top, a raised back panel
    with three tape transports, a sloped strip of switches."""
    parts = []
    for s in (-1, 1):
        x0, x1 = sorted((s * 1.38, s * 0.9))
        parts.append(kit.box((x0, 0, -0.33), (x1, 0.72, 0.33), CONSOLE, 0.012, 1))
        for k in range(3):
            y = 0.08 + k * 0.21
            parts.append(kit.box((x0 + 0.03, y, 0.33), (x1 - 0.03, y + 0.18, 0.345), CONSOLE, 0.004, 1))
            parts.append(kit.box(((x0 + x1) / 2 - 0.06, y + 0.12, 0.345), ((x0 + x1) / 2 + 0.06, y + 0.14, 0.36), STEEL))
    parts.append(kit.box((-0.9, 0.3, -0.33), (0.9, 0.7, -0.3), CONSOLE))
    parts.append(kit.box((-1.4, 0.72, -0.35), (1.4, 0.76, 0.35), STEEL, 0.006, 1))
    # The back panel and its tape transports.
    parts.append(kit.box((-1.38, 0.76, -0.35), (1.38, 1.09, -0.18), CONSOLE, 0.01, 1))
    parts.append(kit.box((-1.4, 1.07, -0.35), (1.4, 1.1, -0.16), STEEL))
    for k in range(3):
        xc = -0.9 + k * 0.9
        parts.append(kit.box((xc - 0.4, 0.79, -0.18), (xc + 0.4, 1.05, -0.17), STEEL))
        for dx in (-0.2, 0.2):
            parts.append(kit.cylinder(0.105, -0.17, -0.15, (xc + dx, 0.93, 0), "z", TRIM, 20))
            parts.append(kit.cylinder(0.035, -0.15, -0.135, (xc + dx, 0.93, 0), "z", STEEL, 10))
        parts.append(kit.box((xc - 0.05, 0.8, -0.17), (xc + 0.05, 0.86, -0.15), LENS))
    # The sloped switch strip along the desk's front.
    parts.append(kit.section([(0.76, -0.16), (0.76, 0.1), (0.82, -0.16)], -1.36, 1.36, CONSOLE, 0.004, 1))
    for k in range(18):
        x = -1.25 + k * 0.147
        parts.append(kit.box((x - 0.02, 0.775, -0.09), (x + 0.02, 0.8, -0.05), HAZARD if k % 6 == 0 else TRIM))
    return kit.asset("recorder-console", parts, smooth_angle=40)


def one_crate(x0, x1, z0, z1, y0, y1, parts, hidden=()):
    """A plank crate filling (x0..x1, y0..y1, z0..z1): a dark core, planks on its sides and lid, battens round its edges
    and a brace across each side. Sides in `hidden` ("x0", "x1", "z0", "z1", "top") are against another crate: no planks there."""
    t, b = 0.025, 0.07
    parts.append(kit.box((x0 + t, y0 + 0.02, z0 + t), (x1 - t, y1 - t, z1 - t), CRATE_FRAME))
    rows = max(3, round((y1 - y0) / 0.2))
    ph = (y1 - y0 - 0.02) / rows
    for k in range(rows):
        ya, yb = y0 + 0.02 + k * ph + 0.004, y0 + 0.02 + (k + 1) * ph - 0.004
        if "z0" not in hidden:
            parts.append(kit.box((x0 + b, ya, z0), (x1 - b, yb, z0 + t), CRATE))
        if "z1" not in hidden:
            parts.append(kit.box((x0 + b, ya, z1 - t), (x1 - b, yb, z1), CRATE))
        if "x0" not in hidden:
            parts.append(kit.box((x0, ya, z0 + b), (x0 + t, yb, z1 - b), CRATE))
        if "x1" not in hidden:
            parts.append(kit.box((x1 - t, ya, z0 + b), (x1, yb, z1 - b), CRATE))
    if "top" not in hidden:
        cols = max(3, round((z1 - z0) / 0.2))
        pw = (z1 - z0 - 2 * b) / cols
        for k in range(cols):
            za, zb = z0 + b + k * pw + 0.004, z0 + b + (k + 1) * pw - 0.004
            parts.append(kit.box((x0 + b, y1 - t, za), (x1 - b, y1, zb), CRATE))
    for ya, yb in ((y0, y0 + b), (y1 - b, y1)):
        for za, zb in ((z0, z0 + b), (z1 - b, z1)):
            parts.append(kit.box((x0, ya, za), (x1, yb, zb), CRATE_FRAME))
        for xa, xb in ((x0, x0 + b), (x1 - b, x1)):
            parts.append(kit.box((xa, ya, z0 + b), (xb, yb, z1 - b), CRATE_FRAME))
    for xa, xb in ((x0, x0 + b), (x1 - b, x1)):
        for za, zb in ((z0, z0 + b), (z1 - b, z1)):
            parts.append(kit.box((xa, y0 + b, za), (xb, y1 - b, zb), CRATE_FRAME))
    dy = b * 0.7
    for side, z, zo in (("z0", z0 - 0.006, z0 + 0.01), ("z1", z1 - 0.01, z1 + 0.006)):
        if side not in hidden:
            parts.append(kit.prism([(x0 + b, y0 + b), (x0 + b + 0.1, y0 + b), (x1 - b, y1 - b - dy), (x1 - b, y1 - b), (x1 - b - 0.1, y1 - b), (x0 + b, y0 + b + dy)], z, zo, CRATE_FRAME))
    for side, x, xo in (("x0", x0 - 0.006, x0 + 0.01), ("x1", x1 - 0.01, x1 + 0.006)):
        if side not in hidden:
            parts.append(kit.section([(y0 + b, z0 + b), (y0 + b, z0 + b + 0.1), (y1 - b - dy, z1 - b), (y1 - b, z1 - b), (y1 - b, z1 - b - 0.1), (y0 + b + dy, z0 + b)], x, xo, CRATE_FRAME))


def crate(w, d, h):
    """A crate (x w, z d, h high), or a stack of them: two high when tall, two by two on a footprint over 1.6 m."""
    parts = []
    nx = 2 if w > 1.6 else 1
    nz = 2 if d > 1.6 and w > 1.6 else 1
    ny = 2 if h > 1.5 else 1
    gap = 0.02
    for i in range(nx):
        for j in range(nz):
            for k in range(ny):
                shrink = 0.05 * k
                x0 = -w / 2 + i * w / nx + (gap if i else 0) + shrink
                x1 = -w / 2 + (i + 1) * w / nx - (gap if i < nx - 1 else 0) - shrink * 0.4
                z0 = -d / 2 + j * d / nz + (gap if j else 0) + shrink * 0.4
                z1 = -d / 2 + (j + 1) * d / nz - (gap if j < nz - 1 else 0) - shrink
                hidden = [n for n, inner in (("x0", i > 0), ("x1", i < nx - 1), ("z0", j > 0), ("z1", j < nz - 1), ("top", k < ny - 1)) if inner]
                one_crate(x0, x1, z0, z1, k * h / ny, (k + 1) * h / ny, parts, hidden)
    # A stencilled hazard band on the single crates: these are the range's instrument cases.
    if nx == 1:
        parts.append(kit.box((-w / 2 + 0.1, h * 0.55, d / 2 - 0.004), (w / 2 - 0.1, h * 0.55 + 0.08, d / 2 + 0.006), HAZARD))
    return kit.asset(crate_name(w, d, h), parts, smooth_angle=35)


def blast_shield():
    """A free-standing blast shield, 4 m long (along z) and 2.6 m high: an armour plate facing +x on a sill, braced by
    tapered ribs behind, an armoured viewing port, a hazard band along its top."""
    parts = [kit.box((-0.2, 0, -2.0), (0.2, 0.1, 2.0), STEEL, 0.01, 1)]
    parts.append(kit.box((0.06, 0.1, -1.98), (0.18, 2.5, 1.98), SHIELD, 0.015, 2))
    parts.append(kit.box((0.06, 2.5, -1.98), (0.18, 2.6, 1.98), HAZARD, 0.01, 1))
    for z in (-1.7, -0.6, 0.6, 1.7):
        parts.append(kit.prism([(-0.19, 0.1), (0.06, 0.1), (0.06, 2.4), (0.0, 2.4)], z - 0.04, z + 0.04, STEEL, 0.006, 1))
    for z in (-1.92, 1.92):
        for y in [0.3 + k * 0.4 for k in range(6)]:
            parts.append(kit.cylinder(0.02, 0.18, 0.195, (0, y, z), "x", STEEL, 6))
    parts.append(kit.box((0.17, 1.55, -0.32), (0.2, 1.82, 0.32), STEEL, 0.006, 1))
    parts.append(kit.box((0.19, 1.6, -0.26), (0.205, 1.77, 0.26), LENS))
    return kit.asset("blast-shield", parts, smooth_angle=40)


def drum(x, z, y0, y1, r, mat):
    """A steel drum standing on y0, its lid at y1: rolling hoops, a chime round the lid, a bung."""
    h = y1 - y0
    prof = [(y0, 0.0), (y0, r - 0.015), (y0 + 0.012, r)]
    for t in (1 / 3, 2 / 3):
        yc = y0 + h * t
        prof += [(yc - 0.03, r), (yc - 0.015, r + 0.012), (yc + 0.015, r + 0.012), (yc + 0.03, r)]
    prof += [(y1 - 0.012, r), (y1, r - 0.006), (y1, r - 0.025), (y1 - 0.012, r - 0.03), (y1 - 0.012, 0.0)]
    parts = [kit.lathe(prof, (x, 0, z), mat, 20, "y")]
    parts.append(kit.cylinder(0.03, y1 - 0.012, y1 - 0.002, (x + r * 0.55, 0, z + r * 0.2), "y", STEEL, 8))
    return parts


def drums_4():
    """Four drums on a pallet, one of them red."""
    parts = []
    for z in (-0.5, 0.0, 0.5):
        parts.append(kit.box((-0.6, 0.0, z - 0.06), (0.6, 0.08, z + 0.06), CRATE_FRAME, 0.006, 1))
    for k in range(7):
        x = -0.55 + k * (1.1 / 6)
        parts.append(kit.box((x - 0.06, 0.08, -0.6), (x + 0.06, 0.1, 0.6), CRATE, 0.004, 1))
    mats = [DRUM, DRUM, DRUM_RED, DRUM]
    k = 0
    for sx in (-1, 1):
        for sz in (-1, 1):
            parts += drum(sx * 0.29, sz * 0.29, 0.1, 0.95, 0.275, mats[k])
            k += 1
    return kit.asset("drums-4", parts, smooth_angle=50)


def corrugated(a, b, pitch=0.28, depth=0.035):
    """(position, depth) points from a to b folding in and out: a container wall's trapezoidal corrugations."""
    n = max(2, round((b - a) / pitch))
    step = (b - a) / n
    pts = []
    for k in range(n):
        x = a + k * step
        pts += [(x, 0.0), (x + step * 0.18, depth), (x + step * 0.5, depth), (x + step * 0.68, 0.0)]
    return pts + [(b, 0.0)]


def container(paint, length=6.0, width=2.4, height=2.6):
    """A range container: corrugated sides and blind end, corner posts and castings, top and bottom rails, and a pair
    of doors at +x with their locking bars."""
    h, w = length / 2, width / 2
    mat = PAINTS[paint]
    post, rail, inset = 0.15, 0.14, 0.02
    parts = []
    side = corrugated(-h + post, h - post)
    end = corrugated(-w + post, w - post)
    outline = [(x, -w + inset + d) for x, d in side]
    outline += [(h - 0.06, -w + post), (h - 0.06, w - post)]
    outline += [(x, w - inset - d) for x, d in reversed(side)]
    outline += [(-h + inset + d, z) for z, d in reversed(end)]
    parts.append(kit.plan(outline, rail, height - rail, mat))
    parts.append(kit.box((-h + post, height - rail, -w + 0.05), (h - post, height - 0.03, w - 0.05), mat))
    parts.append(kit.box((-h + post, 0.06, -w + 0.05), (h - post, rail, w - 0.05), STEEL))
    for sx in (-1, 1):
        for sz in (-1, 1):
            x0, x1 = sorted((sx * h, sx * (h - post)))
            z0, z1 = sorted((sz * w, sz * (w - post)))
            parts.append(kit.box((x0, 0.12, z0), (x1, height - 0.12, z1), mat, 0.012, 1))
            for y0, y1 in ((0, 0.12), (height - 0.12, height)):
                parts.append(kit.box((x0, y0, z0), (x1, y1, z1), STEEL, 0.01, 1))
    for sz in (-1, 1):
        z0, z1 = sorted((sz * w, sz * (w - 0.07)))
        for y0, y1 in ((0, rail), (height - rail, height)):
            parts.append(kit.box((-h + post, y0, z0), (h - post, y1, z1), mat, 0.01, 1))
    for y0, y1 in ((0, rail), (height - rail, height)):
        parts.append(kit.box((-h, y0, -w + post), (-h + 0.08, y1, w - post), mat, 0.01, 1))
        parts.append(kit.box((h - 0.1, y0, -w + post), (h, y1, w - post), mat, 0.01, 1))
    for s in (-1, 1):
        z0, z1 = sorted((0.006 * s, s * (w - post)))
        parts.append(kit.box((h - 0.07, rail, z0), (h - 0.035, height - rail, z1), mat, 0.008, 1))
        for k in range(3):
            y = rail + 0.25 + k * (height - 2 * rail - 0.5) / 2
            parts.append(kit.box((h - 0.04, y - 0.04, z0 + 0.04), (h - 0.025, y + 0.04, z1 - 0.04), mat))
        for t in (0.3, 0.72):
            z = s * (w - post) * t
            parts.append(kit.cylinder(0.018, rail - 0.04, height - rail + 0.04, (h - 0.012, 0, z), "y", STEEL, 8))
            hz0, hz1 = sorted((z - s * 0.012, z + s * 0.15))
            parts.append(kit.box((h - 0.03, 1.0, hz0), (h, 1.04, hz1), STEEL))
            for y in (rail - 0.03, height - rail - 0.03):
                parts.append(kit.box((h - 0.035, y, z - 0.035), (h, y + 0.06, z + 0.035), STEEL))
        for k in range(4):
            y = rail + 0.15 + k * (height - 2 * rail - 0.37) / 3
            parts.append(kit.box((h - 0.04, y, s * (w - post) - 0.03), (h, y + 0.07, s * (w - post) + 0.03), STEEL))
    # A painted range band and the station's number panel on each side.
    for sz in (-1, 1):
        z0, z1 = sorted((sz * (w - inset + 0.004), sz * (w - inset - 0.012)))
        parts.append(kit.box((-h + 0.6, 1.9, z0), (-h + 1.5, 2.25, z1), TRIM))
        parts.append(kit.box((-h + 0.75, 1.98, sz * (w - inset + 0.01)), (-h + 1.35, 2.17, sz * (w - inset - 0.012)), HAZARD))
    return kit.asset(f"container-{fmt(length)}-{paint}", parts, smooth_angle=35)


def generator():
    """A skid-mounted diesel generator set, 3.8 m long: a louvred enclosure, the radiator grille at +x, a control panel
    at -x, an exhaust silencer on the roof."""
    parts = [kit.box((-1.9, 0, -0.8), (1.9, 0.15, 0.8), STEEL, 0.01, 1)]
    for x in (-1.2, 1.2):
        parts.append(kit.box((x - 0.18, 0.03, -0.81), (x + 0.18, 0.12, 0.81), CABLE))
    parts.append(kit.box((-1.78, 0.15, -0.74), (1.5, 1.52, 0.74), GENERATOR, 0.03, 2))
    parts.append(kit.box((-1.82, 1.52, -0.78), (1.54, 1.58, 0.78), GENERATOR, 0.015, 1))
    for s in (-1, 1):
        z0, z1 = sorted((s * 0.74, s * 0.765))
        for xa in (-1.5, -0.4, 0.7):
            parts.append(kit.box((xa, 0.25, z0), (xa + 0.9, 1.42, z1), GENERATOR, 0.004, 1))
            for k in range(6):
                y = 0.95 + k * 0.07
                parts.append(kit.box((xa + 0.1, y, s * 0.74), (xa + 0.8, y + 0.035, s * 0.769), STEEL))
            parts.append(kit.box((xa + 0.78, 0.6, s * 0.74), (xa + 0.84, 0.7, s * 0.777), STEEL))
        parts.append(kit.box((-1.1, 1.2, z0), (-0.85, 1.32, z1), HAZARD))
    parts.append(kit.box((1.5, 0.15, -0.74), (1.86, 1.52, 0.74), STEEL, 0.02, 1))
    for k in range(14):
        y = 0.24 + k * 0.09
        parts.append(kit.box((1.86, y, -0.66), (1.9, y + 0.045, 0.66), GENERATOR))
    parts.append(kit.box((-1.9, 0.55, -0.45), (-1.78, 1.35, 0.45), CONSOLE, 0.01, 1))
    for k in range(3):
        parts.append(kit.cylinder(0.05, -1.91, -1.89, (0, 1.15, -0.25 + k * 0.25), "x", LENS, 12))
    parts.append(kit.box((-1.905, 0.7, -0.3), (-1.895, 0.85, 0.3), TRIM))
    parts.append(kit.cylinder(0.1, -1.0, 0.3, (0, 1.7, 0.3), "x", STEEL, 16))
    parts.append(kit.cylinder(0.045, 1.58, 1.62, (0.1, 0, 0.3), "y", STEEL, 10))
    parts.append(kit.cylinder(0.05, -1.4, -1.0, (0, 1.7, 0.3), "x", STEEL, 10))
    parts.append(kit.cylinder(0.05, 1.7, 1.82, (-1.4, 0, 0.3), "y", STEEL, 10))
    return kit.asset("generator", parts, smooth_angle=45)


TANK_HEAD = [(-3.5, 0.0), (-3.49, 0.45), (-3.45, 0.85), (-3.36, 1.12), (-3.25, 1.26), (-3.12, TANK_R)]


def tank_profile():
    """The barrel's profile, (x, radius): the dished heads (`TANK_HEAD`) in rings every 10-15 cm of radius and the
    shell every 30 cm, so the weathering baked into its vertices (`weather_tank`) has the points to draw on."""
    head = []
    for rr in (0.0, 0.15, 0.3, 0.45, 0.6, 0.75, 0.85, 0.95, 1.04, 1.12, 1.2, 1.26, TANK_R):
        for (x0, r0), (x1, r1) in zip(TANK_HEAD, TANK_HEAD[1:]):
            if r0 <= rr <= r1:
                head.append((x0 + (x1 - x0) * (rr - r0) / (r1 - r0), rr))
                break
    shell = [(-3.12 + k * 6.24 / 21, TANK_R) for k in range(1, 21)]
    return head + shell + [(-x, rr) for x, rr in reversed(head)]


def fuel_tank():
    """A 7 m fuel tank lying on two saddles: a barrel with dished heads, weld seams, a red band, a manway, a placard
    and the draw-off pipe and valve under the +x head. Each head carries a red flammable diamond on a white plate, a
    dark data plate and a level gauge, so a tank seen end on reads as a tank, not a plain white ball (review
    2026-11-14a); its paint is weathered by `weather_tank`."""
    r, a = TANK_R, TANK_AXIS
    parts = [kit.lathe(tank_profile(), (0, a, 0), TANK, 36, "x")]
    for x in (-1.2, 1.2):
        parts.append(ring(x, a, 0, r + 0.006, 0.025, "x", TANK, 36))
    # The heads' weld seams, where the knuckle meets the shell.
    for x in (-3.12, 3.12):
        parts.append(ring(x, a, 0, r + 0.006, 0.03, "x", TANK, 36))
    for s in (-1, 1):
        def along(x0, x1):
            """An x span out from the head's middle, mirrored onto the -x head."""
            return tuple(sorted((s * x0, s * x1)))

        # The placard on the head's middle (which stands within 1 cm of x = 3.5 out to 45 cm): a white diamond 0.62 m
        # across standing 2 cm proud, and a red one inside it 1 cm prouder still.
        for d, (x0, x1), mat in ((0.31, (3.48, 3.52), TRIM), (0.25, (3.5, 3.53), DRUM_RED)):
            parts.append(kit.section([(a + 0.12 - d, 0.0), (a + 0.12, d), (a + 0.12 + d, 0.0), (a + 0.12, -d)], *along(x0, x1), mat))
        # The data plate under it, right of centre seen from outside (game -z is on the right, looking at the +x head).
        z = -s * 0.32
        parts.append(kit.box((along(3.46, 3.505)[0], a - 0.5, z - 0.16), (along(3.46, 3.505)[1], a - 0.3, z + 0.16), STEEL))
        # The level gauge up on the head, left of centre: a dial in a steel bezel, its white face toward the end.
        parts.append(kit.cylinder(0.09, *along(3.42, 3.5), (0, a + 0.72, s * 0.3), "x", STEEL, 16))
        parts.append(kit.cylinder(0.072, *along(3.5, 3.507), (0, a + 0.72, s * 0.3), "x", TRIM, 16))
    parts.append(ring(-1.8, a, 0, r + 0.005, 0.35, "x", STRIPE, 36))
    for x in (-2.4, 2.4):
        parts.append(kit.box((x - 0.25, 0, -0.68), (x + 0.25, 0.32, 0.68), PIER, 0.02, 1))
        arc = [(0.32, -0.68), (0.32, 0.68)]
        for k in range(9):
            z = 0.68 - k * 1.36 / 8
            arc.append((a - math.sqrt(r * r - z * z) + 0.005, z))
        parts.append(kit.section(arc, x - 0.12, x + 0.12, STEEL))
        parts.append(kit.box((x - 0.2, 0.32, -0.68), (x + 0.2, 0.34, 0.68), STEEL))
    parts.append(kit.cylinder(0.25, a + r - 0.12, a + r + 0.015, (1.5, 0, 0), "y", TANK, 20))
    parts.append(kit.cylinder(0.28, a + r + 0.01, a + r + 0.035, (1.5, 0, 0), "y", STEEL, 20))
    parts.append(kit.cylinder(0.06, a + r - 0.05, a + r + 0.04, (-0.6, 0, 0), "y", STEEL, 10))
    parts.append(kit.box((-0.35, a - 0.3, r - 0.012), (0.35, a + 0.25, r + 0.012), TRIM))
    parts.append(kit.box((-0.3, a - 0.25, r + 0.008), (0.3, a + 0.2, r + 0.018), HAZARD))
    parts.append(kit.cylinder(0.05, 2.7, 3.45, (0, 0.35, 0.4), "x", STEEL, 10))
    parts.append(kit.cylinder(0.05, 0.35, a - r + 0.25, (2.7, 0, 0.4), "y", STEEL, 10))
    parts.append(kit.lathe([(-0.015, 0.1), (-0.015, 0.13), (0.015, 0.13), (0.015, 0.1)], (3.38, 0.35, 0.4), DRUM_RED, 16, "x"))
    parts.append(kit.box((3.36, 0.3, 0.38), (3.4, 0.4, 0.42), STEEL))
    return kit.asset("fuel-tank", parts, smooth_angle=50)


def weather_tank(o):
    """Weathers the fuel tank's paint, in the vertex colour's alpha, which the game multiplies into the finish's colour
    (`map-models.ts`): rust and dirt run down from its top in streaks of their own length, down the shell's sides and
    the heads; grime lies along the weld seams; and the desert's dust is splashed up its lower third. A white tank
    without them read as a placeholder ball end on (review 2026-11-14a)."""
    mesh = o.data
    ca = mesh.color_attributes["Color"]
    paint = {i for i, m in enumerate(mesh.materials) if m and m.name == TANK.name}
    verts = {v for p in mesh.polygons if p.material_index in paint for v in p.vertices}
    top = TANK_AXIS + TANK_R
    for i in verts:
        co = mesh.vertices[i].co
        x, y, z = co.x, co.z, -co.y
        head = abs(x) > 3.12
        # Along the surface across the streaks: x on the shell, each side its own pattern (blended over the crest, so
        # the two don't meet in a line along the top); z on a head, each end its own.
        if head:
            pattern = lambda k: noise.noise(Vector((z * 2.6 * k[0], 7.3 + (x > 0) * 3.1, k[1])))  # noqa: E731
        else:
            w = min(1.0, max(0.0, 0.5 + z / 0.6))
            pattern = lambda k: (1 - w) * noise.noise(Vector((x * 2.6 * k[0], 1.9, k[1]))) + w * noise.noise(Vector((x * 2.6 * k[0], 6.3, k[1])))  # noqa: E731
        streak = min(1.0, max(0.0, pattern((1.0, 0.5)) * 2.2 + 0.1))
        length = 1.0 + 2.0 * (0.5 + 0.5 * pattern((0.5, 2.5)))
        streak *= max(0.0, 1.0 - (top - y) / length)
        # Rust run down a head from under its level gauge (z = ±0.3, 63 cm over the axis), narrow and fading.
        rust = 0.0
        if head and y < TANK_AXIS + 0.63:
            rust = max(0.0, 1.0 - abs(z - math.copysign(0.3, x)) / 0.12) * max(0.0, 1.0 - (TANK_AXIS + 0.63 - y) / 1.1)
        seam = min(abs(abs(x) - 3.12), abs(abs(x) - 1.2))
        grime = 0.15 * max(0.0, 1.0 - seam / 0.25)
        dust = max(0.0, 1.0 - y / 1.2) ** 1.3 * (0.7 + 0.3 * noise.noise(Vector((x * 2.1, z * 2.1, 4.0))))
        tone = 0.08 * (0.5 + 0.5 * noise.noise(Vector((x * 0.6, y * 0.6, z * 0.6))))
        shade = max(0.35, 1.0 - 0.5 * streak - 0.45 * rust - grime - 0.5 * dust - tone)
        c = ca.data[i].color
        if head and abs(y - TANK_AXIS - 0.12) + abs(z) < 0.41:
            c = (1.0, 1.0, 1.0, 1.0)  # under and just round the placard: its occlusion would spread from there in spikes
        ca.data[i].color = (c[0], c[1], c[2], shade)


def instrument_trailer():
    """An instrument trailer, 8 m long, its drawbar toward +x: a box body with a red band, windows, a door with steps,
    ribbed seams, roof units, and tandem wheels under it."""
    parts = []
    for s in (-1, 1):
        parts.append(kit.box((-3.9, 0.72, s * 0.75 - 0.06), (3.6, 0.95, s * 0.75 + 0.06), STEEL))
    parts.append(kit.box((-3.9, 0.95, -1.2), (3.6, 3.2, 1.2), TRAILER, 0.04, 2))
    parts.append(kit.box((-3.95, 3.18, -1.24), (3.65, 3.25, 1.24), TRAILER, 0.015, 1))
    for s in (-1, 1):
        z0, z1 = sorted((s * 1.2, s * 1.212))
        parts.append(kit.box((-3.88, 2.2, z0), (3.58, 2.38, z1), STRIPE))
        for k in range(12):
            x = -3.6 + k * 0.62
            parts.append(kit.box((x - 0.015, 0.97, z0), (x + 0.015, 3.18, z1), TRAILER))
        for xa in (-2.8, -1.4):
            parts.append(kit.box((xa, 1.65, s * 1.19), (xa + 0.9, 2.1, s * 1.216), WINDOW))
        # Fenders over the wheels.
        fz0, fz1 = sorted((s * 0.85, s * 1.22))
        parts.append(kit.box((-1.45, 0.86, fz0), (0.25, 0.95, fz1), STEEL, 0.01, 1))
        for x in (-1.1, -0.1):
            parts += kit.wheel(x, 0.4, s * 1.0, 0.4, 0.22, TYRE, STEEL, STEEL, 18, 0.6, s)
    for x in (-1.1, -0.1):
        parts.append(kit.cylinder(0.05, -0.9, 0.9, (x, 0.4, 0), "z", STEEL, 10))
    # The door on the +z side, its frame, handle and the step under it.
    parts.append(kit.box((1.0, 1.0, 1.2), (1.9, 3.0, 1.225), STEEL, 0.006, 1))
    parts.append(kit.box((1.05, 1.05, 1.21), (1.85, 2.95, 1.235), TRAILER, 0.006, 1))
    parts.append(kit.box((1.12, 2.3, 1.235), (1.78, 2.8, 1.24), WINDOW))
    parts.append(kit.box((1.72, 1.8, 1.235), (1.8, 1.86, 1.27), STEEL))
    parts.append(kit.box((1.0, 0.5, 0.95), (1.9, 0.55, 1.28), STEEL))
    for x in (1.02, 1.85):
        parts.append(kit.box((x - 0.02, 0.5, 1.22), (x + 0.02, 0.95, 1.26), STEEL))
    # The drawbar and its jack.
    parts.append(kit.plan([(3.6, -0.7), (3.95, -0.06), (3.95, 0.06), (3.6, 0.7)], 0.55, 0.68, STEEL))
    parts.append(kit.cylinder(0.08, 3.9, 4.0, (0, 0.62, 0), "x", STEEL, 12))
    parts.append(kit.cylinder(0.04, 0.0, 0.66, (3.75, 0, 0.3), "y", STEEL, 10))
    parts.append(kit.box((3.65, 0.0, 0.2), (3.85, 0.03, 0.4), STEEL))
    # The rear: tail lamps and a cable port.
    for s in (-1, 1):
        parts.append(kit.box((-3.94, 1.05, s * 0.95 - 0.1), (-3.9, 1.15, s * 0.95 + 0.1), STRIPE))
    parts.append(kit.box((-3.94, 1.4, -0.3), (-3.9, 1.8, 0.3), STEEL, 0.006, 1))
    # Roof units: an air conditioner and a short antenna mast.
    parts.append(kit.box((1.4, 3.25, -0.5), (2.3, 3.42, 0.5), STEEL, 0.02, 1))
    for k in range(6):
        parts.append(kit.box((1.45, 3.42, -0.45 + k * 0.17), (2.25, 3.43, -0.4 + k * 0.17), CONSOLE))
    parts.append(kit.cylinder(0.03, 3.25, 3.42, (-3.2, 0, -0.8), "y", STEEL, 8))
    parts.append(kit.cylinder(0.08, 3.38, 3.42, (-3.2, 0, -0.8), "y", TRIM, 12))
    return kit.asset("instrument-trailer", parts, smooth_angle=40)


def instrument_hut():
    """A cast concrete instrument hut, 3.2 by 2.4 m, its steel door toward +z: a plinth, an overhanging roof slab with a
    drip edge, vent grilles in the ends, a conduit and junction box at the back, a warning plate by the door."""
    parts = [kit.box((-1.56, 0, -1.16), (1.56, 0.15, 1.16), PIER, 0.01, 1)]
    parts.append(kit.box((-1.5, 0.15, -1.1), (1.5, 2.42, 1.1), HUT, 0.02, 2))
    parts.append(kit.box((-1.6, 2.42, -1.2), (1.6, 2.6, 1.2), HUT, 0.03, 2))
    parts.append(kit.box((-1.58, 2.38, -1.18), (1.58, 2.42, 1.18), PIER))
    parts.append(kit.box((-0.5, 0.15, 1.1), (0.5, 2.2, 1.13), STEEL, 0.008, 1))
    parts.append(kit.box((-0.44, 0.18, 1.13), (0.44, 2.14, 1.15), SHIELD, 0.006, 1))
    parts.append(kit.box((0.28, 1.0, 1.15), (0.36, 1.16, 1.19), STEEL))
    parts.append(kit.box((0.6, 1.3, 1.1), (0.95, 1.65, 1.115), HAZARD))
    parts.append(kit.box((0.65, 1.38, 1.115), (0.9, 1.42, 1.12), STEEL))
    for s in (-1, 1):
        x0, x1 = sorted((s * 1.5, s * 1.53))
        parts.append(kit.box((x0, 1.7, -0.35), (x1, 2.1, 0.35), STEEL, 0.004, 1))
        for k in range(5):
            y = 1.74 + k * 0.07
            parts.append(kit.box((s * 1.5, y, -0.32), (s * 1.54, y + 0.03, 0.32), CABLE))
    parts.append(kit.cylinder(0.04, 0.0, 2.3, (1.1, 0, -1.16), "y", STEEL, 10))
    parts.append(kit.box((0.85, 1.2, -1.19), (1.35, 1.6, -1.1), STEEL, 0.008, 1))
    return kit.asset("instrument-hut", parts, smooth_angle=40)


def lamp_cage():
    """A caged work lamp hanging on a conduit: a canopy, a glass globe, a wire guard of six bars and two hoops."""
    parts = [kit.cylinder(0.018, 0.29, 0.6, (0, 0, 0), "y", CAGE, 10)]
    parts.append(kit.lathe([(0.22, 0.0), (0.22, 0.12), (0.25, 0.12), (0.3, 0.05), (0.3, 0.0)], (0, 0, 0), CAGE, 18, "y"))
    parts.append(kit.lathe([(0.22, 0.05), (0.2, 0.085), (0.12, 0.09), (0.06, 0.06), (0.035, 0.0)], (0, 0, 0), GLOW, 16, "y"))
    for k in range(6):
        a = k * math.pi / 3
        x, z = math.cos(a) * 0.115, math.sin(a) * 0.115
        parts.append(kit.cylinder(0.007, 0.02, 0.22, (x, 0, z), "y", CAGE, 6))
    for y in (0.02, 0.12):
        parts.append(ring(0, y, 0, 0.122, 0.014, "y", CAGE, 18))
    parts.append(kit.cylinder(0.03, 0.0, 0.025, (0, 0, 0), "y", CAGE, 10))
    return kit.asset("lamp-cage", parts, smooth_angle=50)


# ---------------------------------------------------------------- beyond the barrier (no solids)

def shot_tower():
    """The shot tower on the plain, 100 m: a tapering four-legged steel lattice on a concrete pad, girts every 10 m with
    X-bracing in each face, and the shot cab on a platform at the top, a hoist beam over it."""
    H = SHOT_TOWER_H
    base, top = 7.0, 2.4
    half = lambda y: base + (top - base) * y / H
    parts = [kit.box((-11, 0, -11), (11, 0.3, 11), PAD, 0.05, 1)]
    for sx in (-1, 1):
        for sz in (-1, 1):
            parts.append(kit.box((sx * base - 1.0, 0.0, sz * base - 1.0), (sx * base + 1.0, 0.9, sz * base + 1.0), PIER, 0.04, 1))
            parts.append(beam((sx * base, 0.5, sz * base), (sx * top, H, sz * top), 0.7, STEEL))
    levels = [k * 10.0 for k in range(1, 11)]
    for i, y in enumerate(levels):
        y0 = levels[i - 1] if i else 0.9
        h0, h1 = half(y0), half(y)
        for s in (-1, 1):
            parts.append(beam((-h1, y, s * h1), (h1, y, s * h1), 0.35, STEEL))
            parts.append(beam((s * h1, y, -h1), (s * h1, y, h1), 0.35, STEEL))
            # X-bracing in each of the four faces.
            parts.append(beam((-h0, y0, s * h0), (h1, y, s * h1), 0.2, STEEL))
            parts.append(beam((h0, y0, s * h0), (-h1, y, s * h1), 0.2, STEEL))
            parts.append(beam((s * h0, y0, -h0), (s * h1, y, h1), 0.2, STEEL))
            parts.append(beam((s * h0, y0, h0), (s * h1, y, -h1), 0.2, STEEL))
    # The platform, the cab and the hoist beam over it.
    parts.append(kit.box((-4.5, H, -4.5), (4.5, H + 0.5, 4.5), DECK, 0.05, 1))
    for s in (-1, 1):
        parts.append(kit.box((-4.5, H + 0.5, s * 4.45 - 0.05), (4.5, H + 1.6, s * 4.45 + 0.05), TOWER))
        parts.append(kit.box((s * 4.45 - 0.05, H + 0.5, -4.5), (s * 4.45 + 0.05, H + 1.6, 4.5), TOWER))
    parts.append(kit.box((-2.6, H + 0.5, -2.6), (2.6, H + 4.4, 2.6), HOUSE, 0.05, 1))
    parts.append(kit.box((-2.8, H + 4.4, -2.8), (2.8, H + 4.8, 2.8), ROOF, 0.05, 1))
    for s in (-1, 1):
        parts.append(kit.box((s * 2.0 - 0.15, H + 4.8, -0.15), (s * 2.0 + 0.15, H + 8.0, 0.15), TOWER))
    parts.append(kit.box((-2.6, H + 7.6, -0.18), (5.5, H + 8.0, 0.18), TOWER))
    parts.append(kit.cylinder(0.05, H + 4.0, H + 7.6, (5.2, 0, 0), "y", CABLE, 8))
    # The cable riser up one leg.
    parts.append(beam((base - 1.2, 0.3, base - 1.6), (top - 0.4, H, top - 0.8), 0.25, CABLE))
    return kit.asset("shot-tower", parts, smooth_angle=30)


def cable_pole():
    """A timber pole of the signal-cable line, 8 m: a crossarm across the line with green glass insulators, a cable
    junction box low on the pole."""
    parts = [kit.lathe([(0.0, 0.14), (6.0, 0.12), (7.95, 0.1), (8.0, 0.07), (8.0, 0.0)], (0, 0, 0), POLE, 12, "y")]
    parts.append(kit.box((-0.06, 7.35, -1.1), (0.06, 7.5, 1.1), POLE, 0.01, 1))
    for z in (-0.95, -0.35, 0.35, 0.95):
        parts.append(kit.cylinder(0.012, 7.5, 7.56, (0, 0, z), "y", STEEL, 6))
        parts.append(kit.lathe([(7.54, 0.0), (7.54, 0.045), (7.58, 0.048), (7.61, 0.03), (7.66, 0.032), (7.7, 0.022), (7.71, 0.0)], (0, 0, z), INSULATOR, 10, "y"))
    parts.append(kit.box((0.1, 1.2, -0.2), (0.32, 1.7, 0.2), STEEL, 0.01, 1))
    parts.append(kit.cylinder(0.03, 0.0, 1.2, (0.2, 0, 0), "y", CABLE, 8))
    return kit.asset("cable-pole", parts, smooth_angle=50)


def far_bunker():
    """Another station's bunker, far off on the plain: a concrete box buried in a sand berm, its face and door toward +z,
    a roof slab and an instrument mast."""
    parts = [frustum((-11, 11, -7, 3.6), (-5.5, 5.5, -3.5, 3.6), 0.0, 3.4, LAND)]
    parts.append(kit.box((-4.5, 0.0, -3.0), (4.5, 3.6, 3.6), BUNKER, 0.05, 1))
    parts.append(kit.box((-5.0, 3.6, -3.5), (5.0, 4.1, 4.0), BUNKER, 0.05, 1))
    parts.append(kit.box((-1.0, 0.0, 3.6), (1.0, 2.2, 3.65), STEEL))
    parts.append(kit.box((1.8, 2.4, 3.6), (3.6, 2.7, 3.65), WINDOW))
    parts.append(kit.cylinder(0.08, 4.1, 11.0, (-3.0, 0, -1.5), "y", STEEL, 8))
    parts.append(kit.box((-3.6, 10.0, -1.55), (-2.4, 10.08, -1.45), STEEL))
    return kit.asset("far-bunker", parts, smooth_angle=30)


# ---------------------------------------------------------------- build

built = [camera_tower(), camera_housing(), siren_post()] + [ladder(t) for t in LADDERS]
built += [cable_reel(), instrument_pier()] + [sandbags(*s) for s in SANDBAGS]
built += [instrument_racks(), recorder_console(), blast_shield(), drums_4()]
built += [crate(*c) for c in CRATES]
built += [container(p) for p in PAINTS]
built += [generator(), fuel_tank(), instrument_trailer(), instrument_hut(), lamp_cage()]
scenery = [shot_tower(), cable_pole(), far_bunker()]


def tower_solids():
    h, i = TOWER_HALF, TOWER_HALF - LEG
    out = []
    for sx in (-1, 1):
        for sz in (-1, 1):
            x0, x1 = sorted((sx * i, sx * h))
            z0, z1 = sorted((sz * i, sz * h))
            out.append(((x0, 0, z0), (x1, DECK_Y - 0.2, z1)))
    for s in (-1, 1):
        z0, z1 = sorted((s * i, s * h))
        out.append(((-i, BEAM[0], z0), (i, BEAM[1], z1)))
        x0, x1 = sorted((s * i, s * h))
        out.append(((x0, BEAM[0], -i), (x1, BEAM[1], i)))
    top = DECK_Y + RAIL_H
    out.append(((-h, DECK_Y - 0.2, -h), (h, DECK_Y, h)))
    out += [((-h, DECK_Y, h - 0.05), (h, top, h)), ((-h, DECK_Y, -h), (h, top, -h + 0.05)), ((-h, DECK_Y, -h + 0.05), (-h + 0.05, top, h - 0.05))]
    out += [((h - 0.05, DECK_Y, LADDER_GAP), (h, top, h - 0.05)), ((h - 0.05, DECK_Y, -h + 0.05), (h, top, -LADDER_GAP))]
    return out


def ladder_solids(top):
    out = [((-0.04, 0, s * 0.45 - 0.04), (0.04, top, s * 0.45 + 0.04)) for s in (1, -1)]
    y = 0.3
    while y < top - 0.2:
        out.append(((-0.04, y, -0.41), (0.04, y + 0.05, 0.41)))
        y += 0.3
    return out


def box(x, h, z, y0=0.0):
    """One solid from its half-sizes and height."""
    return [((-x, y0, -z), (x, h, z))]


SOLIDS = {
    "camera-tower": tower_solids(),
    "camera-housing": box(0.55, 1.1, 0.55),
    "siren-post": [((-0.06, 0, -0.14), (0.06, 1.5, 0.14)), ((-0.2, 1.5, -0.2), (0.2, 1.95, 0.2))],
    "cable-reel": box(0.5, 1.6, 0.8),
    "instrument-pier": box(0.6, 1.2, 0.6),
    "instrument-racks": box(0.325, 2.0, 2.3),
    "recorder-console": box(1.4, 1.1, 0.35),
    "blast-shield": box(0.2, 2.6, 2.0),
    "drums-4": box(0.6, 0.95, 0.6),
    "generator": box(1.9, 1.8, 0.8),
    "fuel-tank": [((-3.5, 0, -0.7), (3.5, TANK_AXIS + TANK_R, 0.7))] + [((-3.5, TANK_AXIS - dy, -w), (3.5, TANK_AXIS + dy, w)) for dy, w in TANK_STEPS],
    "instrument-trailer": box(4.0, 3.4, 1.25),
    "instrument-hut": box(1.6, 2.6, 1.2),
    "lamp-cage": [((-0.02, 0.3, -0.02), (0.02, 0.6, 0.02)), ((-0.13, 0, -0.13), (0.13, 0.3, 0.13))],
}
SOLIDS.update({f"ladder-{fmt(t)}": ladder_solids(t) for t in LADDERS})
SOLIDS.update({f"sandbags-{fmt(l)}x{fmt(h)}": box(l / 2, h, d / 2) for l, h, d in SANDBAGS})
SOLIDS.update({crate_name(w, d, h): box(w / 2, h, d / 2) for w, d, h in CRATES})
SOLIDS.update({f"container-600-{p}": box(3.0, 2.6, 1.2) for p in PAINTS})

kit.bake_ao(built + scenery, distance=0.6)
weather_tank(next(o for o in built if o.name == "fuel-tank"))
report = {}
for o in scenery:
    report[o.name] = {"tris": kit.tris(o)}
for o in built:
    worst, where = kit.strays(o, SOLIDS[o.name])
    report[o.name] = {"tris": kit.tris(o), "outside": worst, **({"at": where} if worst > mapkit.TOLERANCE else {})}
result = {"assets": report, "tris": sum(r["tris"] for r in report.values()), "issues": [n for n, r in report.items() if r.get("outside", 0) > mapkit.TOLERANCE]}
if EXPORT:
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    kit.export(built + scenery, OUT)
    result["glb"] = {"path": os.path.abspath(OUT), "bytes": os.path.getsize(OUT)}
