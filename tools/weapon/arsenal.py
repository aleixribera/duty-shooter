"""Build the v2 weapons and the frag grenade for the first-person view.

Run in the Blender session (see the blender skill):
    bkit.reset(); bkit.run(r"tools/weapon/arsenal.py", weapon="smg")

Gun space matches the M4A1 (tools/weapon/README.md): metres, the right palm
near the origin on the grip, and the muzzle along game -Z. Blender is Z up
with -Y as the front, and the glTF export turns Blender +Y into game -Z, so
every gun here is modelled with its muzzle along Blender +Y and its right
side along +X.

Each GLB holds the static body grouped by material, plus the moving parts as
separate objects whose origins are their pivots, named as the client expects
(`mag`, `slide`, `pump`, `bolt`, `spoon`). Sockets (palms, sight, muzzle,
ejection port) are numbers in the client's weapon rig table, measured from
the same constants used below.
"""
import math

import bmesh
import bpy
from mathutils import Matrix, Vector

WEAPON = ARGS.get("weapon", "smg")  # noqa: F821 (ARGS comes from bkit.run)

STEEL = bkit.material("Steel", (0.05, 0.052, 0.055), 0.55, 0.6)  # noqa: F821
DARK = bkit.material("Blued steel", (0.025, 0.026, 0.03), 0.7, 0.45)  # noqa: F821
POLY = bkit.material("Polymer", (0.03, 0.03, 0.032), 0.0, 0.7)  # noqa: F821
WOOD = bkit.material("Walnut", (0.2, 0.09, 0.04), 0.0, 0.55)  # noqa: F821
OLIVE = bkit.material("Olive drab", (0.13, 0.14, 0.08), 0.0, 0.65)  # noqa: F821
GLASS = bkit.material("Lens", (0.012, 0.025, 0.04), 0.2, 0.05)  # noqa: F821
BRASS = bkit.material("Brass", (0.55, 0.34, 0.12), 1.0, 0.3)  # noqa: F821

coll = bpy.data.collections.new(WEAPON)
bpy.context.scene.collection.children.link(coll)


def _link(obj):
    coll.objects.link(obj)
    return obj


def _finish(obj, mat, bevel, segments=2):
    bkit.assign(obj, mat)  # noqa: F821
    if bevel > 0:
        m = obj.modifiers.new("bevel", "BEVEL")
        m.width = bevel
        m.segments = segments
        m.limit_method = "ANGLE"
        m.angle_limit = math.radians(40)
    return obj


def box(name, size, loc, mat, bevel=0.0015, rot=(0, 0, 0)):
    """An axis-aligned box: `size` (x, y, z) full extents, centred at `loc`."""
    mesh = bpy.data.meshes.new(name)
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    bmesh.ops.scale(bm, vec=Vector(size), verts=bm.verts)
    bm.to_mesh(mesh)
    bm.free()
    obj = _link(bpy.data.objects.new(name, mesh))
    obj.location = loc
    obj.rotation_euler = rot
    return _finish(obj, mat, bevel)


def cyl(name, r, length, loc, mat, axis="Y", verts=20, bevel=0.0008, r2=None):
    """A cylinder (or cone with `r2`) of `length` along `axis`, centred at `loc`."""
    mesh = bpy.data.meshes.new(name)
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, segments=verts, radius1=r, radius2=r if r2 is None else r2, depth=length)
    bm.to_mesh(mesh)
    bm.free()
    obj = _link(bpy.data.objects.new(name, mesh))
    obj.location = loc
    obj.rotation_euler = {"X": (0, math.pi / 2, 0), "Y": (math.pi / 2, 0, 0), "Z": (0, 0, 0)}[axis]
    if axis == "Y":
        # create_cone runs along Z; a quarter turn about X lays it along -Y, so flip to +Y.
        obj.rotation_euler = (-math.pi / 2, 0, 0)
    out = _finish(obj, mat, bevel)
    bpy.ops.object.select_all(action="DESELECT")
    out.select_set(True)
    bpy.context.view_layer.objects.active = out
    bpy.ops.object.shade_auto_smooth()
    return out


