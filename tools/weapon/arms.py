"""First-person arms: a combat-shirt sleeve and a tactical glove, skinned to the client's arm rig.

Run from the repository root:
    blender --background --factory-startup --python tools/weapon/arms.py
or in the Blender session: bkit.run(r"tools/weapon/arms.py").
It writes packages/fps-client/src/viewmodel/assets/arms.glb (the right arm; the
client mirrors it for the left) and tools/weapon/arms.blend.

The arm is modelled in its rest pose in arms space (packages/fps-client/src/
viewmodel/arms.ts): metres, three.js axes (+Y up, -Z forward, the camera at the
origin), converted to Blender's frame by `B()`. The rig's numbers below (L1, L2,
SHOULDER, FINGERS, THUMB_*) must match arms.ts. The upper arm, forearm and hand
run straight along -Z; the palm faces -Y, the fingers point -Z, the thumb is
toward -X. Vertex groups are named after the client's bones (`upper`, `fore`,
`hand`, `f<finger>_<joint>`, `thumb_<joint>`, and the forearm twist bones
`twist0..2` that carry the hand's roll down the forearm).

The sleeve is shaped over the arm underneath it (`limb_radius`): deltoid,
biceps and triceps, the point of the elbow behind and a hollow at the crease,
the forearm muscles near the elbow tapering and flattening to the wrist, with
its rings packed closer where the elbow bends.

The glove is one fused surface (palm, fingers, thumb and cuff, voxel-remeshed
and decimated) with a moulded knuckle guard and a hook-and-loop wrist strap on
top; its panels (fabric back, suede palm, rubber finger pads, neoprene cuff)
are painted from per-vertex masks and baked with the sleeve into one texture set.
"""
import importlib
import math
import os
import sys

import bmesh
import bpy
from mathutils import Vector, noise
from mathutils.bvhtree import BVHTree

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import gunsmith  # noqa: E402

importlib.reload(gunsmith)

DRAFT = globals().get("ARGS", {}).get("draft", False)

# --- The rig (arms.ts) -------------------------------------------------------
L1, L2 = 0.33, 0.30
SHOULDER = Vector((0.2, -0.25, 0.1))
WRIST = SHOULDER + Vector((0, 0, -(L1 + L2)))
FINGERS = [  # base (hand space), segment lengths, radius, splay
    ((-0.0292, 0.0012, -0.093), (0.044, 0.026, 0.022), 0.0098, 0.05),
    ((-0.0097, 0.0016, -0.097), (0.048, 0.03, 0.023), 0.0101, 0.012),
    ((0.0098, 0.0012, -0.0945), (0.045, 0.029, 0.022), 0.0096, -0.03),
    ((0.0281, -0.0008, -0.0875), (0.036, 0.022, 0.02), 0.0086, -0.08),
]
THUMB_BASE = Vector((-0.0255, -0.009, -0.019))
THUMB_DIR = Vector((-0.62, -0.34, -0.71)).normalized()
THUMB_LEN = (0.044, 0.033, 0.028)
THUMB_R = (0.0128, 0.0113, 0.0103)


def B(p):
    """Arms space (three.js) to Blender."""
    return Vector((p[0], -p[2], p[1]))


def from_B(p):
    return Vector((p[0], p[2], -p[1]))


def hand_to_arm(p):
    return WRIST + Vector(p)


def sstep(a, b, x):
    t = max(0.0, min(1.0, (x - a) / (b - a)))
    return t * t * (3 - 2 * t)


def finger_frame(splay):
    """Axis, side and up of a straight finger in hand space."""
    d = Vector((-math.sin(splay), 0, -math.cos(splay)))
    side = Vector((math.cos(splay), 0, -math.sin(splay)))
    return d, side, Vector((0, 1, 0))


def thumb_frame():
    d = THUMB_DIR.copy()
    flex = Vector((0.75, -0.65, -0.1)).normalized()
    down = (flex - d * flex.dot(d)).normalized()
    side = d.cross(down).normalized()
    return d, side, -down


# --- Mesh building -----------------------------------------------------------

def ring_mesh(name, rings, caps=True):
    """A closed surface from rings of points (arms space), each ring the same size."""
    bm = bmesh.new()
    vs = [[bm.verts.new(B(p)) for p in ring] for ring in rings]
    n = len(rings[0])
    for a, b in zip(vs, vs[1:]):
        for k in range(n):
            bm.faces.new((a[k], a[(k + 1) % n], b[(k + 1) % n], b[k]))
    if caps:
        bm.faces.new(list(reversed(vs[0])))
        bm.faces.new(vs[-1])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.scene.collection.objects.link(obj)
    return obj


def superellipse(th, a, b, n):
    c, s = math.cos(th), math.sin(th)
    return (a * math.copysign(abs(c) ** (2 / n), c), b * math.copysign(abs(s) ** (2 / n), s))


