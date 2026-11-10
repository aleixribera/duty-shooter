"""The third-person soldier: rigid pieces on a joint hierarchy, posed by the client.

Run from the repository root:
    blender --background --factory-startup --python tools/soldier/soldier.py
or in the Blender session: bkit.run(r"tools/soldier/soldier.py").
It writes packages/fps-client/src/assets/soldier.glb, tools/soldier/soldier.blend
and the preview sheet tools/soldier/previews/soldier.png.

The model is authored in game space (metres, three.js axes: +Y up, the soldier
facing -Z, his right toward +X, the feet at the origin), converted to Blender's
frame by `B()`; the glTF export turns it back. Each joint is an empty named as
the client's bones (packages/fps-client/src/soldier.ts), at rest with no
rotation, and the pieces hang from it as child meshes, one per material.
Limbs hang straight down (-Y) from their joints. The client recolours each
piece by its material's name (the look's slot) and merges the soldier into one
rigidly skinned mesh. Each piece also carries a baked shade in its colour
attribute (`bake_shade`): how open that spot is to the sky.

Most of the soldier's poses are worked out by the client. The two that have no
gun in them, the Downed crawl, the Revive and the deaths, are authored here (`CLIPS`) and
exported as glTF animations on the joints: `crawl`, which the client plays by
distance crawled, and `revive`, which it loops. Each key is a whole body, in
the Euler angles soldier.ts uses (game space, XYZ order unless a key names
another). The dev soldier sheet shows them (apps/range/scripts/soldier-sheet.mjs,
the Crawl, Downed and Revive columns).

The hands are modelled in the palm frame the weapons' grip points use
(`palmFrame` in viewmodel/m4a1.ts): palm facing -Y, fingers along -Z, the wrist
toward +Z, the thumb at -X on the right hand and +X on the left. A hand's
palm centre sits at PALM from its wrist joint, so the client puts a hand on a
grip by matching the frames and reaching the wrist with two-bone IK. The
joint positions and PALM below must match soldier.ts.
"""
import math
import os
import sys

import bmesh
import bpy
from mathutils import Euler, Matrix, Quaternion, Vector

HERE = os.path.dirname(os.path.abspath(__file__)) if "__file__" in globals() else os.path.abspath("tools/soldier")
REPO = os.path.dirname(os.path.dirname(HERE))
GLB = os.path.join(REPO, "packages", "fps-client", "src", "assets", "soldier.glb")
BLEND = os.path.join(HERE, "soldier.blend")
PREVIEW = os.path.join(HERE, "previews", "soldier.png")

# --- The rig (soldier.ts) ---------------------------------------------------
# Joint: (parent, offset from the parent in game space).
JOINTS = {
    "hips": (None, (0, 0.86, 0)),
    "spine": ("hips", (0, 0.14, 0)),
    "neck": ("spine", (0, 0.46, 0)),
    "shoulderL": ("spine", (-0.19, 0.37, 0)),
    "shoulderR": ("spine", (0.19, 0.37, 0)),
    "elbowL": ("shoulderL", (0, -0.3, 0)),
    "elbowR": ("shoulderR", (0, -0.3, 0)),
    "wristL": ("elbowL", (0, -0.28, 0)),
    "wristR": ("elbowR", (0, -0.28, 0)),
    "hipL": ("hips", (-0.1, -0.02, 0)),
    "hipR": ("hips", (0.1, -0.02, 0)),
    "kneeL": ("hipL", (0, -0.42, 0)),
    "kneeR": ("hipR", (0, -0.42, 0)),
    "ankleL": ("kneeL", (0, -0.34, 0)),
    "ankleR": ("kneeR", (0, -0.34, 0)),
}
PALM = (0, -0.018, -0.055)


# --- The clips the client doesn't pose itself ---------------------------------
def fingers_down(side):
    """A wrist with the fingers down, palms in, as soldier.ts rests it. `side`: -1 left, 1 right."""
    return ((-math.pi / 2, -side * math.pi / 2, 0), "YXZ")


def crawl_key(lead):
    """A wounded crawl, flat on the chest: the `lead` arm (-1 left, 1 right) stretched out, the other drawn in, the opposite knee dragged up."""
    back = -lead
    arm = "L" if lead < 0 else "R"
    other = "R" if lead < 0 else "L"
    return {
        "hips": ((-1.5, lead * 0.06, lead * 0.1), (0, 0.22, 0)),
        "spine": ((0.22, back * 0.14, back * 0.08), None),
        "neck": ((0.95, lead * 0.18, 0), None),
        "shoulder" + arm: ((2.55, 0, lead * 0.28), None),
        "elbow" + arm: ((0.32, 0, 0), None),
        "wrist" + arm: ((-0.5, 0, 0), None),
        "shoulder" + other: ((1.0, 0, back * 0.62), None),
        "elbow" + other: ((1.95, 0, 0), None),
        "wrist" + other: ((-0.9, 0, 0), None),
        # The leg on the reaching side trails straight; the other knee comes up beside the body, its boot pushing off.
        "hip" + arm: ((0.02, 0, lead * 0.12), None),
        "knee" + arm: ((-0.1, 0, 0), None),
        "ankle" + arm: ((0.1, 0, 0), None),
        # Turned out along the ground, thigh first: the knee hinge lies flat, so the shin folds in beside the other leg.
        "hip" + other: (((0.05, lead * math.pi / 2, back * 0.95), "XZY"), None),
        "knee" + other: ((-1.3, 0, 0), None),
        "ankle" + other: ((0.2, 0, 0), None),
    }


