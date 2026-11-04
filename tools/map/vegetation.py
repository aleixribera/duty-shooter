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
# Leaves, needles, fronds and blades: their colour is the atlas's photo, so the material is white.
leafCard = mapkit.material(bkit, "plant.leaf", (255, 255, 255), 0.85)  # noqa: F821
twig = mapkit.material(bkit, "plant.twig", (92, 76, 58), 0.95)  # noqa: F821

# Metres a crown is built for: the height of the trunk solid it sits on.
CROWN_FOR = {"pine-crown": 12.0, "broadleaf-crown": 13.0}
# Soft cover: (reach from the middle, top), metres, as the game's concealment counts it.
SOFT = {}


def tapered(r0, r1, height, segments, material, flare=0.0, rng=None, lean=(0, 0), rings=4, turn=0.0):
    """A trunk or stem: a cone from radius r0 at z = 0 to r1 at `height`, flaring at the foot, no caps but the top.
    `turn` (radians) turns its sides about its axis."""
    bm = bmesh.new()
    verts = []
    for k in range(rings + 1):
        t = k / rings
        r = r0 + (r1 - r0) * t + flare * max(0, 1 - t * 4) ** 2
        ring = []
        for i in range(segments):
            a = math.tau * i / segments + turn
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
    """A rock far off: a ragged hexagon in the unit box, bellied, its shoulders rounding to a low peak; no underside. 30 triangles."""
    rng = random.Random(seed)
    bm = bmesh.new()
    sides = 6
    # (radius, height) of each ring, foot to shoulder.
    rings = [(0.88, 0.0), (1.0, 0.38), (0.66, 0.8)]
    verts = []
    for r0, z in rings:
        ring = []
        for k in range(sides):
            a = math.tau * k / sides
            r = r0 * 0.5 / math.cos(math.pi / sides) * rng.uniform(0.9, 1.0)
            x, y = max(-0.5, min(0.5, math.cos(a) * r)), max(-0.5, min(0.5, math.sin(a) * r))
            ring.append(bm.verts.new((x, y, z + (rng.uniform(-0.05, 0.05) if z else 0))))
        verts.append(ring)
    top = bm.verts.new((rng.uniform(-0.06, 0.06), rng.uniform(-0.06, 0.06), 1.0))
    for a, b in zip(verts, verts[1:]):
        for k in range(sides):
            n = (k + 1) % sides
            bm.faces.new((a[k], a[n], b[n], b[k]))
    for k in range(sides):
        bm.faces.new((verts[-1][k], verts[-1][(k + 1) % sides], top))
    bmesh.ops.triangulate(bm, faces=list(bm.faces))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    o = kit.obj(name, bm, rock)
    return kit.asset(name, [o], smooth_angle=50)


# Jointed rocks (ticket 63): a map solid is boxes, so a rock is built from
# blocks that boxes can follow. Rounded boulders left their box's corners and
# top edges as invisible walls, and boxes fitted inside them left a hand's
# width of rock that bullets went through. The Dustlands' ledges are a few blocks of
# stone broken along joints, as granite and sandstone weather: flat faces, a
# small chamfer on every edge, the crown's top corners spalled off and the
# faces pitted inward. Everything about a block is cut into it, never added, so
# tools/map/fit-solids.mjs finds boxes a few centimetres inside its faces.
ROCKS = {
    # Sandstone ledges, each stepped back a little from the one under it.
    "rock-strata": [((-0.5, -0.5, -0.06), (0.5, 0.48, 0.4)), ((-0.48, -0.47, 0.34), (0.5, 0.5, 0.7)), ((-0.46, -0.45, 0.64), (0.47, 0.48, 0.9)), ((-0.4, -0.42, 0.85), (0.43, 0.42, 1.0))],
}
# Unit metres of a rock's edge chamfer, the most a face is pitted in, and how far down a top corner spalls (a share of the block).
EDGE, PIT, SPALL = 0.01, 0.004, 0.1


