"""Mutant Jungle's kit (ticket 22): the giant glowing tree in the clearing, the temple's ruins, the gateways and the
colonnade, crystals grown up through the floor, the research camp on stilts, and the models the cover pass's pieces
there wear. Builds apps/range/public/models/jungle.glb:

    blender -b --factory-startup --python tools/map/build.py -- tools/map/regions/jungle.py --export --preview DIR

The pieces' boxes come from tools/map/regions/jungle.json, which the test writes from the plan
(apps/range/src/map/zero-island-jungle-plan.ts; `UPDATE_KIT=1`). See tools/map/regionkit.py for the pattern.
Permanent dusk under a canopy: grey-green ashlar gone over to moss, dark bark with veins glowing cyan, a teal canopy
hung with magenta and cyan pods, violet and cyan crystals lit from inside, the camp's planks and olive tin.
"""
import math
import os
import random
import sys

import bmesh
from mathutils import Matrix, Vector

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(HERE))
import regionkit  # noqa: E402

OUT = os.path.join(HERE, "..", "..", "..", "apps", "range", "public", "models", "jungle.glb")
rk = regionkit.RegionKit(bkit, "jungle", os.path.join(HERE, "jungle.json"))  # noqa: F821
kit = rk.kit
box = rk.box
EIGHTH = math.pi / 4

# Finishes: colour (sRGB) and the photo layer it wears.
stone = rk.mat("mj.stone", (128, 134, 118), "moss", 0.9)
stone_dark = rk.mat("mj.stonedark", (86, 94, 82), "moss", 0.9)
stone_pale = rk.mat("mj.stonepale", (150, 150, 132), "wall", 0.9)
moss = rk.mat("mj.moss", (62, 104, 52), "moss", 0.95)
rock = rk.mat("mj.rock", (78, 80, 84), "boulder", 0.9)
bark = rk.mat("mj.bark", (74, 64, 54), "moss", 0.95)
bark_dark = rk.mat("mj.barkdark", (48, 42, 38), "moss", 0.95)
leaf = rk.mat("mj.leaf", (34, 86, 70), "jungle", 0.9, glow=(0.0, 0.012, 0.01))
leaf_dark = rk.mat("mj.leafdark", (24, 58, 54), "jungle", 0.9)
leaf_violet = rk.mat("mj.leafviolet", (70, 50, 96), "jungle", 0.9, glow=(0.012, 0.0, 0.02))
plank = rk.mat("mj.plank", (118, 92, 64), "plank", 0.85)
plank_dark = rk.mat("mj.plankdark", (74, 58, 42), "plank", 0.85)
tin = rk.mat("mj.tin", (88, 98, 74), "tin", 0.6, 0.3)
olive = rk.mat("mj.olive", (78, 88, 60), "plate", 0.6, 0.3)
olive_dark = rk.mat("mj.olivedark", (52, 58, 42), "plate", 0.6, 0.3)
steel = rk.mat("mj.steel", (96, 100, 104), "steel", 0.55, 0.5)
steel_dark = rk.mat("mj.steeldark", (44, 46, 50), "steel", 0.6, 0.4)
rubber = rk.mat("mj.rubber", (30, 30, 32), None, 0.95)
glass = rk.mat("mj.glass", (22, 32, 34), None, 0.12, 0.3)
canvas = rk.mat("mj.canvas", (104, 104, 74), None, 0.95)
rust = rk.mat("mj.rust", (112, 64, 40), "plate", 0.8, 0.3)

# Light: the tree's veins and the runes cyan, the pods magenta and cyan, the crystals violet and cyan from inside.
vein = rk.mat("mj.vein", (90, 255, 220), None, 0.4, glow=(0.12, 1.1, 0.85))
rune = rk.mat("mj.rune", (110, 240, 255), None, 0.4, glow=(0.15, 0.85, 1.1))
pod_pink = rk.mat("mj.podpink", (255, 90, 220), None, 0.4, glow=(1.3, 0.12, 1.0))
pod_cyan = rk.mat("mj.podcyan", (90, 240, 255), None, 0.4, glow=(0.1, 1.0, 1.2))
crystal_violet = rk.mat("mj.crystalviolet", (168, 96, 236), "ice", 0.15, glow=(0.32, 0.06, 0.62))
crystal_cyan = rk.mat("mj.crystalcyan", (96, 220, 230), "ice", 0.15, glow=(0.04, 0.42, 0.48))
crystal_core = rk.mat("mj.crystalcore", (236, 200, 255), None, 0.3, glow=(1.2, 0.5, 1.6))
lit_warm = rk.mat("mj.litwarm", (255, 204, 150), None, 0.4, glow=(1.0, 0.64, 0.3))
beacon = rk.mat("mj.beacon", (255, 40, 30), None, 0.4, glow=(1.4, 0.08, 0.05))

# What's picked by chance must be the same in a piece's model and its `-lod` twin: each box draws from a generator
# keyed by the piece and the box's place in it (see frostbite.py).
CUR = {"name": "", "n": 0, "b": None}
_piece = rk.piece
_boxes = rk._boxes


def _keyed_piece(name, lod):
    CUR["name"], CUR["n"] = name, 0
    return _piece(name, lod)


def _tracked(boxes):
    for kind, b in _boxes(boxes):
        CUR["b"] = b
        CUR["n"] += 1
        yield kind, b


rk.piece = _keyed_piece
rk._boxes = _tracked


def R():
    return random.Random(f"{CUR['name']}:{CUR['n']}")


def base_y():
    """The piece-frame height of the current box's middle."""
    return CUR["b"]["c"][1]


def thin_axis(s):
    return 0 if s[0] < s[2] else 2


