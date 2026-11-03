"""Builds Zero Island's vegetation and rock kit (ticket 29): trees, shrubs, tall grass, ferns and rocks.

Run via tools/map/build.py:

    blender -b --factory-startup --python tools/map/build.py -- tools/map/vegetation.py --export --preview tools/map/previews/vegetation

The game draws every asset instanced (packages/fps-client/src/plants-view.ts),
so each is one object at the world origin, standing on z = 0, with its finish
named in its material (`PLANT_FINISHES` in that file) and ambient occlusion
baked into its vertex colours.

Two kinds of asset, by how the game places them:

- Hard cover dresses a solid of the map, which keeps doing the colliding.
  The rocks and the trunks are unit boxes: 1 m across (x and y, from -0.5 to
  0.5) and 1 m tall, scaled to the solid's box, and kept within it but for a
  few centimetres, so what's seen is what stops a bullet. A tree's crown
  goes on top of its trunk, scaled whole with the tree's height (`CROWN_FOR`
  metres tall as built).
- Soft cover (shrubs, tall grass, ferns) has no solid: it hides a body from
  the bots without stopping a bullet. Each is built at its real size, and the
  game's concealment uses `SOFT` below, its reach and height.

`-lod` assets are the same thing in far fewer triangles, drawn past the
near range.
"""
import math
import os
import random
import sys

import bmesh
import bpy
from mathutils import Matrix, Vector, noise

sys.path.insert(0, os.path.dirname(__file__))
import mapkit

OUT = os.path.join(os.path.dirname(__file__), "..", "..", "apps", "range", "public", "models", "vegetation.glb")
kit = mapkit.Kit(bkit, "vegetation")  # noqa: F821
# Plants are drawn by the ten thousand: no splitting big faces for finer occlusion, which would multiply their triangles.
kit.densify = lambda o, longest=0.8: None
# Light, near-neutral bases: the game tints each instance (a Region's rock, a shrub's own green).
rock = mapkit.material(bkit, "plant.rock", (176, 170, 160), 0.95)  # noqa: F821
bark = mapkit.material(bkit, "plant.bark", (98, 78, 62), 0.95)  # noqa: F821
needles = mapkit.material(bkit, "plant.needles", (52, 74, 50), 0.9)  # noqa: F821
leaves = mapkit.material(bkit, "plant.leaves", (74, 108, 52), 0.85)  # noqa: F821
leavesDark = mapkit.material(bkit, "plant.leavesDark", (44, 72, 38), 0.85)  # noqa: F821
grass = mapkit.material(bkit, "plant.grass", (112, 122, 62), 0.9)  # noqa: F821
straw = mapkit.material(bkit, "plant.straw", (170, 146, 92), 0.95)  # noqa: F821
scrub = mapkit.material(bkit, "plant.scrub", (134, 126, 88), 0.95)  # noqa: F821
twig = mapkit.material(bkit, "plant.twig", (92, 76, 58), 0.95)  # noqa: F821

# Metres a crown is built for: the height of the trunk solid it sits on.
CROWN_FOR = {"pine-crown": 12.0, "broadleaf-crown": 13.0}
# Soft cover: (reach from the middle, top), metres, as the game's concealment counts it.
SOFT = {}


def jitter(bm, rng, amount, scale=1.0, keep_base=True):
    """Pushes each vertex along smooth noise, so a primitive stops reading as one."""
    seed = Vector((rng.uniform(0, 100), rng.uniform(0, 100), rng.uniform(0, 100)))
    for v in bm.verts:
        if keep_base and v.co.z <= 0.001:
            continue
        n = noise.noise_vector(v.co * scale + seed)
        v.co += n * amount


def blob(rng, centre, radius, squash=0.8, level=1, rough=0.25, material=leaves):
    """A leafy mass: an icosphere, flattened a little and pushed out of round."""
    bm = bmesh.new()
    bmesh.ops.create_icosphere(bm, subdivisions=level, radius=1)
    seed = Vector((rng.uniform(0, 100), rng.uniform(0, 100), rng.uniform(0, 100)))
    for v in bm.verts:
        d = v.co.normalized()
        k = 1 + rough * noise.noise(d * 1.7 + seed) + rough * 0.5 * noise.noise(d * 4.1 + seed)
        v.co = Vector((d.x * radius * k, d.y * radius * k, d.z * radius * k * squash)) + Vector(centre)
    return kit.obj("blob", bm, material)


