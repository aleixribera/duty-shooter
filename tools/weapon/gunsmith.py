"""Shared tools for the arsenal's Blender generators (pistol.py, smg.py, ...).

Every generator models one weapon in the M4A1's gun space and hands it to
`Gun.finish()`, which bakes its surfaces and writes the game GLB, the editable
.blend and a preview sheet. Coordinates are metres in Blender's frame: the
muzzle along +Y, the gun's right side along +X, +Z up; the glTF export turns
Blender +Y into game -Z. The right palm sits near the origin on the grip.

Surfaces are procedural "finishes" (nitrided steel, polymer, walnut, ...):
node trees with edge wear, cavity grime and micro detail. They are baked in
Cycles into one texture set per weapon (base colour with occlusion, roughness
and metalness, tangent-space normals), and the exported materials are plain
glTF PBR materials that read those textures. Each exported material also
carries its finish's flat colour as the glTF extra `tint`, which the
third-person view uses instead of the textures.

Moving parts are separate objects named as the client expects (`mag`, `slide`,
`pump`, `bolt`), with their pivots as origins.
"""
import math
import os

import bmesh
import bpy
from mathutils import Matrix, Vector

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(os.path.dirname(HERE))
ASSETS = os.path.join(REPO, "packages", "fps-client", "src", "viewmodel", "assets")
PREVIEWS = os.path.join(HERE, "previews")


# ---------------------------------------------------------------------------
# Finishes: how each surface looks. Colours are linear RGB.
# ---------------------------------------------------------------------------

FINISHES = {
    # Black nitride steel: slides, receivers. Wears to bright steel on the edges.
    "nitride": dict(base=(0.022, 0.023, 0.025), rough=0.36, metal=0.85, wear=(0.32, 0.32, 0.33), wear_rough=0.22,
                    wear_amount=0.55, grain=0.25, bump=0.15),
    # Manganese phosphate (parkerized): matte grey-black, slightly green.
    "phosphate": dict(base=(0.03, 0.032, 0.03), rough=0.62, metal=0.55, wear=(0.26, 0.26, 0.26), wear_rough=0.3,
                      wear_amount=0.45, grain=0.35, bump=0.25),
    # Hot-blued carbon steel: deep blue-black with a gloss.
    "blued": dict(base=(0.014, 0.017, 0.024), rough=0.24, metal=0.9, wear=(0.3, 0.3, 0.31), wear_rough=0.2,
                  wear_amount=0.5, grain=0.2, bump=0.08),
    # Bare machined steel: bolts, crowns, pins.
    "steel": dict(base=(0.38, 0.38, 0.39), rough=0.3, metal=1.0, wear=(0.55, 0.55, 0.56), wear_rough=0.18,
                  wear_amount=0.3, grain=0.5, bump=0.1, brushed=True),
    # Black hard-anodised aluminium: scope tubes, rails.
    "anodised": dict(base=(0.016, 0.016, 0.018), rough=0.42, metal=0.75, wear=(0.5, 0.5, 0.52), wear_rough=0.25,
                     wear_amount=0.5, grain=0.2, bump=0.08),
    # Glass-filled polymer: frames, grips, magazines bodies.
    "polymer": dict(base=(0.026, 0.026, 0.028), rough=0.6, metal=0.0, wear=(0.06, 0.06, 0.062), wear_rough=0.42,
                    wear_amount=0.6, grain=0.3, bump=0.35, speckle=0.12),
    # Aggressive stipple on polymer grip panels.
    "stipple": dict(base=(0.022, 0.022, 0.024), rough=0.78, metal=0.0, wear=(0.05, 0.05, 0.052), wear_rough=0.55,
                    wear_amount=0.4, grain=0.3, bump=0.3, stipple=1.0),
    # Rubber: butt pads, scope eye cups.
    "rubber": dict(base=(0.018, 0.018, 0.018), rough=0.88, metal=0.0, wear=(0.03, 0.03, 0.03), wear_rough=0.8,
                   wear_amount=0.2, grain=0.5, bump=0.4),
    # Oiled walnut with a lacquer coat.
    "walnut": dict(base=(0.12, 0.05, 0.022), rough=0.34, metal=0.0, wear=(0.3, 0.15, 0.07), wear_rough=0.55,
                   wear_amount=0.45, grain=0.2, bump=0.15, wood=True),
    # Walnut with cut checkering.
    "checkered": dict(base=(0.1, 0.042, 0.018), rough=0.55, metal=0.0, wear=(0.22, 0.11, 0.05), wear_rough=0.6,
                      wear_amount=0.3, grain=0.2, bump=0.15, wood=True, checker=1.0),
    # Composite stock in olive with a black spider-web fleck.
    "composite": dict(base=(0.062, 0.068, 0.038), rough=0.66, metal=0.0, wear=(0.11, 0.115, 0.075), wear_rough=0.5,
                      wear_amount=0.45, grain=0.3, bump=0.3, web=(0.012, 0.012, 0.01)),
    # Olive drab enamel over steel: grenade bodies.
    "olive_paint": dict(base=(0.05, 0.058, 0.026), rough=0.55, metal=0.0, wear=(0.3, 0.3, 0.3), wear_rough=0.3,
                        wear_amount=0.6, grain=0.35, bump=0.2, chip_metal=True),
    # Yellow stencil paint (the grenade's filler band and lettering).
    "yellow_paint": dict(base=(0.5, 0.36, 0.03), rough=0.55, metal=0.0, wear=(0.3, 0.3, 0.3), wear_rough=0.3,
                         wear_amount=0.5, grain=0.4, bump=0.1, chip_metal=True),
    # White paint: sight dots and fills.
    "white_paint": dict(base=(0.7, 0.7, 0.66), rough=0.5, metal=0.0, wear=(0.5, 0.5, 0.48), wear_rough=0.5,
                        wear_amount=0.1, grain=0.2, bump=0.05),
    # Light laser engraving on dark metal.
    "engraving": dict(base=(0.2, 0.2, 0.21), rough=0.55, metal=0.6, wear=(0.2, 0.2, 0.21), wear_rough=0.55,
                      wear_amount=0.0, grain=0.3, bump=0.05),
    "brass": dict(base=(0.62, 0.42, 0.14), rough=0.28, metal=1.0, wear=(0.75, 0.55, 0.25), wear_rough=0.2,
                  wear_amount=0.3, grain=0.3, bump=0.05),
    "copper": dict(base=(0.6, 0.28, 0.14), rough=0.3, metal=1.0, wear=(0.7, 0.4, 0.25), wear_rough=0.2,
                   wear_amount=0.3, grain=0.3, bump=0.05),
    # Coated optics: a dark glass with a violet-green bloom.
    "lens": dict(base=(0.02, 0.035, 0.04), rough=0.04, metal=0.6, wear=(0.02, 0.035, 0.04), wear_rough=0.04,
                 wear_amount=0.0, grain=0.0, bump=0.0, flat=True),
    # Fibre-optic / tritium inserts.
    "green_insert": dict(base=(0.15, 0.6, 0.12), rough=0.3, metal=0.0, wear=(0.15, 0.6, 0.12), wear_rough=0.3,
                         wear_amount=0.0, grain=0.0, bump=0.0, flat=True),
    "red_insert": dict(base=(0.65, 0.05, 0.03), rough=0.3, metal=0.0, wear=(0.65, 0.05, 0.03), wear_rough=0.3,
                       wear_amount=0.0, grain=0.0, bump=0.0, flat=True),
}