def jointed(name, seed, blocks, lod=False):
    """A rock of `blocks` ((lo, hi) corners, unit frame, z up), overlapping. `lod`: the bare blocks, 12 triangles each."""
    rng = random.Random(seed)
    seed_v = Vector((rng.uniform(0, 50), rng.uniform(0, 50), rng.uniform(0, 50)))
    parts = []
    for lo, hi in blocks:
        lo, hi = Vector(lo), Vector(hi)
        c, h = (lo + hi) / 2, (hi - lo) / 2
        bm = bmesh.new()
        bmesh.ops.create_cube(bm, size=2.0)
        for v in bm.verts:
            v.co = c + Vector((v.co.x * h.x, v.co.y * h.y, v.co.z * h.z))
        if not lod:
            bmesh.ops.subdivide_edges(bm, edges=list(bm.edges), cuts=1, use_grid_fill=True)
            bm.normal_update()
            outer = [e for e in bm.edges if len(e.link_faces) == 2 and e.link_faces[0].normal.angle(e.link_faces[1].normal, 0) > math.radians(45)]
            bmesh.ops.bevel(bm, geom=outer, offset=EDGE, offset_type="OFFSET", segments=1, profile=0.5, affect="EDGES", clamp_overlap=True)
            # The crowning block's top corners spall: whatever lies past a plane across each is pushed back
            # onto it. Only the crown's, and not all of them: a spalled corner is rock no box can follow,
            # and a block under it is what a body stands on and ducks behind.
            for sx in (-1, 1):
                for sy in (-1, 1):
                    depth = SPALL * rng.uniform(0.4, 1.0) if rng.random() < 0.6 and hi.z > 0.99 else 0.0
                    n = Vector((sx / h.x, sy / h.y, 1 / h.z))
                    for v in bm.verts:
                        d = v.co - c
                        if d.x * sx < 0 or d.y * sy < 0:
                            continue
                        over = d.dot(n) - (3 - depth * 3)
                        if over > 0:
                            v.co -= n * (over / n.length_squared)
            bm.normal_update()
            # Pitted, inward only, so the block's faces stay the outside of the rock.
            for v in bm.verts:
                pit = 0.5 + 0.5 * noise.noise(v.co * 7.0 + seed_v)
                v.co -= v.normal * PIT * max(0.0, min(1.0, pit))
        bmesh.ops.triangulate(bm, faces=bm.faces)
        parts.append(kit.obj(name, bm, rock))
    return kit.asset(name, parts, smooth_angle=35)


# Boulders (ticket 78): jointed blocks read as stacked cubes on open ground, so outside the Dustlands a
# rock is one weathered granite boulder again: no two of its corners alike, one worn right round and
# another left nearly square, a corner split off along a vertical joint at an odd angle, a shoulder
# sheared, its top rounded over into its sides and drawn in, its skin dented. Its sides stay near upright
# down to a square foot in the ground, which is where a body hides and bullets fly, so
# tools/map/fit-solids.mjs fills it with a handful of boxes; what they leave is mostly the rounding over
# its top and its round corners.
BOULDERS = {
    # (seed, [(box, rounding of each upright corner (-x-y, +x-y, +x+y, -x+y) and of its top, as shares of its half-size,
    # corner joints, shoulder joints, how far its top draws in)])
    "rock-a": (41, [(((-0.5, -0.5, -0.06), (0.5, 0.5, 1.0)), (0.46, 0.18, 0.34, 0.14), 0.4, 1, 1, 0.07)]),
    "rock-b": (47, [(((-0.5, -0.5, -0.06), (0.5, 0.5, 1.0)), (0.15, 0.45, 0.2, 0.4), 0.44, 2, 1, 0.08)]),
}


def boulder_mass(rng, box, side, top, corners, shoulders, draw, lod):
    """One boulder of a rock, rounded and jointed in its own cube, then stood in `box`."""
    seed_v = Vector((rng.uniform(0, 50), rng.uniform(0, 50), rng.uniform(0, 50)))
    part = bmesh.new()
    bmesh.ops.create_cube(part, size=1.0)
    bmesh.ops.subdivide_edges(part, edges=list(part.edges), cuts=2 if lod else 7, use_grid_fill=True)
    # Each upright corner its own rounding (a number: all four alike).
    corner_r = side if isinstance(side, tuple) else (side,) * 4
    rounds = [Vector((0.5 * c * rng.uniform(0.85, 1.15), 0.5 * c * rng.uniform(0.85, 1.15), 0.5 * top)) for c in corner_r]
    # Joints: near-vertical ones across corners, then steep ones across a top edge. (normal, how far out from the middle.)
    planes = []
    for k in rng.sample(range(4), corners):
        a = math.pi / 4 + k * math.pi / 2 + rng.uniform(-0.4, 0.4)
        n = Vector((math.cos(a), math.sin(a), rng.uniform(-0.05, 0.25))).normalized()
        planes.append((n, (abs(n.x) + abs(n.y)) * 0.5 - rng.uniform(0.04, 0.09)))
    for k in rng.sample(range(4), shoulders):
        a = k * math.pi / 2 + rng.uniform(-0.5, 0.5)
        n = Vector((math.cos(a), math.sin(a), rng.uniform(0.9, 1.6))).normalized()
        planes.append((n, (abs(n.x) + abs(n.y) + n.z) * 0.5 - rng.uniform(0.1, 0.16)))
    for v in part.verts:
        p = v.co.copy()
        r = rounds[(0 if p.y < 0 else 3) if p.x < 0 else (1 if p.y < 0 else 2)]
        # The foot isn't rounded: it stands square in the ground.
        lo, hi = Vector((-0.5 + r.x, -0.5 + r.y, -0.5)), Vector((0.5 - r.x, 0.5 - r.y, 0.5 - r.z))
        # The rounded box: the nearest point of its core, pushed out along the way to p, ellipsoidally.
        q = Vector([max(lo[k], min(hi[k], p[k])) for k in range(3)])
        d = Vector([(p[k] - q[k]) / r[k] for k in range(3)])
        if d.length > 1e-6:
            d.normalize()
        p = q + Vector([d[k] * r[k] for k in range(3)])
        for n, cut in planes:
            over = p.dot(n) - cut
            if over > 0:
                p -= n * over
        # The top drawn in, the lower half left upright.
        k = 1 - draw * 4 * max(0.0, p.z) ** 2
        p.x *= k
        p.y *= k
        if not lod:
            out = p.normalized()
            # Dented over the top, barely down the sides: a box stands no further in than a side's deepest dent.
            h = max(0.0, min(1.0, (p.z + 0.1) / 0.5))
            rise = 0.12 + 0.88 * h * h * (3 - 2 * h)
            # Inward only, so the upright foot stays the widest the boulder is and the boxes reach it.
            p -= out * rise * ((0.5 + 0.5 * noise.noise(p * 1.9 + seed_v)) * 0.045 + (0.5 + 0.5 * noise.noise(p * 5.3 + seed_v)) * 0.012)
        v.co = p
    # Into its box.
    plo = Vector([min(v.co[k] for v in part.verts) for k in range(3)])
    phi = Vector([max(v.co[k] for v in part.verts) for k in range(3)])
    blo, bhi = Vector(box[0]), Vector(box[1])
    for v in part.verts:
        v.co = Vector([blo[k] + (v.co[k] - plo[k]) / (phi[k] - plo[k]) * (bhi[k] - blo[k]) for k in range(3)])
    bmesh.ops.triangulate(part, faces=part.faces)
    return part