def lerp_table(table, x):
    if x <= table[0][0]:
        return table[0][1]
    for (x0, y0), (x1, y1) in zip(table, table[1:]):
        if x <= x1:
            t = (x - x0) / (x1 - x0)
            u = t * t * (3 - 2 * t)
            return y0 + (y1 - y0) * u
    return table[-1][1]


def palm_rings():
    """Back of the hand and palm (hand space), wrist to knuckles, with thenar and hypothenar pads."""
    width = [(-0.104, 0.043), (-0.086, 0.0442), (-0.06, 0.0428), (-0.02, 0.0372), (0.014, 0.0328)]
    height = [(-0.104, 0.0128), (-0.086, 0.0138), (-0.05, 0.0162), (0.014, 0.0158)]
    z0, z1, zr = 0.016, -0.106, -0.088
    rings = []
    n, segs = 34, 40
    for i in range(n):
        z = z0 + (z1 - z0) * i / (n - 1)
        a, b = lerp_table(width, z), lerp_table(height, z)
        if z < zr:
            u = min(1.0, (zr - z) / (zr - z1))
            k = math.sqrt(max(0.0, 1 - u * u))
            a *= 0.35 + 0.65 * k
            b *= max(k, 0.05)
        ring = []
        for j in range(segs):
            th = 2 * math.pi * j / segs
            x, y = superellipse(th, a, b, 2.7)
            down = max(0.0, -math.sin(th))
            # Thenar (thumb side) and hypothenar (little finger side) pads on the palm.
            thenar = math.exp(-((z + 0.032) / 0.026) ** 2) * down * max(0.0, -math.cos(th))
            hypo = math.exp(-((z + 0.045) / 0.035) ** 2) * down * max(0.0, math.cos(th)) ** 1.5
            y -= 0.0065 * thenar + 0.004 * hypo
            x -= 0.004 * thenar
            # Knuckle ridge across the back, under the guard.
            up = max(0.0, math.sin(th))
            y += 0.0018 * math.exp(-((z + 0.088) / 0.008) ** 2) * up
            # Tendons on the back of the hand.
            y += 0.0006 * up * math.cos(x / 0.0195 * math.pi) * sstep(-0.02, -0.05, z) * (1 - sstep(-0.07, -0.085, z))
            ring.append((x, y, z))
        rings.append(ring)
    return rings


def tube_rings(base, d, side, up, lens, r0, r1, start=-0.012, flat=0.86, n=34, segs=20, joints=True):
    """A finger along `d` from `base`: joint bulges, a pad under each segment, rounded tip."""
    total = sum(lens)
    rings = []
    for i in range(n):
        u = i / (n - 1)
        t = start + (total - start) * (u + 0.35 * u * u * (1 - u))  # denser toward the tip
        along = max(0.0, t) / total
        r = r0 + (r1 - r0) * along
        if joints:
            r *= 1 + 0.06 * math.exp(-((t - lens[0]) / 0.006) ** 2) + 0.045 * math.exp(-((t - lens[0] - lens[1]) / 0.005) ** 2)
        cap = total - r1
        if t > cap:
            k = min(1.0, (t - cap) / r1)
            r *= math.sqrt(max(0.0, 1 - k * k))
        r = max(r, 0.0002)
        ring = []
        for j in range(segs):
            th = 2 * math.pi * j / segs
            x, y = superellipse(th, r, r * flat, 2.2)
            # Fleshy pads on the palm side of each segment.
            if joints and math.sin(th) < 0:
                seg_mid = [lens[0] * 0.5, lens[0] + lens[1] * 0.5, lens[0] + lens[1] + lens[2] * 0.45]
                pad = max(math.exp(-((t - m) / 0.009) ** 2) for m in seg_mid)
                y -= 0.0012 * pad * (-math.sin(th))
            p = Vector(base) + d * t + side * x + up * y
            ring.append(tuple(p))
        rings.append(ring)
    return rings


def to_arm(rings):
    return [[tuple(hand_to_arm(p)) for p in r] for r in rings]


def cuff_rings():
    rings = []
    for i in range(18):
        z = 0.058 + (-0.004 - 0.058) * i / 17
        flare = sstep(0.04, 0.058, z)
        a = 0.0332 + 0.001 * flare
        b = 0.0262 + 0.001 * flare
        ring = []
        for j in range(40):
            th = 2 * math.pi * j / 40
            x, y = superellipse(th, a, b, 2.4)
            ring.append((x, y + 0.0005, z))
        rings.append(ring)
    return rings