def revive_key(press):
    """Down on the right knee over a squadmate, both hands on them; `press` 0 to 1 leans the weight in."""
    lean = 0.62 + press * 0.06
    bow = 0.62 + press * 0.2
    return {
        "hips": ((-lean, 0, 0), (0, 0.58 - press * 0.03, 0)),
        "spine": ((-bow, 0, 0), None),
        "neck": ((0.72, 0, 0), None),
        "shoulderL": ((1.42 + press * 0.1, 0, 0.1), None),
        "shoulderR": ((1.42 + press * 0.1, 0, -0.1), None),
        "elbowL": ((0.34 - press * 0.26, 0, 0), None),
        "elbowR": ((0.34 - press * 0.26, 0, 0), None),
        "wristL": (fingers_down(-1), None),
        "wristR": (fingers_down(1), None),
        "hipL": ((1.42 + lean, 0, -0.08), None),
        "kneeL": ((-1.42, 0, 0), None),
        "ankleL": ((0, 0, 0), None),
        "hipR": ((0.05 + lean, 0, 0.06), None),
        "kneeR": ((-1.6, 0, 0), None),
        "ankleR": ((1.4, 0, 0), None),
    }


def climb_keys():
    """A pull-up over a ledge (ticket 67), for the waist and high bands: both hands up on the edge, the chest pulled
    to it with the right knee coming up, the arms pressing the body over onto that knee, then standing. The sim
    lifts the body first and carries it over after (pmove's mantle path), so the keys only bend it."""
    reach = {
        "hips": ((-0.08, 0, 0), (0, 0.86, 0)), "spine": ((0.12, 0, 0), None), "neck": ((0.35, 0, 0), None),
        "shoulderL": ((2.85, 0, 0.12), None), "shoulderR": ((2.85, 0, -0.12), None),
        "elbowL": ((0.3, 0, 0), None), "elbowR": ((0.3, 0, 0), None),
        "wristL": ((-0.45, 0, 0), None), "wristR": ((-0.45, 0, 0), None),
        "hipL": ((0.35, 0, 0), None), "kneeL": ((-0.6, 0, 0), None), "ankleL": ((0.25, 0, 0), None),
        "hipR": ((0.1, 0, 0), None), "kneeR": ((-0.3, 0, 0), None), "ankleR": ((0.2, 0, 0), None),
    }
    pull = {
        "hips": ((-0.35, 0, 0), (0, 0.86, 0)), "spine": ((-0.3, 0, 0), None), "neck": ((0.55, 0, 0), None),
        "shoulderL": ((1.0, 0, 0.12), None), "shoulderR": ((1.0, 0, -0.12), None),
        "elbowL": ((1.7, 0, 0), None), "elbowR": ((1.7, 0, 0), None),
        "wristL": ((-0.9, 0, 0), None), "wristR": ((-0.9, 0, 0), None),
        "hipL": ((0.15, 0, 0), None), "kneeL": ((-0.75, 0, 0), None), "ankleL": ((0.35, 0, 0), None),
        "hipR": ((1.5, 0, 0), None), "kneeR": ((-1.9, 0, 0), None), "ankleR": ((0.4, 0, 0), None),
    }
    over = {
        "hips": ((-0.55, 0, 0), (0, 0.8, 0)), "spine": ((-0.25, 0, 0), None), "neck": ((0.7, 0, 0), None),
        "shoulderL": ((0.4, 0, 0.18), None), "shoulderR": ((0.4, 0, -0.18), None),
        "elbowL": ((0.25, 0, 0), None), "elbowR": ((0.25, 0, 0), None),
        "wristL": ((-1.1, 0, 0), None), "wristR": ((-1.1, 0, 0), None),
        "hipL": ((-0.15, 0, 0), None), "kneeL": ((-0.9, 0, 0), None), "ankleL": ((0.5, 0, 0), None),
        "hipR": ((1.7, 0, 0), None), "kneeR": ((-2.2, 0, 0), None), "ankleR": ((0.5, 0, 0), None),
    }
    stand = {
        "hips": ((-0.1, 0, 0), (0, 0.84, 0)), "spine": ((-0.05, 0, 0), None), "neck": ((0.12, 0, 0), None),
        "shoulderL": ((0.2, 0, 0.08), None), "shoulderR": ((0.2, 0, -0.08), None),
        "elbowL": ((0.5, 0, 0), None), "elbowR": ((0.5, 0, 0), None),
        "wristL": (fingers_down(-1), None), "wristR": (fingers_down(1), None),
        "hipL": ((0.2, 0, 0), None), "kneeL": ((-0.3, 0, 0), None), "ankleL": ((0.1, 0, 0), None),
        "hipR": ((0.5, 0, 0), None), "kneeR": ((-0.6, 0, 0), None), "ankleR": ((0.1, 0, 0), None),
    }
    return (reach, pull, over, stand)