def soften(points, passes=2, closed=True):
    """Rounds an outline by corner cutting; a point given as (a, b, True) stays sharp."""
    pts = [(p[0], p[1], len(p) > 2 and p[2]) for p in points]
    for _ in range(passes):
        out = []
        n = len(pts)
        for i in range(n if closed else n - 1):
            a, b = pts[i], pts[(i + 1) % n]
            if a[2]:
                out.append(a)
            else:
                out.append((0.75 * a[0] + 0.25 * b[0], 0.75 * a[1] + 0.25 * b[1], False))
            if not b[2]:
                out.append((0.25 * a[0] + 0.75 * b[0], 0.25 * a[1] + 0.75 * b[1], False))
        if not closed:
            out.append(pts[-1])
        pts = out
    return [(p[0], p[1]) for p in pts]


def finish(name):
    """The bake material for finish `name` (created once per file)."""
    mat = bpy.data.materials.get(name)
    if mat is None:
        mat = bpy.data.materials.new(name)
        spec = FINISHES[name]
        mat.diffuse_color = (*spec["base"], 1.0)
        mat["finish"] = name
    return mat


# ---------------------------------------------------------------------------
# Modelling
# ---------------------------------------------------------------------------

class Gun:
    """One weapon being built: its collection, static pieces and moving parts."""

    def __init__(self, name):
        self.name = name
        _reset_scene()
        self.coll = bpy.data.collections.new(name)
        bpy.context.scene.collection.children.link(self.coll)
        self.parts = {}

    # -- primitives ---------------------------------------------------------

    def _obj(self, name, bm, mat, bevel, segments=3, angle=25, smooth=True):
        mesh = bpy.data.meshes.new(name)
        bm.to_mesh(mesh)
        bm.free()
        obj = bpy.data.objects.new(name, mesh)
        self.coll.objects.link(obj)
        obj.data.materials.append(finish(mat))
        if smooth:
            for p in mesh.polygons:
                p.use_smooth = True
            _smooth_by_angle(obj, min(angle, 40))
        if bevel > 0:
            m = obj.modifiers.new("bevel", "BEVEL")
            m.width = bevel
            m.segments = segments
            m.limit_method = "ANGLE"
            m.angle_limit = math.radians(angle)
            m.use_clamp_overlap = True
            m.miter_outer = "MITER_ARC"
            # Large flat faces keep flat normals; the bevels carry the shading round the corners.
            wn = obj.modifiers.new("normals", "WEIGHTED_NORMAL")
            wn.keep_sharp = True
            wn.weight = 100
            wn.mode = "FACE_AREA"
        return obj

    def box(self, name, size, loc, mat, bevel=0.0008, rot=(0, 0, 0), segments=3):
        """An axis-aligned box of full extents `size`, centred at `loc`, optionally rotated (radians, XYZ)."""
        bm = bmesh.new()
        bmesh.ops.create_cube(bm, size=1.0)
        bmesh.ops.scale(bm, vec=Vector(size), verts=bm.verts)
        _place(bm, loc, rot)
        return self._obj(name, bm, mat, bevel, segments)

    def slab(self, name, outline, width, mat, bevel=0.001, x=0.0, segments=3, angle=25, taper=None):
        """A side-profile outline [(y, z), ...] extruded `width` across X, centred on `x`.

        `taper(y, z)` -> scale of the half width at that point (default 1).
        """
        bm = bmesh.new()
        front = [bm.verts.new((x - width / 2, y, z)) for y, z in outline]
        back = [bm.verts.new((x + width / 2, y, z)) for y, z in outline]
        n = len(outline)
        bm.faces.new(front)
        bm.faces.new(list(reversed(back)))
        for i in range(n):
            j = (i + 1) % n
            bm.faces.new((front[i], front[j], back[j], back[i]))
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        if taper:
            for v in bm.verts:
                v.co.x = x + (v.co.x - x) * taper(v.co.y, v.co.z)
        return self._obj(name, bm, mat, bevel, segments, angle)

    def plan(self, name, outline, height, mat, bevel=0.001, z=0.0, segments=3, angle=25):
        """A top-view outline [(x, y), ...] extruded `height` up Z, centred on `z`."""
        bm = bmesh.new()
        lo = [bm.verts.new((px, py, z - height / 2)) for px, py in outline]
        hi = [bm.verts.new((px, py, z + height / 2)) for px, py in outline]
        n = len(outline)
        bm.faces.new(lo)
        bm.faces.new(list(reversed(hi)))
        for i in range(n):
            j = (i + 1) % n
            bm.faces.new((lo[i], lo[j], hi[j], hi[i]))
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        return self._obj(name, bm, mat, bevel, segments, angle)

    def sweep(self, name, section, y0, y1, mat, bevel=0.001, segments=3, angle=25, shape=None):
        """A cross-section [(x, z), ...] extruded along Y from `y0` to `y1`.

        `shape(v)` may move the vertices afterwards (e.g. to slope a nose).
        """
        bm = bmesh.new()
        a = [bm.verts.new((px, y0, pz)) for px, pz in section]
        b = [bm.verts.new((px, y1, pz)) for px, pz in section]
        n = len(section)
        bm.faces.new(a)
        bm.faces.new(list(reversed(b)))
        for i in range(n):
            j = (i + 1) % n
            bm.faces.new((a[i], a[j], b[j], b[i]))
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        if shape:
            for v in bm.verts:
                shape(v)
        return self._obj(name, bm, mat, bevel, segments, angle)

    def lathe(self, name, profile, loc, mat, axis="Y", verts=32, bevel=0.0, segments=2, angle=30, closed=True):
        """A solid of revolution: `profile` [(r, t), ...] along `axis` through `loc`.

        Profiles that start or end with r > 0 are capped.
        """
        bm = bmesh.new()
        rings = []
        for r, t in profile:
            if r <= 1e-6:
                rings.append([bm.verts.new((0, 0, t))])
                continue
            rings.append([bm.verts.new((r * math.cos(a), r * math.sin(a), t))
                          for a in (2 * math.pi * k / verts for k in range(verts))])
        for ra, rb in zip(rings, rings[1:]):
            if len(ra) == 1 and len(rb) == 1:
                continue
            if len(ra) == 1:
                for k in range(verts):
                    bm.faces.new((ra[0], rb[k], rb[(k + 1) % verts]))
            elif len(rb) == 1:
                for k in range(verts):
                    bm.faces.new((ra[(k + 1) % verts], ra[k], rb[0]))
            else:
                for k in range(verts):
                    bm.faces.new((ra[k], ra[(k + 1) % verts], rb[(k + 1) % verts], rb[k]))
        if closed:
            if len(rings[0]) > 1:
                bm.faces.new(list(reversed(rings[0])))
            if len(rings[-1]) > 1:
                bm.faces.new(rings[-1])
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        rot = {"Z": Matrix.Identity(3), "Y": Matrix.Rotation(-math.pi / 2, 3, "X"), "X": Matrix.Rotation(math.pi / 2, 3, "Y")}[axis]
        bmesh.ops.rotate(bm, verts=bm.verts, cent=(0, 0, 0), matrix=rot)
        bmesh.ops.translate(bm, vec=Vector(loc), verts=bm.verts)
        return self._obj(name, bm, mat, bevel, segments, angle)

    def cyl(self, name, r, length, loc, mat, axis="Y", verts=24, bevel=0.0004, r2=None):
        """A cylinder (cone with `r2`) of `length` along `axis`, centred at `loc`."""
        rb = r if r2 is None else r2
        return self.lathe(name, [(r, -length / 2), (rb, length / 2)], loc, mat, axis, verts, bevel)

    def tube(self, name, r_out, r_in, length, loc, mat, axis="Y", verts=32, bevel=0.0004):
        """A hollow tube (e.g. a muzzle), open bore through its length."""
        bm = bmesh.new()
        h = length / 2
        rings = []
        for r, t in ((r_out, -h), (r_out, h), (r_in, h), (r_in, -h)):
            rings.append([bm.verts.new((r * math.cos(a), r * math.sin(a), t))
                          for a in (2 * math.pi * k / verts for k in range(verts))])
        for i in range(4):
            ra, rb = rings[i], rings[(i + 1) % 4]
            for k in range(verts):
                bm.faces.new((ra[k], ra[(k + 1) % verts], rb[(k + 1) % verts], rb[k]))
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        rot = {"Z": Matrix.Identity(3), "Y": Matrix.Rotation(-math.pi / 2, 3, "X"), "X": Matrix.Rotation(math.pi / 2, 3, "Y")}[axis]
        bmesh.ops.rotate(bm, verts=bm.verts, cent=(0, 0, 0), matrix=rot)
        bmesh.ops.translate(bm, vec=Vector(loc), verts=bm.verts)
        return self._obj(name, bm, mat, bevel, 2, 30)

    def torus(self, name, r_major, r_minor, loc, mat, rot=(0, 0, 0), verts=24, ring=8):
        bm = bmesh.new()
        grid = []
        for i in range(verts):
            a = 2 * math.pi * i / verts
            row = []
            for j in range(ring):
                b = 2 * math.pi * j / ring
                rr = r_major + r_minor * math.cos(b)
                row.append(bm.verts.new((rr * math.cos(a), rr * math.sin(a), r_minor * math.sin(b))))
            grid.append(row)
        for i in range(verts):
            for j in range(ring):
                bm.faces.new((grid[i][j], grid[(i + 1) % verts][j], grid[(i + 1) % verts][(j + 1) % ring], grid[i][(j + 1) % ring]))
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        _place(bm, loc, rot)
        return self._obj(name, bm, mat, 0.0)

    def pipe(self, name, points, radius, mat, verts=10):
        """A round wire along `points` (e.g. a pull ring or sling loop)."""
        bm = bmesh.new()
        rings = []
        pts = [Vector(p) for p in points]
        for i, p in enumerate(pts):
            d = (pts[min(i + 1, len(pts) - 1)] - pts[max(i - 1, 0)]).normalized()
            up = Vector((0, 0, 1)) if abs(d.z) < 0.9 else Vector((1, 0, 0))
            s = d.cross(up).normalized()
            u = s.cross(d).normalized()
            rings.append([bm.verts.new(p + radius * (math.cos(a) * s + math.sin(a) * u))
                          for a in (2 * math.pi * k / verts for k in range(verts))])
        for ra, rb in zip(rings, rings[1:]):
            for k in range(verts):
                bm.faces.new((ra[k], ra[(k + 1) % verts], rb[(k + 1) % verts], rb[k]))
        bm.faces.new(list(reversed(rings[0])))
        bm.faces.new(rings[-1])
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        return self._obj(name, bm, mat, 0.0)

    def text(self, name, body, loc, size, mat, side="-X", depth=0.00012, align="CENTER", rot=0.0):
        """Raised lettering on a flat side (`-X`, `+X` or `+Z`), its baseline centred at `loc`."""
        curve = bpy.data.curves.new(name, "FONT")
        curve.body = body
        curve.size = size
        curve.align_x = align
        curve.align_y = "CENTER"
        curve.extrude = depth / 2
        tmp = bpy.data.objects.new(name + "_tmp", curve)
        self.coll.objects.link(tmp)
        deps = bpy.context.evaluated_depsgraph_get()
        mesh = bpy.data.meshes.new_from_object(tmp.evaluated_get(deps))
        bpy.data.objects.remove(tmp)
        bpy.data.curves.remove(curve)
        bm = bmesh.new()
        bm.from_mesh(mesh)
        bpy.data.meshes.remove(mesh)
        # Text lies in XY facing +Z; turn it onto the requested side.
        if side == "-X":
            m = Matrix(((0, 0, -1), (-1, 0, 0), (0, 1, 0)))
        elif side == "+X":
            m = Matrix(((0, 0, 1), (1, 0, 0), (0, 1, 0)))
        else:
            m = Matrix(((0, -1, 0), (1, 0, 0), (0, 0, 1)))
        if rot:
            bmesh.ops.rotate(bm, verts=bm.verts, cent=(0, 0, 0), matrix=Matrix.Rotation(rot, 3, "Z"))
        bmesh.ops.rotate(bm, verts=bm.verts, cent=(0, 0, 0), matrix=m)
        bmesh.ops.translate(bm, vec=Vector(loc), verts=bm.verts)
        return self._obj(name, bm, mat, 0.0, smooth=False)

    def rail(self, name, y0, y1, z, mat, x=0.0, width=0.021, slots=True):
        """A Picatinny rail along Y with its base at height `z`."""
        w, n = width / 2, width / 2 - 0.0028
        section = [(-n, 0), (n, 0), (n, 0.0025), (w, 0.0052), (w, 0.0078), (w - 0.0012, 0.0093),
                   (-w + 0.0012, 0.0093), (-w, 0.0078), (-w, 0.0052), (-n, 0.0025)]
        objs = [self.sweep(name, [(px + x, pz + z) for px, pz in section], y0, y1, mat, bevel=0.0004, segments=1)]
        if slots:
            cuts = []
            pitch = 0.01
            count = int((y1 - y0 - 0.004) / pitch)
            start = (y0 + y1) / 2 - (count - 1) * pitch / 2
            for i in range(count):
                cuts.append(self.box(f"{name}_slot{i}", (width + 0.004, 0.0053, 0.008), (x, start + i * pitch, z + 0.0085), mat, 0.0))
            self.cut(objs[0], cuts)
        return objs[0]

    # -- operations ---------------------------------------------------------

    def cut(self, target, cutters, keep=False):
        """Boolean-subtracts `cutters` from `target`, before its bevel."""
        if not isinstance(cutters, (list, tuple)):
            cutters = [cutters]
        tmp = bpy.data.collections.new(f"{target.name}_cutters")
        bpy.context.scene.collection.children.link(tmp)
        for c in cutters:
            for col in list(c.users_collection):
                col.objects.unlink(c)
            tmp.objects.link(c)
            c.modifiers.clear()
        m = target.modifiers.new("cut", "BOOLEAN")
        m.operation = "DIFFERENCE"
        m.operand_type = "COLLECTION"
        m.collection = tmp
        m.solver = "EXACT"
        # The cut runs before the bevel so its edges are chamfered too.
        target.modifiers.move(len(target.modifiers) - 1, 0)
        _apply_modifier(target, "cut")
        for c in cutters:
            bpy.data.objects.remove(c)
        bpy.data.collections.remove(tmp)
        return target

    def union(self, name, objs):
        """Joins pieces of the same finish into one object (modifiers applied)."""
        return _join(name, objs)

    def mirror_x(self, obj):
        """A copy of `obj` mirrored across the gun's centre plane."""
        dup = obj.copy()
        dup.data = obj.data.copy()
        dup.name = obj.name + "_l"
        self.coll.objects.link(dup)
        bm = bmesh.new()
        bm.from_mesh(dup.data)
        bmesh.ops.scale(bm, vec=(-1, 1, 1), verts=bm.verts)
        bmesh.ops.reverse_faces(bm, faces=bm.faces)
        bm.to_mesh(dup.data)
        bm.free()
        return dup

    def part(self, name, objs, pivot):
        """Makes `objs` one moving part called `name` whose origin is `pivot`."""
        obj = _join(name, objs)
        _set_origin(obj, Vector(pivot))
        self.parts[name] = obj
        return obj

    # -- output -------------------------------------------------------------

    def finish(self, texture=2048, draft=False):
        """Joins the static pieces into `body`, bakes the surfaces, exports and previews.

        A draft skips the bake and export and renders flat colours, for quick shape checks.
        """
        if not draft:
            # The editable source: every piece with its modifiers, before the bake.
            bpy.ops.wm.save_as_mainfile(filepath=os.path.join(HERE, f"{self.name}.blend"), compress=True)
        statics = [o for o in self.coll.objects if o.type == "MESH" and o.name not in self.parts]
        body = _join("body", statics)
        objs = [body] + list(self.parts.values())
        for o in objs:
            o.data.name = o.name
        for o in objs:
            _triangulate(o)
        stats = _stats(objs)
        if draft:
            return {"tris": stats["tris"], "size_m": stats["size_m"], "preview": render_preview(self.name, objs, draft=True)}
        _unwrap(objs)
        images = _bake(self.name, objs, texture)
        _export_materials(objs, images)
        out = {"tris": stats["tris"], "size_m": stats["size_m"], "objects": [o.name for o in objs]}
        out["glb_bytes"] = _export(os.path.join(ASSETS, f"{self.name}.glb"), objs)
        out["preview"] = render_preview(self.name, objs)
        return out