def build_glove():
    parts = [ring_mesh("palm", to_arm(palm_rings()))]
    for k, (base, lens, r, splay) in enumerate(FINGERS):
        d, side, up = finger_frame(splay)
        parts.append(ring_mesh(f"finger{k}", to_arm(tube_rings(base, d, side, up, lens, r, r * 0.86))))
    d, side, up = thumb_frame()
    parts.append(ring_mesh("thumb", to_arm(tube_rings(THUMB_BASE, d, side, up, THUMB_LEN, THUMB_R[0], THUMB_R[2], start=-0.016, flat=0.9))))
    parts.append(ring_mesh("cuff", to_arm(cuff_rings())))
    # Fuse into one watertight glove, then thin it to a game mesh.
    bpy.ops.object.select_all(action="DESELECT")
    for o in parts:
        o.select_set(True)
    bpy.context.view_layer.objects.active = parts[0]
    bpy.ops.object.join()
    glove = bpy.context.view_layer.objects.active
    glove.name = "glove"
    rm = glove.modifiers.new("remesh", "REMESH")
    rm.mode = "VOXEL"
    rm.voxel_size = 0.0007
    sm = glove.modifiers.new("smooth", "SMOOTH")
    sm.factor = 0.5
    sm.iterations = 4
    gunsmith._apply_modifier(glove, "remesh")
    gunsmith._apply_modifier(glove, "smooth")
    faces = len(glove.data.polygons)
    dec = glove.modifiers.new("decimate", "DECIMATE")
    dec.decimate_type = "COLLAPSE"
    dec.ratio = min(1.0, 5200 / faces)
    dec.use_collapse_triangulate = True
    gunsmith._apply_modifier(glove, "decimate")
    for p in glove.data.polygons:
        p.use_smooth = True
    return glove


def surface_tree(obj):
    deps = bpy.context.evaluated_depsgraph_get()
    return BVHTree.FromObject(obj, deps)


def shell(name, grid, thickness, tree, lift=0.0006):
    """A rigid shell on the glove: each grid point (arms space) is pushed onto the glove's surface along +Y, then lifted."""
    bm = bmesh.new()
    rows = []
    for row in grid:
        vs = []
        for p, extra in row:
            o = B(Vector(p) + Vector((0, 0.05, 0)))
            hit = tree.ray_cast(o, Vector((0, 0, -1)))
            q = Vector(hit[0]) if hit[0] else B(p)
            vs.append(bm.verts.new(q + Vector((0, 0, lift + extra))))
        rows.append(vs)
    for a, b in zip(rows, rows[1:]):
        for k in range(len(a) - 1):
            bm.faces.new((a[k], a[k + 1], b[k + 1], b[k]))
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.scene.collection.objects.link(obj)
    for p in mesh.polygons:
        p.use_smooth = True
    sol = obj.modifiers.new("solidify", "SOLIDIFY")
    sol.thickness = thickness
    sol.offset = 1.0
    gunsmith._apply_modifier(obj, "solidify")
    return obj


def build_knuckle_guard(tree):
    """A moulded guard over the four knuckles: one plate with a dome per knuckle, grooves between."""
    grid = []
    xs = [-0.042 + 0.084 * i / 47 for i in range(48)]
    zs = [-0.102 + 0.034 * j / 17 for j in range(18)]
    centres = [f[0][0] for f in FINGERS]
    for z in zs:
        row = []
        v = (z + 0.087) / 0.015
        for x in xs:
            # A dome over each knuckle, a groove between them, a lip along the back edge.
            dome = max(math.exp(-((x - c) / 0.0068) ** 2 - ((z + 0.09) / 0.008) ** 2) for c in centres)
            lip = math.exp(-((v - 0.85) / 0.12) ** 2)
            extra = 0.0042 * dome + 0.0012 * lip + 0.0006
            row.append((tuple(hand_to_arm((x, 0.0, z))), extra))
        grid.append(row)
    return shell("knuckle_guard", grid, 0.0022, tree, lift=0.0004)


def build_strap(tree):
    """The hook-and-loop wrist strap round the cuff, with its pull tab on the back of the wrist."""
    rings = []
    for z in (0.034, 0.03, 0.012, 0.008):
        ring = []
        for j in range(48):
            th = 2 * math.pi * j / 48
            x, y = superellipse(th, 0.0352 if 0.01 < z < 0.032 else 0.0346, 0.0282 if 0.01 < z < 0.032 else 0.0276, 2.4)
            ring.append(tuple(hand_to_arm((x, y + 0.0005, z))))
        rings.append(ring)
    strap = ring_mesh("strap", rings, caps=False)
    sol = strap.modifiers.new("solidify", "SOLIDIFY")
    sol.thickness = 0.0016
    sol.offset = -1.0
    gunsmith._apply_modifier(strap, "solidify")
    tab = []
    for zi, z in enumerate((0.033, 0.024, 0.016, 0.009)):
        row = []
        for xi in range(9):
            x = 0.006 + 0.022 * xi / 8
            row.append((tuple(hand_to_arm((x, 0.0, z))), 0.0034 + 0.0006 * xi / 8))
        tab.append(row)
    pull = shell("strap_tab", tab, 0.0018, tree, lift=0.0)
    for p in strap.data.polygons:
        p.use_smooth = True
    return strap, pull