def vault_keys():
    """A low vault (ticket 67): the left hand planted on the top and both knees tucked through, the gun kept in the
    right hand. It keys only the left arm and the legs, so the gun pose holds everywhere else."""
    def key(shoulder, elbow, wrist, hl, kl, hr, kr, ankle):
        return {
            "shoulderL": ((shoulder, 0, -0.25), None), "elbowL": ((elbow, 0, 0), None), "wristL": (wrist, None),
            "hipL": ((hl, 0, 0), None), "kneeL": ((kl, 0, 0), None), "ankleL": ((ankle, 0, 0), None),
            "hipR": ((hr, 0, 0), None), "kneeR": ((kr, 0, 0), None), "ankleR": ((ankle, 0, 0), None),
        }
    return (
        key(0.7, 0.2, (-1.1, 0, 0), 0.6, -0.8, 0.3, -0.5, 0.2),
        key(0.2, 0.0, (-1.4, 0, 0), 1.5, -2.1, 1.3, -2.0, 0.35),
        key(0.5, 0.5, fingers_down(-1), 0.35, -0.45, 0.2, -0.35, 0.1),
    )


def body(hips, at, spine, neck, arm_l, arm_r, leg_l, leg_r):
    """A whole-body key: the hips' turn and place, the spine's and neck's turns, and for each arm
    (shoulder turn, elbow bend) and each leg (hip turn, knee bend). Wrists and ankles hang loose."""
    return {
        "hips": (hips, at), "spine": (spine, None), "neck": (neck, None),
        "shoulderL": (arm_l[0], None), "elbowL": ((arm_l[1], 0, 0), None), "wristL": ((-0.2, 0, 0), None),
        "shoulderR": (arm_r[0], None), "elbowR": ((arm_r[1], 0, 0), None), "wristR": ((-0.2, 0, 0), None),
        "hipL": (leg_l[0], None), "kneeL": ((leg_l[1], 0, 0), None), "ankleL": ((0.25, 0, 0), None),
        "hipR": (leg_r[0], None), "kneeR": ((leg_r[1], 0, 0), None), "ankleR": ((0.25, 0, 0), None),
    }


def fall_back_keys():
    """Shot from the front: the chest is thrown back, the knees go, and the body lands on its back, an arm flung
    out each side and one knee left up."""
    return (
        body((0.12, 0, 0), (0, 0.85, 0.02), (0.2, 0, 0), (-0.2, 0, 0),
             ((0.5, 0, -0.5), 0.9), ((0.4, 0, 0.6), 0.7), ((0.25, 0, 0), -0.5), ((0.05, 0, 0), -0.3)),
        body((0.55, 0, 0), (0, 0.66, 0.2), (0.3, 0, 0), (0.1, 0, 0),
             ((1.2, 0, -0.9), 0.6), ((1.0, 0, 1.0), 0.6), ((0.9, 0, 0), -1.5), ((0.5, 0, 0), -1.2)),
        body((1.15, 0, 0), (0, 0.32, 0.5), (0.15, 0, 0), (-0.35, 0, 0),
             ((0.9, 0, -1.2), 0.5), ((0.8, 0, 1.25), 0.5), ((1.0, 0, 0), -1.3), ((0.6, 0, 0), -0.9)),
        body((1.56, 0, 0.04), (0, 0.2, 0.66), (-0.08, 0, 0), (0.2, 0, 0),
             ((0.1, 0, -1.9), 0.9), ((0.05, 0, 0.95), 0.5), ((0.6, 0, 0), -1.1), ((0.15, 0, 0.12), -0.25)),
        body((1.5, 0, 0.05), (0, 0.19, 0.68), (0.0, 0, 0.05), (0.05, 0.5, 0),
             ((-0.05, 0, -2.15), 0.75), ((0.0, 0, 0.7), 0.35), ((0.5, 0, -0.1), -0.95), ((0.05, 0, 0.16), -0.1)),
    )


def fall_front_keys():
    """Shot from behind: pitched forward onto the knees and then the chest, one arm reaching past the head and
    the other folded under, the face turned aside."""
    return (
        body((-0.15, 0, 0), (0, 0.84, -0.03), (-0.25, 0, 0), (0.3, 0, 0),
             ((0.3, 0, -0.3), 0.8), ((0.3, 0, 0.3), 0.8), ((0.2, 0, 0), -0.4), ((-0.1, 0, 0), -0.2)),
        body((-0.45, 0, 0), (0, 0.62, -0.18), (-0.3, 0, 0), (0.2, 0, 0),
             ((1.0, 0, -0.4), 1.0), ((1.0, 0, 0.4), 1.0), ((0.9, 0, 0), -1.6), ((0.6, 0, 0), -1.5)),
        body((-1.0, 0, 0), (0, 0.36, -0.42), (-0.2, 0, 0), (0.5, 0, 0),
             ((1.9, 0, -0.5), 1.2), ((1.9, 0, 0.5), 1.2), ((0.5, 0, 0), -1.2), ((0.3, 0, 0), -1.0)),
        body((-1.52, 0, 0.05), (0, 0.17, -0.62), (0.06, 0, 0), (0.35, 0.6, 0),
             ((2.4, 0, -0.5), 0.5), ((1.2, 0, 0.7), 1.6), (((0.05, 1.2, -0.45), "XZY"), -0.6), ((0.02, 0, 0.15), -0.3)),
        body((-1.5, 0, 0.06), (0, 0.16, -0.64), (0.1, 0, -0.06), (0.3, 0.75, 0),
             ((2.5, 0, -0.45), 0.35), ((1.0, 0, 0.75), 1.7), (((0.05, math.pi / 2, -0.6), "XZY"), -0.85), ((0.02, 0, 0.16), -0.12)),
    )


