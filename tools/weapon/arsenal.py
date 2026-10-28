"""Build the frag grenade for the first-person view.

The guns have their own generators, pistol.py, smg.py, shotgun.py and
sniper.py (see gunsmith.py).

Run in the Blender session (see the blender skill):
    bkit.reset(); bkit.run(r"tools/weapon/arsenal.py", weapon="frag")

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

WEAPON = ARGS.get("weapon", "frag")  # noqa: F821 (ARGS comes from bkit.run)

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


BUILDERS = {"frag": build_frag}
objs = BUILDERS[WEAPON]()
result = bkit.check(objs, budget=20000)  # noqa: F821
result["objects"] = [o.name for o in objs]
