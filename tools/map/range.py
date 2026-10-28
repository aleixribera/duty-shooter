"""Build the Practice Range's models: the firing line's benches, the distance
boards, the sniping lane's bench and target boards, the signs, the loadout
rack and the mannequin's stand. The range keeps its measuring grid on every
surface; only these props are modelled.

Run in its own Blender (see tools/map/build.py):
    blender -b --factory-startup --python tools/map/build.py -- tools/map/range.py [--export]

Each asset is one object, named as apps/range/src/map/map.ts places it, with
its origin on the ground under its middle, its length along game +x and its
front (where a sign's label sits) toward game +z. The model draws the
collision solids the map ties it to, so it stays within 5 cm of them
(`SOLIDS`, in the map's numbers), and labels sit 1-2 cm in front of the
faces they name, so those faces stay where the solids' were.

Materials are named after the range's finishes (apps/range/src/map/maps.ts).
"""
import importlib
import math
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
import mapkit  # noqa: E402

importlib.reload(mapkit)

EXPORT = ARGS.get("export", False)  # noqa: F821 (ARGS comes from bkit.run)
OUT = os.path.join(os.path.dirname(__file__), "..", "..", "apps", "range", "public", "models", "range.glb")
kit = mapkit.Kit(bkit, "range")  # noqa: F821


def M(name, rgb, roughness=0.6, metallic=0.0):
    return mapkit.material(bkit, name, ((rgb >> 16) & 255, (rgb >> 8) & 255, rgb & 255), roughness, metallic)  # noqa: F821


WOOD = M("prop.wood", 0x8A6644, 0.75)
PLY = M("prop.plywood", 0xC4A575, 0.8)
STEEL = M("prop.steel", 0x3A3F45, 0.5, 0.4)
FRAME = M("prop.frame", 0x2E3A2F, 0.55, 0.2)
SAND = M("prop.sandbag", 0x8B7D5C, 0.95)
RUBBER = M("prop.rubber", 0x1F2022, 0.9)
PLASTIC = M("prop.plastic", 0xE6E0D4, 0.45)
PEG = M("prop.pegboard", 0xB59C78, 0.8)

# Firing benches: (length along x, depth along z), 0.95 m high, the shooter's side toward +z.
BENCHES = [(10, 0.6), (6, 0.6), (14, 0.6), (5, 0.5)]
BENCH_H = 0.95
# Signs on two posts: (width, height), 0.1 m thick, their boards' faces toward +z; the board's bottom edge.
SIGNS = {(2, 3.8): 2.4, (3, 3.8): 2.4, (3, 3.2): 2.0}


def fmt(v):
    """A size in an asset's name, in whole centimetres (three.js turns dots in node names into underscores)."""
    return str(round(v * 100))


def squash(o, centre, sx=1.0, sy=1.0, sz=1.0):
    """Scales a part's mesh about game point `centre` by (sx, sy, sz) along game x, y and z."""
    c = kit.b(centre)
    for v in o.data.vertices:
        d = v.co - c
        v.co = c + type(d)((d.x * sx, d.y * sz, d.z * sy))
    return o


def sandbag(x, y, z, length, r, axis="x"):
    """A sandbag lying along `axis` on height y: a rounded pillow `length` long, flattened to half its width."""
    centre = (x, y + r * 0.55, z)
    o = kit.lathe([(-length / 2, 0.0), (-length / 2 + 0.03, r * 0.75), (-length / 2 + 0.08, r), (length / 2 - 0.08, r), (length / 2 - 0.03, r * 0.75), (length / 2, 0.0)], centre, SAND, 10, axis)
    return squash(o, centre, sy=0.55)


