"""Build Switchyard's models: freight car underframes, the tank car's barrel,
the depot's tanks, the locomotive and the sodium lamps' heads; and for the
end-of-match freight train, boxcar and hopper bodies and a deck plate,
which ride on the same underframes behind the same locomotive.

Run in the Blender session (see the blender skill):
    bkit.reset(); bkit.run(r"tools/map/switchyard.py")
    bkit.run(r"tools/map/switchyard.py", export=True)   # also writes the GLB

Each asset is one object, named as the map places it (`frame-12`, `tank-car`,
...), with its origin where the placement's position goes: on the ground
under the middle of a car, a tank or the locomotive, and at the bottom
centre of a lamp head's housing. Every asset is modelled along Blender +X
(game +x) with Blender Y across it (game -z) and Z up (game +y).

Materials are named after the map's finishes (apps/range/src/map/switchyard.ts),
which the client looks up to colour them. The model draws the collision
solids the map ties it to, so it has to stay within 5 cm of them: each
asset's solids are written out below (`SOLIDS`), in the same numbers as the
map's, and `result` reports any vertex that strays.
"""
import importlib
import math
import os
import sys

import bmesh
import bpy
from mathutils import Matrix, Vector

sys.path.insert(0, os.path.dirname(__file__))
import mapkit  # noqa: E402

importlib.reload(mapkit)

EXPORT = ARGS.get("export", False)  # noqa: F821 (ARGS comes from bkit.run)
OUT = r"apps/range/public/models/switchyard.glb"
TOLERANCE = 0.05

# The map's numbers (apps/range/src/map/switchyard.ts).
RAIL_TOP = 0.29  # ballast 0.15 + rail 0.14
RAIL_HALF_GAUGE = 0.7175
FRAME_BOTTOM = 0.3
DECK_BOTTOM = 1.0
CAR_HALF = 1.5
CAR_FLOOR = 1.1
TANK_STEPS = [(0.4, 0.7, 1.1, 3.7), (0.5, 1.1, 1.3, 3.5), (0.6, 1.4, 1.6, 3.2)]
LAMP_HEAD = (0.55, 0.32, 0.16)  # along, across, height

# Finishes, coloured roughly as the map's (Workbench previews show these).
def _mat(name, srgb, roughness=0.6, metallic=0.0, emission=None):
    lin = tuple(((c / 255) / 12.92) if c / 255 <= 0.04045 else (((c / 255) + 0.055) / 1.055) ** 2.4 for c in srgb)
    return bkit.material(name, lin, roughness, metallic, emission)  # noqa: F821


STEEL = _mat("steel", (0x3a, 0x3d, 0x40), 0.6, 0.3)
WHEEL = _mat("wheel", (0x2c, 0x27, 0x24), 0.5, 0.5)
TANK_BLACK = _mat("tank.black", (0x2b, 0x2c, 0x2e), 0.45, 0.2)
TANK_SILVER = _mat("tank.silver", (0xb9, 0xbe, 0xc1), 0.4, 0.5)
PLACARD = _mat("placard", (0xd2, 0x7a, 0x2c), 0.6)
LOCO = _mat("loco", (0x2e, 0x4a, 0x3a), 0.5, 0.1)
LOCO_CAB = _mat("loco.cab", (0xd3, 0xa4, 0x3a), 0.5, 0.1)
GRILLE = _mat("grille", (0x26, 0x29, 0x2b), 0.7, 0.3)
WINDOW = _mat("window", (0x1c, 0x2a, 0x33), 0.1)
LAMP_POST = _mat("lamp.post", (0x4a, 0x50, 0x48), 0.55, 0.3)
LAMP_GLOW = _mat("lamp.glow", (0xff, 0xb2, 0x5e), 0.3, 0.0, emission=(1.0, 0.45, 0.12))
CAR = {name: _mat(name, rgb, 0.55, 0.3) for name, rgb in (("car.oxide", (0x7e, 0x3a, 0x2a)), ("car.brown", (0x5e, 0x45, 0x35)), ("car.teal", (0x3f, 0x65, 0x63)), ("car.grey", (0x80, 0x86, 0x8a)))}
ROOF = _mat("roof.flat", (0x4f, 0x4b, 0x47), 0.8)

coll = bpy.data.collections.new("switchyard")
bpy.context.scene.collection.children.link(coll)
kit = mapkit.Kit(bkit, "switchyard-props")  # noqa: F821


# ---------------------------------------------------------------- primitives
# Positions and sizes below are game-style (x along, y up, z across) and
# turned into Blender's (x, -z, y) as each part is made.

def _b(v):
    return Vector((v[0], -v[2], v[1]))


def _obj(name, bm, mat, bevel=0.0):
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    obj = bpy.data.objects.new(name, mesh)
    coll.objects.link(obj)
    bkit.assign(obj, mat)  # noqa: F821
    if bevel > 0:
        m = obj.modifiers.new("bevel", "BEVEL")
        m.width = bevel
        m.segments = 2
        m.limit_method = "ANGLE"
        m.angle_limit = math.radians(40)
    return obj


def box(lo, hi, mat, bevel=0.0):
    """A box from game-space corner `lo` to `hi`."""
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    a, b = _b(lo), _b(hi)
    size = Vector((abs(b.x - a.x), abs(b.y - a.y), abs(b.z - a.z)))
    bmesh.ops.scale(bm, vec=size, verts=bm.verts)
    bmesh.ops.translate(bm, vec=(a + b) / 2, verts=bm.verts)
    return _obj("box", bm, mat, bevel)


def cylinder(r, x0, x1, centre, axis, mat, segments=20, bevel=0.0):
    """A cylinder of radius `r` along game axis `axis` ('x', 'y' or 'z'), from x0 to x1 on it, through game point `centre`."""
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, segments=segments, radius1=r, radius2=r, depth=x1 - x0)
    # Blender's cone runs along its Z; turn it onto the axis, then move it.
    rot = {"x": Matrix.Rotation(math.pi / 2, 4, "Y"), "z": Matrix.Rotation(math.pi / 2, 4, "X"), "y": Matrix.Identity(4)}[axis]
    bmesh.ops.transform(bm, matrix=rot, verts=bm.verts)
    c = list(centre)
    c["xyz".index(axis)] = (x0 + x1) / 2
    bmesh.ops.translate(bm, vec=_b(c), verts=bm.verts)
    return _obj("cylinder", bm, mat, bevel)


def prism(profile, z0, z1, mat, bevel=0.0):
    """A slab from a game-space (x, y) outline (counter-clockwise), from z0 to z1 across."""
    bm = bmesh.new()
    verts = [bm.verts.new(_b((x, y, z0))) for x, y in profile]
    face = bm.faces.new(verts)
    bmesh.ops.recalc_face_normals(bm, faces=[face])
    ext = bmesh.ops.extrude_face_region(bm, geom=[face])
    moved = [v for v in ext["geom"] if isinstance(v, bmesh.types.BMVert)]
    bmesh.ops.translate(bm, vec=_b((0, 0, z1 - z0)), verts=moved)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return _obj("prism", bm, mat, bevel)