# ---------------------------------------------------------------------------
# Internals: geometry
# ---------------------------------------------------------------------------

def _reset_scene():
    """Empties the file in place (a factory reset would also unload the session's add-ons)."""
    if bpy.context.object and bpy.context.object.mode != "OBJECT":
        bpy.ops.object.mode_set(mode="OBJECT")
    for kind in ("objects", "collections", "meshes", "curves", "materials", "images", "cameras", "lights", "worlds", "node_groups"):
        coll = getattr(bpy.data, kind)
        for block in list(coll):
            coll.remove(block)
    scene = bpy.context.scene
    scene.unit_settings.system = "METRIC"
    scene.unit_settings.scale_length = 1.0


def _place(bm, loc, rot):
    if any(rot):
        m = (Matrix.Rotation(rot[2], 3, "Z") @ Matrix.Rotation(rot[1], 3, "Y") @ Matrix.Rotation(rot[0], 3, "X"))
        bmesh.ops.rotate(bm, verts=bm.verts, cent=(0, 0, 0), matrix=m)
    bmesh.ops.translate(bm, vec=Vector(loc), verts=bm.verts)


def _smooth_by_angle(obj, degrees):
    """Marks edges sharper than `degrees` as sharp, so smooth shading keeps hard corners."""
    mesh = obj.data
    bm = bmesh.new()
    bm.from_mesh(mesh)
    limit = math.radians(degrees)
    for e in bm.edges:
        if len(e.link_faces) == 2 and e.calc_face_angle(0) > limit:
            e.smooth = False
    bm.to_mesh(mesh)
    bm.free()