def tapered(r0, r1, height, segments, material, flare=0.0, rng=None, lean=(0, 0)):
    """A trunk or stem: a cone from radius r0 at z = 0 to r1 at `height`, flaring at the foot, no caps but the top."""
    bm = bmesh.new()
    rings = 4
    verts = []
    for k in range(rings + 1):
        t = k / rings
        r = r0 + (r1 - r0) * t + flare * max(0, 1 - t * 4) ** 2
        ring = []
        for i in range(segments):
            a = math.tau * i / segments
            wob = 1 + (0.08 * math.sin(a * 3 + k) if rng else 0)
            ring.append(bm.verts.new((math.cos(a) * r * wob + lean[0] * t * t, math.sin(a) * r * wob + lean[1] * t * t, height * t)))
        verts.append(ring)
    for k in range(rings):
        for i in range(segments):
            j = (i + 1) % segments
            bm.faces.new((verts[k][i], verts[k][j], verts[k + 1][j], verts[k + 1][i]))
    bm.faces.new(list(reversed(verts[-1]))).normal_update()
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return kit.obj("stem", bm, material)


def limb(start, end, r0, r1, material, segments=5):
    """A branch from `start` to `end`."""
    s, e = Vector(start), Vector(end)
    o = tapered(r0, r1, (e - s).length, segments, material)
    d = (e - s).normalized()
    o.matrix_world = Matrix.Translation(s) @ d.to_track_quat("Z", "Y").to_matrix().to_4x4()
    bpy.context.view_layer.update()
    o.data.transform(o.matrix_world)
    o.matrix_world = Matrix.Identity(4)
    return o


def blade(bm, rng, base, height, width, lean, turn, segments=3):
    """One curved blade or frond: a strip of quads narrowing to a point, bending over as it rises."""
    ca, sa = math.cos(turn), math.sin(turn)
    side = Vector((-sa, ca, 0))
    rows = []
    for k in range(segments + 1):
        t = k / segments
        out = lean * t * t
        p = Vector(base) + Vector((ca * out, sa * out, height * (t - 0.35 * t * t * abs(lean) / max(height, 0.01))))
        w = width * (1 - t) ** 0.8
        rows.append((bm.verts.new(p - side * w / 2), bm.verts.new(p + side * w / 2)) if k < segments else (bm.verts.new(p),))
    for k in range(segments):
        a, b = rows[k], rows[k + 1]
        if len(b) == 1:
            bm.faces.new((a[0], a[1], b[0]))
        else:
            bm.faces.new((a[0], a[1], b[1], b[0]))


def boulder(name, seed, cuts=6, level=3, strata=0):
    """A rock filling the unit box: a rounded cube, cut at a few corners and pushed about by noise, then stretched
    back to fill the box exactly, so its sides touch the box the solid stops bullets with."""
    rng = random.Random(seed)
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1)
    bmesh.ops.subdivide_edges(bm, edges=bm.edges, cuts=level, use_grid_fill=True)
    planes = []
    for _ in range(cuts):
        n = Vector((rng.uniform(-1, 1), rng.uniform(-1, 1), rng.uniform(0.1, 1))).normalized()
        planes.append((n, rng.uniform(0.34, 0.44)))
    seed_v = Vector((rng.uniform(0, 50), rng.uniform(0, 50), rng.uniform(0, 50)))
    for v in bm.verts:
        p = v.co.copy()
        # Part-way to a sphere: no box corners left.
        p = p.lerp(p.normalized() * 0.62, 0.45)
        for n, cut in planes:
            over = p.dot(n) - cut
            if over > 0:
                p -= n * over * 0.85
        bump = noise.noise(p * 2.3 + seed_v) * 0.09 + noise.noise(p * 6.1 + seed_v) * 0.025
        if strata:
            # Ledges: the face steps in and out by layers, as weathered sandstone does.
            layer = math.floor((p.z + 0.5) * strata + noise.noise(p * 1.3 + seed_v) * 0.6)
            bump += 0.035 if layer % 2 else -0.035
        v.co = p + p.normalized() * bump
    bmesh.ops.triangulate(bm, faces=bm.faces)
    # Stretched to the unit box, standing on z = 0, the base a little sunk to sit in the ground.
    lo = Vector([min(v.co[k] for v in bm.verts) for k in range(3)])
    hi = Vector([max(v.co[k] for v in bm.verts) for k in range(3)])
    for v in bm.verts:
        q = Vector([(v.co[k] - lo[k]) / (hi[k] - lo[k]) for k in range(3)])
        v.co = Vector((q.x - 0.5, q.y - 0.5, q.z * 1.06 - 0.06))
    o = kit.obj(name, bm, rock)
    return kit.asset(name, [o], smooth_angle=50)