def block(lo, hi, mat, lod, bevel=0.035):
    """A dressed stone: chamfered, so the joints between stones show."""
    if lod:
        return kit.box(lo, hi, mat)
    b = min(bevel, (hi[0] - lo[0]) / 4, (hi[1] - lo[1]) / 4, (hi[2] - lo[2]) / 4)
    return kit.box(lo, hi, mat, b, segments=1)


def blob(c, r, mat, rng, lo, hi, subdiv=2, rough=0.18, ground=False):
    """A lumpy round mass (an ellipsoid of radii `r` about `c`, its surface pushed in and out), clamped inside lo..hi:
    where it meets the box it's flat, as what stops a body there is."""
    bm = bmesh.new()
    bmesh.ops.create_icosphere(bm, subdivisions=subdiv, radius=1.0)
    phase = [rng.uniform(0, 6.3) for _ in range(3)]
    for v in bm.verts:
        d = v.co.normalized()
        k = 1 + rough * (math.sin(3.1 * d.x + phase[0]) * math.sin(2.7 * d.y + phase[1]) + 0.6 * math.sin(4.3 * d.z + phase[2]))
        v.co = Vector((c[0] + d.x * r[0] * k, c[1] + d.z * r[1] * k, c[2] + d.y * r[2] * k))
    # Facing out is settled while it's still round: clamped flat, half its faces have no area to tell by.
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    if bm.faces[0].normal.dot(bm.faces[0].calc_center_median() - Vector(c)) < 0:
        bmesh.ops.reverse_faces(bm, faces=bm.faces)
    # Game (x, y, z) to Blender keeps handedness (a turn), so the faces still face out after it. Each blob is
    # clamped a hair inside its box, its own hair: two flat on one plane would read to the solid fitter as one face.
    e = rng.uniform(0.0005, 0.004)
    lo, hi = [a + e for a in lo], [b - e for b in hi]
    if ground:
        # Standing on the ground: down to it exactly, as the cover's solids must reach it.
        lo[1] -= e
    for v in bm.verts:
        g = tuple(min(hi[i], max(lo[i], v.co[i])) for i in range(3))
        v.co = Vector(kit.b(g))
    bm.normal_update()
    return kit.obj("blob", bm, mat, smooth=True)


def courses(s, lod, rng, course=0.55, length=(0.9, 1.6), mats=None, jag=0.0, moss_top=True):
    """A run of stone in its box: courses of dressed blocks laid in bond along the longer side, the top course broken
    off here and there by up to `jag`, moss on what's left of the top."""
    hx, hy, hz = s[0] / 2, s[1] / 2, s[2] / 2
    along = 0 if s[0] >= s[2] else 2
    L = s[along]
    mats = mats or [stone, stone, stone_dark, stone_pale]
    out = []
    if lod:
        out.append(kit.box([-hx, -hy, -hz], [hx, hy, hz], stone))
        return out
    n = max(1, round(s[1] / course))
    hc = s[1] / n
    # How far each stretch of the top is broken down, in whole courses.
    breaks = []
    u = -L / 2
    while u < L / 2 - 1e-6:
        w = min(L / 2 - u, rng.uniform(0.15, 0.4) * min(L, 6.0))
        # About half the top stands its full height: what's left stands as tall as its box.
        broken = jag > 0 and len(breaks) != 1 and rng.random() < 0.55
        breaks.append((u, u + w, min(n - 1, int(rng.uniform(1, jag / hc + 0.999))) if broken else 0))
        u += w
    for i in range(n):
        y0, y1 = -hy + i * hc, -hy + (i + 1) * hc
        u = -L / 2 - (rng.uniform(0.2, 0.6) if i % 2 else 0)
        while u < L / 2 - 1e-6:
            a, b = max(u, -L / 2), min(u + rng.uniform(*length), L / 2)
            if b - a < 0.25 and b < L / 2 - 1e-6:
                b = min(L / 2, a + 0.5)
            mid = (a + b) / 2
            gone = next((k for p, q, k in breaks if p <= mid < q), 0)
            if i < n - gone:
                lo, hi = [-hx, y0, -hz], [hx, y1, hz]
                lo[along], hi[along] = a, b
                top = i == n - gone - 1
                m = moss if (top and moss_top and rng.random() < 0.55) else mats[rng.randrange(len(mats))]
                out.append(block(lo, hi, m, lod))
            u = b
    return out


# ------------------------------------------------------------------ the giant tree


def trunk(r, y0, y1, lod, rng):
    """The trunk: an octagon of dark bark, ridged, veins glowing cyan climbing it between the ridges."""
    rng = R()
    R8 = (r - 0.04) / math.cos(math.pi / 8)
    o = kit.lathe([(y0, R8), (y1, R8)], (0, 0, 0), bark_dark, 8, smooth=False)
    o.data.transform(Matrix.Rotation(math.pi / 8, 4, "Z"))
    out = [o]
    w = 2 * r * math.tan(math.pi / 8)
    for k in range(8):
        parts = []
        # Ridges of bark proud of the core, with veins in the furrows between them.
        edges = [-w / 2 + 0.05, -w / 2 + w * 0.3, -w / 2 + w * 0.36, w / 2 - w * 0.36, w / 2 - w * 0.3, w / 2 - 0.05]
        for a, b in ((edges[0], edges[1]), (edges[2], edges[3]), (edges[4], edges[5])):
            parts.append(kit.box([r - 0.06, y0, a], [r, y1, b], bark))
        if not lod:
            for a, b in ((edges[1], edges[2]), (edges[3], edges[4])):
                z = (a + b) / 2
                y = y0 + rng.uniform(0, 1.5)
                off = 0.0
                while y < y1 - 0.5:
                    seg = rng.uniform(0.6, 1.6)
                    parts.append(kit.box([r - 0.05, y, z + off - 0.035], [r - 0.035, min(y1, y + seg), z + off + 0.035], vein))
                    nxt = rng.uniform(-0.09, 0.09)
                    parts.append(kit.box([r - 0.05, y + seg - 0.07, z + min(off, nxt) - 0.035], [r - 0.035, min(y1, y + seg), z + max(off, nxt) + 0.035], vein))
                    off = nxt
                    y += seg - 0.07
                    if rng.random() < 0.15:
                        y += rng.uniform(0.5, 1.5)
        for p in parts:
            p.data.transform(Matrix.Rotation(k * EIGHTH, 4, "Z"))
        out += parts
    return out