def prism(name, outline, width, mat, bevel=0.0012):
    """An outline in the side plane (y forward, z up) extruded `width` across X, centred on x = 0."""
    mesh = bpy.data.meshes.new(name)
    bm = bmesh.new()
    verts = [bm.verts.new((-width / 2, y, z)) for y, z in outline]
    face = bm.faces.new(verts)
    res = bmesh.ops.extrude_face_region(bm, geom=[face])
    moved = [v for v in res["geom"] if isinstance(v, bmesh.types.BMVert)]
    bmesh.ops.translate(bm, vec=(width, 0, 0), verts=moved)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(mesh)
    bm.free()
    return _finish(_link(bpy.data.objects.new(name, mesh)), mat, bevel)


def part(name, objs, pivot):
    """Joins `objs` into one moving part named `name` with its origin at `pivot`."""
    joined = join(name, objs)
    bpy.context.scene.cursor.location = pivot
    bpy.ops.object.select_all(action="DESELECT")
    joined.select_set(True)
    bpy.context.view_layer.objects.active = joined
    bpy.ops.object.origin_set(type="ORIGIN_CURSOR")
    bpy.context.scene.cursor.location = (0, 0, 0)
    return joined


def join(name, objs):
    """Applies modifiers and transforms, then joins `objs` into one object called `name`."""
    bpy.ops.object.select_all(action="DESELECT")
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    for o in objs:
        bpy.context.view_layer.objects.active = o
        for m in list(o.modifiers):
            bpy.ops.object.modifier_apply(modifier=m.name)
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    bpy.context.view_layer.objects.active = objs[0]
    if len(objs) > 1:
        bpy.ops.object.join()
    out = bpy.context.view_layer.objects.active
    out.name = name
    out.data.name = name
    return out


def bodies(groups):
    """Joins the static pieces by material: one object per material, named body_<material>."""
    out = []
    for key, objs in groups.items():
        if objs:
            out.append(join(f"body_{key}", objs))
    return out


# ---------------------------------------------------------------------------
# The guns. Shared landmarks (Blender coordinates): the right palm sits at
# about (0.015, 0, -0.074) on every grip, like the M4A1.
# ---------------------------------------------------------------------------


def build_smg():
    """Wasp 9: a compact 9 mm SMG, magazine through the pistol grip, folding wire stock, short barrel."""
    s, d, p = [], [], []
    # Receiver: a long flat box with a ribbed top cover.
    s.append(box("receiver", (0.042, 0.25, 0.058), (0, 0.06, 0.004), STEEL, 0.003))
    s.append(box("top_cover", (0.038, 0.2, 0.012), (0, 0.07, 0.038), DARK, 0.002))
    for i in range(7):
        d.append(box(f"rib{i}", (0.04, 0.004, 0.004), (0, 0.0 + i * 0.022, 0.046), DARK, 0.0))
    # Barrel and muzzle nut.
    d.append(cyl("barrel", 0.0075, 0.07, (0, 0.215, 0.01), DARK, verts=16))
    d.append(cyl("barrel_nut", 0.014, 0.022, (0, 0.19, 0.01), STEEL, verts=12))
    # Sights: a post at the front, an aperture at the back.
    d.append(box("front_post", (0.004, 0.006, 0.02), (0, 0.17, 0.052), DARK, 0.0))
    d.append(box("front_ears", (0.02, 0.008, 0.014), (0, 0.17, 0.048), DARK, 0.001))
    d.append(box("rear_sight", (0.022, 0.012, 0.018), (0, -0.045, 0.05), DARK, 0.001))
    # Grip with the magazine running through it, and the trigger guard.
    p.append(prism("grip", [(-0.012, -0.022), (0.03, -0.022), (0.028, -0.115), (-0.02, -0.118)], 0.036, POLY, 0.004))
    s.append(prism("trigger_guard", [(0.03, -0.022), (0.08, -0.022), (0.08, -0.03), (0.07, -0.06), (0.03, -0.06), (0.03, -0.054), (0.066, -0.054), (0.072, -0.03), (0.03, -0.03)], 0.01, STEEL, 0.001))
    d.append(box("trigger", (0.006, 0.006, 0.024), (0, 0.045, -0.038), DARK, 0.0))
    d.append(box("cocking_knob", (0.016, 0.016, 0.012), (0, 0.11, 0.05), DARK, 0.002))
    # Folding stock: two wire struts folded under the receiver, a butt plate at the front.
    for x in (-0.017, 0.017):
        d.append(cyl(f"strut{x}", 0.0035, 0.22, (x, 0.04, -0.03), DARK, verts=8))
    d.append(box("butt", (0.04, 0.008, 0.03), (0, 0.15, -0.03), DARK, 0.002))
    d.append(box("sling_loop", (0.046, 0.01, 0.01), (0, -0.06, -0.015), STEEL, 0.001))
    body = bodies({"steel": s, "dark": d, "polymer": p})
    mag = part("mag", [box("mag_body", (0.026, 0.03, 0.16), (0, 0.004, -0.13), STEEL, 0.002), box("mag_base", (0.03, 0.036, 0.008), (0, 0.004, -0.21), DARK, 0.002)], (0, 0.004, -0.04))
    return body + [mag]