def barrel(r, half, cap, cy, mat, segments=32):
    """A barrel lying along x: a cylinder of radius r from -half to half with domed caps `cap` deep, its axis at height cy."""
    bm = bmesh.new()
    rings = []
    # Cap profile: (x, radius) from one tip to the other, through the straight part.
    steps = 5
    profile = []
    for i in range(steps + 1):
        t = i / steps
        a = (1 - t) * math.pi / 2
        profile.append((-half - cap * math.sin(a), r * math.cos(a)))
    for i in range(steps + 1):
        t = i / steps
        a = t * math.pi / 2
        profile.append((half + cap * math.sin(a), r * math.cos(a)))
    for x, rad in profile:
        ring = []
        for k in range(segments):
            ang = 2 * math.pi * k / segments
            ring.append(bm.verts.new(_b((x, cy + rad * math.sin(ang), rad * math.cos(ang)))))
        rings.append(ring)
    for a, b in zip(rings, rings[1:]):
        for k in range(segments):
            bm.faces.new((a[k], a[(k + 1) % segments], b[(k + 1) % segments], b[k]))
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    obj = _obj("barrel", bm, mat)
    for p in obj.data.polygons:
        p.use_smooth = True
    return obj


def asset(name, parts):
    """Joins `parts` (their modifiers applied) into one object called `name`, origin at the world origin."""
    for o in parts:
        bpy.context.view_layer.objects.active = o
        for m in list(o.modifiers):
            bpy.ops.object.select_all(action="DESELECT")
            o.select_set(True)
            bpy.ops.object.modifier_apply(modifier=m.name)
    bpy.ops.object.select_all(action="DESELECT")
    for o in parts:
        o.select_set(True)
    bpy.context.view_layer.objects.active = parts[0]
    bpy.ops.object.join()
    obj = bpy.context.view_layer.objects.active
    obj.name = name
    obj.data.name = name
    # Flat-shaded except the round parts, which were smoothed before the join.
    return obj


# ---------------------------------------------------------------- the assets

def bogie(cx, wheel_r, wheelbase, frame_y):
    """A two-axle bogie centred at x = cx: side frames, bolster, springs, axles, wheels and journal boxes."""
    parts = []
    axle_y = RAIL_TOP + wheel_r
    for s in (-1, 1):
        zf = s * 0.92
        half = wheelbase / 2 + 0.3
        prof = [(cx - half, axle_y - 0.02), (cx - half + 0.2, frame_y), (cx + half - 0.2, frame_y), (cx + half, axle_y - 0.02), (cx + half - 0.15, axle_y - 0.16), (cx + 0.4, axle_y - 0.24), (cx - 0.4, axle_y - 0.24), (cx - half + 0.15, axle_y - 0.16)]
        parts.append(prism(prof, zf - 0.05, zf + 0.05, STEEL))
        for k in (-1, 0, 1):
            parts.append(cylinder(0.05, axle_y - 0.22, axle_y - 0.04, (cx + k * 0.12, 0, s * 0.92), "y", STEEL, 8))
        for ax in (-1, 1):
            parts.append(box((cx + ax * wheelbase / 2 - 0.11, axle_y - 0.08, s * 0.98 - 0.07), (cx + ax * wheelbase / 2 + 0.11, axle_y + 0.1, s * 0.98 + 0.07), STEEL, 0.01))
    parts.append(box((cx - 0.2, axle_y - 0.04, -1.05), (cx + 0.2, frame_y - 0.02, 1.05), STEEL, 0.01))
    for ax in (-1, 1):
        x = cx + ax * wheelbase / 2
        parts.append(cylinder(0.07, -0.9, 0.9, (x, axle_y, 0), "z", STEEL, 10))
        for s in (-1, 1):
            z = s * RAIL_HALF_GAUGE
            parts.append(cylinder(wheel_r, z - 0.06, z + 0.06, (x, axle_y, 0), "z", WHEEL, 24))
            # The flange, on the inside of the rail.
            fz = z - s * 0.075
            parts.append(cylinder(wheel_r + 0.025, fz - 0.015, fz + 0.015, (x, axle_y, 0), "z", WHEEL, 24))
    return parts


def underframe(length):
    """A freight car's underframe, `length` m long: sills, a fish-belly centre sill, couplers, brake gear and two bogies."""
    h = length / 2
    parts = [
        # The deck plate's underside, so nothing shows through from below.
        box((-h, DECK_BOTTOM - 0.04, -CAR_HALF), (h, DECK_BOTTOM, CAR_HALF), STEEL),
        # Side sills and headstocks.
        box((-h, 0.74, CAR_HALF - 0.1), (h, DECK_BOTTOM - 0.04, CAR_HALF), STEEL, 0.01),
        box((-h, 0.74, -CAR_HALF), (h, DECK_BOTTOM - 0.04, -CAR_HALF + 0.1), STEEL, 0.01),
        box((h - 0.16, 0.7, -CAR_HALF), (h, DECK_BOTTOM - 0.04, CAR_HALF), STEEL, 0.01),
        box((-h, 0.7, -CAR_HALF), (-h + 0.16, DECK_BOTTOM - 0.04, CAR_HALF), STEEL, 0.01),
        # The centre sill, deepest in the middle.
        prism([(-h + 0.16, 0.8), (h - 0.16, 0.8), (h - 0.16, DECK_BOTTOM - 0.04), (-h + 0.16, DECK_BOTTOM - 0.04)], -0.2, 0.2, STEEL),
        prism([(-h * 0.45, 0.8), (-h * 0.25, 0.56), (h * 0.25, 0.56), (h * 0.45, 0.8)], -0.18, 0.18, STEEL),
    ]
    for x in (-h * 0.5, -h * 0.15, h * 0.15, h * 0.5):
        parts.append(box((x - 0.08, 0.84, -CAR_HALF + 0.1), (x + 0.08, DECK_BOTTOM - 0.04, CAR_HALF - 0.1), STEEL))
    for s in (-1, 1):
        # Couplers: shank and knuckle, inside the car's length.
        parts.append(box((s * (h - 0.42), 0.74, -0.1), (s * (h - 0.02), 0.86, 0.1), STEEL, 0.01))
        parts.append(box((s * (h - 0.18), 0.68, -0.17), (s * h, 0.92, 0.17), STEEL, 0.02))
    # Brake cylinder and air reservoir.
    parts.append(cylinder(0.13, -0.3, 0.3, (0, 0.82, -0.62), "x", STEEL, 14))
    parts.append(cylinder(0.16, -1.4, -0.4, (0, 0.8, 0.62), "x", STEEL, 14))
    bx = h - 1.9 if length >= 12 else h - 1.6
    for s in (-1, 1):
        parts += bogie(s * bx, 0.36, 1.72, 0.84)
    return asset(f"frame-{length}", parts)