def limb_radius(a, th):
    """The arm under the sleeve at distance `a` from the shoulder, angle `th` round it.

    th = 90 deg faces +Y: the elbow crease and the biceps (the elbow bends that
    way, see arms.ts). th = -90 deg is the triceps and the point of the elbow,
    th = 180 deg the thumb side of the forearm (the hand rests palm down).
    """
    up, down = max(0.0, math.sin(th)), max(0.0, -math.sin(th))
    thumb, outer = max(0.0, -math.cos(th)), max(0.0, math.cos(th))
    base = lerp_table([(-0.07, 0.05), (0.04, 0.048), (0.16, 0.044), (L1 - 0.05, 0.04), (L1, 0.037),
                       (L1 + 0.07, 0.04), (L1 + 0.15, 0.036), (L1 + 0.24, 0.03), (L1 + L2, 0.027)], a)
    r = base
    # Upper arm: deltoid cap, biceps in front, triceps behind.
    r += 0.006 * math.exp(-((a - 0.0) / 0.05) ** 2) * outer
    r += 0.006 * math.exp(-((a - 0.18) / 0.08) ** 2) * up ** 1.5
    r += 0.005 * math.exp(-((a - 0.13) / 0.09) ** 2) * down ** 1.5
    # Elbow: the point of the elbow behind, a hollow at the crease in front.
    r += 0.006 * math.exp(-((a - L1 - 0.005) / 0.02) ** 2) * down ** 4
    r -= 0.004 * math.exp(-((a - L1) / 0.03) ** 2) * up ** 2
    # Forearm: the brachioradialis on the thumb side and the flexors underneath, near the elbow.
    r += 0.006 * math.exp(-((a - L1 - 0.07) / 0.06) ** 2) * thumb ** 1.5
    r += 0.004 * math.exp(-((a - L1 - 0.09) / 0.07) ** 2) * down ** 1.5
    return r


def arm_samples(a0, a1, n):
    """Stations along the arm, packed closer round the elbow where it bends."""
    dens = lambda a: 1 + 2.2 * math.exp(-((a - L1) / 0.06) ** 2) + 0.8 * math.exp(-((a - (L1 + L2 - 0.05)) / 0.04) ** 2)
    xs = [a0 + (a1 - a0) * i / 999 for i in range(1000)]
    cdf = [0.0]
    for x0, x1 in zip(xs, xs[1:]):
        cdf.append(cdf[-1] + dens((x0 + x1) / 2) * (x1 - x0))
    out = []
    for i in range(n):
        target = cdf[-1] * i / (n - 1)
        k = next(j for j in range(len(cdf)) if cdf[j] >= target - 1e-12)
        out.append(xs[k])
    return out


def sleeve_rings():
    """The sleeve over the arm, from behind the shoulder to just short of the wrist, with folds."""
    a0, a1 = -0.07, L1 + L2 - 0.05
    rings = []
    segs = 40
    for a in arm_samples(a0, a1, 104):
        ease = 0.0058 + 0.0014 * math.exp(-((a - 0.15) / 0.12) ** 2)  # loose cloth over the limb
        ring = []
        for j in range(segs):
            th = 2 * math.pi * j / segs
            up = max(0.0, math.sin(th))
            r = limb_radius(a, th) + ease
            # Long soft folds, ridges bunched in the elbow crease and above the cuff.
            fold = noise.noise(Vector((a * 26, math.cos(th) * 1.6, math.sin(th) * 1.6))) * 0.0018
            fold += noise.noise(Vector((a * 70 + 7, math.cos(th) * 3, math.sin(th) * 3))) * 0.0006
            crease = math.exp(-((a - L1) / 0.045) ** 2) * (0.35 + 0.65 * up ** 1.5)
            wrist = math.exp(-((a - (a1 - 0.04)) / 0.03) ** 2)
            ridge = math.sin(a * 240 + noise.noise(Vector((th * 2, a * 15, 0))) * 2.5)
            r += ridge * (0.0022 * crease + 0.0012 * wrist)
            r += fold
            # Hem: a rolled, stitched edge at the cuff.
            if a > a1 - 0.008:
                r += 0.0012 * math.sin((a - (a1 - 0.008)) / 0.008 * math.pi)
            x, y = math.cos(th) * r, math.sin(th) * r * 0.95
            ring.append(tuple(SHOULDER + Vector((x, y, -a))))
        rings.append(ring)
    return rings