def boulder_lod(name, seed):
    rng = random.Random(seed)
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1)
    for v in bm.verts:
        v.co = Vector((v.co.x * rng.uniform(0.85, 1), v.co.y * rng.uniform(0.85, 1), v.co.z + 0.5))
    bevel = bmesh.ops.bevel(bm, geom=list(bm.edges), offset=0.12, segments=1, affect="EDGES")
    del bevel
    o = kit.obj(name, bm, rock)
    return kit.asset(name, [o], smooth_angle=50)


def pine_trunk(name, segments):
    # The unit trunk: 1 m across at the foot, tapering, 1 m tall.
    o = tapered(0.5, 0.36, 1.0, segments, bark, flare=0.06 if segments > 6 else 0)
    return kit.asset(name, [o], smooth_angle=70)


def pine_crown(name, seed, tiers, segments):
    """Tiers of drooping, ragged skirts of needles round the top of the trunk, from 3 m up."""
    rng = random.Random(seed)
    parts = []
    top, bottom = CROWN_FOR["pine-crown"] + 1.6, 3.0
    for k in range(tiers):
        t = k / max(tiers - 1, 1)
        z = bottom + (top - 2.5 - bottom) * t
        r = 2.9 * (1 - t) ** 0.85 + 0.5
        # Each tier reaches down over the one below, so few tiers still make one tree.
        h = max(2.7 - 0.6 * t, (top - 2.5 - bottom) / max(tiers - 1, 1) * 1.45)
        bm = bmesh.new()
        tip = bm.verts.new((rng.uniform(-0.1, 0.1), rng.uniform(-0.1, 0.1), z + h))
        rim = []
        for i in range(segments * 2):
            a = math.tau * i / (segments * 2) + rng.uniform(-0.1, 0.1)
            rr = r * (1 if i % 2 == 0 else 0.72) * rng.uniform(0.88, 1.1)
            rim.append(bm.verts.new((math.cos(a) * rr, math.sin(a) * rr, z - (0.45 if i % 2 == 0 else 0.05) * r / 2.9 + rng.uniform(-0.1, 0.1))))
        for i in range(len(rim)):
            bm.faces.new((rim[i], rim[(i + 1) % len(rim)], tip))
        under = bm.verts.new((0, 0, z + 0.25 * h))
        for i in range(len(rim)):
            bm.faces.new((rim[(i + 1) % len(rim)], rim[i], under))
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        parts.append(kit.obj("tier", bm, needles))
    return kit.asset(name, parts, smooth_angle=35)


def broadleaf_trunk(name, segments):
    o = tapered(0.46, 0.38, 1.0, segments, bark, flare=0.1 if segments > 6 else 0.05, rng=random.Random(5))
    return kit.asset(name, [o], smooth_angle=70)