def tank_car():
    """A tank car's barrel and its saddles, over a 12 m car (the underframe is frame-12)."""
    r, cy = 1.32, 2.4
    parts = [barrel(r, 5.2, 0.4, cy, TANK_BLACK)]
    for x in (-4.4, 4.4):
        parts.append(box((x - 0.35, 1.1, -0.62), (x + 0.35, cy - r + 0.12, 0.62), STEEL))
    # Bands round the barrel, and a placard each side.
    for x in (-3.6, 0.0, 3.6):
        parts.append(cylinder(r + 0.012, x - 0.04, x + 0.04, (0, cy, 0), "x", STEEL, 32))
    for s in (-1, 1):
        parts.append(box((-0.32, cy - 0.3, s * (r - 0.02) - 0.01), (0.32, cy + 0.3, s * (r + 0.015)), PLACARD))
    return asset("tank-car", parts)


def depot_tank():
    """A storage tank lying on its plinth, 10 m long, on two saddles."""
    r, cy = 1.5, 2.1
    parts = [barrel(r, 4.5, 0.45, cy, TANK_SILVER)]
    for x in (-3.0, 3.0):
        parts.append(box((x - 0.3, 0.6, -0.7), (x + 0.3, cy - r + 0.25, 0.7), STEEL))
    for x in (-2.2, 2.2):
        parts.append(cylinder(r + 0.012, x - 0.05, x + 0.05, (0, cy, 0), "x", STEEL, 32))
    # A manway on top.
    parts.append(cylinder(0.32, cy + r - 0.08, cy + r + 0.03, (1.5, 0, 0), "y", STEEL, 20))
    return asset("depot-tank", parts)


def loco():
    """The shunting locomotive: frame and bogies, the long hood (west) and the cab (east), 12 m long."""
    parts = [
        # Frame: deck underside, sills, a fuel tank between the bogies and the end beams with their ploughs.
        box((-6, 1.06, -1.4), (6, 1.1, 1.4), STEEL),
        box((-6, 0.86, 1.28), (6, 1.06, 1.4), LOCO_CAB, 0.01),
        box((-6, 0.86, -1.4), (6, 1.06, -1.28), LOCO_CAB, 0.01),
        box((-1.9, 0.48, -1.05), (1.9, 0.98, 1.05), STEEL, 0.06),
    ]
    for s in (-1, 1):
        parts.append(prism([(s * 5.75, 1.06), (s * 6, 1.06), (s * 6, 0.62), (s * 5.75, 0.4)] if s > 0 else [(s * 6, 1.06), (s * 5.75, 1.06), (s * 5.75, 0.4), (s * 6, 0.62)], -1.4, 1.4, LOCO_CAB))
        parts += bogie(s * 3.6, 0.4, 2.0, 0.98)
    # The hood, with door seams, radiator grilles at the west end and fan grilles on top.
    hood = box((-5.8, 1.2, -1.1), (2.0, 3.6, 1.1), LOCO, 0.12)
    parts.append(hood)
    for s in (-1, 1):
        z = s * 1.1
        for x in (-3.8, -2.0, -0.2):
            parts.append(box((x - 0.015, 1.4, z - 0.01), (x + 0.015, 3.3, z + 0.01), GRILLE))
        parts.append(box((-5.55, 2.3, z - 0.012), (-4.2, 3.35, z + 0.012), GRILLE))
    for x in (-5.0, -3.6):
        parts.append(cylinder(0.5, 3.6 - 0.01, 3.62, (x, 0, 0), "y", GRILLE, 20))
    parts.append(cylinder(0.12, 3.58, 3.64, (-1.2, 0, 0), "y", STEEL, 12))
    # The cab, windows all round.
    parts.append(box((2.0, 1.2, -1.4), (5.8, 4.2, 1.4), LOCO_CAB, 0.08))
    parts.append(box((1.97, 4.12, -1.43), (5.83, 4.2, 1.43), LOCO, 0.02))
    for s in (-1, 1):
        z = s * 1.41
        parts.append(box((2.4, 2.9, z - 0.012), (3.7, 3.8, z + 0.012), WINDOW))
        parts.append(box((4.1, 2.9, z - 0.012), (5.4, 3.8, z + 0.012), WINDOW))
        parts.append(box((5.8, 3.0, s * 0.18), (5.815, 3.85, s * 1.15), WINDOW))
        parts.append(box((1.985, 3.68, s * 0.25), (2.0, 4.02, s * 1.2), WINDOW))
        # Headlights, off.
        parts.append(cylinder(0.12, 5.8, 5.83, (0, 2.4, s * 0.7), "x", WINDOW, 14))
        parts.append(cylinder(0.12, -5.83, -5.8, (0, 3.2, s * 0.6), "x", WINDOW, 14))
    return asset("loco", parts)


def deck(length):
    """A wagon's deck plate (DECK_BOTTOM up to CAR_FLOOR), with a lip along each side: what a car of the yard has as a plain solid."""
    h = length / 2
    parts = [box((-h, DECK_BOTTOM, -CAR_HALF), (h, CAR_FLOOR - 0.02, CAR_HALF), STEEL)]
    for s in (-1, 1):
        parts.append(box((-h, CAR_FLOOR - 0.02, s * CAR_HALF - 0.06), (h, CAR_FLOOR, s * CAR_HALF + 0.0), STEEL))
    parts.append(box((-h + 0.06, CAR_FLOOR - 0.02, -CAR_HALF + 0.06), (h - 0.06, CAR_FLOOR, CAR_HALF - 0.06), STEEL))
    return parts