def granite(name, seed, masses, lod=False):
    """A rock of boulders (`BOULDERS`), filling the unit box. `lod`: the same in about a hundred triangles."""
    rng = random.Random(seed)
    parts = [kit.obj(name, boulder_mass(rng, *m, lod), rock) for m in masses]
    return kit.asset(name, parts, smooth_angle=60)


# Rubble (ticket 78): Ground Zero's rocks are what the blast left of its concrete, slabs and blocks
# broken across, lying on one another; their fracture faces run at odd angles, their edges are sharp
# with the arrises chipped, and rebar sticks out of the breaks. Blocks again, so boxes follow them, but
# each broken by planes, not chamfered.
RUBBLE = {
    # A thick slab broken across, a block of wall lying on it, and a chunk at its foot.
    "rubble-a": [((-0.5, -0.5, -0.06), (0.5, 0.5, 0.46)), ((-0.42, -0.36, 0.4), (0.3, 0.42, 1.0)), ((0.22, -0.5, -0.06), (0.5, -0.05, 0.62))],
    # Two pieces of a broken beam side by side, the taller one cracked off at its top.
    "rubble-b": [((-0.5, -0.5, -0.06), (0.06, 0.5, 1.0)), ((-0.04, -0.44, -0.06), (0.5, 0.46, 0.74)), ((0.0, -0.3, 0.68), (0.36, 0.3, 0.86))],
}
rebar = mapkit.material(bkit, "plant.rebar", (70, 52, 40), 0.8)  # noqa: F821


def broken(name, seed, blocks, lod=False):
    """Concrete rubble of `blocks` ((lo, hi) corners, unit frame, z up): each block's top broken off by tilted planes, its corners chipped."""
    rng = random.Random(seed)
    seed_v = Vector((rng.uniform(0, 50), rng.uniform(0, 50), rng.uniform(0, 50)))
    parts = []
    for lo, hi in blocks:
        lo, hi = Vector(lo), Vector(hi)
        c, h = (lo + hi) / 2, (hi - lo) / 2
        bm = bmesh.new()
        bmesh.ops.create_cube(bm, size=2.0)
        if not lod:
            bmesh.ops.subdivide_edges(bm, edges=list(bm.edges), cuts=3, use_grid_fill=True)
        planes = []
        # The break: one or two planes across the top, tilted a few tens of degrees.
        for _ in range(rng.choice((1, 2))):
            a = rng.uniform(0, math.tau)
            t = math.radians(rng.uniform(8, 20))
            planes.append((Vector((math.cos(a) * math.sin(t), math.sin(a) * math.sin(t), math.cos(t))), rng.uniform(0.86, 0.96)))
        # Chipped vertical arrises.
        for _ in range(2):
            a = rng.choice((0.25, 0.75, 1.25, 1.75)) * math.pi + rng.uniform(-0.3, 0.3)
            planes.append((Vector((math.cos(a), math.sin(a), rng.uniform(-0.2, 0.4))).normalized(), rng.uniform(1.12, 1.3)))
        for v in bm.verts:
            p = v.co.copy()  # -1..1 in the block's frame
            for n, cut in planes:
                over = p.dot(n) - cut
                if over > 0:
                    p -= n * over
            if not lod:
                # Fracture faces rough, cast faces flat: the roughness only where a plane cut.
                cut_here = any(p.dot(n) > cut - 1e-4 for n, cut in planes)
                if cut_here:
                    p -= Vector((0, 0, 1)) * 0.04 * (0.5 + 0.5 * noise.noise(p * 4.0 + seed_v))
            v.co = c + Vector((p.x * h.x, p.y * h.y, p.z * h.z))
        bmesh.ops.triangulate(bm, faces=bm.faces)
        parts.append(kit.obj(name, bm, rock))
        if not lod and rng.random() < 0.8:
            # Rebar out of the break: two bent bars, thin enough that no box need follow them.
            for _ in range(2):
                u, w = rng.uniform(-0.6, 0.6), rng.uniform(-0.6, 0.6)
                foot = c + Vector((u * h.x, w * h.y, h.z * 0.55))
                tip = foot + Vector((rng.uniform(-0.12, 0.12), rng.uniform(-0.12, 0.12), rng.uniform(0.1, 0.18)))
                tip.z = min(tip.z, 1.02)
                parts.append(limb(foot, tip, 0.008, 0.007, rebar, segments=4))
    return kit.asset(name, parts, smooth_angle=30)


