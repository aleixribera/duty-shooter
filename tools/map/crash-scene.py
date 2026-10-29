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
sources = {}
for placement in layout['models']['placements']:
    name = placement['asset']
    source = sources.get(name) or bpy.data.objects.get(name)
    if source is None:
        raise ValueError('Missing Blender asset: ' + name)
    sources[name] = source
    obj = source.copy()
    obj.data = source.data
    coll.objects.link(obj)
    x, y, z = placement['position']
    obj.location = (x, -z, y)
    obj.rotation_euler[2] = placement['yaw']
for source in sources.values():
    source.hide_render = True
    source.hide_viewport = True
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
for i, deco in enumerate(layout['decorations']):
    x, y, z = deco['center']
    sx, sy, sz = deco['size']
    bpy.ops.mesh.primitive_cube_add(size=1, location=(x, -z, y))
    obj = bpy.context.object
    obj.name = 'trim_%04d' % i
    obj.dimensions = (sx, sz, sy)
    obj.rotation_euler[2] = deco['yaw']
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    for c in list(obj.users_collection): c.objects.unlink(obj)
    coll.objects.link(obj)
    mat = materials.get(deco['finish'])
    if mat: obj.data.materials.append(mat)

# Non-rendering markers make the game-authored starts and objectives visible
# and inspectable in Blender without adding geometry to the playable map.
markers = bpy.data.collections.new('Gameplay markers')
scene.collection.children.link(markers)
def marker(name, position, display, size):
    x, y, z = position
    obj = bpy.data.objects.new(name, None)
    markers.objects.link(obj)
    obj.location = (x, -z, y)
    obj.empty_display_type = display
    obj.empty_display_size = size
    return obj

for team, spawns in enumerate(layout['spawns']['teams'] or [], 1):
    for i, spawn in enumerate(spawns, 1):
        obj = marker('team %d spawn %02d' % (team,i), spawn['position'], 'ARROWS', 0.7)
        obj.rotation_euler[2] = spawn['yaw']
        obj['team'] = team
for i, spawn in enumerate(layout['spawns']['ffa'], 1):
    obj = marker('free-for-all spawn %02d' % i, spawn['position'], 'ARROWS', 0.4)
    obj.rotation_euler[2] = spawn['yaw']
for zone in layout['zones']:
    obj = marker('outpost ' + zone['id'] + ' ' + zone['name'], zone['center'], 'CIRCLE', zone['radius'])
    obj['height'] = zone['height']
for site in layout['sites']:
    lo, hi = site['min'], site['max']
    center = [(a+b)/2 for a,b in zip(lo,hi)]
    obj = marker('charge ' + site['id'] + ' ' + site['name'], center, 'CUBE', 1)
    obj.scale = ((hi[0]-lo[0])/2, (hi[2]-lo[2])/2, (hi[1]-lo[1])/2)
bpy.ops.wm.save_as_mainfile(filepath=args[1])