def crumple_keys():
    """No push to speak of: the legs fold, the body sits down onto its knees and tips over onto its right side,
    curled."""
    return (
        body((-0.1, 0, 0.05), (0, 0.82, 0), (-0.2, 0, 0.1), (0.2, 0, 0.15),
             ((0.1, 0, -0.15), 0.4), ((0.1, 0, 0.15), 0.4), ((0.4, 0, 0), -0.8), ((0.4, 0, 0), -0.8)),
        body((-0.15, 0, 0.1), (0, 0.5, 0.02), (-0.35, 0, 0.15), (-0.3, 0, 0),
             ((0.15, 0, -0.2), 0.3), ((0.15, 0, 0.2), 0.3), ((0.5, 0, 0), -2.0), ((0.45, 0, 0), -2.0)),
        body((-0.2, 0, -0.7), (0.18, 0.34, 0.02), (-0.3, 0, -0.2), (-0.2, 0, -0.3),
             ((0.4, 0, -0.1), 0.5), ((0.3, 0, 0.5), 0.6), ((0.7, 0, 0), -1.9), ((0.6, 0, 0), -1.9)),
        body((-0.15, 0.25, -1.5), (0.42, 0.2, 0.04), (-0.25, 0, -0.05), (-0.15, 0, -0.2),
             ((0.6, 0, -0.2), 0.7), ((0.9, 0, 0.2), 0.9), ((0.9, 0, 0), -1.5), ((0.5, 0, 0), -1.2)),
        body((-0.12, 0.3, -1.52), (0.45, 0.19, 0.05), (-0.3, 0, -0.03), (-0.1, 0, -0.25),
             ((0.7, 0, -0.25), 0.8), ((1.0, 0, 0.15), 1.0), ((1.0, 0, 0), -1.4), ((0.45, 0, 0), -1.1)),
    )


# Clip: (seconds, its keys evenly through it). The loops (crawl, revive) end on their first key; the mantles
# (climb, vault) are played once, by how far the mantle is through, and key only the joints they move.
CLIPS = {
    "crawl": (1.0, (crawl_key(-1), crawl_key(1), crawl_key(-1))),
    "revive": (0.8, (revive_key(0), revive_key(1), revive_key(0))),
    "climb": (1.2, climb_keys()),
    "vault": (0.45, vault_keys()),
    # The deaths, each played once from the pose the soldier died in (soldier.ts picks one by the killing shot).
    "fallBack": (0.8, fall_back_keys()),
    "fallFront": (0.8, fall_front_keys()),
    "crumple": (0.95, crumple_keys()),
}

# Slot colours (sRGB) as the free-for-all look wears them; the client recolours by slot.
SLOTS = {
    "uniform": 0x5D6447, "trousers": 0x535A40, "vest": 0x3D4232, "pouch": 0x353A2B, "strap": 0x262920,
    "skin": 0xA9836A, "helmet": 0x4B5139, "boots": 0x2A2622, "sole": 0x161412, "accent": 0x5D6447,
    "lens": 0x172128, "glove": 0x2B2A27,
}


def B(v):
    """Game space to Blender: (x, y, z) -> (x, -z, y)."""
    return Vector((v[0], -v[2], v[1]))


def srgb(hex_):
    c = [((hex_ >> s) & 255) / 255 for s in (16, 8, 0)]
    return [x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4 for x in c]


def world(joint):
    parent, off = JOINTS[joint]
    p = world(parent) if parent else Vector((0, 0, 0))
    return p + Vector(off)


MATS = {}


def mat(slot):
    if slot not in MATS:
        m = bpy.data.materials.new(slot)
        m.use_nodes = True
        bsdf = m.node_tree.nodes.get("Principled BSDF")
        rgb = srgb(SLOTS[slot])
        bsdf.inputs["Base Color"].default_value = (*rgb, 1)
        bsdf.inputs["Roughness"].default_value = 0.35 if slot == "lens" else 0.8
        m.diffuse_color = (*rgb, 1)
        MATS[slot] = m
    return MATS[slot]


PIECES = []  # (joint, slot, part name or None, object)


def _object(name, bm, joint, slot, part, bevel=0.0, smooth=False):
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    ob = bpy.data.objects.new(name, me)
    COL.objects.link(ob)
    me.materials.append(mat(slot))
    if bevel > 0:
        mod = ob.modifiers.new("bevel", "BEVEL")
        mod.width = bevel
        mod.segments = 2
        mod.limit_method = "ANGLE"
        mod.angle_limit = math.radians(35)
    for p in me.polygons:
        p.use_smooth = smooth
    PIECES.append((joint, slot, part, ob))
    return ob


def box(joint, slot, size, at, rot=(0, 0, 0), part=None, taper=(1, 1), bevel=None, local=False):
    """A bevelled box in game space (or, `local`, relative to its joint); `taper` scales the top face (x, z)."""
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1)
    for v in bm.verts:
        x, y, z = v.co.x, v.co.z, -v.co.y  # cube in game axes
        if y > 0:
            x *= taper[0]
            z *= taper[1]
        p = Vector((x * size[0], y * size[1], z * size[2]))
        p = Euler(rot, "XYZ").to_matrix() @ p
        c = Vector(at) + (world(joint) if local else Vector())
        v.co = B(p + c)
    b = min(size) * 0.22 if bevel is None else bevel
    return _object(part or f"{joint}_{slot}", bm, joint, slot, part, bevel=b)