# A near trunk has eight sides, flat to the unit box's axes (ticket 63): its solid is boxes, and a
# cross of boxes fills an octagon square to it all but its slanted sides' corners.
TRUNK_SIDES, TRUNK_TURN = 8, math.pi / 8


def pine_trunk(name, segments, rings=4, turn=0.0):
    # The unit trunk: 1 m across at the foot, tapering, 1 m tall.
    o = tapered(0.5, 0.36, 1.0, segments, bark, flare=0.06 if segments > 6 else 0, rings=rings, turn=turn)
    return kit.asset(name, [o], smooth_angle=70)


def broadleaf_trunk(name, segments, rings=4, turn=0.0):
    o = tapered(0.46, 0.38, 1.0, segments, bark, flare=0.1 if segments > 6 else 0.05, rng=random.Random(5), rings=rings, turn=turn)
    return kit.asset(name, [o], smooth_angle=70)


# ------------------------------------------------------------------ cards
#
# Foliage is alpha-tested cards (ticket 62): quads that each show a cell of
# the foliage atlas (tools/textures/foliage.py), a cluster of scanned leaves,
# a pine spray, a frond or a fan of blades. The game draws them from both
# sides and lights them by the volume they make, not by their flat faces:
# each card's normals point out from the middle of its crown or bush, so a
# whole bush shades as one rounded mass, the way leaves do.

# The atlas's cells, in foliage.py's `CELLS` order: a 4 x 4 grid, the first row at the image's top.
ATLAS = [
    "broad-a", "broad-b", "bush-a", "bush-b",
    "pine-a", "pine-b", "juniper", "dry-a",
    "dry-b", "fern-a", "fern-b", "grass",
    "straw", "tuft", "tuft-dry", "solid",
]
GRID = 4
# What a cell's picture spans across it (the fronds stand in the middle), and the clear frame round every cell (px of 512).
SPAN = {"fern-a": (0.3, 0.7), "fern-b": (0.3, 0.7)}
FRAME = 6 / 512


def cell_uv(cell, s, t):
    """Blender UV of (s, t) on a card showing `cell`: s across, t from the card's foot (0) to its top (1)."""
    i = ATLAS.index(cell)
    col, row = i % GRID, i // GRID
    u0, u1 = SPAN.get(cell, (FRAME, 1 - FRAME))
    t = FRAME + (1 - 2 * FRAME) * t
    return ((col + u0 + (u1 - u0) * s) / GRID, (GRID - 1 - row + t) / GRID)


SOLID_UV = cell_uv("solid", 0.5, 0.5)


# The leaf clusters are discs: their cards are octagons round them, so the empty corners of the cell cost no pixels.
DISCS = {"broad-a", "broad-b", "bush-a", "bush-b", "dry-a", "dry-b"}
# A card's width at its tip as a share of its foot's: fronds narrow to a point.
TAPER = {"fern-a": 0.45, "fern-b": 0.45}


def card(bm, cell, foot, right, up, width, length, droop=0.0, segments=1, taper=None, squeeze=False):
    """A card standing on `foot` along `up` (unit vectors), `width` across and `length` long, its far end sagging `droop` m,
    its tip `taper` of its foot's width (the cell's own by default): the cell cropped to the narrower card, or `squeeze`d into it,
    which keeps the cell's own ragged edges as the card's."""
    uv = bm.loops.layers.uv.get("UVMap") or bm.loops.layers.uv.new("UVMap")
    foot, right, up = Vector(foot), Vector(right).normalized(), Vector(up).normalized()
    if cell in DISCS and segments == 1 and not droop:
        # An octagon whose sides touch a circle of 0.49 of the card: the cluster's leaves reach no farther.
        rim = []
        for k in range(8):
            a = math.tau * (k + 0.5) / 8
            r = 0.49 / math.cos(math.pi / 8)
            s, t = 0.5 + r * math.cos(a), 0.5 + r * math.sin(a)
            s, t = min(1.0, max(0.0, s)), min(1.0, max(0.0, t))
            rim.append((bm.verts.new(foot + right * width * (s - 0.5) + up * length * t), cell_uv(cell, s, t)))
        f = bm.faces.new([v for v, _ in rim])
        for loop, (_, coords) in zip(f.loops, rim):
            loop[uv].uv = coords
        return
    tip = TAPER.get(cell, 1.0) if taper is None else taper
    rows = []
    for k in range(segments + 1):
        t = k / segments
        centre = foot + up * length * t + Vector((0, 0, -droop * t * t))
        w = 1 - (1 - tip) * t
        rows.append([(bm.verts.new(centre + right * width * w * (s - 0.5)), cell_uv(cell, s if squeeze else 0.5 + w * (s - 0.5), t)) for s in (0.0, 1.0)])
    for a, b in zip(rows, rows[1:]):
        f = bm.faces.new((a[0][0], a[1][0], b[1][0], b[0][0]))
        for loop, (_, coords) in zip(f.loops, (a[0], a[1], b[1], b[0])):
            loop[uv].uv = coords