def flare(r, y0, y1, lod, rng):
    """The trunk's flared foot: wide at the ground, sweeping up into the trunk, moss in its lap."""
    R8 = r / math.cos(math.pi / 8)
    top = (3.4 - 0.04) / math.cos(math.pi / 8)
    n = 3 if lod else 7
    prof = [(y0, R8)]
    for i in range(1, n + 1):
        t = i / n
        prof.append((y0 + (y1 - y0) * t, top + (R8 - top) * (1 - t) ** 2))
    o = kit.lathe(prof, (0, 0, 0), bark, 8, smooth=False)
    o.data.transform(Matrix.Rotation(math.pi / 8, 4, "Z"))
    out = [o]
    o = kit.lathe([(y0, R8 - 0.05), (y0 + 0.35, R8 - 0.05), (y0 + 0.45, R8 - 0.6)], (0, 0, 0), moss, 8, smooth=False)
    o.data.transform(Matrix.Rotation(math.pi / 8, 4, "Z"))
    out.append(o)
    return out


def loft(sections, mat):
    """A solid through cross-sections: each a list of game points, all the same length, joined ring to ring."""
    bm = bmesh.new()
    rings = [[bm.verts.new(kit.b(p)) for p in sec] for sec in sections]
    k = len(sections[0])
    for a, c in zip(rings, rings[1:]):
        for i in range(k):
            bm.faces.new((a[i], a[(i + 1) % k], c[(i + 1) % k], c[i]))
    bm.faces.new(list(reversed(rings[0])))
    bm.faces.new(rings[-1])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return kit.obj("loft", bm, mat, smooth=True)


def root(s, lod, rng):
    """A root running out from the trunk along the ground: thick and high at the trunk, thinning and sinking to its
    tip, a vein glowing along its crest, moss on its flank."""
    rng = R()
    hx, hy, hz = s[0] / 2, s[1] / 2, s[2] / 2
    n = 4 if lod else 10
    m = 6 if lod else 10
    sections = []
    crest = []
    for i in range(n + 1):
        t = i / n
        x = -hx + s[0] * t
        h = 0.2 + (s[1] - 0.24) * (1 - t) ** 1.4
        w = hz * (1 - 0.6 * t)
        wob = 0.0 if i in (0, n) else rng.uniform(-0.12, 0.12) * (hz - w + 0.1)
        sec = [(x, -hy + h * math.sin(math.pi * j / m), wob + w * math.cos(math.pi * j / m)) for j in range(m + 1)]
        sections.append(sec)
        crest.append((x, -hy + h, wob))
    out = [loft(sections, bark)]
    if not lod:
        vs = [[(x, y - 0.06, z - 0.06), (x, y + 0.035, z), (x, y - 0.06, z + 0.06)] for x, y, z in crest[:-1]]
        out.append(loft(vs, vein))
        if rng.random() < 0.7:
            x = rng.uniform(-hx + 0.5, hx - 1.5)
            out.append(blob((x, -hy + 0.3, rng.choice((-1, 1)) * (hz - 0.35)), (0.7, 0.3, 0.3), moss, rng, [-hx, -hy, -hz], [hx, hy, hz], 1))
    return out


def bough(s, lod, rng):
    """A bough out from the trunk into the canopy, tapering, leaves bunched at its tip."""
    rng = R()
    hx, hy, hz = s[0] / 2, s[1] / 2, s[2] / 2
    out = [kit.cylinder(hy - 0.02, -hx, hx - 1.2, (0, 0, 0), "x", bark, 8 if lod else 12, r2=hy * 0.45)]
    lo, hi = [-hx, -hy, -hz], [hx, hy, hz]
    for k in range(1 if lod else 3):
        x = hx - 1.0 - k * 1.3
        out.append(blob((x, rng.uniform(-0.1, 0.3), rng.uniform(-0.3, 0.3)), (1.1, 0.9, 1.0), leaf if k % 2 == 0 else leaf_dark, rng, lo, hi, 1 if lod else 2))
    return out