def boxcar(paint):
    """A 12 m boxcar's body in `paint`, on its deck: ribbed sides, a sliding door each side, a crowned roof with a walkway, ladders at the corners."""
    h, top = 5.95, 4.0
    body = CAR[paint]
    parts = deck(12)
    parts.append(box((-h, CAR_FLOOR, -1.42), (h, top, 1.42), body, 0.03))
    # The roof: a low crown and a running board along its ridge.
    parts.append(prism([(-h - 0.03, top), (h + 0.03, top), (h + 0.03, top + 0.06), (-h - 0.03, top + 0.06)], -1.47, 1.47, ROOF))
    parts.append(prism([(-h, top + 0.06), (h, top + 0.06), (h, top + 0.16), (-h, top + 0.16)], -0.9, 0.9, ROOF))
    parts.append(box((-h + 0.2, top + 0.16, -0.28), (h - 0.2, top + 0.2, 0.28), STEEL))
    for s in (-1, 1):
        z = s * 1.42
        # Side ribs, but not across the door.
        for x in [-5.4 + 0.9 * k for k in range(13)]:
            if abs(x) < 1.4:
                continue
            parts.append(box((x - 0.04, CAR_FLOOR + 0.05, z - 0.03 if s < 0 else z), (x + 0.04, top - 0.05, z + 0.03 if s > 0 else z), body))
        # The door, a little proud, on its top and bottom tracks.
        zo = z + s * 0.06
        parts.append(box((-1.25, CAR_FLOOR + 0.08, min(z, zo)), (1.25, top - 0.15, max(z, zo)), body, 0.01))
        parts.append(box((-2.6, top - 0.18, min(z, zo + s * 0.02)), (1.4, top - 0.1, max(z, zo + s * 0.02)), STEEL))
        parts.append(box((-2.6, CAR_FLOOR, min(z, zo + s * 0.02)), (1.4, CAR_FLOOR + 0.08, max(z, zo + s * 0.02)), STEEL))
        for x in (-1.0, 1.0):
            parts.append(box((x - 0.03, 2.0, min(zo, zo + s * 0.05)), (x + 0.03, 2.7, max(zo, zo + s * 0.05)), STEEL))
        # A ladder at one corner each side.
        lx = s * (h - 0.35)
        for k in range(7):
            y = CAR_FLOOR + 0.35 + k * 0.4
            parts.append(box((lx - 0.22, y - 0.015, min(z, z + s * 0.12)), (lx + 0.22, y + 0.015, max(z, z + s * 0.12)), STEEL))
    # End posts.
    for s in (-1, 1):
        for z in (-1.0, 0.0, 1.0):
            parts.append(box((min(s * h, s * (h + 0.04)), CAR_FLOOR, z - 0.06), (max(s * h, s * (h + 0.04)), top, z + 0.06), body))
    return asset(f"boxcar-{paint.split('.')[1]}", parts)


def hopper():
    """A 12 m covered hopper: a deep body with sloping ends, ribbed sides, loading hatches along its roof."""
    h, top = 5.95, 3.9
    body = CAR["car.grey"]
    parts = deck(12)
    parts.append(prism([(-h, CAR_FLOOR), (h, CAR_FLOOR), (h, top - 0.5), (h - 0.6, top), (-h + 0.6, top), (-h, top - 0.5)], -1.42, 1.42, body, 0.03))
    for s in (-1, 1):
        z = s * 1.42
        for x in [-4.8 + 1.2 * k for k in range(9)]:
            parts.append(box((x - 0.05, CAR_FLOOR + 0.1, min(z, z + s * 0.04)), (x + 0.05, top - 0.12, max(z, z + s * 0.04)), body))
        parts.append(box((-h + 0.1, CAR_FLOOR + 0.1, min(z, z + s * 0.05)), (h - 0.1, CAR_FLOOR + 0.3, max(z, z + s * 0.05)), body))
    for x in (-3.6, -1.2, 1.2, 3.6):
        parts.append(cylinder(0.32, top - 0.01, top + 0.12, (x, 0, 0), "y", STEEL, 16))
    parts.append(box((-h + 0.6, top, -0.25), (h - 0.6, top + 0.04, 0.25), STEEL))
    return asset("hopper", parts)


def lamp_head():
    """A sodium lamp's head: a cobra-head housing over a glowing glass bowl, its mount toward -x (the arm)."""
    along, across, height = LAMP_HEAD
    a, c = along / 2, across / 2
    housing = prism([(-a, 0.02), (a - 0.06, 0.03), (a, 0.07), (a - 0.05, height - 0.03), (-a + 0.08, height), (-a, height - 0.04)], -c + 0.01, c - 0.01, LAMP_POST, 0.015)
    glass = prism([(-a + 0.1, -0.035), (a - 0.06, -0.035), (a - 0.03, 0.025), (-a + 0.07, 0.025)], -c + 0.05, c - 0.05, LAMP_GLOW)
    collar = cylinder(0.05, -a - 0.0, -a + 0.1, (0, height - 0.06, 0), "x", LAMP_POST, 12)
    return asset("lamp-head", [housing, glass, collar])


# Each asset's collision solids (game space, relative to its origin): its vertices must stay within TOLERANCE of them.
SOLIDS = {
    "frame-12": [((-6, FRAME_BOTTOM, -CAR_HALF), (6, DECK_BOTTOM, CAR_HALF))],
    "frame-9": [((-4.5, FRAME_BOTTOM, -CAR_HALF), (4.5, DECK_BOTTOM, CAR_HALF))],
    "tank-car": [((-6 + i, lo, -w), (6 - i, hi, w)) for i, w, lo, hi in TANK_STEPS],
    "depot-tank": [((-4.8, 0.6, -0.75), (4.8, 3.6, 0.75)), ((-4.9, 0.8, -1.15), (4.9, 3.4, 1.15)), ((-5.0, 1.2, -1.5), (5.0, 3.0, 1.5))],
    "loco": [((-6, FRAME_BOTTOM, -1.4), (6, 1.1, 1.4)), ((-5.8, 1.2, -1.1), (2, 3.6, 1.1)), ((2, 1.2, -1.4), (5.8, 4.2, 1.4))],
    "lamp-head": [((-LAMP_HEAD[0] / 2, 0, -LAMP_HEAD[1] / 2), (LAMP_HEAD[0] / 2, LAMP_HEAD[2], LAMP_HEAD[1] / 2))],
}


def strays(obj):
    """How far the worst vertex of `obj` lies outside its solids (m), and where (game space)."""
    worst, where = 0.0, None
    for v in obj.data.vertices:
        p = obj.matrix_world @ v.co
        g = (p.x, p.z, -p.y)
        d = min(math.dist(g, [min(max(g[k], lo[k]), hi[k]) for k in range(3)]) for lo, hi in SOLIDS[obj.name])
        if d > worst:
            worst, where = d, [round(x, 3) for x in g]
    return round(worst, 4), where



# ---------------------------------------------------------------- the yard's props
# Made with mapkit: smooth-by-angle shading and ambient occlusion baked into vertex colours.

def K(name, rgb, roughness=0.6, metallic=0.0):
    return mapkit.material(bkit, name, ((rgb >> 16) & 255, (rgb >> 8) & 255, rgb & 255), roughness, metallic)  # noqa: F821


PAINTS = {"blue": K("container", 0x2F5D86, 0.55, 0.3), "red": K("container.red", 0x8E3326, 0.55, 0.3), "green": K("container.green", 0x3D6B4A, 0.55, 0.3), "white": K("container.white", 0xCFCBC0, 0.55, 0.3)}
CRATE = K("crate", 0x9C7A50, 0.8)
CRATE_FRAME = K("crate.frame", 0x6E5537, 0.8)
SLEEPER = K("sleeper", 0x4C3C2E, 0.9)
CABINET = K("cabinet", 0x8A918E, 0.5, 0.2)
SLAB = K("slab", 0xAAA59B, 0.9)
TRUCK = K("truck", 0x8D2F2A, 0.45, 0.1)
TRUCK_BOX = K("truck.box", 0xD8D4C8, 0.5, 0.2)
FORKLIFT = K("forklift", 0xD9A52B, 0.45, 0.1)
TYRE = K("tyre", 0x1E1F21, 0.9)
POLE = K("pole", 0x5E4734, 0.9)
INSULATOR = K("insulator", 0x5F8A7F, 0.2)
RAIL = K("rail", 0x6E6157, 0.7, 0.6)
RAIL_HEAD = K("rail.head", 0xA9A6A2, 0.3, 0.9)
HEADLAMP = K("headlamp", 0xF3EDD0, 0.2)
TAIL_LAMP = K("tail.lamp", 0xB3362C, 0.3)
BEACON = K("beacon", 0xE08A2A, 0.3)