def build_pistol():
    """Warden 9: a polymer-frame 9 mm pistol with a steel slide."""
    s, d, p = [], [], []
    p.append(prism("frame", [(-0.02, -0.0), (0.12, -0.0), (0.12, -0.016), (0.02, -0.016), (0.0, -0.03), (-0.02, -0.03)], 0.026, POLY, 0.003))
    p.append(prism("grip", [(-0.03, -0.012), (0.012, -0.012), (0.004, -0.12), (-0.04, -0.118)], 0.03, POLY, 0.005))
    p.append(prism("trigger_guard", [(0.012, -0.014), (0.07, -0.014), (0.07, -0.022), (0.058, -0.048), (0.012, -0.048), (0.012, -0.042), (0.052, -0.042), (0.062, -0.022), (0.012, -0.022)], 0.01, POLY, 0.001))
    d.append(box("trigger", (0.005, 0.005, 0.02), (0, 0.03, -0.028), DARK, 0.0))
    d.append(cyl("barrel_tip", 0.0062, 0.01, (0, 0.135, 0.016), DARK, verts=14))
    body = bodies({"steel": s, "dark": d, "polymer": p})
    # The slide recoils along -Y on its own.
    slide = [box("slide_body", (0.026, 0.19, 0.032), (0, 0.04, 0.016), STEEL, 0.0025)]
    for i in range(6):
        slide.append(box(f"serration{i}", (0.0275, 0.003, 0.026), (0, -0.045 + i * 0.006, 0.016), DARK, 0.0))
    slide.append(box("front_sight", (0.004, 0.006, 0.006), (0, 0.125, 0.035), DARK, 0.0))
    slide.append(box("rear_sight", (0.02, 0.008, 0.007), (0, -0.045, 0.035), DARK, 0.0))
    slide.append(box("port", (0.004, 0.022, 0.008), (0.012, 0.03, 0.022), DARK, 0.0))
    slide_part = part("slide", slide, (0, 0.04, 0.016))
    mag = part("mag", [box("mag_body", (0.02, 0.03, 0.1), (0, -0.012, -0.07), STEEL, 0.002), box("mag_base", (0.026, 0.038, 0.008), (0, -0.016, -0.122), POLY, 0.002)], (0, -0.012, -0.02))
    return body + [slide_part, mag]