def lathe(joint, slot, p0, p1, profile, part=None, seg=10, flat=1.0, up=(0, 0, -1), local=False):
    """A surface of revolution from p0 to p1 (game space): `profile` is (t, radius) along it;
    a zero radius closes an end. `flat` squashes the rings along `up`'s side axis."""
    o = world(joint) if local else Vector()
    a, b = Vector(p0) + o, Vector(p1) + o
    d = (b - a).normalized()
    u = Vector(up)
    u = (u - d * u.dot(d)).normalized()
    w = d.cross(u)
    bm = bmesh.new()
    rings = []
    for t, r in profile:
        c = a.lerp(b, t)
        if r <= 0:
            rings.append([bm.verts.new(B(c))])
            continue
        ring = []
        for i in range(seg):
            ang = 2 * math.pi * i / seg
            p = c + u * math.cos(ang) * r + w * math.sin(ang) * r * flat
            ring.append(bm.verts.new(B(p)))
        rings.append(ring)
    for r0, r1 in zip(rings, rings[1:]):
        if len(r0) == 1 and len(r1) == 1:
            continue
        if len(r0) == 1:
            for i in range(seg):
                bm.faces.new((r0[0], r1[(i + 1) % seg], r1[i]))
        elif len(r1) == 1:
            for i in range(seg):
                bm.faces.new((r0[i], r0[(i + 1) % seg], r1[0]))
        else:
            for i in range(seg):
                bm.faces.new((r0[i], r0[(i + 1) % seg], r1[(i + 1) % seg], r1[i]))
    for end in (rings[0], rings[-1]):
        if len(end) > 1:
            bm.faces.new(end if end is rings[-1] else list(reversed(end)))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return _object(part or f"{joint}_{slot}", bm, joint, slot, part, smooth=True)


def ellipsoid(joint, slot, size, at, part=None, seg=12, rings=7, cut=None, local=False):
    """An ellipsoid of diameters `size` centred `at`; `cut` keeps only y >= cut (relative to centre, as a fraction)."""
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=seg, v_segments=rings, radius=0.5)
    if cut is not None:
        bmesh.ops.bisect_plane(bm, geom=bm.verts[:] + bm.edges[:] + bm.faces[:], plane_co=(0, 0, cut * 0.5),
                               plane_no=(0, 0, 1), clear_inner=True)
        edges = [e for e in bm.edges if e.is_boundary]
        bmesh.ops.edgeloop_fill(bm, edges=edges)
    c = Vector(at) + (world(joint) if local else Vector())
    for v in bm.verts:
        x, y, z = v.co.x, v.co.z, -v.co.y
        v.co = B(Vector((x * size[0], y * size[1], z * size[2])) + c)
    return _object(part or f"{joint}_{slot}", bm, joint, slot, part, smooth=True)


# ---------------------------------------------------------------------------
# Build
# ---------------------------------------------------------------------------

for o in list(bpy.data.objects):
    if o.name.startswith("soldier") or o.get("soldier"):
        bpy.data.objects.remove(o)
COL = bpy.data.collections.get("soldier") or bpy.data.collections.new("soldier")
if COL.name not in bpy.context.scene.collection.children:
    bpy.context.scene.collection.children.link(COL)

# Pelvis and belt.
hips = world("hips")
box("hips", "trousers", (0.33, 0.2, 0.22), hips + Vector((0, 0.02, 0)), part="pelvis", taper=(1.06, 1.05))
box("hips", "strap", (0.35, 0.05, 0.235), hips + Vector((0, 0.11, 0)))
box("hips", "pouch", (0.06, 0.05, 0.03), hips + Vector((0, 0.11, -0.125)))  # buckle
for x in (-0.15, 0.15):  # hip pouches on the belt
    box("hips", "pouch", (0.045, 0.1, 0.11), hips + Vector((x * 1.08, 0.07, 0.02)))

# Torso: a shirt that widens to the shoulders, under a plate carrier.
sp = world("spine")
box("spine", "uniform", (0.32, 0.46, 0.21), sp + Vector((0, 0.21, 0)), part="torso", taper=(1.16, 1.08))
box("spine", "vest", (0.33, 0.33, 0.07), sp + Vector((0, 0.24, -0.1)), taper=(1.0, 1.0), bevel=0.02)  # front plate
box("spine", "vest", (0.33, 0.35, 0.06), sp + Vector((0, 0.25, 0.1)), bevel=0.02)  # back plate
for x in (-1, 1):
    box("spine", "vest", (0.04, 0.2, 0.2), sp + Vector((x * 0.175, 0.15, 0)), bevel=0.012)  # cummerbund
    box("spine", "strap", (0.065, 0.03, 0.25), sp + Vector((x * 0.11, 0.44, 0)), bevel=0.008)  # shoulder straps
for x in (-0.085, 0, 0.085):  # rifle magazine pouches
    box("spine", "pouch", (0.072, 0.12, 0.05), sp + Vector((x, 0.135, -0.148)), bevel=0.01)
    box("spine", "strap", (0.074, 0.02, 0.052), sp + Vector((x, 0.19, -0.15)), bevel=0.005)
box("spine", "pouch", (0.2, 0.07, 0.045), sp + Vector((0, 0.33, -0.142)), bevel=0.01)  # admin pouch
box("spine", "pouch", (0.22, 0.24, 0.07), sp + Vector((0, 0.25, 0.155)), bevel=0.02)  # assault pack
box("spine", "pouch", (0.06, 0.16, 0.05), sp + Vector((-0.12, 0.3, 0.2)), bevel=0.01)  # radio
lathe("spine", "strap", (-0.12, 0.38, 0.215), (-0.12, 0.6, 0.215), [(0, 0.008), (1, 0.006), (1, 0)], seg=6, local=True)  # antenna
lathe("spine", "uniform", (0, 0.4, 0.005), (0, 0.49, 0.005), [(0, 0.075), (1, 0.066)], seg=12, local=True)  # collar