def _apply_modifier(obj, name):
    with bpy.context.temp_override(object=obj, active_object=obj, selected_objects=[obj]):
        bpy.ops.object.modifier_apply(modifier=name)


def _join(name, objs):
    for o in objs:
        for m in list(o.modifiers):
            _apply_modifier(o, m.name)
    bpy.ops.object.select_all(action="DESELECT")
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    if len(objs) > 1:
        bpy.ops.object.join()
    out = bpy.context.view_layer.objects.active
    out.name = name
    out.data.name = name
    return out


def _triangulate(obj):
    """Triangulates up front so the bake and the exported tangents share one triangulation."""
    m = obj.modifiers.new("tri", "TRIANGULATE")
    m.quad_method = "BEAUTY"
    m.ngon_method = "BEAUTY"
    m.keep_custom_normals = True
    _apply_modifier(obj, "tri")


def _set_origin(obj, pivot):
    """Moves `obj`'s origin to world `pivot` without moving its geometry."""
    world = obj.matrix_world.copy()
    offset = world.inverted() @ pivot
    obj.data.transform(Matrix.Translation(-offset))
    obj.matrix_world = world @ Matrix.Translation(offset)


def _stats(objs):
    deps = bpy.context.evaluated_depsgraph_get()
    tris = 0
    lo = Vector((1e9, 1e9, 1e9))
    hi = -lo
    for o in objs:
        mesh = o.evaluated_get(deps).to_mesh()
        tris += sum(len(p.vertices) - 2 for p in mesh.polygons)
        for v in mesh.vertices:
            w = o.matrix_world @ v.co
            lo = Vector(map(min, lo, w))
            hi = Vector(map(max, hi, w))
        o.evaluated_get(deps).to_mesh_clear()
    return {"tris": tris, "size_m": [round(v, 3) for v in hi - lo]}