def frame(normal, roll):
    """Right and up vectors of a card facing along `normal`, turned `roll` radians about it."""
    n = Vector(normal).normalized()
    side = n.cross(Vector((0, 0, 1)))
    if side.length < 1e-3:
        side = Vector((1, 0, 0))
    side.normalize()
    upv = side.cross(n).normalized()
    right = side * math.cos(roll) + upv * math.sin(roll)
    return right, right.cross(n).normalized()


def solid(o):
    """Bark and stems read the atlas's white cell, so they keep their own colour."""
    uv = o.data.uv_layers.get("UVMap") or o.data.uv_layers.new(name="UVMap")
    for d in uv.data:
        d.uv = SOLID_UV
    return o


def cards(name, build):
    bm = bmesh.new()
    build(bm)
    return kit.obj(name, bm, leafCard)


def cluster(rng, bm, cells, centre, radii, count, size, up_bias=0.25, lift=0.0):
    """Cards scattered through an ellipsoid, each facing out from its middle give or take, so it reads full from every side."""
    c = Vector(centre)
    for _ in range(count):
        d = Vector((rng.gauss(0, 1), rng.gauss(0, 1), rng.gauss(0, 1) * 0.8 + lift)).normalized()
        r = rng.random() ** 0.4
        p = c + Vector((d.x * radii[0], d.y * radii[1], d.z * radii[2])) * r * 0.82
        n = (d + Vector((rng.uniform(-0.6, 0.6), rng.uniform(-0.6, 0.6), up_bias))).normalized()
        right, upv = frame(n, rng.uniform(0, math.tau))
        s = size * rng.uniform(0.8, 1.15)
        card(bm, cells[rng.randrange(len(cells))], p - upv * s / 2, right, upv, s, s)


def pine_crown(name, seed, tiers, branches, core=3, ragged=True):
    """Whorls of drooping sprays round the top of the trunk, from 3 m up, narrowing to a spire, over a core of
    crossed sprays the crown's height, which fills the cone between the whorls from every side. A `ragged` core keeps the
    sprays' own edges as its outline; the distance model's is cut to the cone, fuller where its whorls are few."""
    rng = random.Random(seed)
    top, bottom = CROWN_FOR["pine-crown"] + 1.6, 3.0

    def build(bm):
        for i in range(core):
            a = math.pi * i / core + rng.uniform(-0.15, 0.15)
            # A cone, not a board: wide at the bottom whorl, to a point at the spire.
            card(bm, ("pine-a", "pine-b")[i % 2], (0, 0, bottom - 0.6), (math.cos(a), math.sin(a), 0), (0, 0, 1), 7.4, top - bottom + 0.6, segments=3, taper=0.06, squeeze=ragged)
        for k in range(tiers):
            t = k / max(tiers - 1, 1)
            z = bottom + 0.4 + (top - 2.4 - bottom) * t
            reach = 2.9 * (1 - t) ** 0.85 + 0.5
            n = max(4, round(branches * (1 - 0.45 * t)))
            for i in range(n):
                a = math.tau * (i + rng.uniform(-0.3, 0.3)) / n + k * 0.7
                out = Vector((math.cos(a), math.sin(a), 0))
                along = (out + Vector((0, 0, rng.uniform(-0.1, 0.35)))).normalized()
                # Each spray rolls about its own length, so from the side some show broad and none vanish edge-on.
                roll = rng.uniform(-0.9, 0.9)
                side = out.cross(Vector((0, 0, 1)))
                right = (side * math.cos(roll) + Vector((0, 0, 1)) * math.sin(roll)).normalized()
                card(bm, rng.choice(("pine-a", "pine-b")), Vector((0, 0, z)) - out * 0.15, right, along, reach * 1.0, reach * 1.05, droop=reach * 0.4, segments=2)
        # The spire: short sprays leaning up round the trunk's last metres, which the narrowing core can't hide.
        for k, z in enumerate((CROWN_FOR["pine-crown"] - 2.6, CROWN_FOR["pine-crown"] - 1.6, CROWN_FOR["pine-crown"] - 0.6)):
            for i in range(7):
                a = math.tau * (i + 0.5 * k) / 7 + rng.uniform(-0.2, 0.2)
                out = Vector((math.cos(a), math.sin(a), 0))
                along = (out * 0.45 + Vector((0, 0, 1))).normalized()
                card(bm, rng.choice(("pine-a", "pine-b")), Vector((0, 0, z)) - out * 0.1, out.cross(Vector((0, 0, 1))), along, 1.6 - 0.35 * k, 2.6 - 0.5 * k)
    return kit.asset(name, [cards("tiers", build)], smooth_angle=180)