def build_sleeve():
    sleeve = ring_mesh("sleeve", sleeve_rings(), caps=True)
    for p in sleeve.data.polygons:
        p.use_smooth = True
    return sleeve


# --- Skin weights ---------------------------------------------------------------

BONES = (["upper", "fore", "hand"] + [f"f{k}_{j}" for k in range(4) for j in range(3)]
         + [f"thumb_{j}" for j in range(3)] + [f"twist{i}" for i in range(3)])
# Forearm twist bones at a third, two thirds and all the way to the wrist; arms.ts
# spreads the hand's roll over them like the radius turning over the ulna.
TWIST = [("fore", 0.0), ("twist0", 1 / 3), ("twist1", 2 / 3), ("twist2", 1.0)]


def forearm_weight(s):
    """Linear between the twist stations at fraction `s` of the way from elbow to wrist."""
    s = max(0.0, min(1.0, s))
    for (n0, s0), (n1, s1) in zip(TWIST, TWIST[1:]):
        if s <= s1:
            w = (s - s0) / (s1 - s0)
            return {n0: 1 - w, n1: w}
    return {"twist2": 1.0}


def arm_weight(a):
    """Upper arm, forearm (with its twist bones) and hand by distance `a` from the shoulder."""
    if a < L1 + 0.05:
        w = sstep(L1 - 0.045, L1 + 0.045, a)
        out = {"upper": 1 - w}
        for k, v in forearm_weight((a - L1) / L2).items():
            out[k] = out.get(k, 0.0) + w * v
        return out
    wh = sstep(L1 + L2 - 0.03, L1 + L2 + 0.012, a)
    out = {k: v * (1 - wh) for k, v in forearm_weight((a - L1) / L2).items()}
    out["hand"] = out.get("hand", 0.0) + wh
    return out


def chain_weight(t, lens, prefix, base_blend):
    first, second, third = f"{prefix}_0", f"{prefix}_1", f"{prefix}_2"
    if t < lens[0] * 0.5:
        w = sstep(-base_blend, base_blend * 0.6, t)
        return {"hand": 1 - w, first: w}
    if t < lens[0] + lens[1] * 0.5:
        w = sstep(lens[0] - 0.0045, lens[0] + 0.0045, t)
        return {first: 1 - w, second: w}
    w = sstep(lens[0] + lens[1] - 0.004, lens[0] + lens[1] + 0.004, t)
    return {second: 1 - w, third: w}


CHAINS = [(Vector(base), finger_frame(splay)[0], lens, r, f"f{k}", 0.006) for k, (base, lens, r, splay) in enumerate(FINGERS)]
CHAINS.append((THUMB_BASE, THUMB_DIR, THUMB_LEN, THUMB_R[0], "thumb", 0.012))


def glove_weight(p_hand):
    best = None
    for base, d, lens, r, prefix, blend in CHAINS:
        rel = p_hand - base
        t = rel.dot(d)
        radial = (rel - d * t).length
        limit = r * (2.0 if prefix == "thumb" else 1.55)
        if t > -0.014 and radial < limit and t < sum(lens) + 0.01:
            score = radial / r
            if best is None or score < best[0]:
                best = (score, t, lens, prefix, blend)
    if best:
        _, t, lens, prefix, blend = best
        return chain_weight(t, lens, prefix, blend)
    return arm_weight(L1 + L2 - p_hand.z)


def skin(obj, rule):
    for name in BONES:
        if name not in obj.vertex_groups:
            obj.vertex_groups.new(name=name)
    groups = {g.name: g for g in obj.vertex_groups}
    for v in obj.data.vertices:
        p = from_B(obj.matrix_world @ v.co)
        for name, w in rule(p).items():
            if w > 1e-4:
                groups[name].add([v.index], w, "REPLACE")


def glove_rule(p):
    return glove_weight(p - WRIST)


def sleeve_rule(p):
    return arm_weight(SHOULDER.z - p.z)


def rigid(bone):
    return lambda p: {bone: 1.0}


# --- Panels: per-vertex masks the bake material reads -----------------------

