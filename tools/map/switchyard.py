"""Build Switchyard's models: freight car underframes, the tank car's barrel,
the depot's tanks, the locomotive and the sodium lamps' heads.

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
import math

import bmesh
import bpy
from mathutils import Matrix, Vector

EXPORT = ARGS.get("export", False)  # noqa: F821 (ARGS comes from bkit.run)
OUT = r"apps/range/public/models/switchyard.glb"
TOLERANCE = 0.05

# The map's numbers (apps/range/src/map/switchyard.ts).
RAIL_TOP = 0.29  # ballast 0.15 + rail 0.14
RAIL_HALF_GAUGE = 0.7175
FRAME_BOTTOM = 0.3
DECK_BOTTOM = 1.0
CAR_HALF = 1.5
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

coll = bpy.data.collections.new("switchyard")
bpy.context.scene.collection.children.link(coll)


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


built = [underframe(12), underframe(9), tank_car(), depot_tank(), loco(), lamp_head()]
report = {}
for o in built:
    worst, where = strays(o)
    report[o.name] = {"tris": sum(len(p.vertices) - 2 for p in o.data.polygons), "outside": worst, **({"at": where} if worst > TOLERANCE else {})}
result = {"assets": report, "issues": [n for n, r in report.items() if r["outside"] > TOLERANCE]}
if EXPORT:
    import os
    bpy.ops.object.select_all(action="DESELECT")
    for o in built:
        o.select_set(True)
    path = os.path.join(os.path.dirname(__file__), "..", "..", OUT)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    bpy.ops.export_scene.gltf(filepath=path, export_format="GLB", use_selection=True, export_apply=True, export_yup=True, export_materials="EXPORT", export_texcoords=False)
    result["glb"] = {"path": path, "bytes": os.path.getsize(path)}