def broadleaf_crown(name, seed, masses, per_mass, size, limbs, caps=6):
    """A broad, layered canopy from 6.5 m up: leaf clusters through a few masses, on limbs that fork from the trunk's top."""
    rng = random.Random(seed)
    h = CROWN_FOR["broadleaf-crown"]
    spots = []
    for i in range(masses):
        a = math.tau * i / masses + rng.uniform(-0.3, 0.3)
        d = rng.uniform(2.0, 3.6) if i else 0
        z = h - 2.2 + rng.uniform(-1.4, 1.2) + (1.5 if i == 0 else 0)
        spots.append((math.cos(a) * d, math.sin(a) * d, z))

    def build(bm):
        for i, (x, y, z) in enumerate(spots):
            r = rng.uniform(2.2, 3.0) if i else 3.0
            cluster(rng, bm, ("broad-a", "broad-b"), (x, y, z), (r, r, r * 0.62), per_mass, size, lift=0.25)
        # The clusters lie through each mass's skin: cards lying over the trunk's top close the hollow it would show through from above.
        for _ in range(caps):
            n = Vector((rng.uniform(-0.35, 0.35), rng.uniform(-0.35, 0.35), 1))
            right, upv = frame(n, rng.uniform(0, math.tau))
            s = size * 1.3
            card(bm, rng.choice(("broad-a", "broad-b")), Vector((rng.uniform(-0.8, 0.8), rng.uniform(-0.8, 0.8), h + rng.uniform(0.1, 0.7))) - upv * s / 2, right, upv, s, s)
    parts = [cards("canopy", build)]
    for x, y, z in spots[1:limbs + 1]:
        parts.append(solid(limb((0, 0, h * 0.55), (x * 0.8, y * 0.8, z - 0.8), 0.28, 0.12, bark)))
    return kit.asset(name, parts, smooth_angle=180)


def bush(name, seed, width, height, cells, count, size, stems=0, upright=0.25):
    """A shrub: leaf clusters through a dome on the ground, `width` across and `height` tall."""
    rng = random.Random(seed)

    def build(bm):
        cluster(rng, bm, cells, (0, 0, height * 0.5), (width * 0.5, width * 0.5, height * 0.5), count, size, up_bias=upright)
    parts = [cards("leaves", build)]
    for _ in range(stems):
        a = rng.uniform(0, math.tau)
        parts.append(solid(limb((0, 0, 0), (math.cos(a) * width * 0.2, math.sin(a) * width * 0.2, height * 0.5), 0.05, 0.03, twig, segments=4)))
    o = kit.asset(name, parts, smooth_angle=180)
    SOFT[name] = (round(width * 0.42, 2), round(height * 0.92, 2))
    return o


def crossed(name, cell, width, height, count, seed=0):
    """`count` cards standing crossed through the middle: a far plant, or a clump of grass far off."""
    rng = random.Random(seed)

    def build(bm):
        for i in range(count):
            a = math.pi * i / count + rng.uniform(-0.2, 0.2)
            card(bm, cell, (0, 0, -0.03), (math.cos(a), math.sin(a), 0), (0, 0, 1), width, height)
    return kit.asset(name, [cards(name, build)], smooth_angle=180)


def bush_lod(name, cell, width, height):
    """A shrub far off: three crossed cards and one lying across the top."""
    def build(bm):
        for i in range(3):
            a = math.pi * i / 3
            card(bm, cell, (0, 0, -0.05), (math.cos(a), math.sin(a), 0), (0, 0, 1), width, height * 1.05)
        card(bm, cell, (0, -width * 0.45, height * 0.7), (1, 0, 0), (0, 1, 0), width * 0.9, width * 0.9)
    return kit.asset(name, [cards(name, build)], smooth_angle=180)


def tussock(name, seed, cell, height, spread, count, segments=2):
    """A clump of tall grass: cards of blades crossing at its root, leaning a little out."""
    rng = random.Random(seed)

    def build(bm):
        for i in range(count):
            a = math.pi * i / count + rng.uniform(-0.25, 0.25)
            lean = rng.uniform(-0.2, 0.2)
            right = Vector((math.cos(a), math.sin(a), 0))
            out = right.cross(Vector((0, 0, 1)))
            card(bm, cell, out * rng.uniform(-0.05, 0.05), right, Vector((0, 0, 1)) + out * lean, spread, height * rng.uniform(0.85, 1.05), droop=height * 0.08, segments=segments)
    o = kit.asset(name, [cards(name, build)], smooth_angle=180)
    SOFT[name] = (round(spread * 0.45, 2), round(height * 0.88, 2))
    return o