def glove_masks(glove):
    """R: suede palm, G: rubber finger pads, B: neoprene cuff (hand-space rules on the rest pose)."""
    mesh = glove.data
    attr = mesh.color_attributes.new("panels", "FLOAT_COLOR", "POINT")
    normals = [v.normal for v in mesh.vertices]
    for v in mesh.vertices:
        p = from_B(v.co) - WRIST
        n = from_B(normals[v.index])
        palm = sstep(-0.15, -0.45, n.y)
        pad = 0.0
        tip = 0.0
        for base, d, lens, r, prefix, blend in CHAINS[:4]:
            rel = p - base
            t = rel.dot(d)
            radial = (rel - d * t).length
            if radial < r * 1.5 and -0.004 < t < sum(lens) + 0.01:
                top = sstep(0.15, 0.55, n.y)
                seg = max(sstep(0.006, 0.009, t) * (1 - sstep(lens[0] - 0.008, lens[0] - 0.005, t)),
                          sstep(lens[0] + 0.004, lens[0] + 0.007, t) * (1 - sstep(lens[0] + lens[1] - 0.006, lens[0] + lens[1] - 0.003, t)))
                pad = max(pad, seg * top)
                tip = max(tip, sstep(sum(lens) - 0.016, sum(lens) - 0.012, t))
        cuff = sstep(0.004, 0.008, p.z)
        attr.data[v.index].color = (max(palm, tip) * (1 - cuff), pad * (1 - cuff), cuff, 1.0)


# --- Materials ---------------------------------------------------------------