# Head: face, helmet with cover, headset and glasses.
nk = world("neck")
lathe("neck", "skin", nk + Vector((0, -0.04, 0.01)), nk + Vector((0, 0.08, 0.01)), [(0, 0.055), (1, 0.05)], seg=10)
ellipsoid("neck", "skin", (0.17, 0.23, 0.2), nk + Vector((0, 0.15, -0.005)), part="head")
box("neck", "skin", (0.035, 0.05, 0.04), nk + Vector((0, 0.15, -0.105)), bevel=0.012)  # nose
# A neck gaiter pulled up over the chin and mouth: cloth where most of the bare skin was.
lathe("neck", "uniform", nk + Vector((0, -0.045, 0.004)), nk + Vector((0, 0.128, -0.004)),
      [(0, 0.064), (0.3, 0.07), (0.62, 0.1), (1, 0.107)], seg=12, flat=0.88)
ellipsoid("neck", "helmet", (0.25, 0.22, 0.27), nk + Vector((0, 0.2, 0.0)), cut=-0.05, seg=16, rings=9)
box("neck", "helmet", (0.2, 0.025, 0.03), nk + Vector((0, 0.197, -0.122)), bevel=0.008)  # brim
box("neck", "strap", (0.06, 0.05, 0.03), nk + Vector((0, 0.27, -0.13)), bevel=0.01)  # NVG mount
for x in (-1, 1):
    box("neck", "strap", (0.025, 0.04, 0.1), nk + Vector((x * 0.122, 0.225, 0.005)), bevel=0.008)  # side rails
    ellipsoid("neck", "pouch", (0.05, 0.085, 0.085), nk + Vector((x * 0.1, 0.15, 0.01)), seg=10, rings=6)  # ear cups
box("neck", "lens", (0.15, 0.04, 0.03), nk + Vector((0, 0.175, -0.1)), bevel=0.01)  # glasses
box("neck", "strap", (0.03, 0.06, 0.04), nk + Vector((0, 0.06, -0.08)), bevel=0.01)  # boom mic & chin
for x in (-1, 1):
    box("neck", "strap", (0.012, 0.11, 0.012), nk + Vector((x * 0.085, 0.1, -0.03)), rot=(0.35, 0, 0), bevel=0.003)

# Arms: upper arm and team-coloured shoulder pad, forearm, elbow pad, glove.
for s, side in (("L", -1), ("R", 1)):
    sh, el, wr = world("shoulder" + s), world("elbow" + s), world("wrist" + s)
    lathe("shoulder" + s, "uniform", sh + Vector((0, 0.06, 0)), el + Vector((0, -0.02, 0)),
          [(0, 0), (0.06, 0.05), (0.2, 0.062), (0.55, 0.056), (0.9, 0.05), (1, 0)], part="upperArm" + s, seg=10)
    ellipsoid("shoulder" + s, "accent", (0.14, 0.12, 0.14), sh + Vector((side * 0.02, 0.02, 0)), cut=-0.15, seg=12, rings=6)
    box("shoulder" + s, "strap", (0.075, 0.07, 0.012), sh + Vector((side * 0.06, -0.12, 0)), rot=(0, 0, side * 0.1), bevel=0.004)  # flag patch
    lathe("elbow" + s, "uniform", el + Vector((0, 0.03, 0)), wr + Vector((0, 0.01, 0)),
          [(0, 0), (0.06, 0.05), (0.3, 0.052), (0.8, 0.04), (0.97, 0.037), (1, 0)], part="foreArm" + s, seg=10, flat=0.85)
    ellipsoid("elbow" + s, "pouch", (0.1, 0.1, 0.1), el + Vector((0, -0.005, 0.018)), seg=10, rings=6)  # elbow pad
    lathe("elbow" + s, "glove", wr + Vector((0, 0.07, 0)), wr + Vector((0, -0.005, 0)), [(0, 0.041), (1, 0.043)], seg=10)  # cuff

    # The hand, in the palm frame: palm facing -Y, fingers -Z, thumb toward -X (right) or +X (left).
    def hand(size, at, rot=(0, 0, 0), part=None, slot="glove"):
        return box("wrist" + s, slot, size, (at[0] * side, at[1], at[2]),
                   rot=(rot[0], rot[1] * side, rot[2] * side), part=part, local=True, bevel=0.008)

    hand((0.08, 0.034, 0.09), (0.002, 0.0, -0.045), part="hand" + s)  # back and palm
    hand((0.078, 0.026, 0.036), (0.004, -0.002, -0.106), rot=(0.25, 0, 0))  # first knuckles
    hand((0.074, 0.044, 0.026), (0.004, -0.03, -0.126), rot=(0.1, 0, 0))  # fingers curled down
    hand((0.07, 0.022, 0.03), (0.004, -0.05, -0.103))  # fingertips tucked under the grip
    hand((0.026, 0.026, 0.062), (-0.043, -0.022, -0.06), rot=(0.2, -0.45, 0))  # thumb
    hand((0.06, 0.012, 0.05), (0.003, 0.02, -0.06), slot="strap")  # knuckle guard

