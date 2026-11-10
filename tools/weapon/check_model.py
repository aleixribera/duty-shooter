"""Check evaluated Blender solids and moving-part pivots without modifying the file.

Run: blender --background m4a1-model.blend --python tools/weapon/check_model.py
     blender --background tools/weapon/lmg.blend --python tools/weapon/check_model.py

The M4A1's scene is checked by its collections and pivots. Any other scene is taken
for a `gunsmith.py` weapon: every mesh piece must be a closed solid with a material.
"""
import re
import sys
import bpy
import bmesh
import numpy as np

# Lettering lies within this of flat, even wrapped round a barrel.
SHEET = 0.0005
# A slit shorter than this is a bevel that closed on itself, not a hole anyone can see.
SLIVER = 0.001
# Lathes left open on purpose (`closed=False`): the barrel they sit on closes them.
OPEN_RINGS = ('crown', 'muzzle_crown')


def islands(bm):
    """The mesh's connected pieces, as lists of faces."""
    seen = set()
    for start in bm.faces:
        if start.index in seen:
            continue
        seen.add(start.index)
        island, stack = [], [start]
        while stack:
            face = stack.pop()
            island.append(face)
            for edge in face.edges:
                for other in edge.link_faces:
                    if other.index not in seen:
                        seen.add(other.index)
                        stack.append(other)
        yield island


def flat(island):
    """Lettering and paint marks are thin sheets laid on a surface, single-sided by design."""
    points = np.array([vert.co[:] for face in island for vert in face.verts])
    centred = points - points.mean(axis=0)
    # The thinnest way through the island: across the sheet, if it is one.
    thin = centred @ np.linalg.eigh(np.cov(centred.T))[1][:, 0]
    return thin.max() - thin.min() < SHEET


def check_kit_weapon(depsgraph):
    problems, notes = [], []
    checked = tris = 0
    for obj in bpy.data.objects:
        if obj.type != 'MESH':
            continue
        evaluated = obj.evaluated_get(depsgraph)
        mesh = evaluated.to_mesh()
        bm = bmesh.new()
        bm.from_mesh(mesh)
        bm.faces.index_update()
        checked += 1
        tris += sum(len(face.verts) - 2 for face in bm.faces)
        if not bm.faces:
            problems.append(f'{obj.name}: no faces')
        if not any(slot.material for slot in obj.material_slots):
            problems.append(f'{obj.name}: no material')
        holes = slivers = sheets = 0
        for island in islands(bm):
            edges = {edge for face in island for edge in face.edges if not edge.is_manifold}
            if not edges:
                continue
            if flat(island):
                sheets += 1
                continue
            for edge in edges:
                if edge.calc_length() < SLIVER:
                    slivers += 1
                else:
                    holes += 1
        tiny = sum(face.calc_area() < 1e-12 for face in bm.faces)
        if holes and obj.name not in OPEN_RINGS:
            problems.append(f'{obj.name}: {holes} open or non-manifold edges over {SLIVER * 1000:g} mm')
        if slivers or tiny:
            notes.append(f'{obj.name}: {slivers} sliver edges under {SLIVER * 1000:g} mm, {tiny} zero-area faces')
        if sheets and not obj.name.startswith('mark_'):
            notes.append(f'{obj.name}: {sheets} flat sheets of lettering joined in')
        bm.free()
        evaluated.to_mesh_clear()
    for note in notes:
        print('NOTE:', note)
    return problems, f'Checked {checked} pieces, {tris} triangles before the bake.'


def check_m4a1(depsgraph):
    problems = []
    checked = 0
    for collection_name in ('AUTHORED - export', 'AUTHORED - moving magazine'):
        collection = bpy.data.collections.get(collection_name)
        if collection is None:
            problems.append('Missing collection: ' + collection_name)
            continue
        for obj in collection.objects:
            # Flat lettering is an intentional single-sided decal, not a solid.
            if obj.type != 'MESH' or obj.name.startswith('stamp ') or re.fullmatch(r'rail \d+(?:\.\d+)?', obj.name):
                continue
            evaluated = obj.evaluated_get(depsgraph)
            mesh = evaluated.to_mesh()
            bm = bmesh.new()
            bm.from_mesh(mesh)
            bad_edges = sum(not edge.is_manifold for edge in bm.edges)
            zero_faces = sum(face.calc_area() < 1e-12 for face in bm.faces)
            if bad_edges or zero_faces or not bm.faces:
                problems.append(f'{obj.name}: {bad_edges} non-manifold edges, {zero_faces} tiny faces')
            checked += 1
            bm.free()
            evaluated.to_mesh_clear()

    for name in ('curved magazine shell', 'REFERENCE cartridges'):
        obj = bpy.data.objects.get(name)
        if obj is None or obj.parent is None or obj.parent.name != 'Magazine pivot':
            problems.append(f'{name} is not attached to the magazine pivot')
    for name in ('Charging handle pivot', 'Bolt pivot', 'Bolt catch pivot'):
        if bpy.data.objects.get(name) is None:
            problems.append('Missing pivot: ' + name)
    return problems, f'Checked {checked} authored solids and the moving-part pivots.'


depsgraph = bpy.context.evaluated_depsgraph_get()
m4a1 = bpy.data.collections.get('AUTHORED - export') is not None
problems, summary = check_m4a1(depsgraph) if m4a1 else check_kit_weapon(depsgraph)
if problems:
    for problem in problems:
        print('ERROR:', problem)
    sys.exit(1)
print(summary)