# Shipping containers: name (length in cm) -> (length, width, height, paint). Length runs along the model's +x, its doors at +x.
CONTAINERS = {
    "container-600-blue": (6, 2.6, 2.4, "blue"),
    "container-600-red": (6, 2.6, 2.4, "red"),
    "container-600-green": (6, 2.6, 2.4, "green"),
    "container-720-white": (7.2, 2.3, 2.6, "white"),
    "container-490-red": (4.9, 2.3, 2.6, "red"),
    "container-560-green": (5.6, 2.3, 2.6, "green"),
    "container-520-blue": (5.2, 2.3, 2.6, "blue"),
}
# Crates and crate stacks: footprint (x, z) and height.
CRATES = [(1.2, 1.2, 1.1), (1.2, 1.2, 2.2), (1.4, 1.8, 1.2), (1.2, 1.2, 1.2), (1.2, 1.2, 1.0), (1.2, 1.2, 2.0), (2.3, 2.7, 2.2), (2.3, 2.6, 2.2), (2.3, 2.1, 2.2)]
SLEEPER_STACKS = (1.0, 1.2)
# The tracks' lengths: one model draws both rails of a track.
TRACK_LENGTHS = (82, 61, 14, 90, 44, 320)
BALLAST_H = 0.15
# A telegraph pole's height, and its insulators along the crossarm (z, across the line).
POLE_TOP = 7.5
INSULATORS = (-0.85, -0.3, 0.3, 0.85)


def fmt(v):
    """A size in an asset's name, in whole centimetres (three.js turns dots in node names into underscores)."""
    return str(round(v * 100))


def crate_name(w, d, h):
    return f"crate-{fmt(w)}x{fmt(d)}x{fmt(h)}"


def corrugated(a, b, pitch=0.28, depth=0.035):
    """(position, depth) points from a to b folding in and out: a container wall's trapezoidal corrugations."""
    n = max(2, round((b - a) / pitch))
    step = (b - a) / n
    pts = []
    for k in range(n):
        x = a + k * step
        pts += [(x, 0.0), (x + step * 0.18, depth), (x + step * 0.5, depth), (x + step * 0.68, 0.0)]
    return pts + [(b, 0.0)]


def container(name, length, width, height, paint):
    """A shipping container: corrugated sides and blind end, corner posts and castings, top and bottom rails, and
    a pair of doors at +x with their locking bars."""
    h, w = length / 2, width / 2
    mat = PAINTS[paint]
    post, rail, inset = 0.15, 0.14, 0.02
    parts = []
    # The shell between the rails: a plan outline whose long sides and blind end fold in and out.
    side = corrugated(-h + post, h - post)
    end = corrugated(-w + post, w - post)
    outline = [(x, -w + inset + d) for x, d in side]
    outline += [(h - 0.06, -w + post), (h - 0.06, w - post)]
    outline += [(x, w - inset - d) for x, d in reversed(side)]
    outline += [(-h + inset + d, z) for z, d in reversed(end)]
    parts.append(kit.plan(outline, rail, height - rail, mat))
    # Roof panel and the floor's underside.
    parts.append(kit.box((-h + post, height - rail, -w + 0.05), (h - post, height - 0.03, w - 0.05), mat))
    parts.append(kit.box((-h + post, 0.06, -w + 0.05), (h - post, rail, w - 0.05), K_STEEL))
    # Corner posts with their castings top and bottom.
    for sx in (-1, 1):
        for sz in (-1, 1):
            x0, x1 = sorted((sx * h, sx * (h - post)))
            z0, z1 = sorted((sz * w, sz * (w - post)))
            parts.append(kit.box((x0, 0.12, z0), (x1, height - 0.12, z1), mat, 0.012, 1))
            for y0, y1 in ((0, 0.12), (height - 0.12, height)):
                parts.append(kit.box((x0, y0, z0), (x1, y1, z1), K_STEEL, 0.01, 1))
    # Top and bottom side rails, and the end rails.
    for sz in (-1, 1):
        z0, z1 = sorted((sz * w, sz * (w - 0.07)))
        for y0, y1 in ((0, rail), (height - rail, height)):
            parts.append(kit.box((-h + post, y0, z0), (h - post, y1, z1), mat, 0.01, 1))
    for y0, y1 in ((0, rail), (height - rail, height)):
        parts.append(kit.box((-h, y0, -w + post), (-h + 0.08, y1, w - post), mat, 0.01, 1))
        parts.append(kit.box((h - 0.1, y0, -w + post), (h, y1, w - post), mat, 0.01, 1))
    # The doors: two ribbed leaves, each with two locking bars and their cams, a handle on each bar, and hinges.
    for s in (-1, 1):
        z0, z1 = sorted((0.006 * s, s * (w - post)))
        parts.append(kit.box((h - 0.07, rail, z0), (h - 0.035, height - rail, z1), mat, 0.008, 1))
        for k in range(3):
            y = rail + 0.25 + k * (height - 2 * rail - 0.5) / 2
            parts.append(kit.box((h - 0.04, y - 0.04, z0 + 0.04), (h - 0.025, y + 0.04, z1 - 0.04), mat))
        for t in (0.3, 0.72):
            z = s * (w - post) * t
            parts.append(kit.cylinder(0.018, rail - 0.04, height - rail + 0.04, (h - 0.012, 0, z), "y", K_STEEL, 8))
            hz0, hz1 = sorted((z - s * 0.012, z + s * 0.15))
            parts.append(kit.box((h - 0.03, 1.0, hz0), (h, 1.04, hz1), K_STEEL))
            for y in (rail - 0.03, height - rail - 0.03):
                parts.append(kit.box((h - 0.035, y, z - 0.035), (h, y + 0.06, z + 0.035), K_STEEL))
        for k in range(4):
            y = rail + 0.15 + k * (height - 2 * rail - 0.37) / 3
            parts.append(kit.box((h - 0.04, y, s * (w - post) - 0.03), (h, y + 0.07, s * (w - post) + 0.03), K_STEEL))
    # Vents high on each side, near the ends.
    for sx in (-1, 1):
        for sz in (-1, 1):
            z0, z1 = sorted((sz * (w - inset), sz * (w - inset + 0.02)))
            parts.append(kit.box((sx * (h - 0.45) - 0.12, height - rail - 0.16, z0), (sx * (h - 0.45) + 0.12, height - rail - 0.06, z1), K_STEEL))
    return kit.asset(name, parts, smooth_angle=35)