def fern(name, seed, fronds, length, segments=3):
    """Fronds arching out from a crown at the ground, a jungle floor's cover."""
    rng = random.Random(seed)

    def build(bm):
        for i in range(fronds):
            a = math.tau * i / fronds + rng.uniform(-0.25, 0.25)
            out = Vector((math.cos(a), math.sin(a), 0))
            rise = rng.uniform(1.1, 2.4)
            along = (out + Vector((0, 0, rise))).normalized()
            right = out.cross(Vector((0, 0, 1))).normalized()
            n = length * rng.uniform(0.8, 1.05)
            card(bm, rng.choice(("fern-a", "fern-b")), (0, 0, 0), right, along, 0.55 * rng.uniform(0.85, 1.1), n, droop=n * 0.4 * max(0.2, 1 - rise / 2.6), segments=segments)
    o = kit.asset(name, [cards(name, build)], smooth_angle=180)
    SOFT[name] = (round(length * 0.55, 2), round(length * 0.72, 2))
    return o


def juniper(name, seed, sprays, width, height):
    """A low, wind-pressed conifer on the snowfields: sprays fanning up and out from its root."""
    rng = random.Random(seed)

    def build(bm):
        for i in range(sprays):
            a = math.tau * i / sprays + rng.uniform(-0.2, 0.2)
            out = Vector((math.cos(a), math.sin(a), 0))
            tilt = rng.uniform(0.25, 1.0) if i % 3 else rng.uniform(0.0, 0.2)
            along = (out * tilt + Vector((0, 0, 1))).normalized()
            right = out.cross(Vector((0, 0, 1))).normalized()
            roll = rng.uniform(-0.6, 0.6)
            right = (right * math.cos(roll) + out * math.sin(roll)).normalized()
            n = height * rng.uniform(0.75, 1.05) / max(along.z, 0.5)
            card(bm, "juniper", out * width * rng.uniform(0.0, 0.12), right, along, width * rng.uniform(0.45, 0.6), n, droop=n * 0.15, segments=2)
    o = kit.asset(name, [cards(name, build)], smooth_angle=180)
    SOFT[name] = (round(width * 0.42, 2), round(height * 0.9, 2))
    return o


def shade_with(o, normals, ao):
    o.data.normals_split_custom_set_from_vertices(normals)
    me = o.data
    for a in list(me.color_attributes):
        me.color_attributes.remove(a)
    ca = me.color_attributes.new("Color", "BYTE_COLOR", "POINT")
    me.color_attributes.active_color = ca
    for d, a in zip(ca.data, ao):
        d.color = (a, a, a, 1.0)
    return o


def volume(o, centre, radii, up=0.2, floor=None, ao_low=0.45):
    """Normals out from the plant's middle (an ellipsoid of `radii` round `centre`), leaning up; occlusion deepening inward and, given a
    `floor` height, toward the ground. Bark and stems (on the white cell) keep their own normals and a mid occlusion."""
    me = o.data
    uv = me.uv_layers["UVMap"].data
    on_card = [False] * len(me.vertices)
    for loop in me.loops:
        if (Vector(uv[loop.index].uv) - Vector(SOLID_UV)).length > 0.06:
            on_card[loop.vertex_index] = True
    c, r = Vector(centre), Vector(radii)
    normals, ao = [], []
    for v, leafy in zip(me.vertices, on_card):
        if not leafy:
            normals.append(v.normal.copy())
            ao.append(0.6)
            continue
        q = Vector(((v.co.x - c.x) / r.x, (v.co.y - c.y) / r.y, (v.co.z - c.z) / r.z))
        depth = min(q.length, 1.0)
        n = (q.normalized() if q.length > 1e-4 else Vector((0, 0, 1))) + Vector((0, 0, up))
        normals.append(n.normalized())
        a = ao_low + (1 - ao_low) * depth ** 1.5
        if floor is not None:
            a *= 0.7 + 0.3 * min(1.0, max(0.0, (v.co.z - floor) / (r.z * 0.8)))
        ao.append(a)
    return shade_with(o, normals, ao)


def blades_up(o, height, lean=0.3, ao_low=0.55):
    """Blades and fronds: normals leaning up and a little out, lit like the ground they grow from; darker at the root."""
    normals, ao = [], []
    for v in o.data.vertices:
        out = Vector((v.co.x, v.co.y, 0))
        out = out.normalized() if out.length > 1e-4 else Vector((0, 0, 0))
        normals.append((Vector((0, 0, 1)) + out * lean).normalized())
        ao.append(ao_low + (1 - ao_low) * min(1.0, max(0.0, v.co.z / height)) ** 0.6)
    return shade_with(o, normals, ao)