# Legs: thigh, knee pad, shin, boot (on the ankle, so it can stay flat on the ground).
for s, side in (("L", -1), ("R", 1)):
    hp, kn, an = world("hip" + s), world("knee" + s), world("ankle" + s)
    lathe("hip" + s, "trousers", hp + Vector((0, 0.06, 0)), kn + Vector((0, -0.02, 0)),
          [(0, 0), (0.06, 0.085), (0.3, 0.088), (0.75, 0.072), (0.95, 0.062), (1, 0)], part="thigh" + s, seg=10)
    box("hip" + s, "pouch", (0.05, 0.13, 0.1), hp + Vector((side * 0.088, -0.17, 0.01)), bevel=0.01)  # cargo pocket
    lathe("knee" + s, "trousers", kn + Vector((0, 0.03, 0)), an + Vector((0, 0.04, 0)),
          [(0, 0), (0.06, 0.062), (0.3, 0.064), (0.85, 0.05), (1, 0)], part="shin" + s, seg=10)
    box("knee" + s, "vest", (0.1, 0.12, 0.05), kn + Vector((0, -0.01, -0.065)), taper=(0.9, 1), bevel=0.015)  # knee pad
    box("knee" + s, "strap", (0.13, 0.025, 0.13), kn + Vector((0, -0.05, -0.0)), bevel=0.006)
    # The boot: a cuff up over the trouser leg, and a rounded toe along the ground.
    lathe("ankle" + s, "boots", an + Vector((0, 0.15, 0.004)), an + Vector((0, -0.05, 0)),
          [(0, 0.055), (0.1, 0.062), (0.7, 0.06), (1, 0.063)], part="foot" + s, seg=10)
    lathe("ankle" + s, "boots", an + Vector((0, -0.012, 0.055)), an + Vector((0, -0.024, -0.185)),
          [(0, 0), (0.08, 0.05), (0.45, 0.057), (0.8, 0.053), (0.95, 0.036), (1, 0)], seg=10, flat=0.74, up=(1, 0, 0))
    box("ankle" + s, "strap", (0.128, 0.018, 0.128), an + Vector((0, 0.115, 0.004)), bevel=0.005)  # the cuff's strap
    box("ankle" + s, "sole", (0.115, 0.03, 0.26), an + Vector((0, -0.065, -0.05)), bevel=0.008)

# ---------------------------------------------------------------------------
# Joints, and one mesh per joint and material.
# ---------------------------------------------------------------------------

empties = {}
root = bpy.data.objects.new("soldier", None)
root.empty_display_size = 0.1
COL.objects.link(root)
for name, (parent, off) in JOINTS.items():
    e = bpy.data.objects.new(name, None)
    e.empty_display_type = "PLAIN_AXES"
    e.empty_display_size = 0.05
    COL.objects.link(e)
    e.parent = empties[parent] if parent else root
    e.location = B(off)
    empties[name] = e

bpy.context.view_layer.update()
groups = {}
for joint, slot, part, ob in PIECES:
    groups.setdefault((joint, slot), []).append((part, ob))
for (joint, slot), items in groups.items():
    obs = [ob for _, ob in items]
    for ob in obs:  # bake bevels before joining
        for mod in list(ob.modifiers):
            with bpy.context.temp_override(object=ob):
                bpy.ops.object.modifier_apply(modifier=mod.name)
    # The named part takes the others in, so it keeps its name.
    keep = next((ob for part, ob in items if part), obs[0])
    if len(obs) > 1:
        with bpy.context.temp_override(active_object=keep, selected_editable_objects=obs, object=keep):
            bpy.ops.object.join()
    named = [p for p, _ in items if p]
    keep.name = named[0] if named else f"{joint}_{slot}"
    keep.data.name = keep.name
    # Pieces are authored in game space; hang them on their joint without moving them.
    e = empties[joint]
    keep.parent = e
    keep.matrix_parent_inverse = e.matrix_world.inverted()
    keep["soldier"] = 1

meshes = [o for o in COL.objects if o.type == "MESH"]
for o in meshes:  # bake the parent inverse into the mesh, so each piece sits at its joint with an identity transform
    o.data.transform(o.matrix_parent_inverse)
    o.matrix_parent_inverse = Matrix()
    o.data.update()


def bake_shade(obs, rays=48, reach=0.16):
    """Paints each piece with how open it is to the sky (its colour attribute, exported as COLOR_0): dark where
    another piece stands close in front of it (under the vest's edge, between the pouches, inside the collar),
    and a little darker toward the boots, where the dust is. The client multiplies the look's colours by it.
    Pieces run into one another (a thigh into the pelvis), and a vertex buried there would drag its darkness
    down the whole limb: a ray leaving the inside of a piece passes through, so only what faces it shades it."""
    from mathutils.bvhtree import BVHTree
    verts, polys = [], []
    for o in obs:
        base = len(verts)
        verts += [o.matrix_world @ v.co for v in o.data.vertices]
        polys += [[base + i for i in poly.vertices] for poly in o.data.polygons]
    tree = BVHTree.FromPolygons(verts, polys, epsilon=0.0)
    # Directions spread evenly over a hemisphere about +Z (a golden-angle spiral).
    dirs = []
    for i in range(rays):
        z = (i + 0.5) / rays
        r = math.sqrt(1 - z * z)
        a = i * math.pi * (3 - math.sqrt(5))
        dirs.append(Vector((math.cos(a) * r, math.sin(a) * r, z)))
    for o in obs:
        me = o.data
        attr = me.color_attributes.get("Color") or me.color_attributes.new("Color", "FLOAT_COLOR", "CORNER")
        me.color_attributes.active_color = attr
        me.color_attributes.render_color_index = list(me.color_attributes).index(attr)
        turn = o.matrix_world.to_3x3()
        seen = {}
        for poly in me.polygons:
            for li in poly.loop_indices:
                vi = me.loops[li].vertex_index
                normal = me.vertices[vi].normal if poly.use_smooth else poly.normal
                key = (vi, round(normal.x, 2), round(normal.y, 2), round(normal.z, 2))
                if key not in seen:
                    n = (turn @ normal).normalized()
                    at = o.matrix_world @ me.vertices[vi].co + n * 0.004
                    frame = n.to_track_quat("Z", "Y")
                    shut = 0.0
                    for d in dirs:
                        way = frame @ d
                        start, gone = at, 0.0
                        for _ in range(6):
                            hit = tree.ray_cast(start, way, reach - gone)
                            if hit[0] is None:
                                break
                            gone += hit[3]
                            if hit[1].dot(way) < 0:  # a face turned toward the vertex
                                shut += (1 - gone / reach) * d.z
                                break
                            start = hit[0] + way * 0.0005
                            gone += 0.0005
                    open_ = 1 - min(1.0, shut / (rays * 0.5) * 1.25)
                    height = at.z  # Blender Z is up; the feet are at 0
                    dust = 0.88 + 0.12 * min(1.0, height / 0.4)
                    seen[key] = max(0.3, open_) * dust
                k = seen[key]
                attr.data[li].color = (k, k, k, 1)


