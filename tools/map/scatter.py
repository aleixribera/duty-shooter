"""Build the ground scatter every map can strew: rocks, stone litter, broken masonry and dry shrubs.

Run via tools/map/build.py. They are visual only (bullets and players pass
through), so each stays below a crouching player: nothing here may read as
cover that isn't there. The materials name finishes the game gives them (see
`SCATTER_FINISHES` in packages/fps-client/src/surfaces/scatter.ts), and that file's
`REACH` holds how far each asset spreads.
"""
import math
import os
import random
import sys

import bmesh
import bpy
from mathutils import Vector
sys.path.insert(0, os.path.dirname(__file__))
import mapkit

OUT = os.path.join(os.path.dirname(__file__), "..", "..", "apps", "range", "public", "models", "scatter.glb")
kit = mapkit.Kit(bkit, "scatter")  # noqa: F821
stone = mapkit.material(bkit, "scatter.stone", (178, 158, 128), 0.95)  # noqa: F821
dark = mapkit.material(bkit, "scatter.stoneDark", (120, 104, 84), 0.95)  # noqa: F821
brick = mapkit.material(bkit, "scatter.masonry", (158, 112, 80), 0.95)  # noqa: F821
twig = mapkit.material(bkit, "scatter.twig", (104, 84, 58), 0.95)  # noqa: F821
straw = mapkit.material(bkit, "scatter.straw", (190, 156, 92), 0.95)  # noqa: F821
BUILT_UP_TO = 0.7


def lump(rng, size, at=(0, 0), level=1, material=stone):
    """A stone: an icosphere pushed out of round and flattened, its flat base sunk into the ground."""
    bm = bmesh.new()
    bmesh.ops.create_icosphere(bm, subdivisions=level, radius=1)
    # Big planes cut across it, so it breaks into facets instead of reading as a ball.
    planes = [Vector((rng.gauss(0, 1), rng.gauss(0, 1), rng.gauss(0, 0.6))).normalized() for _ in range(5)]
    cuts = [rng.uniform(0.55, 0.85) for _ in planes]
    for v in bm.verts:
        p = v.co.copy()
        for n, cut in zip(planes, cuts):
            over = p.dot(n) - cut
            if over > 0:
                p -= n * over
        p.x *= size[0]
        p.y *= size[1]
        p.z = max(p.z * size[2], -0.02) + size[2] * 0.25
        v.co = p + Vector((at[0], at[1], 0))
    return kit.obj("lump", bm, material)


def rock(name, seed, size):
    rng = random.Random(seed)
    return kit.asset(name, [lump(rng, size, level=2)], smooth_angle=35)


def litter(name, seed, count, spread, biggest):
    """Stones of mixed sizes, thrown down together."""
    rng = random.Random(seed)
    parts = []
    for i in range(count):
        a, r = rng.uniform(0, math.tau), spread * math.sqrt(rng.random())
        s = biggest * rng.uniform(0.35, 1)
        parts.append(lump(rng, (s, s * rng.uniform(0.6, 1), s * rng.uniform(0.45, 0.75)), (0, 0) if i == 0 else (r * math.cos(a), r * math.sin(a)), material=dark if i % 3 == 2 else stone))
    return kit.asset(name, parts, smooth_angle=35)