def bench(length, depth):
    """A firing bench: a thick hardwood top on a welded steel frame, a lower shelf, a modesty panel on the shooter's side."""
    h, d = length / 2, depth / 2
    parts = [kit.box((-h, BENCH_H - 0.06, -d), (h, BENCH_H, d), WOOD, 0.012, 2)]
    legs = max(2, round(length / 2) + 1)
    xs = [-h + 0.08 + k * (length - 0.16) / (legs - 1) for k in range(legs)]
    for x in xs:
        for z in (-d + 0.06, d - 0.06):
            parts.append(kit.box((x - 0.03, 0, z - 0.03), (x + 0.03, BENCH_H - 0.06, z + 0.03), STEEL, 0.006, 1))
            parts.append(kit.box((x - 0.05, 0, z - 0.05), (x + 0.05, 0.015, z + 0.05), RUBBER))
        parts.append(kit.box((x - 0.025, 0.25, -d + 0.06), (x + 0.025, 0.3, d - 0.06), STEEL))
    for z in (-d + 0.06, d - 0.06):
        parts.append(kit.box((-h + 0.05, BENCH_H - 0.12, z - 0.025), (h - 0.05, BENCH_H - 0.06, z + 0.025), STEEL))
    # The shelf and the panel facing the shooter.
    parts.append(kit.box((-h + 0.11, 0.3, -d + 0.09), (h - 0.11, 0.33, d - 0.09), PLY))
    parts.append(kit.box((-h + 0.05, 0.45, d - 0.02), (h - 0.05, BENCH_H - 0.12, d), PLY, 0.004, 1))
    return kit.asset(f"bench-{fmt(length)}x{fmt(depth)}", parts, smooth_angle=40)


def distance_board():
    """A distance board, 1.2 m wide and 1.6 m high: two square posts and a painted board on them, its face toward +z."""
    parts = []
    for x in (-0.48, 0.48):
        parts.append(kit.box((x - 0.04, 0, -0.05), (x + 0.04, 1.6, 0.02), FRAME, 0.006, 1))
    parts.append(kit.box((-0.6, 0.95, 0.02), (0.6, 1.6, 0.05), PLY, 0.008, 1))
    parts.append(kit.box((-0.6, 0.93, 0.0), (0.6, 0.97, 0.02), FRAME))
    return kit.asset("distance-board", parts, smooth_angle=40)


def target_board():
    """A sniping target's backer, 1.6 m wide and 2.6 m high: a plywood face on a timber frame, braced to the ground behind and weighed down with sandbags."""
    parts = [kit.box((-0.8, 0.35, 0.06), (0.8, 2.6, 0.1), PLY, 0.008, 1)]
    for x in (-0.72, 0.0, 0.72):
        parts.append(kit.box((x - 0.045, 0, -0.04), (x + 0.045, 2.55, 0.06), WOOD, 0.006, 1))
    for y in (0.6, 1.5, 2.4):
        parts.append(kit.box((-0.78, y - 0.04, -0.04), (0.78, y + 0.04, 0.06), WOOD, 0.006, 1))
    for x in (-0.55, 0.0, 0.55):
        parts.append(sandbag(x, 0.0, 0.0, 0.5, 0.09))
    return kit.asset("target-board", parts, smooth_angle=40)


def sign(width, height, bottom):
    """A sign on two posts, `width` wide and `height` high, its board from `bottom` to the top, its face toward +z (0.1 m deep)."""
    w = width / 2
    parts = []
    for x in (-w + 0.15, w - 0.15):
        parts.append(kit.box((x - 0.05, 0, -0.05), (x + 0.05, height - 0.05, 0.03), FRAME, 0.008, 1))
        parts.append(kit.box((x - 0.09, 0, -0.05), (x + 0.09, 0.08, 0.05), STEEL, 0.006, 1))
    parts.append(kit.box((-w, bottom, 0.03), (w, height, 0.05), PLY, 0.01, 1))
    for y in (bottom, height - 0.04):
        parts.append(kit.box((-w, y, 0.0), (w, y + 0.04, 0.03), FRAME))
    return kit.asset(f"sign-{fmt(width)}x{fmt(height)}", parts, smooth_angle=40)


def signpost():
    """The pointer to the sniping lane: a round post and a 2 m board on it, its face toward +z."""
    parts = [kit.cylinder(0.05, 0, 2.0, (0, 0, 0), "y", FRAME, 12)]
    parts.append(kit.box((-1.0, 1.4, -0.02), (1.0, 2.2, 0.02), PLY, 0.008, 1))
    parts.append(kit.box((-0.06, 1.5, -0.04), (0.06, 1.56, -0.02), STEEL))
    parts.append(kit.box((-0.06, 2.04, -0.04), (0.06, 2.1, -0.02), STEEL))
    return kit.asset("signpost", parts, smooth_angle=40)


