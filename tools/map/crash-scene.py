"""Rebuild the complete Crash Blender scene from the game's layout.

Run crash-layout.mjs first, then Blender background with this script:
blender -b tools/map/crash.blend --python tools/map/crash-scene.py -- layout.json output.blend
The collision-authored boxes remain the game source of truth; the wreck is
reused from crash.blend. The generated scene is an editable layout reference.
"""
import json
import sys
import bpy

args = sys.argv[sys.argv.index('--') + 1:]
with open(args[0], encoding='utf-8') as f:
    layout = json.load(f)
scene = bpy.context.scene
coll = bpy.data.collections.new('Crash level')
scene.collection.children.link(coll)
materials = {}
for name, finish in layout['finishes'].items():
    color = finish.get('color', 0xaaaaaa)
    rgb = tuple(((color >> shift) & 255) / 255 for shift in (16, 8, 0))
    mat = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    mat.diffuse_color = (*rgb, 1)
    materials[name] = mat
for placement in layout['models']['placements']:
    obj = bpy.data.objects.get(placement['asset'])
    if obj is None:
        raise ValueError('Missing Blender asset: ' + placement['asset'])
    x, y, z = placement['position']
    obj.location = (x, -z, y)
    obj.rotation_euler[2] = placement['yaw']
model_solids = {i for p in layout['models']['placements'] for i in p['solids']}
for i, solid in enumerate(layout['solids']):
    if i in model_solids:
        continue
    lo, hi = solid['min'], solid['max']
    bpy.ops.mesh.primitive_cube_add(size=1, location=((lo[0]+hi[0])/2, -(lo[2]+hi[2])/2, (lo[1]+hi[1])/2))
    obj = bpy.context.object
    obj.name = 'solid_%04d' % i
    obj.dimensions = (hi[0]-lo[0], hi[2]-lo[2], hi[1]-lo[1])
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    for c in list(obj.users_collection): c.objects.unlink(obj)
    coll.objects.link(obj)
    look = layout['looks'][i] or {}
    mat = materials.get(look.get('side'))
    if mat: obj.data.materials.append(mat)
bpy.ops.wm.save_as_mainfile(filepath=args[1])