def arms_surface(mat):
    """Bake nodes for the arms' materials (`glove`, `guard`, `sleeve`), in the gunsmith socket layout."""
    key = mat["finish"]
    mat.use_nodes = True
    nt = mat.node_tree
    nt.nodes.clear()
    N, L = nt.nodes.new, nt.links.new

    def mathn(op, a, b=None):
        n = N("ShaderNodeMath")
        n.operation = op
        for i, s in enumerate((a, b)):
            if s is None:
                continue
            if isinstance(s, (int, float)):
                n.inputs[i].default_value = s
            else:
                L(s, n.inputs[i])
        return n.outputs[0]

    def remap(s, a, b, lo=0.0, hi=1.0):
        n = N("ShaderNodeMapRange")
        n.clamp = True
        L(s, n.inputs["Value"])
        n.inputs["From Min"].default_value, n.inputs["From Max"].default_value = a, b
        n.inputs["To Min"].default_value, n.inputs["To Max"].default_value = lo, hi
        return n.outputs[0]

    def mix(fac, a, b):
        n = N("ShaderNodeMix")
        n.data_type = "RGBA"
        L(fac, n.inputs["Factor"])
        for sock, v in ((n.inputs[6], a), (n.inputs[7], b)):
            if isinstance(v, tuple):
                sock.default_value = (*v, 1)
            else:
                L(v, sock)
        return n.outputs[2]

    def mixf(fac, a, b):
        n = N("ShaderNodeMix")
        n.data_type = "FLOAT"
        L(fac, n.inputs["Factor"])
        for sock, v in ((n.inputs[2], a), (n.inputs[3], b)):
            if isinstance(v, (int, float)):
                sock.default_value = v
            else:
                L(v, sock)
        return n.outputs[0]

    tc = N("ShaderNodeTexCoord")
    pos = tc.outputs["Object"]
    sep = N("ShaderNodeSeparateXYZ")
    L(pos, sep.inputs[0])

    def noise_tex(scale, detail=4, rough=0.5):
        n = N("ShaderNodeTexNoise")
        n.inputs["Scale"].default_value = scale
        n.inputs["Detail"].default_value = detail
        n.inputs["Roughness"].default_value = rough
        L(pos, n.inputs["Vector"])
        return n.outputs["Fac"]

    def weave(freq):
        a = mathn("SINE", mathn("MULTIPLY", mathn("ADD", sep.outputs["X"], sep.outputs["Z"]), freq))
        b = mathn("SINE", mathn("MULTIPLY", mathn("SUBTRACT", sep.outputs["Y"], sep.outputs["Z"]), freq))
        return mathn("MULTIPLY", mathn("ADD", mathn("MULTIPLY", a, b), 1.0), 0.5)

    ao = N("ShaderNodeAmbientOcclusion")
    ao.only_local = False
    ao.samples = 16
    ao.inputs["Distance"].default_value = 0.012
    cavity = remap(ao.outputs["AO"], 0.2, 1.0, 0.45, 1.0)
    grain = noise_tex(600, 3, 0.6)
    blot = noise_tex(30, 4, 0.55)
    height = mathn("MULTIPLY", grain, 0.15)

    if key == "glove":
        attr = N("ShaderNodeAttribute")
        attr.attribute_name = "panels"
        sepc = N("ShaderNodeSeparateColor")
        L(attr.outputs["Color"], sepc.inputs[0])
        palm = remap(sepc.outputs[0], 0.45, 0.55)
        pad = remap(sepc.outputs[1], 0.45, 0.55)
        cuff = remap(sepc.outputs[2], 0.45, 0.55)
        fabric_w = weave(2 * math.pi / 0.0011)
        coyote = mix(remap(blot, 0.3, 0.7), (0.15, 0.105, 0.062), (0.19, 0.138, 0.085))
        coyote = mix(mathn("MULTIPLY", fabric_w, 0.35), coyote, (0.11, 0.077, 0.045))
        suede = mix(remap(noise_tex(160, 6, 0.7), 0.3, 0.7), (0.035, 0.032, 0.03), (0.06, 0.055, 0.05))
        rubber = (0.016, 0.016, 0.017)
        neo = mix(mathn("MULTIPLY", weave(2 * math.pi / 0.0007), 0.4), (0.02, 0.021, 0.022), (0.03, 0.031, 0.032))
        color = mix(palm, coyote, suede)
        color = mix(pad, color, rubber)
        color = mix(cuff, color, neo)
        # Seams: a dark stitched groove wherever two panels meet.
        near = mathn("MINIMUM", mathn("MINIMUM", mathn("ABSOLUTE", mathn("SUBTRACT", sepc.outputs[0], 0.5)),
                                                mathn("ABSOLUTE", mathn("SUBTRACT", sepc.outputs[1], 0.5))),
                     mathn("ABSOLUTE", mathn("SUBTRACT", sepc.outputs[2], 0.5)))
        seam = remap(near, 0.06, 0.02)
        stitch = remap(mathn("SINE", mathn("MULTIPLY", mathn("ADD", sep.outputs["Z"], sep.outputs["X"]), 2 * math.pi / 0.0028)), 0.2, 0.6)
        color = mix(mathn("MULTIPLY", seam, 0.6), color, (0.02, 0.016, 0.012))
        color = mix(mathn("MULTIPLY", remap(near, 0.11, 0.09), mathn("MULTIPLY", remap(near, 0.07, 0.09), stitch)), color, (0.09, 0.07, 0.045))
        # Scuffing on the knuckles and finger pads, dust in the creases.
        wear = mathn("MULTIPLY", remap(blot, 0.55, 0.75), 0.5)
        color = mix(mathn("MULTIPLY", wear, mathn("ADD", pad, 0.3)), color, (0.12, 0.1, 0.08))
        rough = mixf(palm, mathn("ADD", 0.82, mathn("MULTIPLY", grain, 0.1)), 0.9)
        rough = mixf(pad, rough, 0.55)
        rough = mixf(cuff, rough, 0.75)
        height = mathn("ADD", height, mathn("MULTIPLY", fabric_w, mathn("MULTIPLY", mathn("SUBTRACT", 1.0, mathn("MAXIMUM", palm, cuff)), 0.6)))
        height = mathn("ADD", height, mathn("MULTIPLY", pad, 1.2))
        height = mathn("SUBTRACT", height, mathn("MULTIPLY", seam, 1.0))
        # Suede palm: a fine nap.
        height = mathn("ADD", height, mathn("MULTIPLY", palm, mathn("MULTIPLY", noise_tex(2500, 2, 0.5), 0.5)))
        metal = 0.0
    elif key == "guard":
        base = mix(remap(blot, 0.3, 0.7), (0.014, 0.014, 0.015), (0.022, 0.022, 0.023))
        wear = remap(noise_tex(90, 6, 0.7), 0.62, 0.7)
        color = mix(mathn("MULTIPLY", wear, 0.6), base, (0.06, 0.058, 0.055))
        rough = mathn("ADD", 0.45, mathn("MULTIPLY", grain, 0.12))
        height = mathn("ADD", height, mathn("MULTIPLY", noise_tex(1800, 2, 0.5), 0.4))
        metal = 0.0
    else:  # sleeve: ranger green ripstop
        rip = mathn("MAXIMUM",
                    remap(mathn("ABSOLUTE", mathn("SINE", mathn("MULTIPLY", sep.outputs["X"], 2 * math.pi / 0.006))), 0.96, 1.0),
                    remap(mathn("ABSOLUTE", mathn("SINE", mathn("MULTIPLY", sep.outputs["Y"], 2 * math.pi / 0.006))), 0.96, 1.0))
        fine = weave(2 * math.pi / 0.0008)
        base = mix(remap(blot, 0.25, 0.75), (0.052, 0.06, 0.04), (0.07, 0.078, 0.052))
        base = mix(mathn("MULTIPLY", fine, 0.3), base, (0.04, 0.046, 0.03))
        color = mix(mathn("MULTIPLY", rip, 0.25), base, (0.09, 0.098, 0.068))
        rough = mathn("ADD", 0.86, mathn("MULTIPLY", grain, 0.08))
        height = mathn("ADD", height, mathn("ADD", mathn("MULTIPLY", rip, 0.5), mathn("MULTIPLY", fine, 0.3)))
        metal = 0.0

    shade = N("ShaderNodeMix")
    shade.data_type = "RGBA"
    shade.blend_type = "MULTIPLY"
    shade.inputs["Factor"].default_value = 1.0
    L(color, shade.inputs[6])
    L(cavity, shade.inputs[7])
    color_out = shade.outputs[2]
    bump = N("ShaderNodeBump")
    bump.inputs["Strength"].default_value = 0.35
    bump.inputs["Distance"].default_value = 0.00025
    L(height, bump.inputs["Height"])
    metal_v = N("ShaderNodeValue")
    metal_v.outputs[0].default_value = metal
    out = N("ShaderNodeOutputMaterial")
    emit = N("ShaderNodeEmission")
    L(emit.outputs[0], out.inputs["Surface"])
    bsdf = N("ShaderNodeBsdfDiffuse")
    L(bump.outputs["Normal"], bsdf.inputs["Normal"])
    img = N("ShaderNodeTexImage")
    nt.nodes.active = img
    return {"color": color_out, "rough": rough, "metal": metal_v.outputs[0], "normal": bump.outputs["Normal"], "emit": emit,
            "out": out, "bsdf": bsdf, "image": img, "links": nt.links, "N": N, "math": mathn}