def canopy(s, lod, rng):
    """The canopy: masses of teal leaves, a violet one here and there, pods glowing magenta and cyan hung under it."""
    rng = R()
    hx, hy, hz = s[0] / 2, s[1] / 2, s[2] / 2
    lo, hi = [-hx, -hy, -hz], [hx, hy, hz]
    sub = 1 if lod else 2
    out = []
    upper = s[0] < 20
    if upper:
        # The crown: it settles down into the canopy under it (the box below is the lower canopy's, and wider).
        lo = [-hx, -hy - 4.0, -hz]
        masses = [(0, -0.4, 0, 5.8, 3.4)] + [(4.4 * math.cos(a), rng.uniform(-1.8, -0.6), 4.4 * math.sin(a), 3.8, 3.0) for a in (0.4, 2.0, 3.5, 5.0)]
    else:
        masses = [(0, 1.0, 0, 7.8, 3.4)]
        for k in range(9):
            a = k * 2 * math.pi / 9 + rng.uniform(-0.15, 0.15)
            d = rng.uniform(8.6, 9.6)
            masses.append((d * math.cos(a), rng.uniform(-0.9, 0.2), d * math.sin(a), rng.uniform(3.8, 4.6), rng.uniform(3.2, 3.6)))
        for k in range(5):
            a = k * 2 * math.pi / 5 + 0.6
            masses.append((5.2 * math.cos(a), rng.uniform(-0.6, 0.6), 5.2 * math.sin(a), 4.4, 3.4))
    for i, (x, y, z, rh, rv) in enumerate(masses):
        m = leaf_violet if (i % 5 == 3) else (leaf if rng.random() < 0.6 else leaf_dark)
        out.append(blob((x, y, z), (rh, rv, rh * rng.uniform(0.85, 1.1)), m, rng, lo, hi, sub, 0.22))
    if not upper:
        # The pods: hung under the canopy's rim and round the trunk, each on a short stalk.
        n = 10 if lod else 34
        for k in range(n):
            a = rng.uniform(0, 2 * math.pi)
            d = rng.uniform(4.5, 12.5)
            x, z = d * math.cos(a), d * math.sin(a)
            y = -hy + rng.uniform(0.3, 1.6)
            r = rng.uniform(0.18, 0.34)
            m = pod_pink if rng.random() < 0.55 else pod_cyan
            out.append(blob((x, y, z), (r, r * 1.35, r), m, rng, lo, hi, 1, 0.05))
            if not lod:
                out.append(kit.cylinder(0.03, y + r, y + r + 1.2, (x, 0, z), "y", leaf_dark, 4, smooth=False))
    return out


rk.dress("trunk", trunk)
rk.dress("flare", flare)
rk.dress("root", root)
rk.dress("bough", bough)
rk.dress("canopy", canopy)

# ------------------------------------------------------------------ the ruins


def plinth(s, lod, rng):
    """The temple's plinth: two courses of big blocks, flagstones on top with moss grown up between them."""
    rng = R()
    hx, hy, hz = s[0] / 2, s[1] / 2, s[2] / 2
    if lod:
        return [kit.box([-hx, -hy, -hz], [hx, hy, hz], stone)]
    out = []
    n = 8
    for i in range(n):
        a, b = -hx + s[0] * i / n, -hx + s[0] * (i + 1) / n
        out.append(block([a, -hy, -hz], [b, 0, hz], stone_dark if i % 3 == 1 else stone, lod, 0.05))
    for j in range(n):
        a, b = -hz + s[2] * j / n, -hz + s[2] * (j + 1) / n
        out.append(block([-hx, 0, a], [hx, hy - 0.03, b], stone if j % 2 else stone_pale, lod, 0.05))
    for k in range(9):
        x, z = rng.uniform(-hx + 1.2, hx - 1.2), rng.uniform(-hz + 1.2, hz - 1.2)
        w, d = rng.uniform(0.8, 2.4), rng.uniform(0.6, 1.8)
        out.append(kit.box([max(-hx, x - w), hy - 0.03, max(-hz, z - d)], [min(hx, x + w), hy, min(hz, z + d)], moss))
    return out


def step(s, lod, rng):
    hx, hy, hz = s[0] / 2, s[1] / 2, s[2] / 2
    out = [block([-hx, -hy, -hz], [hx, hy, 0], stone, lod), block([-hx, -hy, 0], [hx, hy, hz], stone_pale, lod)]
    return out


def ruin_wall(s, lod, rng):
    """A ruined wall: dressed blocks gone green, its top broken down a course or two in places."""
    top = base_y() + s[1] / 2
    jag = 0.0 if top < 2.5 else min(1.1, s[1] * 0.3)
    return courses(s, lod, R(), jag=jag)


def roof_slab(s, lod, rng):
    """What's left of the roof: two great slabs laid side by side, moss and leaves on them."""
    rng = R()
    hx, hy, hz = s[0] / 2, s[1] / 2, s[2] / 2
    out = [block([-hx, -hy, -hz], [hx, hy - 0.04, 0], stone_dark, lod, 0.06), block([-hx, -hy, 0], [hx, hy - 0.04, hz], stone, lod, 0.06)]
    out.append(kit.box([-hx + 0.3, hy - 0.04, -hz + 0.4], [hx - 0.8, hy, hz - 1.2], moss))
    return out


def altar(s, lod, rng):
    """The altar: a block on a step, runes cut in its faces glowing, the crystal growing out of its top."""
    hx, hy, hz = s[0] / 2, s[1] / 2, s[2] / 2
    out = [block([-hx, -hy, -hz], [hx, -hy + 0.2, hz], stone_dark, lod), block([-hx + 0.12, -hy + 0.2, -hz + 0.12], [hx - 0.12, hy, hz - 0.12], stone_pale, lod)]
    if not lod:
        f = hx - 0.12
        for k in range(4):
            parts = []
            for y0, y1, a, b in ((-0.1, 0.3, -0.4, -0.3), (-0.1, 0.0, -0.2, 0.2), (0.2, 0.3, -0.2, 0.2), (-0.1, 0.3, 0.3, 0.4), (0.05, 0.15, -0.05, 0.05)):
                parts.append(kit.box([f - 0.004, y0, a], [f + 0.004, y1, b], rune))
            for p in parts:
                p.data.transform(Matrix.Rotation(k * math.pi / 2, 4, "Z"))
            out += parts
    return out