def _unwrap(objs):
    """One shared UV atlas for every object, islands scaled by their size in the world."""
    bpy.ops.object.select_all(action="DESELECT")
    for o in objs:
        o.select_set(True)
        if not o.data.uv_layers:
            o.data.uv_layers.new(name="UVMap")
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.uv.smart_project(angle_limit=math.radians(55), island_margin=0.0, area_weight=0.0,
                             correct_aspect=True, scale_to_bounds=False)
    bpy.ops.uv.select_all(action="SELECT")
    bpy.ops.uv.average_islands_scale()
    bpy.ops.uv.pack_islands(rotate=True, margin=0.003, shape_method="CONCAVE")
    bpy.ops.object.mode_set(mode="OBJECT")


# ---------------------------------------------------------------------------
# Internals: surfaces and baking
# ---------------------------------------------------------------------------

def _surface(mat):
    """Builds `mat`'s procedural surface; returns sockets for colour, roughness, metalness and normal."""
    spec = FINISHES[mat["finish"]]
    mat.use_nodes = True
    nt = mat.node_tree
    nt.nodes.clear()
    N = nt.nodes.new
    L = nt.links.new

    def value(v):
        n = N("ShaderNodeValue")
        n.outputs[0].default_value = v
        return n.outputs[0]

    def rgb(c):
        n = N("ShaderNodeRGB")
        n.outputs[0].default_value = (*c, 1)
        return n.outputs[0]

    def math_node(op, a, b=None, clamp=False):
        n = N("ShaderNodeMath")
        n.operation = op
        n.use_clamp = clamp
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
        n.inputs["From Min"].default_value = a
        n.inputs["From Max"].default_value = b
        n.inputs["To Min"].default_value = lo
        n.inputs["To Max"].default_value = hi
        return n.outputs[0]

    def mix(fac, a, b):
        n = N("ShaderNodeMix")
        n.data_type = "RGBA"
        L(fac, n.inputs["Factor"]) if not isinstance(fac, float) else None
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

    def noise(scale, detail=6, rough=0.6, stretch=None, coord=None):
        n = N("ShaderNodeTexNoise")
        n.noise_dimensions = "3D"
        n.inputs["Scale"].default_value = scale
        n.inputs["Detail"].default_value = detail
        n.inputs["Roughness"].default_value = rough
        tc = N("ShaderNodeTexCoord")
        src = tc.outputs["Object"]
        if stretch:
            mp = N("ShaderNodeMapping")
            mp.inputs["Scale"].default_value = stretch
            L(src, mp.inputs["Vector"])
            src = mp.outputs[0]
        L(src, n.inputs["Vector"])
        return n.outputs["Fac"]

    flat = spec.get("flat", False)
    # Masks: convex edges from inside-AO, cavities from AO, both broken up by noise.
    if flat:
        edge = value(0.0)
        cavity = value(1.0)
    else:
        # Edges: where a wide bevel sample bends away from the true face normal...
        bev_e = N("ShaderNodeBevel")
        bev_e.samples = 16
        bev_e.inputs["Radius"].default_value = 0.0012
        geo = N("ShaderNodeNewGeometry")
        dot = N("ShaderNodeVectorMath")
        dot.operation = "DOT_PRODUCT"
        L(bev_e.outputs["Normal"], dot.inputs[0])
        L(geo.outputs["True Normal"], dot.inputs[1])
        edge_raw = remap(dot.outputs["Value"], 0.985, 0.8)
        # ...and open to the sky, so only convex edges wear; concave ones collect grime.
        ao = N("ShaderNodeAmbientOcclusion")
        ao.only_local = True
        ao.samples = 16
        ao.inputs["Distance"].default_value = 0.01
        convex = remap(ao.outputs["AO"], 0.55, 0.85)
        edge_raw = math_node("MULTIPLY", edge_raw, convex)
        cavity = remap(ao.outputs["AO"], 0.1, 0.9, 0.3, 1.0)
        chip = noise(160, 8, 0.7)
        breakup = noise(22, 4, 0.5)
        # Wear is strongest on the edges and frays into chips around them.
        wear_in = math_node("MULTIPLY", edge_raw, math_node("ADD", remap(chip, 0.35, 0.65, 0.3, 1.5), remap(breakup, 0.3, 0.7, -0.25, 0.25)))
        edge = remap(wear_in, 0.4, 0.8, 0.0, spec["wear_amount"])

    # Grain: large soft variation plus fine speckle.
    big = noise(9, 3, 0.5)
    fine = noise(700, 4, 0.6)
    if spec.get("brushed"):
        fine = noise(500, 6, 0.6, stretch=(1, 40, 1))
    vary = math_node("ADD", math_node("MULTIPLY", math_node("SUBTRACT", big, 0.5), spec["grain"]),
                     math_node("MULTIPLY", math_node("SUBTRACT", fine, 0.5), spec["grain"] * 0.6))
    base = rgb(spec["base"])
    if spec.get("wood"):
        # Walnut: stretched bands along the length with dark pores and figure.
        wave = N("ShaderNodeTexWave")
        wave.wave_type = "BANDS"
        wave.bands_direction = "Z"
        wave.inputs["Scale"].default_value = 30
        wave.inputs["Distortion"].default_value = 9
        wave.inputs["Detail"].default_value = 4
        wave.inputs["Detail Scale"].default_value = 1.6
        tc = N("ShaderNodeTexCoord")
        mp = N("ShaderNodeMapping")
        mp.inputs["Scale"].default_value = (1, 0.12, 1)
        L(tc.outputs["Object"], mp.inputs["Vector"])
        L(mp.outputs[0], wave.inputs["Vector"])
        grain = remap(wave.outputs["Fac"], 0.1, 0.9)
        pores = remap(noise(900, 2, 0.5, stretch=(1, 0.08, 1)), 0.55, 0.75)
        dark = tuple(c * 0.45 for c in spec["base"])
        light = tuple(min(1, c * 1.7) for c in spec["base"])
        base = mix(grain, dark, light)
        base = mix(math_node("MULTIPLY", pores, 0.6), base, tuple(c * 0.3 for c in spec["base"]))
    if spec.get("web"):
        web = remap(noise(55, 10, 0.75), 0.6, 0.66)
        base = mix(web, base, spec["web"])
    if spec.get("speckle"):
        sp = remap(noise(1500, 1, 0.5), 0.7, 0.8, 0.0, spec["speckle"])
        base = mix(sp, base, tuple(c * 2.2 for c in spec["base"]))
    hsv = N("ShaderNodeHueSaturation")
    L(base, hsv.inputs["Color"])
    L(math_node("ADD", 1.0, vary), hsv.inputs["Value"])
    base = hsv.outputs[0]
    wear_color = rgb(spec["wear"])
    color = mix(edge, base, wear_color)
    if spec.get("chip_metal"):
        color = mix(edge, base, (0.25, 0.24, 0.23))
    # Grime in cavities.
    grime = mix(math_node("SUBTRACT", 1.0, cavity), color, tuple(c * 0.25 for c in spec["base"]))
    color_out = mix(math_node("MULTIPLY", math_node("SUBTRACT", 1.0, cavity), 0.7), grime, (0, 0, 0)) if not flat else color

    rough = mixf(edge, math_node("ADD", spec["rough"], math_node("MULTIPLY", vary, 0.6)), spec["wear_rough"])
    if not flat:
        rough = mixf(math_node("SUBTRACT", 1.0, cavity), rough, min(1.0, spec["rough"] + 0.2))
    metal = mixf(edge, spec["metal"], 1.0 if spec.get("chip_metal") or spec["metal"] > 0.3 else spec["metal"])

    # Normal: micro rounding of hard edges, plus surface texture.
    height = math_node("MULTIPLY", fine, spec["bump"])
    if spec.get("stipple"):
        vor = N("ShaderNodeTexVoronoi")
        vor.feature = "F1"
        vor.inputs["Scale"].default_value = 900
        tc = N("ShaderNodeTexCoord")
        L(tc.outputs["Object"], vor.inputs["Vector"])
        height = math_node("ADD", height, remap(vor.outputs["Distance"], 0.0, 0.6, 1.0, 0.0))
    if spec.get("checker"):
        tc = N("ShaderNodeTexCoord")
        sep = N("ShaderNodeSeparateXYZ")
        L(tc.outputs["Object"], sep.inputs[0])
        f = 2 * math.pi / 0.0022
        a = math_node("SINE", math_node("MULTIPLY", math_node("ADD", sep.outputs["Y"], sep.outputs["Z"]), f))
        b = math_node("SINE", math_node("MULTIPLY", math_node("SUBTRACT", sep.outputs["Y"], sep.outputs["Z"]), f))
        diamonds = math_node("MINIMUM", math_node("ABSOLUTE", a), math_node("ABSOLUTE", b))
        height = math_node("ADD", height, remap(diamonds, 0.0, 0.5))
    if spec.get("wood"):
        height = math_node("ADD", height, math_node("MULTIPLY", pores, -0.4))
    bump = N("ShaderNodeBump")
    bump.inputs["Strength"].default_value = 0.25 if spec.get("stipple") or spec.get("checker") else 0.12
    bump.inputs["Distance"].default_value = 0.0003
    L(height, bump.inputs["Height"])
    if not flat:
        bev = N("ShaderNodeBevel")
        bev.samples = 8
        bev.inputs["Radius"].default_value = 0.00035
        L(bev.outputs["Normal"], bump.inputs["Normal"])
    normal = bump.outputs["Normal"]

    out = N("ShaderNodeOutputMaterial")
    emit = N("ShaderNodeEmission")
    L(emit.outputs[0], out.inputs["Surface"])
    bsdf = N("ShaderNodeBsdfDiffuse")
    L(normal, bsdf.inputs["Normal"])
    img = N("ShaderNodeTexImage")
    nt.nodes.active = img
    return {"color": color_out, "rough": rough, "metal": metal, "normal": normal, "emit": emit, "out": out,
            "bsdf": bsdf, "image": img, "links": nt.links, "N": N, "math": math_node}