PREVIEW_COLOURS = {"glove": (0.17, 0.12, 0.075), "guard": (0.018, 0.018, 0.02), "sleeve": (0.06, 0.068, 0.045)}


def material(name):
    mat = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    mat["finish"] = name
    mat.diffuse_color = (*PREVIEW_COLOURS[name], 1)
    return mat


# --- Build --------------------------------------------------------------------

gunsmith.reset_scene()
glove = build_glove()
glove.data.materials.append(material("glove"))
tree = surface_tree(glove)
guard = build_knuckle_guard(tree)
guard.data.materials.append(material("guard"))
strap, tab = build_strap(tree)
for o in (strap, tab):
    o.data.materials.append(material("guard"))
sleeve = build_sleeve()
sleeve.data.materials.append(material("sleeve"))

for o in (glove, guard, strap, tab, sleeve):
    gunsmith.triangulate(o)
glove_masks(glove)
skin(glove, glove_rule)
skin(guard, rigid("hand"))
skin(strap, lambda p: arm_weight(L1 + L2 - (p - WRIST).z))
skin(tab, lambda p: arm_weight(L1 + L2 - (p - WRIST).z))
skin(sleeve, sleeve_rule)

# The armature: bones at the rig's joints, named as the client names them.
arm_data = bpy.data.armatures.new("arms_rig")
rig = bpy.data.objects.new("arms_rig", arm_data)
bpy.context.scene.collection.objects.link(rig)
bpy.context.view_layer.objects.active = rig
bpy.ops.object.mode_set(mode="EDIT")


def add_bone(name, head, tail, parent=None):
    b = arm_data.edit_bones.new(name)
    b.head, b.tail = B(head), B(tail)
    if parent:
        b.parent = arm_data.edit_bones[parent]
    return b


elbow = SHOULDER + Vector((0, 0, -L1))
add_bone("upper", SHOULDER, elbow)
add_bone("fore", elbow, WRIST, "upper")
add_bone("hand", WRIST, WRIST + Vector((0, 0, -0.08)), "fore")
for i in range(3):
    at = elbow + Vector((0, 0, -L2 * (i + 1) / 3))
    add_bone(f"twist{i}", at, at + Vector((0, 0, -0.03)), "fore")
for base, d, lens, r, prefix, blend in CHAINS:
    start = WRIST + base
    parent = "hand"
    for j in range(3):
        end = start + d * lens[j]
        add_bone(f"{prefix}_{j}", start, end, parent)
        parent = f"{prefix}_{j}"
        start = end
bpy.ops.object.mode_set(mode="OBJECT")

objs = [sleeve, glove, guard, strap, tab]
for o in objs:
    o.parent = rig
    m = o.modifiers.new("rig", "ARMATURE")
    m.object = rig

stats = {"tris": sum(sum(len(p.vertices) - 2 for p in o.data.polygons) for o in objs)}
if DRAFT:
    stats["preview"] = gunsmith.render_preview("arms", objs, draft=True)
    result = stats
else:
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(gunsmith.HERE, "arms.blend"), compress=True)
    gunsmith.unwrap(objs)
    images = gunsmith.bake("arms", objs, 2048, surface=arms_surface)
    gunsmith.export_materials(objs, images)
    bpy.ops.object.select_all(action="DESELECT")
    for o in objs + [rig]:
        o.select_set(True)
    path = os.path.join(gunsmith.ASSETS, "arms.glb")
    bpy.ops.export_scene.gltf(filepath=path, export_format="GLB", use_selection=True, export_apply=False,
                              export_yup=True, export_tangents=True, export_skins=True, export_animations=False,
                              export_image_format="JPEG", export_jpeg_quality=90, export_cameras=False, export_lights=False)
    stats["glb_bytes"] = os.path.getsize(path)
    stats["preview"] = gunsmith.render_preview("arms", objs)
    result = stats