def game_turn(euler):
    """A joint's turn from soldier.ts Euler angles, in Blender's frame."""
    if len(euler) == 2:  # (angles, order), for the one the client gives in another order
        (x, y, z), order = euler
    else:
        (x, y, z), order = euler, "XYZ"
    turns = {"X": Quaternion((1, 0, 0), x), "Y": Quaternion((0, 1, 0), y), "Z": Quaternion((0, 0, 1), z)}
    q = Quaternion()
    for axis in order:
        q = q @ turns[axis]
    return Quaternion((q.w, q.x, -q.z, q.y))


def put_pose(key):
    for name, e in empties.items():
        e.rotation_mode = "QUATERNION"
        angles, at = key.get(name, ((0, 0, 0), None))
        e.rotation_quaternion = game_turn(angles)
        e.location = B(at if at else JOINTS[name][1])


def rest_pose():
    put_pose({})


def author_clips():
    """One NLA track per clip on every joint, which the export joins by name into one animation."""
    fps = bpy.context.scene.render.fps
    for clip, (seconds, keys) in CLIPS.items():
        frames = [1 + round(seconds * fps * i / (len(keys) - 1)) for i in range(len(keys))]
        for name, e in empties.items():
            if not any(name in key for key in keys):
                continue
            action = bpy.data.actions.new(clip + "_" + name)
            data = e.animation_data_create()
            data.action = action
            for key, frame in zip(keys, frames):
                put_pose(key)
                e.keyframe_insert("rotation_quaternion", frame=frame)
                if name == "hips":
                    e.keyframe_insert("location", frame=frame)
            data.action = None
            track = data.nla_tracks.new()
            track.name = clip
            strip = track.strips.new(clip, frames[0], action)
            strip.extrapolation = "NOTHING"
            # Left evaluating, a track puts every joint it drives at zero outside its strip, the rest pose included.
            data.use_nla = False
    rest_pose()
    bpy.context.scene.frame_set(0)


bpy.context.view_layer.update()
bake_shade(meshes)
tris = sum(sum(len(p.vertices) - 2 for p in o.data.polygons) for o in meshes)
result = {"meshes": len(meshes), "tris": tris, "joints": len(empties)}

if not globals().get("ARGS", {}).get("no_export"):
    os.makedirs(os.path.dirname(GLB), exist_ok=True)
    author_clips()
    bpy.ops.object.select_all(action="DESELECT")
    for o in COL.objects:
        o.select_set(True)
    bpy.ops.export_scene.gltf(filepath=GLB, export_format="GLB", use_selection=True, export_apply=True,
                              export_yup=True, export_normals=True, export_texcoords=False, export_materials="EXPORT",
                              export_vertex_color="ACTIVE", export_active_vertex_color_when_no_material=True,
                              export_animations=True, export_animation_mode="NLA_TRACKS", export_force_sampling=False,
                              export_optimize_animation_size=False, export_optimize_animation_keep_anim_object=True)
    result["glb_bytes"] = os.path.getsize(GLB)
    rest_pose()  # the export leaves the joints wherever its last clip ended
    bpy.context.scene.frame_set(0)

    # The editable source, then a preview sheet with the arms down (the hands turned fingers-down, palms in).
    bpy.ops.wm.save_as_mainfile(filepath=BLEND)
    for s, side in (("L", -1), ("R", 1)):
        empties["wrist" + s].rotation_mode = empties["shoulder" + s].rotation_mode = "XYZ"
        empties["wrist" + s].rotation_euler = (math.radians(-90), 0, math.radians(90 * -side))
        empties["shoulder" + s].rotation_euler = (0, 0.12 * -side, 0)
    bpy.context.view_layer.update()
    sys.path.insert(0, os.path.join(os.path.expanduser("~"), ".claude", "skills", "blender", "scripts"))
    try:
        import bkit
        engine = globals().get("ARGS", {}).get("engine", "WORKBENCH")
        result["preview"] = bkit.preview(PREVIEW, meshes, views=("back", "side", "three_quarter", "front"), size=640, engine=engine)["sheet"]
    except ImportError:
        pass