def _bake(name, objs, size, surface=None):
    """Bakes colour, roughness/metalness and normals of `objs` into one texture set.

    `surface(mat)` builds a material's bake nodes (default: its finish, see _surface).
    """
    scene = bpy.context.scene
    scene.render.engine = "CYCLES"
    try:
        prefs = bpy.context.preferences.addons["cycles"].preferences
        prefs.compute_device_type = "OPTIX"
        prefs.get_devices()
        for d in prefs.devices:
            d.use = d.type == "OPTIX"
        scene.cycles.device = "GPU" if any(d.use for d in prefs.devices) else "CPU"
    except Exception:
        scene.cycles.device = "CPU"
    scene.cycles.samples = 32
    scene.cycles.use_denoising = False
    scene.render.bake.margin = 12
    scene.render.bake.margin_type = "EXTEND"
    scene.render.bake.use_clear = True
    scene.render.bake.target = "IMAGE_TEXTURES"

    def image(suffix, non_color):
        img = bpy.data.images.new(f"{name}_{suffix}", size, size, alpha=False)
        img.colorspace_settings.name = "Non-Color" if non_color else "sRGB"
        return img

    images = {"color": image("color", False), "rm": image("rm", True), "normal": image("normal", True)}
    mats = {m for o in objs for m in o.data.materials if m}
    sockets = {m.name: (surface or _surface)(m) for m in mats}

    bpy.ops.object.select_all(action="DESELECT")
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]

    def run(key, bake_type):
        for m in mats:
            s = sockets[m.name]
            s["image"].image = images[key]
            m.node_tree.nodes.active = s["image"]
            links = s["links"]
            if key == "color":
                links.new(s["color"], s["emit"].inputs["Color"])
                links.new(s["emit"].outputs[0], s["out"].inputs["Surface"])
            elif key == "rm":
                comb = s["N"]("ShaderNodeCombineColor")
                links.new(s["rough"], comb.inputs[1])
                links.new(s["metal"], comb.inputs[2])
                comb.inputs[0].default_value = 1.0
                links.new(comb.outputs[0], s["emit"].inputs["Color"])
                links.new(s["emit"].outputs[0], s["out"].inputs["Surface"])
            else:
                links.new(s["bsdf"].outputs[0], s["out"].inputs["Surface"])
        if bake_type == "NORMAL":
            bpy.ops.object.bake(type="NORMAL", normal_space="TANGENT", margin=12)
        else:
            bpy.ops.object.bake(type="EMIT", margin=12)

    run("color", "EMIT")
    run("rm", "EMIT")
    run("normal", "NORMAL")
    for img in images.values():
        img.pack()
    return images