def build_shotgun():
    """Harrow 12: a 12-gauge pump with a walnut stock and forend, steel receiver, tube under the barrel."""
    s, d, w = [], [], []
    s.append(box("receiver", (0.036, 0.22, 0.062), (0, 0.06, 0.008), STEEL, 0.004))
    d.append(cyl("barrel", 0.0115, 0.5, (0, 0.42, 0.022), DARK, verts=18))
    d.append(cyl("tube", 0.0105, 0.42, (0, 0.38, -0.008), DARK, verts=16))
    d.append(cyl("tube_cap", 0.012, 0.02, (0, 0.6, -0.008), STEEL, verts=14))
    d.append(box("barrel_clamp", (0.012, 0.012, 0.042), (0, 0.585, 0.007), STEEL, 0.001))
    d.append(cyl("bead", 0.0028, 0.006, (0, 0.665, 0.037), BRASS, axis="Z", verts=10))
    d.append(box("rib", (0.008, 0.48, 0.004), (0, 0.42, 0.035), DARK, 0.0))
    s.append(prism("trigger_guard", [(0.0, -0.022), (0.09, -0.022), (0.09, -0.03), (0.075, -0.06), (0.0, -0.06), (0.0, -0.054), (0.07, -0.054), (0.08, -0.03), (0.0, -0.03)], 0.012, STEEL, 0.001))
    d.append(box("trigger", (0.006, 0.006, 0.024), (0, 0.04, -0.036), DARK, 0.0))
    d.append(box("port", (0.004, 0.06, 0.022), (0.0185, 0.07, 0.016), DARK, 0.0))
    d.append(box("loading_port", (0.022, 0.07, 0.004), (0, 0.08, -0.022), DARK, 0.0))
    # Stock: pistol-grip wrist sweeping down to a butt with a rubber pad.
    w.append(prism("stock", [(-0.05, 0.03), (-0.05, -0.034), (-0.12, -0.062), (-0.37, -0.135), (-0.38, -0.135), (-0.38, -0.012), (-0.14, 0.002), (-0.08, 0.008)], 0.04, WOOD, 0.006))
    d.append(box("butt_pad", (0.042, 0.016, 0.125), (0, -0.388, -0.0735), POLY, 0.004))
    body = bodies({"steel": s, "dark": d, "wood": w})
    # The forend slides along the tube; its origin sits at rest.
    pump = part("pump", [prism("forend", [(0.2, -0.028), (0.38, -0.028), (0.38, 0.012), (0.2, 0.012)], 0.044, WOOD, 0.006)], (0, 0.29, -0.008))
    return body + [pump]


def build_sniper():
    """Ridgeline .308: a bolt-action rifle with an olive stock, heavy barrel and a 4x scope."""
    s, d, o, g = [], [], [], []
    s.append(cyl("receiver", 0.018, 0.22, (0, 0.06, 0.012), STEEL, verts=20))
    d.append(cyl("barrel", 0.0135, 0.62, (0, 0.48, 0.012), DARK, verts=18, r2=0.0105))
    d.append(cyl("crown", 0.0115, 0.012, (0, 0.795, 0.012), STEEL, verts=16))
    # Stock: a thumbhole-free sporter shape with a raised cheek piece.
    o.append(prism("stock", [(-0.04, 0.0), (0.4, 0.0), (0.4, -0.03), (0.05, -0.036), (0.01, -0.03), (-0.02, -0.11), (-0.06, -0.11), (-0.06, -0.06), (-0.4, -0.11), (-0.41, -0.11), (-0.41, 0.03), (-0.12, 0.035), (-0.06, 0.004)], 0.045, OLIVE, 0.006))
    o.append(box("cheek", (0.036, 0.2, 0.024), (0, -0.25, 0.04), OLIVE, 0.006))
    d.append(box("butt_pad", (0.047, 0.016, 0.15), (0, -0.418, -0.035), POLY, 0.004))
    s.append(prism("trigger_guard", [(0.0, -0.034), (0.08, -0.034), (0.07, -0.07), (0.0, -0.068), (0.0, -0.062), (0.064, -0.062), (0.072, -0.04), (0.0, -0.04)], 0.012, STEEL, 0.001))
    d.append(box("trigger", (0.006, 0.006, 0.022), (0, 0.035, -0.048), DARK, 0.0))
    # Scope: tube, bells, turrets and rings. The eye looks along the tube at z = 0.072.
    d.append(cyl("scope_tube", 0.015, 0.2, (0, 0.06, 0.072), DARK, verts=24))
    d.append(cyl("objective", 0.024, 0.07, (0, 0.2, 0.072), DARK, verts=24, r2=0.021))
    d.append(cyl("objective_cone", 0.021, 0.04, (0, 0.155, 0.072), DARK, verts=24, r2=0.015))
    d.append(cyl("ocular", 0.02, 0.07, (0, -0.075, 0.072), DARK, verts=24))
    d.append(cyl("ocular_cone", 0.015, 0.03, (0, -0.03, 0.072), DARK, verts=24, r2=0.02))
    d.append(cyl("turret_top", 0.011, 0.024, (0, 0.06, 0.094), STEEL, axis="Z", verts=16))
    d.append(cyl("turret_side", 0.011, 0.024, (0.022, 0.06, 0.072), STEEL, axis="X", verts=16))
    for y in (0.0, 0.13):
        s.append(box(f"ring{y}", (0.034, 0.016, 0.06), (0, y, 0.044), STEEL, 0.003))
    g.append(cyl("lens_front", 0.021, 0.002, (0, 0.236, 0.072), GLASS, verts=24))
    g.append(cyl("lens_rear", 0.017, 0.002, (0, -0.111, 0.072), GLASS, verts=24))
    body = bodies({"steel": s, "dark": d, "olive": o, "glass": g})
    # The bolt rotates up about the bore, then pulls back.
    bolt = part("bolt", [cyl("bolt_body", 0.009, 0.05, (0, -0.03, 0.012), STEEL, verts=14), cyl("bolt_arm", 0.0035, 0.045, (0.03, -0.035, 0.012), STEEL, axis="X", verts=8), cyl("bolt_knob", 0.008, 0.016, (0.055, -0.035, 0.012), DARK, axis="X", verts=12)], (0, -0.03, 0.012))
    mag = part("mag", [box("mag_body", (0.03, 0.08, 0.04), (0, 0.07, -0.035), DARK, 0.002)], (0, 0.07, -0.02))
    return body + [bolt, mag]