def crystal_one(base, h, r, tilt, yaw, mat, lod):
    """One crystal: a six-sided shaft rising from `base` to a point, leaning `tilt` toward `yaw`."""
    prof = [(0.0, r * 0.75), (0.15 * h, r), (0.78 * h, r), (h, 0.0)]
    o = kit.lathe(prof, (0, 0, 0), mat, 6, smooth=False)
    turn = Matrix.Rotation(yaw, 4, "Z") @ Matrix.Rotation(tilt, 4, "X")
    # Leaning, the foot's edge would dip under the ground: lift it by as much.
    base = (base[0], base[1] + r * 0.75 * abs(math.sin(tilt)), base[2])
    o.data.transform(Matrix.Translation(kit.b(base)) @ turn)
    out = [o]
    if not lod and h > 1.5:
        c = kit.lathe([(0.12 * h, r * 0.4), (0.7 * h, r * 0.4), (0.85 * h, 0.0)], (0, 0, 0), crystal_core, 6, smooth=False)
        c.data.transform(Matrix.Translation(kit.b(base)) @ turn)
        out.append(c)
    return out


def cluster(lo, hi, rng, lod, mats=None, lift=0.0):
    """A cluster of crystals inside lo..hi: one tall one up the middle, smaller ones leaning out round it."""
    w = min(hi[0] - lo[0], hi[2] - lo[2])
    H = hi[1] - lo[1]
    cx, cz = (lo[0] + hi[0]) / 2, (lo[2] + hi[2]) / 2
    mats = mats or ([crystal_violet, crystal_cyan] if rng.random() < 0.6 else [crystal_cyan, crystal_violet])
    r0 = w * 0.22
    # `lift` stands them a little up in the rock they grow out of, so no foot lies on the rock's own foot.
    out = crystal_one((cx, lo[1] + lift, cz), H - lift, r0, 0.0, rng.uniform(0, 1), mats[0], lod)
    for k in range(2 if lod else 4):
        h = H * rng.uniform(0.35, 0.6)
        r = r0 * rng.uniform(0.45, 0.7)
        a = k * math.pi / 2 + rng.uniform(-0.4, 0.4)
        d = r0 * 0.9
        # Lean out as far as the box lets the tip go.
        room = w / 2 - d - r * 1.2
        tilt = max(0.0, min(0.55, math.asin(max(0.0, min(1.0, room / h)))))
        # Blender's z turn: the lean's direction in the plan. Game (x, z) is Blender (x, -y).
        bx, bz = cx + d * math.cos(a), cz + d * math.sin(a)
        yaw = math.atan2(-math.sin(a), math.cos(a)) - math.pi / 2
        out += crystal_one((bx, lo[1] + lift, bz), h, r, -tilt, yaw, mats[k % 2 == 0], lod)
    return out


def crystal(s, lod, rng):
    hx, hy, hz = s[0] / 2, s[1] / 2, s[2] / 2
    return cluster([-hx, -hy, -hz], [hx, hy, hz], R(), lod)


def column(s, lod, rng):
    """A round column on a square base, its capital on if it still stands its full height, else broken off."""
    rng = R()
    hx, hy, hz = s[0] / 2, s[1] / 2, s[2] / 2
    whole = s[1] >= 4.9
    out = [block([-hx, -hy, -hz], [hx, -hy + 0.35, hz], stone_dark, lod)]
    r = hx - 0.14
    top = hy - (0.4 if whole else 0.0)
    seg = 10 if lod else 16
    n = 1 if lod else max(1, int((top + hy - 0.35) / 1.1))
    for i in range(n):
        y0 = -hy + 0.35 + (top + hy - 0.35) * i / n
        y1 = -hy + 0.35 + (top + hy - 0.35) * (i + 1) / n
        out.append(kit.cylinder(r - (0.02 if i % 2 else 0.0), y0 + (0.0 if i == 0 or lod else 0.015), y1, (0, 0, 0), "y", stone if (i + n) % 3 else stone_pale, seg))
    if whole:
        out.append(block([-hx, hy - 0.4, -hz], [hx, hy, hz], stone, lod))
    elif not lod:
        out.append(kit.cylinder(r + 0.01, top - 0.2, top, (0, 0, 0), "y", moss, seg))
    if not lod:
        out.append(kit.cylinder(r + 0.015, -hy + 0.35, -hy + 0.35 + rng.uniform(0.4, 0.9), (0, 0, 0), "y", moss, seg))
    return out


def column_fallen(s, lod, rng):
    """A fallen column: its drums lying end to end along the ground where it fell, a little apart."""
    hx, hy, hz = s[0] / 2, s[1] / 2, s[2] / 2
    along = "x" if s[0] >= s[2] else "z"
    L = max(s[0], s[2])
    r = hy - 0.01
    out = []
    n = 1 if lod else 4
    for i in range(n):
        a = -L / 2 + L * i / n + (0.03 if i else 0)
        b = -L / 2 + L * (i + 1) / n - (0.03 if i < n - 1 else 0)
        c = (0, 0, 0)
        out.append(kit.cylinder(r - (0.03 if i % 2 else 0), a, b, c, along, stone if i % 2 else stone_pale, 10 if lod else 16))
    if not lod:
        o = kit.box([-L * 0.2, r - 0.12, -0.25], [L * 0.15, r - 0.02, 0.25], moss)
        if along == "z":
            o.data.transform(Matrix.Rotation(math.pi / 2, 4, "Z"))
        out.append(o)
    return out