def _export_materials(objs, images):
    """Swaps each finish's bake material for a glTF material reading the baked textures."""
    swaps = {}
    for o in objs:
        for slot in o.material_slots:
            src = slot.material
            if src is None:
                continue
            if src.name not in swaps:
                swaps[src.name] = _gltf_material(src["finish"], images)
            slot.material = swaps[src.name]
    for name in list(swaps):
        old = bpy.data.materials.get(name)
        if old and old.users == 0:
            bpy.data.materials.remove(old)
    for new in swaps.values():
        new.name = new["finish"]


def _gltf_material(key, images):
    mat = bpy.data.materials.new(f"{key}.export")
    mat["finish"] = key
    spec = FINISHES.get(key)
    if spec:
        mat["tint"] = [round(c, 4) for c in spec["base"]]
        mat.diffuse_color = (*spec["base"], 1)
    mat.use_nodes = True
    nt = mat.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    bsdf = nt.nodes.new("ShaderNodeBsdfPrincipled")
    nt.links.new(bsdf.outputs[0], out.inputs["Surface"])
    col = nt.nodes.new("ShaderNodeTexImage")
    col.image = images["color"]
    nt.links.new(col.outputs["Color"], bsdf.inputs["Base Color"])
    rm = nt.nodes.new("ShaderNodeTexImage")
    rm.image = images["rm"]
    sep = nt.nodes.new("ShaderNodeSeparateColor")
    nt.links.new(rm.outputs["Color"], sep.inputs[0])
    nt.links.new(sep.outputs[1], bsdf.inputs["Roughness"])
    nt.links.new(sep.outputs[2], bsdf.inputs["Metallic"])
    nm = nt.nodes.new("ShaderNodeTexImage")
    nm.image = images["normal"]
    nmap = nt.nodes.new("ShaderNodeNormalMap")
    nt.links.new(nm.outputs["Color"], nmap.inputs["Color"])
    nt.links.new(nmap.outputs[0], bsdf.inputs["Normal"])
    return mat