def masonry(name, seed, count):
    """Broken blocks fallen from a wall, a pale face of render left on some."""
    rng = random.Random(seed)
    parts = []
    for i in range(count):
        a, r = rng.uniform(0, math.tau), rng.uniform(0, 0.42)
        w, d, h = rng.uniform(0.1, 0.22), rng.uniform(0.07, 0.14), rng.uniform(0.04, 0.09)
        x, y = (0, 0) if i == 0 else (r * math.cos(a), r * math.sin(a))
        bm = bmesh.new()
        bmesh.ops.create_cube(bm, size=2)
        for v in bm.verts:
            v.co.x = (v.co.x + rng.uniform(-0.3, 0.3)) * w
            v.co.y = (v.co.y + rng.uniform(-0.3, 0.3)) * d
            v.co.z = (v.co.z * h + h) * rng.uniform(0.7, 1.1)
        bmesh.ops.rotate(bm, verts=bm.verts, matrix=__import__("mathutils").Matrix.Rotation(rng.uniform(0, math.tau), 3, "Z"))
        bmesh.ops.rotate(bm, verts=bm.verts, matrix=__import__("mathutils").Matrix.Rotation(rng.uniform(-0.25, 0.25), 3, "X"))
        bmesh.ops.translate(bm, verts=bm.verts, vec=Vector((x, y, -0.015)))
        parts.append(kit.obj("block", bm, brick if i % 3 else stone))
    return kit.asset(name, parts, smooth_angle=25)


def spike(base, tip, width, material):
    """A three-sided needle with no cap: three triangles."""
    bm = bmesh.new()
    d = (Vector(tip) - Vector(base)).normalized()
    side = d.orthogonal().normalized() * width
    third = d.cross(side).normalized() * width
    ring = [bm.verts.new(Vector(base) + side), bm.verts.new(Vector(base) - side * 0.5 + third * 0.87), bm.verts.new(Vector(base) - side * 0.5 - third * 0.87)]
    top = bm.verts.new(tip)
    for i in range(3):
        bm.faces.new((ring[i], ring[(i + 1) % 3], top))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return kit.obj("spike", bm, material)


def shrub(name, seed, stems, height, spread):
    """A dry desert bush: stems fanning from one root, each forking into twigs and straw-coloured tips."""
    rng = random.Random(seed)
    parts = []
    for _ in range(stems):
        a = rng.uniform(0, math.tau)
        lean = rng.uniform(0.25, 1) * spread
        h = rng.uniform(0.5, 1) * height
        mid = Vector((math.cos(a) * lean * 0.5, math.sin(a) * lean * 0.5, h * 0.55))
        top = Vector((math.cos(a) * lean, math.sin(a) * lean, h))
        parts.append(spike((0, 0, -0.02), top, 0.009, twig))
        for _ in range(4):
            t = rng.uniform(0.35, 0.95)
            start = top * t
            fork = a + rng.uniform(-1.1, 1.1)
            length = rng.uniform(0.08, 0.2)
            end = start + Vector((math.cos(fork) * length, math.sin(fork) * length, rng.uniform(0.02, 0.14)))
            parts.append(spike(start, end, 0.007, straw))
            if end.z > BUILT_UP_TO:
                raise ValueError(f"{name} stands {end.z:.2f} m high")
        _ = mid
    return kit.asset(name, parts, smooth_angle=20)


built = [
    rock("rock-small", 11, (0.11, 0.08, 0.07)),
    rock("rock-medium", 12, (0.2, 0.15, 0.12)),
    rock("rock-large", 13, (0.34, 0.26, 0.2)),
    litter("stones-a", 21, 7, 0.34, 0.11),
    litter("stones-b", 22, 9, 0.5, 0.15),
    masonry("masonry-a", 31, 6),
    masonry("masonry-b", 32, 9),
    shrub("shrub-a", 41, 11, 0.46, 0.34),
    shrub("shrub-b", 42, 14, 0.56, 0.42),
    shrub("shrub-c", 43, 7, 0.36, 0.28),
]
for o in built:
    o.location = (0, 0, 0)
kit.bake_ao(built, distance=0.3, samples=16)
result = {"assets": {o.name: {"tris": kit.tris(o), "high": round(max(v.co.z for v in o.data.vertices), 3)} for o in built}}
result["issues"] = [o.name for o in built if max(v.co.z for v in o.data.vertices) > BUILT_UP_TO]
if ARGS.get("export", False):  # noqa: F821
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    kit.export(built, OUT)
    result["glb"] = {"path": os.path.abspath(OUT), "bytes": os.path.getsize(OUT)}