def rubble(s, lod, rng):
    """A heap of fallen blocks: low ones lying round, a few taller ones standing in the middle, all on the ground."""
    rng = R()
    hx, hy, hz = s[0] / 2, s[1] / 2, s[2] / 2
    out = []
    layers = [(-hy, -hy + s[1] * 0.55, 6 if not lod else 3), (-hy, hy, 3 if not lod else 1)]
    for li, (y0, y1, n) in enumerate(layers):
        spread = 1.0 if li == 0 else 0.55
        for k in range(n):
            w, d = rng.uniform(0.5, 1.0) * min(hx, hz), rng.uniform(0.4, 0.8) * min(hx, hz)
            reach = math.hypot(w, d) / 2
            if reach > min(hx, hz) * spread:
                f = min(hx, hz) * spread / reach
                w, d, reach = w * f, d * f, reach * f
            x = rng.uniform(-hx * spread + reach, hx * spread - reach)
            z = rng.uniform(-hz * spread + reach, hz * spread - reach)
            h = (y1 - y0) * rng.uniform(0.7, 1.0)
            o = block([-w / 2, 0, -d / 2], [w / 2, h, d / 2], stone if rng.random() < 0.6 else (stone_dark if rng.random() < 0.6 else moss), lod, 0.015)
            o.data.transform(Matrix.Translation(kit.b((x, y0, z))) @ Matrix.Rotation(rng.uniform(0, 6.3), 4, "Z"))
            out.append(o)
    return out


def pier(s, lod, rng):
    """A gateway's pier: courses of big blocks, a moulded cap."""
    hx, hy, hz = s[0] / 2, s[1] / 2, s[2] / 2
    out = courses([s[0] - 0.12, s[1] - 0.3, s[2] - 0.12], lod, R(), course=0.75, length=(0.6, 1.0), moss_top=False)
    for o in out:
        o.data.transform(Matrix.Translation(kit.b((0, -0.15, 0))))
    out.append(block([-hx, hy - 0.3, -hz], [hx, hy, hz], stone_pale, lod))
    return out


def lintel(s, lod, rng):
    """The lintel: one great stone across the piers, a band of runes glowing along both faces."""
    hx, hy, hz = s[0] / 2, s[1] / 2, s[2] / 2
    out = [block([-hx + 0.01, -hy, -hz], [hx - 0.01, hy - 0.06, hz], stone_pale, lod, 0.06)]
    out.append(kit.box([-hx + 0.05, hy - 0.06, -hz + 0.1], [hx - 0.05, hy, hz - 0.1], moss))
    if not lod:
        rng = R()
        for side in (-1, 1):
            f = side * (hx - 0.01)
            z = -hz + 0.6
            while z < hz - 0.6:
                w = rng.uniform(0.12, 0.3)
                y0 = rng.choice((-0.25, -0.05, 0.1))
                out.append(kit.box([min(f, f + side * 0.008), y0, z], [max(f, f + side * 0.008), y0 + rng.uniform(0.08, 0.22), z + w], rune))
                z += w + rng.uniform(0.08, 0.25)
    return out


def stylobate(s, lod, rng):
    hx, hy, hz = s[0] / 2, s[1] / 2, s[2] / 2
    out = []
    n = 1 if lod else 8
    for i in range(n):
        a, b = -hx + s[0] * i / n, -hx + s[0] * (i + 1) / n
        out.append(block([a, -hy, -hz], [b, hy, hz], stone_pale if i % 2 else stone, lod, 0.05))
    return out


def architrave(s, lod, rng):
    hx, hy, hz = s[0] / 2, s[1] / 2, s[2] / 2
    out = [block([-hx, -hy, -hz], [0.2, hy, hz], stone_pale, lod, 0.05), block([0.2, -hy, -hz], [hx, hy - 0.15, hz], stone, lod, 0.05)]
    if not lod:
        out.append(kit.box([-hx + 0.2, hy - 0.04, -hz + 0.1], [-0.4, hy, hz - 0.1], moss))
    return out


def rock_base(s, lod, rng):
    """The outcrop's rock: a broken mound, flat where it meets its box, moss on its shoulders."""
    rng = R()
    hx, hy, hz = s[0] / 2, s[1] / 2, s[2] / 2
    lo, hi = [-hx, -hy, -hz], [hx, hy, hz]
    out = [blob((0, -hy, 0), (hx * 1.12, s[1] * 1.15, hz * 1.12), rock, rng, lo, hi, 1 if lod else 2, 0.12, ground=True)]
    if not lod:
        out.append(blob((hx * 0.4, hy - 0.2, -hz * 0.3), (1.4, 0.25, 1.1), moss, rng, lo, hi, 1))
    return out


rk.dress("plinth", plinth)
rk.dress("step", step)
rk.dress("ruin-wall", ruin_wall)
rk.dress("roof-slab", roof_slab)
rk.dress("altar", altar)
rk.dress("crystal", crystal)
rk.dress("column", column)
rk.dress("column-fallen", column_fallen)
rk.dress("rubble", rubble)
rk.dress("pier", pier)
rk.dress("lintel", lintel)
rk.dress("stylobate", stylobate)
rk.dress("architrave", architrave)
rk.dress("rock", rock_base)

# ------------------------------------------------------------------ the camp


def deck(s, lod, rng):
    """The deck: boards across a frame of beams, the beams' ends showing."""
    hx, hy, hz = s[0] / 2, s[1] / 2, s[2] / 2
    out = [kit.box([-hx, -hy, -hz], [hx, hy - 0.06, hz], plank_dark)]
    n = 1 if lod else int(s[0] / 0.3)
    for i in range(n):
        a, b = -hx + s[0] * i / n, -hx + s[0] * (i + 1) / n
        g = 0 if lod else 0.012
        out.append(kit.box([a + g, hy - 0.06, -hz], [b - g, hy, hz], plank if i % 4 else plank_dark))
    return out


def post(s, lod, rng):
    hx, hy, hz = s[0] / 2, s[1] / 2, s[2] / 2
    out = [kit.box([-hx, -hy, -hz], [hx, hy, hz], plank_dark)]
    if not lod:
        out.append(kit.box([-hx, -hy, -hz], [hx, -hy + 0.5, hz], moss))
    return out


