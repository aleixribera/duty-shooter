"""Check evaluated Blender solids and moving-part pivots without modifying the file.

Run: blender --background m4a1-model.blend --python tools/weapon/check_model.py
"""
import re
import sys
import bpy
import bmesh

depsgraph = bpy.context.evaluated_depsgraph_get()
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

if problems:
    for problem in problems:
        print('ERROR:', problem)
    sys.exit(1)
print(f'Checked {checked} authored solids and the moving-part pivots.')