hard = [
    # Hard cover: rocks, filling a unit box.
    # Granite boulders on open ground, the Dustlands' sandstone ledges, Ground Zero's broken concrete (ticket 78).
    *[granite(name, seed, masses) for name, (seed, masses) in BOULDERS.items()],
    *[granite(f"{name}-lod", seed, masses, lod=True) for name, (seed, masses) in BOULDERS.items()],
    jointed("rock-strata", 13, ROCKS["rock-strata"]),
    jointed("rock-strata-lod", 13, ROCKS["rock-strata"], lod=True),
    *[broken(name, 71 + i, blocks) for i, (name, blocks) in enumerate(RUBBLE.items())],
    *[broken(f"{name}-lod", 71 + i, blocks, lod=True) for i, (name, blocks) in enumerate(RUBBLE.items())],
    # Trees' unit trunks.
    pine_trunk("pine-trunk", TRUNK_SIDES, turn=TRUNK_TURN),
    pine_trunk("pine-trunk-lod", 5, rings=1),
    broadleaf_trunk("broadleaf-trunk", TRUNK_SIDES, turn=TRUNK_TURN),
    broadleaf_trunk("broadleaf-trunk-lod", 5, rings=1),
]
PINE_TOP = CROWN_FOR["pine-crown"] + 1.6
PINE_MID, PINE_HALF = (3.0 + PINE_TOP) / 2, (PINE_TOP - 3.0) / 2 + 0.6
BROAD = CROWN_FOR["broadleaf-crown"]
# Soft cover keeps ticket 29's outer sizes, which the game's concealment (`SOFT`) is tuned to.
leafy = [
    volume(pine_crown("pine-crown", 21, 8, 9), (0, 0, PINE_MID), (3.4, 3.4, PINE_HALF), up=0.15),
    volume(pine_crown("pine-crown-lod", 22, 3, 4, core=3, ragged=False), (0, 0, PINE_MID), (3.4, 3.4, PINE_HALF), up=0.15),
    volume(broadleaf_crown("broadleaf-crown", 31, 7, 11, 2.0, 4), (0, 0, BROAD - 1.5), (6.2, 6.2, 3.2), up=0.25),
    volume(broadleaf_crown("broadleaf-crown-lod", 31, 4, 8, 3.4, 0, caps=3), (0, 0, BROAD - 1.5), (6.2, 6.2, 3.2), up=0.25),
    volume(bush("bush-leafy", 51, 2.3, 1.75, ("bush-a", "bush-b"), 26, 1.0, stems=3), (0, 0, 0.7), (1.2, 1.2, 1.0), floor=0.0),
    volume(bush_lod("bush-leafy-lod", "bush-a", 2.3, 1.75), (0, 0, 0.7), (1.2, 1.2, 1.0), floor=0.0),
    volume(bush("bush-dry", 52, 2.0, 1.5, ("dry-a", "dry-b"), 24, 0.95, stems=4, upright=0.5), (0, 0, 0.6), (1.05, 1.05, 0.9), floor=0.0),
    volume(bush_lod("bush-dry-lod", "dry-a", 2.0, 1.5), (0, 0, 0.6), (1.05, 1.05, 0.9), floor=0.0),
    volume(juniper("juniper", 53, 22, 2.2, 1.7), (0, 0, 0.6), (1.15, 1.15, 1.1), floor=0.0),
    volume(crossed("juniper-lod", "juniper", 1.9, 1.75, 3, seed=53), (0, 0, 0.6), (1.15, 1.15, 1.1), floor=0.0),
]
thin = [
    blades_up(fern("fern", 54, 16, 1.6), 1.2),
    blades_up(fern("fern-lod", 54, 7, 1.6, segments=1), 1.2),
    blades_up(tussock("grass-tall", 55, "grass", 1.35, 1.1, 4), 1.35),
    blades_up(crossed("grass-tall-lod", "grass", 1.1, 1.3, 2, seed=55), 1.35),
    blades_up(tussock("grass-dry", 56, "straw", 1.25, 1.1, 4), 1.25),
    blades_up(crossed("grass-dry-lod", "straw", 1.1, 1.2, 2, seed=56), 1.25),
    # Ground cover, drawn near only: no cover at all.
    blades_up(tussock("tuft", 57, "tuft", 0.38, 0.45, 3, segments=1), 0.38),
    blades_up(tussock("tuft-dry", 58, "tuft-dry", 0.32, 0.45, 3, segments=1), 0.32),
]
built = hard + leafy + thin
for o in built:
    o.location = (0, 0, 0)
kit.bake_ao(hard, distance=0.8, samples=16)
for o in hard:
    # The GLB carries one UV set for the whole kit: rocks and trunks sit on the white cell.
    solid(o)
result = {"assets": {o.name: {"tris": kit.tris(o), "size": [round(d, 2) for d in o.dimensions]} for o in built}, "soft": SOFT}
if ARGS.get("export", False):  # noqa: F821
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    kit.export(built, OUT, texcoords=True)
    result["glb"] = {"path": os.path.abspath(OUT), "bytes": os.path.getsize(OUT)}