def stair(s, lod, rng):
    """A step of the camp's stair: closed, a board on its tread and its riser, the sides boarded."""
    hx, hy, hz = s[0] / 2, s[1] / 2, s[2] / 2
    out = [kit.box([-hx, -hy, -hz], [hx - 0.03, hy - 0.05, hz], plank_dark)]
    out.append(kit.box([-hx, hy - 0.05, -hz], [hx, hy, hz], plank))
    out.append(kit.box([hx - 0.03, max(-hy, hy - 0.4), -hz], [hx, hy - 0.05, hz], plank))
    return out


def hut_wall(s, lod, rng):
    """The hut's wall: boards up and down, battens over the joints, the bottom gone green."""
    hx, hy, hz = s[0] / 2, s[1] / 2, s[2] / 2
    t = thin_axis(s)
    th = s[t] / 2
    L = s[2 - t]
    d = 0 if lod else 0.02
    lo, hi = [-hx, -hy, -hz], [hx, hy, hz]
    lo[t], hi[t] = -th + d, th - d
    out = [kit.box(lo, hi, plank)]
    if lod:
        return out
    n = max(1, round(L / 0.6))
    for i in range(n + 1):
        u = -L / 2 + 0.04 + (L - 0.08) * i / n
        bl, bh = [0, -hy, 0], [0, hy, 0]
        bl[t], bh[t] = -th, th
        bl[2 - t], bh[2 - t] = u - 0.04, u + 0.04
        out.append(kit.box(bl, bh, plank_dark))
    return out


def hut_roof(s, lod, rng):
    """The hut's roof: olive tin on purlins, leaves fallen on it."""
    rng = R()
    hx, hy, hz = s[0] / 2, s[1] / 2, s[2] / 2
    out = [kit.box([-hx, -hy, -hz], [hx, -hy + 0.12, hz], plank_dark)]
    n = 1 if lod else int(s[2] / 0.25)
    for i in range(n):
        a, b = -hz + s[2] * i / n, -hz + s[2] * (i + 1) / n
        out.append(kit.box([-hx, -hy + 0.12, a], [hx, hy - (0.0 if i % 2 else 0.03), b], tin))
    if not lod:
        for k in range(3):
            x, z = rng.uniform(-hx + 1, hx - 1), rng.uniform(-hz + 1, hz - 1)
            out.append(blob((x, hy - 0.02, z), (0.9, 0.08, 0.7), leaf_dark, rng, [-hx, -hy, -hz], [hx, hy, hz], 1, 0.1))
    return out


def rail(s, lod, rng):
    """The deck's rail: posts, a top rail, and woven matting to knee height and over."""
    hx, hy, hz = s[0] / 2, s[1] / 2, s[2] / 2
    t = thin_axis(s)
    th = s[t] / 2
    L = s[2 - t]
    out = []

    def run(u0, u1, y0, y1, m, d=0.0):
        lo, hi = [0, y0, 0], [0, y1, 0]
        lo[t], hi[t] = -th + d, th - d
        lo[2 - t], hi[2 - t] = u0, u1
        out.append(kit.box(lo, hi, m))

    run(-L / 2, L / 2, hy - 0.08, hy, plank)
    run(-L / 2, L / 2, -hy, hy - 0.12, canvas, 0.025)
    if not lod:
        n = max(1, round(L / 1.2))
        for i in range(n + 1):
            u = -L / 2 + 0.05 + (L - 0.1) * i / n
            run(u - 0.05, u + 0.05, -hy, hy - 0.08, plank_dark)
    return out


def crate(s, lod, rng):
    """A supply crate: boards, a dark frame round its edges, a stencilled patch."""
    hx, hy, hz = s[0] / 2, s[1] / 2, s[2] / 2
    i = 0.02
    out = [kit.box([-hx + i, -hy + 0.002, -hz + i], [hx - i, hy - 0.002, hz - i], plank)]
    if not lod:
        for y0, y1 in ((-hy, -hy + 0.08), (hy - 0.08, hy)):
            out.append(kit.box([-hx, y0, -hz], [hx, y1, hz], plank_dark))
        for sx in (-1, 1):
            for sz in (-1, 1):
                x0, x1 = sorted((sx * hx, sx * (hx - 0.08)))
                z0, z1 = sorted((sz * hz, sz * (hz - 0.08)))
                out.append(kit.box([x0, -hy + 0.08, z0], [x1, hy - 0.08, z1], plank_dark))
    return out


def antenna(s, lod, rng):
    hx, hy, hz = s[0] / 2, s[1] / 2, s[2] / 2
    out = [kit.cylinder(0.04, -hy, hy - 0.12, (0, 0, 0), "y", steel, 6)]
    out.append(kit.cylinder(0.07, hy - 0.12, hy, (0, 0, 0), "y", beacon, 8))
    if not lod:
        for y in (-hy + 1.0, -hy + 2.0):
            out.append(kit.box([-hx, y, -0.015], [hx, y + 0.03, 0.015], steel_dark))
    return out


def tank(s, lod, rng):
    """A water tank: an olive drum on its side's cradle, its bands, a tap."""
    hx, hy, hz = s[0] / 2, s[1] / 2, s[2] / 2
    r = hx - 0.02
    seg = 12 if lod else 20
    out = [kit.cylinder(r, -hy + 0.1, hy - 0.05, (0, 0, 0), "y", olive, seg)]
    out.append(kit.box([-hx, -hy, -hz], [hx, -hy + 0.1, hz], plank_dark))
    out.append(kit.cylinder(r * 0.4, hy - 0.05, hy, (0, 0, 0), "y", olive_dark, seg))
    if not lod:
        for y in (-0.3, 0.3):
            out.append(kit.cylinder(r + 0.015, y - 0.04, y + 0.04, (0, 0, 0), "y", olive_dark, seg))
    return out