def build_frag():
    """A fragmentation grenade: a rounded olive body, a steel fuse, the spoon and the pull ring. Origin at its centre."""
    o, s = [], []
    mesh = bpy.data.meshes.new("frag_body")
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=20, v_segments=14, radius=0.031)
    bmesh.ops.scale(bm, vec=(1, 1, 1.18), verts=bm.verts)
    bm.to_mesh(mesh)
    bm.free()
    shell = _link(bpy.data.objects.new("frag_shell", mesh))
    bkit.assign(shell, OLIVE)  # noqa: F821
    for poly in mesh.polygons:
        poly.use_smooth = True
    o.append(shell)
    s.append(cyl("fuse", 0.011, 0.024, (0, 0, 0.042), STEEL, axis="Z", verts=14))
    s.append(cyl("fuse_cap", 0.0075, 0.01, (0, 0, 0.058), STEEL, axis="Z", verts=12))
    body = bodies({"olive": o, "steel": s})
    spoon = part("spoon", [box("spoon_top", (0.012, 0.03, 0.003), (0, 0.012, 0.056), STEEL, 0.0), box("spoon_side", (0.012, 0.003, 0.06), (0, 0.028, 0.026), STEEL, 0.0)], (0, 0.0, 0.056))
    ring = bpy.data.meshes.new("ring")
    bm = bmesh.new()
    bmesh.ops.create_circle(bm, segments=16, radius=0.011)
    bm.to_mesh(ring)
    bm.free()
    ring_obj = _link(bpy.data.objects.new("ring", ring))
    ring_obj.location = (-0.016, 0, 0.05)
    ring_obj.rotation_euler = (0, math.pi / 2, 0)
    sk = ring_obj.modifiers.new("wire", "SKIN")
    ring_obj.data.skin_vertices[0].data.foreach_set("radius", [0.0012, 0.0012] * len(ring_obj.data.vertices))
    bkit.assign(ring_obj, STEEL)  # noqa: F821
    ring_part = part("ring", [ring_obj], (-0.016, 0, 0.05))
    return body + [spoon, ring_part]


BUILDERS = {"smg": build_smg, "pistol": build_pistol, "shotgun": build_shotgun, "sniper": build_sniper, "frag": build_frag}
objs = BUILDERS[WEAPON]()
result = bkit.check(objs, budget=20000)  # noqa: F821
result["objects"] = [o.name for o in objs]
