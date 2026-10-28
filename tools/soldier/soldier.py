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
rigidly skinned mesh; the pieces themselves are what a ragdoll throws.

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
from mathutils import Euler, Matrix, Vector

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

# Slot colours (sRGB) as the free-for-all look wears them; the client recolours by slot.
SLOTS = {
    "uniform": 0x5D6447, "trousers": 0x535A40, "vest": 0x3D4232, "pouch": 0x353A2B, "strap": 0x262920,
    "skin": 0xC08F6A, "helmet": 0x4B5139, "boots": 0x2A2622, "sole": 0x161412, "accent": 0x5D6447,
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
    box("ankle" + s, "boots", (0.11, 0.14, 0.13), an + Vector((0, 0.02, 0.0)), part="foot" + s, bevel=0.025)
    box("ankle" + s, "boots", (0.105, 0.075, 0.17), an + Vector((0, -0.03, -0.075)), bevel=0.025)  # toe
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

tris = sum(sum(len(p.vertices) - 2 for p in o.data.polygons) for o in meshes)
result = {"meshes": len(meshes), "tris": tris, "joints": len(empties)}

if not globals().get("ARGS", {}).get("no_export"):
    os.makedirs(os.path.dirname(GLB), exist_ok=True)
    bpy.ops.object.select_all(action="DESELECT")
    for o in COL.objects:
        o.select_set(True)
    bpy.ops.export_scene.gltf(filepath=GLB, export_format="GLB", use_selection=True, export_apply=True,
                              export_yup=True, export_normals=True, export_texcoords=False, export_materials="EXPORT")
    result["glb_bytes"] = os.path.getsize(GLB)

    # The editable source, then a preview sheet with the arms down (the hands turned fingers-down, palms in).
    bpy.ops.wm.save_as_mainfile(filepath=BLEND)
    for s, side in (("L", -1), ("R", 1)):
        empties["wrist" + s].rotation_euler = (math.radians(-90), 0, math.radians(90 * -side))
        empties["shoulder" + s].rotation_euler = (0, 0.12 * -side, 0)
    bpy.context.view_layer.update()
    sys.path.insert(0, os.path.join(os.path.expanduser("~"), ".claude", "skills", "blender", "scripts"))
    try:
        import bkit
        result["preview"] = bkit.preview(PREVIEW, meshes, views=("back", "side", "three_quarter", "front"), size=640,
                                         engine=globals().get("ARGS", {}).get("engine", "WORKBENCH"))["sheet"]
    except ImportError:
        pass
    for s in ("L", "R"):
        empties["wrist" + s].rotation_euler = (0, 0, 0)
        empties["shoulder" + s].rotation_euler = (0, 0, 0)