def broadleaf_crown(name, seed, masses, level, limbs):
    """A broad, layered canopy from 6.5 m up, on a few limbs that fork from the trunk's top."""
    rng = random.Random(seed)
    parts = []
    h = CROWN_FOR["broadleaf-crown"]
    spots = []
    for i in range(masses):
        a = math.tau * i / masses + rng.uniform(-0.3, 0.3)
        d = rng.uniform(2.0, 3.6) if i else 0
        z = h - 2.2 + rng.uniform(-1.4, 1.2) + (1.5 if i == 0 else 0)
        spots.append((math.cos(a) * d, math.sin(a) * d, z))
    for i, (x, y, z) in enumerate(spots):
        r = rng.uniform(2.2, 3.0) if i else 3.0
        parts.append(blob(rng, (x, y, z), r, squash=0.62, level=level, rough=0.3, material=leaves if i % 2 else leavesDark))
        if i and i <= limbs:
            parts.append(limb((0, 0, h * 0.55), (x * 0.8, y * 0.8, z - 0.8), 0.28, 0.12, bark))
    return kit.asset(name, parts, smooth_angle=40)


def bush(name, seed, masses, width, height, level=1, material=leaves, dark=leavesDark, rough=0.3, stems=0):
    """A shrub: overlapping leafy masses on the ground, `width` across and `height` tall."""
    rng = random.Random(seed)
    parts = []
    for i in range(masses):
        a = math.tau * i / masses + rng.uniform(-0.4, 0.4)
        d = (width / 2 - width * 0.22) * (0 if i == 0 else rng.uniform(0.55, 1))
        r = width * (0.3 if i == 0 else rng.uniform(0.2, 0.27))
        z = height - r * 0.62 if i == 0 else rng.uniform(r * 0.5, height - r * 0.7)
        parts.append(blob(rng, (math.cos(a) * d, math.sin(a) * d, z), r, squash=0.85, level=level, rough=rough, material=material if i % 2 == 0 else dark))
    for i in range(stems):
        a = rng.uniform(0, math.tau)
        parts.append(limb((0, 0, 0), (math.cos(a) * width * 0.2, math.sin(a) * width * 0.2, height * 0.5), 0.05, 0.03, twig, segments=4))
    o = kit.asset(name, parts, smooth_angle=50)
    SOFT[name] = (round(width * 0.42, 2), round(height * 0.92, 2))
    return o


def tussock(name, seed, blades, height, spread, material, segments=3, width=0.07):
    """A clump of tall grass blades from one root, leaning out."""
    rng = random.Random(seed)
    bm = bmesh.new()
    for _ in range(blades):
        a = rng.uniform(0, math.tau)
        r = spread * 0.25 * math.sqrt(rng.random())
        blade(bm, rng, (math.cos(a) * r, math.sin(a) * r, 0), height * rng.uniform(0.7, 1.05), width * rng.uniform(0.7, 1.2), spread * rng.uniform(0.3, 0.7), a + rng.uniform(-0.5, 0.5), segments)
    o = kit.obj(name, bm, material)
    o = kit.asset(name, [o], smooth_angle=80)
    SOFT[name] = (round(spread * 0.45, 2), round(height * 0.88, 2))
    return o


def fern(name, seed, fronds, length, segments=4):
    """Fronds arching out from a crown at the ground, a jungle floor's cover."""
    rng = random.Random(seed)
    bm = bmesh.new()
    for i in range(fronds):
        a = math.tau * i / fronds + rng.uniform(-0.25, 0.25)
        blade(bm, rng, (0, 0, 0), length * rng.uniform(0.8, 1.05), 0.42 * rng.uniform(0.8, 1.1), length * rng.uniform(0.7, 0.95), a, segments)
    o = kit.obj(name, bm, leaves)
    o = kit.asset(name, [o], smooth_angle=60)
    SOFT[name] = (round(length * 0.55, 2), round(length * 0.72, 2))
    return o