def _export(path, objs):
    bpy.ops.object.select_all(action="DESELECT")
    for o in objs:
        o.select_set(True)
    bpy.ops.export_scene.gltf(filepath=path, export_format="GLB", use_selection=True, export_apply=True,
                              export_yup=True, export_tangents=True, export_extras=True,
                              export_image_format="JPEG", export_jpeg_quality=90,
                              export_materials="EXPORT", export_cameras=False, export_lights=False)
    return os.path.getsize(path)


# Shared with the other generators (arms.py).
bake = _bake
export_materials = _export_materials
export_glb = _export
unwrap = _unwrap
triangulate = _triangulate
reset_scene = _reset_scene


# ---------------------------------------------------------------------------
# Preview: an EEVEE sheet lit by one of Blender's studio HDRIs
# ---------------------------------------------------------------------------

def render_preview(name, objs, size=900, draft=False):
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_WORKBENCH" if draft else "BLENDER_EEVEE"
    if draft:
        scene.display.shading.light = "STUDIO"
        scene.display.shading.color_type = "MATERIAL"
        scene.display.shading.show_cavity = True
        scene.display.shading.cavity_type = "BOTH"
    scene.render.resolution_x = size
    scene.render.resolution_y = int(size * 0.62)
    scene.render.film_transparent = False
    scene.view_settings.view_transform = "AgX"
    world = bpy.data.worlds.get("preview") or bpy.data.worlds.new("preview")
    world.use_nodes = True
    nt = world.node_tree
    nt.nodes.clear()
    env = nt.nodes.new("ShaderNodeTexEnvironment")
    hdri = os.path.join(os.path.dirname(bpy.app.binary_path), f"{bpy.app.version[0]}.{bpy.app.version[1]}",
                        "datafiles", "studiolights", "world", "forest.exr")
    if os.path.exists(hdri):
        env.image = bpy.data.images.load(hdri, check_existing=True)
    bg = nt.nodes.new("ShaderNodeBackground")
    bg.inputs["Strength"].default_value = 1.0
    out = nt.nodes.new("ShaderNodeOutputWorld")
    nt.links.new(env.outputs[0], bg.inputs[0])
    # The background itself is a flat grey so the gun reads clearly.
    lp = nt.nodes.new("ShaderNodeLightPath")
    flat = nt.nodes.new("ShaderNodeBackground")
    flat.inputs[0].default_value = (0.05, 0.055, 0.06, 1)
    mixs = nt.nodes.new("ShaderNodeMixShader")
    nt.links.new(lp.outputs["Is Camera Ray"], mixs.inputs[0])
    nt.links.new(bg.outputs[0], mixs.inputs[1])
    nt.links.new(flat.outputs[0], mixs.inputs[2])
    nt.links.new(mixs.outputs[0], out.inputs["Surface"])
    scene.world = world
    sun = bpy.data.objects.get("preview_key")
    if sun is None:
        light = bpy.data.lights.new("preview_key", "SUN")
        light.energy = 3.0
        light.angle = math.radians(8)
        sun = bpy.data.objects.new("preview_key", light)
        scene.collection.objects.link(sun)
    sun.rotation_euler = (math.radians(50), math.radians(10), math.radians(-40))

    lo = Vector((1e9, 1e9, 1e9))
    hi = -lo
    for o in objs:
        for c in o.bound_box:
            w = o.matrix_world @ Vector(c)
            lo = Vector(map(min, lo, w))
            hi = Vector(map(max, hi, w))
    centre = (lo + hi) / 2
    extent = max(hi - lo)
    cam_data = bpy.data.cameras.get("preview") or bpy.data.cameras.new("preview")
    cam_data.type = "ORTHO"
    cam = bpy.data.objects.get("preview") or bpy.data.objects.new("preview", cam_data)
    if cam.name not in scene.collection.objects:
        scene.collection.objects.link(cam)
    scene.camera = cam
    views = {
        "left": (Vector((-1, 0, 0)), 1),
        "right": (Vector((1, 0, 0)), 1),
        "three_quarter": (Vector((-0.7, -0.75, 0.45)), 1),
        "shooter": (Vector((-0.35, -1, 0.3)), 1),
    }
    os.makedirs(PREVIEWS, exist_ok=True)
    files = []
    for key, (direction, zoom) in views.items():
        d = direction.normalized()
        cam.location = centre + d * extent * 2
        cam.rotation_euler = (-d).to_track_quat("-Z", "Y").to_euler()
        rot = cam.rotation_euler.to_matrix()
        right, up = rot.col[0], rot.col[1]
        corners = [Vector((x, y, z)) for x in (lo.x, hi.x) for y in (lo.y, hi.y) for z in (lo.z, hi.z)]
        span_x = max((c - centre).dot(right) for c in corners) * 2
        span_y = max((c - centre).dot(up) for c in corners) * 2
        aspect = scene.render.resolution_y / scene.render.resolution_x
        cam_data.ortho_scale = max(span_x, span_y / aspect) * 1.08
        path = os.path.join(PREVIEWS, f"{name}-{key}{'-draft' if draft else ''}.png")
        scene.render.filepath = path
        bpy.ops.render.render(write_still=True)
        files.append(path)
    return _tile(files, os.path.join(PREVIEWS, f"{name}{'-draft' if draft else ''}.png"))


def _tile(files, out):
    """Tiles the views two by two into one sheet."""
    imgs = [bpy.data.images.load(f) for f in files]
    w, h = imgs[0].size
    sheet = bpy.data.images.new("sheet", w * 2, h * 2, alpha=False)
    import array
    px = array.array("f", [0.0]) * (w * 2 * h * 2 * 4)
    for i, img in enumerate(imgs):
        src = array.array("f", [0.0]) * (w * h * 4)
        img.pixels.foreach_get(src)
        ox, oy = (i % 2) * w, (1 - i // 2) * h
        for row in range(h):
            start = ((oy + row) * w * 2 + ox) * 4
            px[start:start + w * 4] = src[row * w * 4:(row + 1) * w * 4]
    sheet.pixels.foreach_set(px)
    sheet.filepath_raw = out
    sheet.file_format = "PNG"
    sheet.save()
    for img in imgs:
        bpy.data.images.remove(img)
    bpy.data.images.remove(sheet)
    for f in files:
        os.remove(f)
    return out