def one_crate(x0, x1, z0, z1, y0, y1, parts, hidden=()):
    """A plank crate filling (x0..x1, y0..y1, z0..z1): a dark core, planks on its sides and lid, battens round its edges
    and a brace across each side. Sides in `hidden` ("x0", "x1", "z0", "z1", "top") are against another crate: no planks there."""
    t, b = 0.025, 0.07
    parts.append(kit.box((x0 + t, y0 + 0.02, z0 + t), (x1 - t, y1 - t, z1 - t), CRATE_FRAME))
    # Planks run level on the sides and along x on the lid, with hairline gaps between them.
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
    # Battens along the twelve edges.
    for ya, yb in ((y0, y0 + b), (y1 - b, y1)):
        for za, zb in ((z0, z0 + b), (z1 - b, z1)):
            parts.append(kit.box((x0, ya, za), (x1, yb, zb), CRATE_FRAME))
        for xa, xb in ((x0, x0 + b), (x1 - b, x1)):
            parts.append(kit.box((xa, ya, z0 + b), (xb, yb, z1 - b), CRATE_FRAME))
    for xa, xb in ((x0, x0 + b), (x1 - b, x1)):
        for za, zb in ((z0, z0 + b), (z1 - b, z1)):
            parts.append(kit.box((xa, y0 + b, za), (xb, y1 - b, zb), CRATE_FRAME))
    # A diagonal brace across each open side.
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
                # The upper crates a touch smaller and set off-centre, so the stack reads as stacked.
                shrink = 0.05 * k
                x0 = -w / 2 + i * w / nx + (gap if i else 0) + shrink
                x1 = -w / 2 + (i + 1) * w / nx - (gap if i < nx - 1 else 0) - shrink * 0.4
                z0 = -d / 2 + j * d / nz + (gap if j else 0) + shrink * 0.4
                z1 = -d / 2 + (j + 1) * d / nz - (gap if j < nz - 1 else 0) - shrink
                hidden = [n for n, inner in (("x0", i > 0), ("x1", i < nx - 1), ("z0", j > 0), ("z1", j < nz - 1), ("top", k < ny - 1)) if inner]
                one_crate(x0, x1, z0, z1, k * h / ny, (k + 1) * h / ny, parts, hidden)
    return kit.asset(crate_name(w, d, h), parts, smooth_angle=35)


def sleeper_stack(height):
    """Old sleepers stacked for reuse, 2.6 m long along x and 1.2 m across: four to a layer on crosswise spacers."""
    parts = []
    layer = 0.2
    for k in range(round(height / layer)):
        y = k * layer
        for x in (-0.95, 0.95):
            parts.append(kit.box((x - 0.05, y, -0.58), (x + 0.05, y + 0.05, 0.58), SLEEPER, 0.008, 1))
        for i in range(4):
            jitter = math.sin(k * 7.1 + i * 3.3) * 0.03
            z = -0.45 + i * 0.3
            parts.append(kit.box((-1.27 + jitter, y + 0.05, z - 0.125), (1.27 + jitter, y + 0.2, z + 0.125), SLEEPER, 0.018, 2))
    return kit.asset(f"sleeper-stack-{fmt(height)}", parts, smooth_angle=40)


def cabinet(name, w, d, h):
    """A lineside relay cabinet, doors toward +z: a concrete plinth, a steel case under a sloped, overhanging lid, louvres on its ends."""
    top = h - 0.1
    parts = [kit.box((-w / 2 + 0.06, 0, -d / 2 + 0.06), (w / 2 - 0.06, 0.15, d / 2 - 0.06), SLAB, 0.01, 1)]
    parts.append(kit.box((-w / 2 + 0.03, 0.15, -d / 2 + 0.03), (w / 2 - 0.03, top, d / 2 - 0.03), CABINET, 0.012, 1))
    parts.append(kit.section([(top, -d / 2), (top, d / 2), (top + 0.05, d / 2), (h, -d / 2)], -w / 2, w / 2, CABINET, 0.01, 1))
    leaves = 2 if w > 1.2 else 1
    lw = (w - 0.1) / leaves
    mid = (top + 0.22) / 2
    for i in range(leaves):
        x0 = -w / 2 + 0.05 + i * lw + 0.01
        x1 = x0 + lw - 0.02
        parts.append(kit.box((x0, 0.22, d / 2 - 0.03), (x1, top - 0.06, d / 2 - 0.012), CABINET, 0.006, 1))
        hx = x0 + 0.06 if leaves == 2 and i == 1 else x1 - 0.06
        parts.append(kit.box((hx - 0.015, mid - 0.08, d / 2 - 0.012), (hx + 0.015, mid + 0.08, d / 2 + 0.01), K_STEEL))
    for s in (-1, 1):
        x0, x1 = sorted((s * (w / 2 - 0.03), s * (w / 2 - 0.012)))
        for k in range(4):
            y = top - 0.25 - k * 0.07
            parts.append(kit.box((x0, y, -d / 4), (x1, y + 0.035, d / 4), K_GRILLE))
    return kit.asset(name, parts, smooth_angle=40)


