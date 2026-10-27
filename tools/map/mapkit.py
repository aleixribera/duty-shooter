"""Shared building blocks for the maps' Blender generators (survival_town.py, ...).

Positions and sizes are game-style (x along, y up, z across) and turned into
Blender's (x, -z, y) as each part is made, so a generator can use the map's
own numbers. Materials are named after the map's finishes, which the client
looks up to colour them.

Every asset gets ambient occlusion baked into its vertex colours (Cycles, on
a ground plane), which the client multiplies into its finish: the contact
shading of a real model at no cost per frame.
"""
import math

import bmesh
import bpy
from mathutils import Matrix, Vector

TOLERANCE = 0.05


def srgb_to_linear(srgb):
    return tuple(((c / 255) / 12.92) if c / 255 <= 0.04045 else (((c / 255) + 0.055) / 1.055) ** 2.4 for c in srgb)


def material(bkit, name, srgb, roughness=0.6, metallic=0.0, emission=None):
    return bkit.material(name, srgb_to_linear(srgb), roughness, metallic, emission)


class Kit:
    """Makes parts into one collection, and joins them into assets."""

    def __init__(self, bkit, collection):
        self.bkit = bkit
        self.coll = bpy.data.collections.new(collection)
        bpy.context.scene.collection.children.link(self.coll)

    # ------------------------------------------------------------ primitives

    @staticmethod
    def b(v):
        return Vector((v[0], -v[2], v[1]))

    def obj(self, name, bm, mat, bevel=0.0, segments=2, smooth=False):
        mesh = bpy.data.meshes.new(name)
        bm.to_mesh(mesh)
        bm.free()
        o = bpy.data.objects.new(name, mesh)
        self.coll.objects.link(o)
        self.bkit.assign(o, mat)
        if bevel > 0:
            m = o.modifiers.new("bevel", "BEVEL")
            m.width = bevel
            m.segments = segments
            m.limit_method = "ANGLE"
            m.angle_limit = math.radians(40)
        o["smooth"] = smooth
        return o

    def box(self, lo, hi, mat, bevel=0.0, segments=2):
        """A box from game-space corner `lo` to `hi`."""
        bm = bmesh.new()
        bmesh.ops.create_cube(bm, size=1.0)
        a, c = self.b(lo), self.b(hi)
        size = Vector((abs(c.x - a.x), abs(c.y - a.y), abs(c.z - a.z)))
        bmesh.ops.scale(bm, vec=size, verts=bm.verts)
        bmesh.ops.translate(bm, vec=(a + c) / 2, verts=bm.verts)
        return self.obj("box", bm, mat, bevel, segments)

    def cylinder(self, r, x0, x1, centre, axis, mat, segments=20, bevel=0.0, r2=None, smooth=True):
        """A cylinder (or a cone, to radius `r2`) along game axis `axis`, from x0 to x1 on it, through game point `centre`."""
        bm = bmesh.new()
        bmesh.ops.create_cone(bm, cap_ends=True, segments=segments, radius1=r, radius2=r if r2 is None else r2, depth=abs(x1 - x0))
        if x1 < x0:
            bmesh.ops.transform(bm, matrix=Matrix.Rotation(math.pi, 4, "X"), verts=bm.verts)
        rot = {"x": Matrix.Rotation(math.pi / 2, 4, "Y"), "z": Matrix.Rotation(math.pi / 2, 4, "X"), "y": Matrix.Identity(4)}[axis]
        bmesh.ops.transform(bm, matrix=rot, verts=bm.verts)
        c = list(centre)
        c["xyz".index(axis)] = (x0 + x1) / 2
        bmesh.ops.translate(bm, vec=self.b(c), verts=bm.verts)
        return self.obj("cylinder", bm, mat, bevel, smooth=smooth)

    def _slab(self, verts3, offset, mat, bevel, segments, smooth):
        bm = bmesh.new()
        verts = [bm.verts.new(self.b(p)) for p in verts3]
        face = bm.faces.new(verts)
        ext = bmesh.ops.extrude_face_region(bm, geom=[face])
        moved = [v for v in ext["geom"] if isinstance(v, bmesh.types.BMVert)]
        bmesh.ops.translate(bm, vec=self.b(offset), verts=moved)
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        return self.obj("slab", bm, mat, bevel, segments, smooth)

    def prism(self, profile, z0, z1, mat, bevel=0.0, segments=2, smooth=False):
        """A slab from a game-space (x, y) outline, from z0 to z1 across."""
        return self._slab([(x, y, z0) for x, y in profile], (0, 0, z1 - z0), mat, bevel, segments, smooth)

    def section(self, profile, x0, x1, mat, bevel=0.0, segments=2, smooth=False):
        """A slab from a game-space (y, z) cross-section, from x0 to x1 along."""
        return self._slab([(x0, y, z) for y, z in profile], (x1 - x0, 0, 0), mat, bevel, segments, smooth)

    def plan(self, profile, y0, y1, mat, bevel=0.0, segments=2, smooth=False):
        """A slab from a game-space (x, z) outline, from y0 up to y1."""
        return self._slab([(x, y0, z) for x, z in profile], (0, y1 - y0, 0), mat, bevel, segments, smooth)

    def lathe(self, profile, centre, mat, segments=16, axis="y", smooth=True, caps=True):
        """A solid of revolution: `profile` is (along, radius) pairs about `axis` through `centre`."""
        bm = bmesh.new()
        rings = []
        for t, rad in profile:
            ring = []
            for k in range(segments):
                ang = 2 * math.pi * k / segments
                u, v = rad * math.cos(ang), rad * math.sin(ang)
                p = {"y": (u, t, v), "x": (t, u, v), "z": (u, v, t)}[axis]
                ring.append(bm.verts.new(self.b((centre[0] + p[0], centre[1] + p[1], centre[2] + p[2]))))
            rings.append(ring)
        for a, c in zip(rings, rings[1:]):
            for k in range(segments):
                bm.faces.new((a[k], a[(k + 1) % segments], c[(k + 1) % segments], c[k]))
        if caps and profile[0][1] > 1e-6:
            bm.faces.new(list(reversed(rings[0])))
        if caps and profile[-1][1] > 1e-6:
            bm.faces.new(rings[-1])
        bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5)
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        return self.obj("lathe", bm, mat, smooth=smooth)

    def wheel(self, x, y, z, r, width, tyre, rim, hub=None, segments=20, rim_r=0.6, outward=1):
        """A wheel on axle (x, y) at z across: a rounded tyre, a dished rim and a hub cap, its face toward `outward` z."""
        t = width / 2
        prof = [(-t, r * 0.62), (-t, r * 0.86), (-t * 0.85, r * 0.97), (-t * 0.45, r), (t * 0.45, r), (t * 0.85, r * 0.97), (t, r * 0.86), (t, r * 0.62)]
        parts = [self.lathe([(z + p * outward, q) for p, q in prof], (x, y, 0), tyre, segments, "z", caps=False)]
        s = outward
        # The rim: its lip just inside the tyre's bead, dished in to the hub, closed at the back.
        rim_prof = [(-t * 0.7, 0.0), (-t * 0.7, r * rim_r * 1.04), (t * 0.9, r * rim_r * 1.04), (t * 0.94, r * rim_r * 0.95), (t * 0.6, r * rim_r * 0.75), (t * 0.55, r * 0.3), (t * 0.75, r * 0.24), (t * 0.8, 0.0)]
        parts.append(self.lathe([(z + p * s, q) for p, q in rim_prof], (x, y, 0), rim, segments, "z"))
        if hub:
            parts.append(self.cylinder(r * 0.16, z + s * t * 0.85, z + s * t * 0.97, (x, y, z), "z", hub, 12))
        return parts

    # ---------------------------------------------------------------- assets

    def asset(self, name, parts, smooth_angle=60.0):
        """Joins `parts` (their modifiers applied) into one object called `name`, origin at the world origin."""
        for o in parts:
            for m in list(o.modifiers):
                with bpy.context.temp_override(object=o, active_object=o, selected_objects=[o]):
                    bpy.ops.object.modifier_apply(modifier=m.name)
        with bpy.context.temp_override(active_object=parts[0], selected_editable_objects=parts, selected_objects=parts):
            bpy.ops.object.join()
        o = parts[0]
        o.name = name
        o.data.name = name
        self.densify(o)
        # Smooth over bevels and round parts, hard at real corners, flat panels kept flat by face-area weighting.
        o.data.shade_smooth()
        o.data.set_sharp_from_angle(angle=math.radians(smooth_angle))
        m = o.modifiers.new("normals", "WEIGHTED_NORMAL")
        m.keep_sharp = True
        m.mode = "FACE_AREA"
        with bpy.context.temp_override(object=o, active_object=o, selected_objects=[o]):
            bpy.ops.object.modifier_apply(modifier=m.name)
        return o

    @staticmethod
    def densify(o, longest=0.8):
        """Splits edges longer than `longest` (m), so baked occlusion, which lives on vertices, can vary across big panels
        rather than being spread from their (often buried) corners."""
        bm = bmesh.new()
        bm.from_mesh(o.data)
        # Halving the long edges a few times over keeps quads as quads (bmesh fills the patterns).
        for _ in range(5):
            # Only where a face is broad across the edge too: thin strips (rails, frames) don't need it.
            edges = [e for e in bm.edges if e.calc_length() > longest and any(f.calc_area() / e.calc_length() > 0.25 for f in e.link_faces)]
            if not edges:
                break
            bmesh.ops.subdivide_edges(bm, edges=edges, cuts=1, use_grid_fill=True)
        bmesh.ops.triangulate(bm, faces=[f for f in bm.faces if len(f.verts) > 4])
        bm.to_mesh(o.data)
        bm.free()

    @staticmethod
    def unbury(mesh, ao, buried=0.06):
        """Vertices that see nothing at all are buried inside another part (a rib's foot, under a roof cap), not in a
        crease: they take the mean of their seeing neighbours, spreading in from the edges of the buried patch."""
        near = [[] for _ in ao]
        for e in mesh.edges:
            a, c = e.vertices
            near[a].append(c)
            near[c].append(a)
        dark = {i for i, v in enumerate(ao) if v < buried}
        for _ in range(12):
            if not dark:
                break
            lit = {}
            for i in dark:
                seen = [ao[j] for j in near[i] if j not in dark]
                if seen:
                    lit[i] = sum(seen) / len(seen)
            if not lit:
                break
            for i, v in lit.items():
                ao[i] = v
            dark -= lit.keys()

    def bake_ao(self, objects, distance=0.6, floor=0.0, samples=48, low=0.22):
        """Bakes ambient occlusion (over a ground plane at `floor`) into each object's vertex colours, one at a time: dark `low` in the deepest creases."""
        scene = bpy.context.scene
        scene.render.engine = "CYCLES"
        scene.cycles.device = "CPU"
        scene.cycles.samples = samples
        if scene.world is None:
            scene.world = bpy.data.worlds.new("World")
        scene.world.light_settings.distance = distance
        scene.render.bake.target = "VERTEX_COLORS"
        bpy.ops.mesh.primitive_plane_add(size=400, location=(0, 0, floor))
        ground = bpy.context.active_object
        everything = [o for o in bpy.data.objects if o.type == "MESH"]
        for target in objects:
            for o in everything:
                o.hide_render = o is not target and o is not ground
            mesh = target.data
            for a in list(mesh.color_attributes):
                mesh.color_attributes.remove(a)
            ca = mesh.color_attributes.new("Color", "BYTE_COLOR", "POINT")
            mesh.color_attributes.active_color = ca
            with bpy.context.temp_override(active_object=target, object=target, selected_objects=[target], selected_editable_objects=[target]):
                bpy.ops.object.bake(type="AO")
            ao = [d.color[0] for d in ca.data]
            self.unbury(mesh, ao)
            for d, a in zip(ca.data, ao):
                v = low + (1 - low) * a
                d.color = (v, v, v, 1.0)
        for o in everything:
            o.hide_render = False
        bpy.data.objects.remove(ground)

    @staticmethod
    def tris(o):
        return sum(len(p.vertices) - 2 for p in o.data.polygons)

    @staticmethod
    def strays(o, solids):
        """How far the worst vertex of `o` lies outside `solids` (game-space boxes), and where (game space)."""
        worst, where = 0.0, None
        for v in o.data.vertices:
            p = o.matrix_world @ v.co
            g = (p.x, p.z, -p.y)
            d = min(math.dist(g, [min(max(g[k], lo[k]), hi[k]) for k in range(3)]) for lo, hi in solids)
            if d > worst:
                worst, where = d, [round(x, 3) for x in g]
        return round(worst, 4), where

    def export(self, objects, path):
        bpy.ops.object.select_all(action="DESELECT")
        for o in objects:
            o.select_set(True)
        bpy.ops.export_scene.gltf(
            filepath=path,
            export_format="GLB",
            use_selection=True,
            export_apply=True,
            export_yup=True,
            export_materials="EXPORT",
            export_texcoords=False,
            export_vertex_color="ACTIVE",
            export_all_vertex_colors=False,
        )