def loadout_rack():
    """The loadout station: a steel workbench with drawers under a pegboard back, a rifle rack rail and hooks; its front toward +z."""
    parts = [kit.box((-1.2, 0.84, -0.4), (1.2, 0.9, 0.4), WOOD, 0.01, 2)]
    parts.append(kit.box((-1.15, 0.08, -0.35), (-0.45, 0.84, 0.38), STEEL, 0.01, 1))
    for k in range(4):
        y = 0.12 + k * 0.18
        parts.append(kit.box((-1.12, y, 0.38), (-0.48, y + 0.16, 0.4), STEEL, 0.006, 1))
        parts.append(kit.box((-0.86, y + 0.1, 0.4), (-0.74, y + 0.12, 0.42), FRAME))
    for x in (0.4, 1.15):
        for z in (-0.35, 0.35):
            parts.append(kit.box((x - 0.03, 0, z - 0.03), (x + 0.03, 0.84, z + 0.03), STEEL, 0.006, 1))
    parts.append(kit.box((-0.45, 0.2, -0.35), (1.15, 0.23, 0.35), STEEL))
    # The pegboard back (its face at z = -0.3, toward +z) with hooks and a rack rail.
    parts.append(kit.box((-1.2, 0.9, -0.4), (1.2, 2.0, -0.3), PEG, 0.008, 1))
    for x in (-1.17, 1.17):
        parts.append(kit.box((x - 0.03, 0.9, -0.3), (x + 0.03, 2.0, -0.28), FRAME))
    parts.append(kit.box((-1.2, 1.97, -0.3), (1.2, 2.0, -0.27), FRAME))
    for k in range(6):
        x = -1.0 + k * 0.4
        parts.append(kit.cylinder(0.01, -0.3, -0.255, (x, 1.1, 0), "z", STEEL, 6))
    parts.append(kit.box((-1.1, 1.08, -0.3), (1.1, 1.1, -0.26), STEEL))
    return kit.asset("loadout-rack", parts, smooth_angle=40)


def mannequin_stand():
    """The penetration station's mannequin: a moulded torso on a pole and a weighted round base (its head is a separate prop)."""
    parts = [kit.lathe([(0.0, 0.0), (0.0, 0.14), (0.03, 0.15), (0.05, 0.13), (0.05, 0.0)], (0, 0, 0), RUBBER, 20, "y")]
    parts.append(kit.cylinder(0.025, 0.05, 0.8, (0, 0, 0), "y", STEEL, 10))
    # The torso: a lathed, flattened body from the hips up to the neck.
    torso = kit.lathe([(0.75, 0.0), (0.76, 0.13), (0.85, 0.165), (1.0, 0.15), (1.15, 0.17), (1.3, 0.2), (1.38, 0.18), (1.42, 0.08), (1.45, 0.05), (1.45, 0.0)], (0, 0, 0), PLASTIC, 20, "y")
    parts.append(squash(torso, (0, 1.1, 0), sx=1.15, sz=0.62))
    return kit.asset("mannequin-stand", parts, smooth_angle=60)


built = [bench(*b) for b in BENCHES]
built += [distance_board(), target_board()] + [sign(w, h, bottom) for (w, h), bottom in SIGNS.items()]
built += [signpost(), loadout_rack(), mannequin_stand()]

SOLIDS = {f"bench-{fmt(l)}x{fmt(d)}": [((-l / 2, 0, -d / 2), (l / 2, BENCH_H, d / 2))] for l, d in BENCHES}
SOLIDS.update({f"sign-{fmt(w)}x{fmt(h)}": [((-w / 2, 0, -0.05), (w / 2, h, 0.05))] for w, h in SIGNS})
SOLIDS.update({
    "distance-board": [((-0.6, 0, -0.05), (0.6, 1.6, 0.05))],
    "target-board": [((-0.8, 0, -0.1), (0.8, 2.6, 0.1))],
    "signpost": [((-0.05, 0, -0.05), (0.05, 2.0, 0.05)), ((-1.0, 1.4, -0.02), (1.0, 2.2, 0.02))],
    "loadout-rack": [((-1.2, 0, -0.4), (1.2, 0.9, 0.4)), ((-1.2, 0.9, -0.4), (1.2, 2.0, -0.3))],
    "mannequin-stand": [((-0.25, 0, -0.15), (0.25, 1.45, 0.15))],
})

kit.bake_ao(built, distance=0.5)
report = {}
for o in built:
    worst, where = kit.strays(o, SOLIDS[o.name])
    report[o.name] = {"tris": kit.tris(o), "outside": worst, **({"at": where} if worst > mapkit.TOLERANCE else {})}
result = {"assets": report, "issues": [n for n, r in report.items() if r["outside"] > mapkit.TOLERANCE]}
if EXPORT:
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    kit.export(built, OUT)
    result["glb"] = {"path": os.path.abspath(OUT), "bytes": os.path.getsize(OUT)}