def box_truck():
    """A box truck parked on the service road, nose toward +x: a cab-over cab, a box body with a roll-up door at the back, dual rear wheels."""
    parts = []
    # Chassis rails, a fuel tank and a battery box between the wheels.
    for s in (-1, 1):
        parts.append(kit.box((-3.95, 0.62, s * 0.42 - 0.05), (3.85, 0.86, s * 0.42 + 0.05), K_STEEL))
    parts.append(kit.cylinder(0.24, -0.9, 0.5, (0, 0.62, -0.85), "x", K_STEEL, 16))
    parts.append(kit.box((0.7, 0.45, 0.62), (1.3, 0.85, 1.05), K_STEEL, 0.02, 1))
    # Wheels: singles at the front, duals at the back.
    r = 0.47
    for s in (-1, 1):
        parts += kit.wheel(2.85, r, s * 1.08, r, 0.3, TYRE, K_STEEL, K_STEEL, 20, 0.62, s)
        parts += kit.wheel(-2.3, r, s * 1.08, r, 0.3, TYRE, K_STEEL, K_STEEL, 20, 0.62, s)
        parts += kit.wheel(-2.3, r, s * 0.76, r, 0.3, TYRE, K_STEEL, None, 20, 0.62, -s)
    # The box: a floor sill, walls with posts, the roof, the frame round the roll-up door, a rear bumper and lights.
    parts.append(kit.box((-4.0, 1.0, -1.25), (1.8, 1.2, 1.25), K_STEEL, 0.01, 1))
    parts.append(kit.box((-3.95, 1.2, -1.22), (1.75, 3.35, 1.22), TRUCK_BOX, 0.03, 2))
    parts.append(kit.box((-4.0, 3.3, -1.25), (1.8, 3.4, 1.25), TRUCK_BOX, 0.02, 1))
    for x in [-3.6 + 0.6 * k for k in range(9)]:
        for s in (-1, 1):
            z0, z1 = sorted((s * 1.22, s * 1.25))
            parts.append(kit.box((x - 0.03, 1.2, z0), (x + 0.03, 3.3, z1), TRUCK_BOX))
    for s in (-1, 1):
        z0, z1 = sorted((s * 1.25, s * 1.13))
        parts.append(kit.box((-4.0, 1.2, z0), (-3.92, 3.3, z1), TRUCK_BOX))
    for k in range(14):
        y = 1.3 + k * 0.14
        parts.append(kit.box((-3.99, y, -1.12), (-3.96, y + 0.11, 1.12), TRUCK_BOX))
    parts.append(kit.box((-4.0, 0.55, -1.2), (-3.85, 0.72, 1.2), K_STEEL, 0.01, 1))
    for s in (-1, 1):
        parts.append(kit.box((-4.0, 1.05, s * 1.05 - 0.07), (-3.97, 1.17, s * 1.05 + 0.07), TAIL_LAMP))
        parts.append(kit.box((-2.95, 0.2, s * 0.92 - 0.2), (-2.92, 0.75, s * 0.92 + 0.2), TYRE))
    # The cab: a flat nose with grille and lamps, a raked windscreen, side windows, steps and mirrors, a bumper below.
    parts.append(kit.prism([(2.0, 1.05), (3.98, 1.05), (3.98, 2.05), (3.82, 2.15), (3.5, 2.78), (2.0, 2.8)], -1.14, 1.14, TRUCK, 0.05, 2))
    parts.append(kit.prism([(3.86, 2.16), (3.88, 2.18), (3.56, 2.76), (3.54, 2.74)], -1.0, 1.0, K_WINDOW))
    parts.append(kit.box((3.98, 1.25, -0.6), (4.0, 1.8, 0.6), K_GRILLE))
    for s in (-1, 1):
        parts.append(kit.cylinder(0.1, 3.98, 4.01, (0, 1.55, s * 0.85), "x", HEADLAMP, 14))
        z0, z1 = sorted((s * 1.14, s * 1.155))
        parts.append(kit.box((2.4, 1.95, z0), (3.45, 2.6, z1), K_WINDOW))
        parts.append(kit.box((2.3, 1.15, z0), (2.35, 2.55, z1), K_GRILLE))
        parts.append(kit.box((2.5, 0.75, s * 1.0 - 0.12), (3.3, 0.8, s * 1.0 + 0.12), K_STEEL))
        mz0, mz1 = sorted((s * 1.14, s * 1.18))
        parts.append(kit.box((3.6, 2.2, mz0), (3.64, 2.24, mz1), K_STEEL))
        parts.append(kit.box((3.58, 1.95, s * 1.18 - 0.02), (3.66, 2.35, s * 1.18 + 0.02), K_STEEL))
    parts.append(kit.box((3.85, 0.62, -1.18), (4.03, 0.98, 1.18), K_STEEL, 0.02, 1))
    return kit.asset("box-truck", parts, smooth_angle=40)


def forklift():
    """A counterbalance forklift, forks toward +x and lowered: yellow body, grey counterweight, overhead guard, mast and carriage."""
    parts = [kit.box((-0.6, 0.18, -0.52), (0.52, 0.95, 0.52), FORKLIFT, 0.05, 2)]
    parts.append(kit.prism([(-0.8, 0.18), (-0.55, 0.18), (-0.55, 1.2), (-0.72, 1.15), (-0.8, 0.95)], -0.55, 0.55, K_STEEL, 0.06, 2))
    # Seat, dash and steering wheel.
    parts.append(kit.box((-0.5, 0.95, -0.25), (-0.15, 1.05, 0.25), K_GRILLE, 0.03, 2))
    parts.append(kit.box((-0.52, 1.05, -0.25), (-0.44, 1.45, 0.25), K_GRILLE, 0.03, 2))
    parts.append(kit.box((0.05, 0.95, -0.45), (0.5, 1.1, 0.45), FORKLIFT, 0.04, 2))
    parts.append(kit.cylinder(0.025, 1.1, 1.35, (0.25, 0, 0), "y", K_STEEL, 8))
    parts.append(kit.lathe([(-0.02, 0.17), (0.0, 0.18), (0.02, 0.17), (0.0, 0.15), (-0.02, 0.17)], (0.25, 1.37, 0), K_GRILLE, 16, "y"))
    for s in (-1, 1):
        parts += kit.wheel(0.3, 0.3, s * 0.45, 0.3, 0.2, TYRE, FORKLIFT, None, 18, 0.55, s)
        parts += kit.wheel(-0.5, 0.25, s * 0.45, 0.25, 0.18, TYRE, FORKLIFT, None, 18, 0.55, s)
    # The overhead guard: four posts and a slatted roof.
    for x in (-0.62, 0.38):
        for s in (-1, 1):
            parts.append(kit.box((x - 0.03, 0.95, s * 0.5 - 0.03), (x + 0.03, 2.04, s * 0.5 + 0.03), K_GRILLE, 0.008, 1))
    for s in (-1, 1):
        parts.append(kit.box((-0.65, 2.0, s * 0.5 - 0.04), (0.42, 2.08, s * 0.5 + 0.04), K_GRILLE, 0.008, 1))
    for k in range(6):
        x = -0.55 + k * 0.18
        parts.append(kit.box((x - 0.025, 2.02, -0.46), (x + 0.025, 2.06, 0.46), K_GRILLE))
    # The mast: two channels, cross ties and the lift cylinder; the carriage and the forks.
    for s in (-1, 1):
        parts.append(kit.box((0.56, 0.12, s * 0.38 - 0.05), (0.66, 2.1, s * 0.38 + 0.05), K_STEEL, 0.008, 1))
    for y in (0.5, 1.4, 2.04):
        parts.append(kit.box((0.58, y, -0.34), (0.64, y + 0.06, 0.34), K_STEEL))
    parts.append(kit.cylinder(0.045, 0.2, 1.9, (0.6, 0, 0), "y", K_STEEL, 10))
    parts.append(kit.box((0.68, 0.1, -0.46), (0.74, 0.62, 0.46), K_STEEL, 0.01, 1))
    for y in (0.14, 0.52):
        parts.append(kit.box((0.66, y, -0.48), (0.76, y + 0.06, 0.48), K_STEEL))
    for z in (-0.25, 0.25):
        parts.append(kit.box((0.74, 0.03, z - 0.05), (0.79, 0.6, z + 0.05), K_STEEL, 0.006, 1))
        parts.append(kit.prism([(0.74, 0.03), (1.8, 0.03), (1.8, 0.05), (1.7, 0.08), (0.74, 0.08)], z - 0.05, z + 0.05, K_STEEL))
    parts.append(kit.cylinder(0.05, 2.08, 2.14, (-0.55, 0, 0), "y", BEACON, 12))
    return kit.asset("forklift", parts, smooth_angle=40)