def juniper(name, seed, cones, width, height, segments=7):
    """A low, wind-pressed conifer on the snowfields: ragged cones crowded together."""
    rng = random.Random(seed)
    parts = []
    for i in range(cones):
        a = math.tau * i / cones + rng.uniform(-0.3, 0.3)
        d = 0 if i == 0 else width * rng.uniform(0.18, 0.3)
        h = height * (1 if i == 0 else rng.uniform(0.55, 0.85))
        r = width * (0.32 if i == 0 else rng.uniform(0.22, 0.3))
        bm = bmesh.new()
        cx, cy = math.cos(a) * d, math.sin(a) * d
        tip = bm.verts.new((cx + rng.uniform(-0.1, 0.1), cy + rng.uniform(-0.1, 0.1), h))
        ring = [bm.verts.new((cx + math.cos(math.tau * k / segments) * r * rng.uniform(0.8, 1.15), cy + math.sin(math.tau * k / segments) * r * rng.uniform(0.8, 1.15), rng.uniform(0, 0.12))) for k in range(segments)]
        mid = [bm.verts.new((cx + (v.co.x - cx) * 0.62, cy + (v.co.y - cy) * 0.62, h * 0.48 + rng.uniform(-0.08, 0.08))) for v in ring]
        for k in range(segments):
            j = (k + 1) % segments
            bm.faces.new((ring[k], ring[j], mid[j], mid[k]))
            bm.faces.new((mid[k], mid[j], tip))
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        parts.append(kit.obj("cone", bm, needles))
    o = kit.asset(name, parts, smooth_angle=45)
    SOFT[name] = (round(width * 0.42, 2), round(height * 0.9, 2))
    return o


built = [
    # Hard cover: rocks, filling a unit box.
    boulder("rock-a", 11),
    boulder("rock-b", 12, cuts=8),
    boulder("rock-strata", 13, cuts=5, strata=7),
    boulder_lod("rock-lod", 14),
    # Trees: unit trunks and their crowns.
    pine_trunk("pine-trunk", 9),
    pine_trunk("pine-trunk-lod", 5),
    pine_crown("pine-crown", 21, 6, 9),
    pine_crown("pine-crown-lod", 22, 3, 5),
    broadleaf_trunk("broadleaf-trunk", 10),
    broadleaf_trunk("broadleaf-trunk-lod", 5),
    broadleaf_crown("broadleaf-crown", 31, 7, 2, 4),
    broadleaf_crown("broadleaf-crown-lod", 31, 4, 1, 0),
    # Soft cover.
    bush("bush-leafy", 51, 7, 2.3, 1.75, stems=3),
    bush("bush-leafy-lod", 51, 3, 2.3, 1.75, level=1, rough=0.2),
    bush("bush-dry", 52, 6, 2.0, 1.5, material=scrub, dark=straw, rough=0.45, stems=4),
    bush("bush-dry-lod", 52, 3, 2.0, 1.5, material=scrub, dark=straw, rough=0.3),
    juniper("juniper", 53, 5, 2.2, 1.7),
    juniper("juniper-lod", 53, 2, 2.2, 1.7, segments=5),
    fern("fern", 54, 11, 1.6),
    fern("fern-lod", 54, 6, 1.6, segments=2),
    tussock("grass-tall", 55, 44, 1.35, 1.1, grass),
    tussock("grass-tall-lod", 55, 14, 1.35, 1.1, grass, segments=2, width=0.12),
    tussock("grass-dry", 56, 40, 1.25, 1.1, straw),
    tussock("grass-dry-lod", 56, 13, 1.25, 1.1, straw, segments=2, width=0.12),
    # Ground cover, drawn near only: no cover at all.
    tussock("tuft", 57, 9, 0.38, 0.4, grass, segments=2, width=0.05),
    tussock("tuft-dry", 58, 8, 0.32, 0.4, straw, segments=2, width=0.05),
]
for o in built:
    o.location = (0, 0, 0)
kit.bake_ao(built, distance=0.8, samples=16)
result = {"assets": {o.name: {"tris": kit.tris(o), "size": [round(d, 2) for d in o.dimensions]} for o in built}, "soft": SOFT}
if ARGS.get("export", False):  # noqa: F821
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    kit.export(built, OUT)
    result["glb"] = {"path": os.path.abspath(OUT), "bytes": os.path.getsize(OUT)}