rk.dress("deck", deck)
rk.dress("post", post)
rk.dress("stair", stair)
rk.dress("hut-wall", hut_wall)
rk.dress("hut-roof", hut_roof)
rk.dress("rail", rail)
rk.dress("crate", crate)
rk.dress("antenna", antenna)
rk.dress("tank", tank)

# ------------------------------------------------------------------ the kit for the cover pass's pieces (unit boxes)


def ruinwall(lod, rng):
    """A ruined wall: courses of blocks, the top broken down in steps, moss on it."""
    out = courses([1.0, 1.0, 0.84], lod, rng, course=0.2, length=(0.16, 0.26), jag=0.4)
    for o in out:
        o.data.transform(Matrix.Translation(kit.b((0, 0.5, 0))))
    return out


def crystals(lod, rng):
    """A crystal cluster on a low rock."""
    out = [blob((0, 0, 0), (0.56, 0.2, 0.56), rock, rng, [-0.5, 0, -0.5], [0.5, 0.16, 0.5], 1 if lod else 2, 0.1, ground=True)]
    out += cluster([-0.5, 0.0, -0.5], [0.5, 1.0, 0.5], rng, lod, lift=0.03)
    return out


def crates(lod, rng):
    """Supply crates: two side by side, a smaller one on top, a strap of olive webbing."""
    out = []

    def one(x0, z0, x1, z1, y0, y1, m):
        # The boards' bands round each end lie on the crate's own faces: the box stops a hair inside them.
        out.append(kit.box([x0 + 0.015, y0 + 0.002, z0 + 0.015], [x1 - 0.015, y1 - 0.002, z1 - 0.015], m))
        if not lod:
            for y in (y0, y1 - 0.05):
                out.append(kit.box([x0, y, z0], [x1, y + 0.05, z1], plank_dark))
            out.append(kit.box([(x0 + x1) / 2 - 0.03, y0 + 0.05, z0], [(x0 + x1) / 2 + 0.03, y1 - 0.05, z1], olive_dark))

    one(-0.5, -0.5, 0.02, 0.5, 0, 0.58, plank)
    one(0.04, -0.46, 0.5, 0.4, 0, 0.58, plank_dark)
    one(-0.36, -0.34, 0.24, 0.3, 0.58, 1.0, plank)
    return out


JEEP = (4.2, 2.0, 2.0)  # the jeeps' solids, metres: drawn at that size and shrunk into the unit box


def jeep(lod, rng):
    """A jeep the jungle has had for years: olive gone to rust, wheels sunk in moss, its roll bar overgrown, leaves
    heaped on its bonnet. Drawn in metres along +x."""
    out = []
    # The body: a tub, the bonnet forward, the wings over the wheels.
    out.append(box([-2.05, 0.45, -0.85], [1.0, 1.15, 0.85], olive, 0 if lod else 0.03))
    out.append(kit.prism([(1.0, 0.45), (2.05, 0.45), (2.05, 1.0), (1.9, 1.12), (1.0, 1.2)], -0.8, 0.8, olive, 0 if lod else 0.03))
    for z0, z1 in ((-1.0, -0.85), (0.85, 1.0)):
        out.append(box([-1.95, 0.85, z0], [2.0, 0.95, z1], olive_dark))
    # The windscreen frame, folded flat across the bonnet's back, and the roll bar over the seats.
    out.append(box([0.95, 1.2, -0.8], [1.05, 1.3, 0.8], olive_dark))
    for z in (-0.78, 0.78):
        out.append(box([-0.9, 1.15, z - 0.05], [-0.8, 1.95, z + 0.05], steel_dark))
    out.append(box([-0.9, 1.85, -0.78], [-0.8, 1.95, 0.78], steel_dark))
    # Seats and the inside, dark.
    out.append(box([-1.8, 1.15, -0.7], [0.8, 1.17, 0.7], olive_dark))
    seg = 10 if lod else 16
    for x in (-1.35, 1.35):
        for z, o in ((-0.82, -1), (0.82, 1)):
            out.append(kit.cylinder(0.42, z - 0.13, z + 0.13, (x, 0.42, 0), "z", rubber, seg))
    if not lod:
        out.append(box([2.05, 0.6, -0.6], [2.08, 0.95, 0.6], steel_dark))
        out.append(box([1.4, 1.12, -0.6], [1.9, 1.17, -0.3], rust))
        out.append(box([-2.0, 0.6, -0.8], [-1.97, 1.05, 0.8], rust))
        lo, hi = [-2.1, 0.0, -1.0], [2.1, 2.0, 1.0]
        out.append(blob((1.5, 1.15, 0.1), (0.6, 0.2, 0.7), leaf_dark, rng, lo, hi, 1, 0.15))
        out.append(blob((-0.85, 1.9, 0.0), (0.25, 0.12, 0.9), leaf, rng, lo, hi, 1, 0.2))
        out.append(blob((-1.6, 0.2, 0.9), (0.8, 0.3, 0.2), moss, rng, lo, hi, 1, 0.1))
        out.append(blob((0.6, 0.15, -0.95), (1.0, 0.3, 0.15), moss, rng, lo, hi, 1, 0.1))
    shrink = Matrix.Diagonal((1 / JEEP[0], 1 / JEEP[2], 1 / JEEP[1], 1.0))
    for o in out:
        o.data.transform(shrink)
    return out


rk.unit("mj-ruinwall", ruinwall)
rk.unit("mj-crystal", crystals)
rk.unit("mj-crates", crates)
rk.unit("mj-jeep", jeep)

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