def lamp_post():
    """A sodium lamp's post, 7.4 m: a cast base, a tapered round shaft and a tube arm reaching 1.2 m toward +x (the head is `lamp-head`)."""
    parts = [kit.lathe([(0.0, 0.145), (0.3, 0.145), (0.34, 0.11), (0.5, 0.1), (0.54, 0.088), (7.3, 0.062), (7.34, 0.075), (7.4, 0.06), (7.4, 0.0)], (0, 0, 0), K_POST, 20, "y")]
    parts.append(kit.cylinder(0.04, 0.0, 1.22, (0, 7.29, 0), "x", K_POST, 12))
    parts.append(kit.cylinder(0.05, 1.12, 1.24, (0, 7.29, 0), "x", K_POST, 12))
    parts.append(kit.box((0.06, 0.7, -0.06), (0.105, 1.1, 0.06), K_POST, 0.008, 1))
    return kit.asset("lamp-post", parts, smooth_angle=50)


def telegraph_pole():
    """A creosoted telegraph pole beyond the barrier: a tapered round pole, a crossarm across the line, green glass insulators on it."""
    parts = [kit.lathe([(0.0, 0.13), (6.0, 0.115), (POLE_TOP - 0.05, 0.1), (POLE_TOP, 0.07), (POLE_TOP, 0.0)], (0, 0, 0), POLE, 14, "y")]
    parts.append(kit.box((-0.055, 6.9, -1.0), (0.055, 7.05, 1.0), POLE, 0.01, 1))
    for z in INSULATORS:
        parts.append(kit.cylinder(0.012, 7.05, 7.1, (0, 0, z), "y", K_STEEL, 6))
        parts.append(kit.lathe([(7.08, 0.0), (7.08, 0.045), (7.12, 0.048), (7.15, 0.03), (7.2, 0.032), (7.24, 0.022), (7.25, 0.0)], (0, 0, z), INSULATOR, 12, "y"))
    return kit.asset("telegraph-pole", parts, smooth_angle=50)


def track_rails(length):
    """Both rails of a track `length` m long along x, on the ballast at gauge: flat-bottomed rail with a bright, worn head."""
    h = length / 2
    prof = [(0.15, -0.075), (0.15, 0.075), (0.16, 0.075), (0.175, 0.01), (0.245, 0.01), (0.258, 0.035), (0.284, 0.035), (0.284, -0.035), (0.258, -0.035), (0.245, -0.01), (0.175, -0.01), (0.16, -0.075)]
    parts = []
    for s in (-1, 1):
        z = s * RAIL_HALF_GAUGE
        parts.append(kit.section([(y, z + dz) for y, dz in prof], -h, h, RAIL))
        parts.append(kit.section([(0.284, z - 0.032), (0.284, z + 0.032), (0.29, z + 0.026), (0.29, z - 0.026)], -h, h, RAIL_HEAD))
    return kit.asset(f"track-{fmt(length)}", parts, smooth_angle=30)


K_STEEL = K("steel", 0x3A3D40, 0.6, 0.3)
K_GRILLE = K("grille", 0x26292B, 0.7, 0.3)
K_WINDOW = K("window", 0x1C2A33, 0.1)
K_POST = K("lamp.post", 0x4A5048, 0.55, 0.3)

props = [container(n, *spec) for n, spec in CONTAINERS.items()]
props += [crate(*c) for c in CRATES]
props += [sleeper_stack(hh) for hh in SLEEPER_STACKS]
props += [cabinet("relay-cabinet", 0.8, 0.6, 1.4), cabinet("location-case", 2.0, 1.0, 1.0), box_truck(), forklift(), lamp_post(), telegraph_pole()]
tracks = [track_rails(n) for n in TRACK_LENGTHS]

SOLIDS.update({name: [((-l / 2, 0, -w / 2), (l / 2, hh, w / 2))] for name, (l, w, hh, _) in CONTAINERS.items()})
SOLIDS.update({crate_name(w, d, hh): [((-w / 2, 0, -d / 2), (w / 2, hh, d / 2))] for w, d, hh in CRATES})
SOLIDS.update({f"sleeper-stack-{fmt(hh)}": [((-1.3, 0, -0.6), (1.3, hh, 0.6))] for hh in SLEEPER_STACKS})
SOLIDS.update({
    "relay-cabinet": [((-0.4, 0, -0.3), (0.4, 1.4, 0.3))],
    "location-case": [((-1.0, 0, -0.5), (1.0, 1.0, 0.5))],
    "box-truck": [((-4, 0, -1.25), (4, 1.1, 1.25)), ((-4, 1.1, -1.25), (1.8, 3.4, 1.25)), ((2, 1.1, -1.15), (4, 2.8, 1.15))],
    "forklift": [((-0.8, 0, -0.6), (0.8, 2.1, 0.6)), ((0.8, 0, -0.4), (1.8, 0.1, 0.4))],
    "lamp-post": [((-0.1, 0, -0.1), (0.1, 7.4, 0.1)), ((-0.05, 7.22, -0.05), (1.25, 7.36, 0.05))],
    "telegraph-pole": [((-0.13, 0, -0.13), (0.13, POLE_TOP, 0.13)), ((-0.06, 6.9, -1.0), (0.06, 7.05, 1.0))] + [((-0.05, 7.05, z - 0.05), (0.05, 7.25, z + 0.05)) for z in INSULATORS],
})
SOLIDS.update({f"track-{fmt(n)}": [((-n / 2, BALLAST_H, s * RAIL_HALF_GAUGE - 0.035), (n / 2, BALLAST_H + 0.14, s * RAIL_HALF_GAUGE + 0.035)) for s in (-1, 1)] for n in TRACK_LENGTHS})

built = [underframe(12), underframe(9), tank_car(), depot_tank(), loco(), lamp_head()]
# The train's: placed only on the train, which collides with nothing.
train = [boxcar("car.oxide"), boxcar("car.brown"), boxcar("car.teal"), hopper(), asset("deck-12", deck(12))]
# The rolling stock gets crease occlusion too, its panels split up so the occlusion can vary across them.
for o in built + train:
    kit.densify(o)
kit.bake_ao(built + train + props, distance=0.6)
report = {}
for o in train:
    report[o.name] = {"tris": kit.tris(o)}
for o in built + props + tracks:
    worst, where = kit.strays(o, SOLIDS[o.name])
    report[o.name] = {"tris": kit.tris(o), "outside": worst, **({"at": where} if worst > TOLERANCE else {})}
result = {"assets": report, "issues": [n for n, r in report.items() if r.get("outside", 0) > TOLERANCE]}
if EXPORT:
    path = os.path.join(os.path.dirname(__file__), "..", "..", OUT)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    kit.export(built + train + props + tracks, path)
    result["glb"] = {"path": os.path.abspath(path), "bytes": os.path.getsize(path)}
