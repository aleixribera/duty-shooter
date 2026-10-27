"""Build the Warden 9 first-person asset in Blender.

Run from the repository root with Blender in background mode. Coordinates and
moving-part origins match kit.ts; the source scene remains editable and the
export contains only the asset collection.
"""
import math
import os
import random
import tempfile
import bpy
from mathutils import Matrix, Vector

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
# The glTF exporter uses a temporary image when packing roughness/metallic
# channels. Keep that scratch work inside the checkout on restricted systems.
tempfile.tempdir = os.path.join(ROOT, 'node_modules', 'weapon-work', 'tmp')
os.makedirs(tempfile.tempdir, exist_ok=True)
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
scene = bpy.context.scene
scene.unit_settings.system = 'METRIC'
collection = bpy.data.collections.new('Warden 9')
scene.collection.children.link(collection)

def material(name, color, metal, rough):
    mat = bpy.data.materials.new(name)
    mat.diffuse_color = (*color, 1)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get('Principled BSDF')
    bsdf.inputs['Base Color'].default_value = (*color, 1)
    bsdf.inputs['Metallic'].default_value = metal
    bsdf.inputs['Roughness'].default_value = rough
    if name in ('Black nitride slide', 'Moulded charcoal polymer', 'Grip texture', 'Barrel steel'):
        # Subtle material-specific grain, roughness and tangent-space relief.
        # All three maps are packed and travel with the exported GLB.
        rng = random.Random(name)
        image = bpy.data.images.new(name + ' microtexture', width=128, height=128)
        heights = []
        for y in range(128):
            for x in range(128):
                # Steel has fine parallel machining, polymer has irregular
                # mould texture. Periodic terms make the tile seamless.
                if metal > .5:
                    height = .45*math.sin(y*math.tau*19/128) + .18*math.sin(y*math.tau*37/128 + x*math.tau/128) + rng.uniform(-.22,.22)
                else:
                    height = rng.uniform(-.65,.65)
                heights.append(height)
        pixels, normal_pixels, rough_pixels = [], [], []
        for y in range(128):
            for x in range(128):
                i = y*128+x
                grain = 1 + heights[i]*.055
                pixels.extend((color[0]*grain, color[1]*grain, color[2]*grain, 1))
                dx = heights[y*128+(x+1)%128] - heights[y*128+(x-1)%128]
                dy = heights[((y+1)%128)*128+x] - heights[((y-1)%128)*128+x]
                normal = Vector((-dx*.018, -dy*.018, 1)).normalized()
                normal_pixels.extend((normal.x*.5+.5, normal.y*.5+.5, normal.z*.5+.5, 1))
                r = min(1, max(0, rough + heights[i]*.025))
                rough_pixels.extend((r, r, r, 1))
        image.pixels.foreach_set(pixels)
        image.pack()
        image_node = mat.node_tree.nodes.new('ShaderNodeTexImage')
        image_node.image = image
        mat.node_tree.links.new(image_node.outputs['Color'], bsdf.inputs['Base Color'])
        normal_image = bpy.data.images.new(name + ' normal', width=128, height=128)
        normal_image.colorspace_settings.name = 'Non-Color'
        normal_image.pixels.foreach_set(normal_pixels)
        normal_image.pack()
        normal_tex = mat.node_tree.nodes.new('ShaderNodeTexImage')
        normal_tex.image = normal_image
        normal_map = mat.node_tree.nodes.new('ShaderNodeNormalMap')
        mat.node_tree.links.new(normal_tex.outputs['Color'], normal_map.inputs['Color'])
        mat.node_tree.links.new(normal_map.outputs['Normal'], bsdf.inputs['Normal'])
        rough_image = bpy.data.images.new(name + ' roughness', width=128, height=128)
        rough_image.colorspace_settings.name = 'Non-Color'
        rough_image.pixels.foreach_set(rough_pixels)
        rough_image.pack()
        rough_tex = mat.node_tree.nodes.new('ShaderNodeTexImage')
        rough_tex.image = rough_image
        separate = mat.node_tree.nodes.new('ShaderNodeSeparateColor')
        mat.node_tree.links.new(rough_tex.outputs['Color'], separate.inputs['Color'])
        mat.node_tree.links.new(separate.outputs['Green'], bsdf.inputs['Roughness'])
    return mat

slide_mat = material('Black nitride slide', (.055, .061, .064), .78, .36)
frame_mat = material('Moulded charcoal polymer', (.034, .038, .039), .04, .69)
grip_mat = material('Grip texture', (.022, .024, .024), 0, .84)
recess_mat = material('Recessed steel', (.013, .015, .016), .55, .58)
steel_mat = material('Barrel steel', (.105, .112, .113), .82, .32)
mark_mat = material('Engraving', (.19, .20, .19), .30, .64)
sight_mat = material('Sight inlay', (.70, .72, .62), 0, .5)

def move_to_collection(obj):
    for c in list(obj.users_collection):
        c.objects.unlink(obj)
    collection.objects.link(obj)
    return obj

def finish(obj, name, mat, bevel=.0005):
    obj.name = name
    obj.data.materials.append(mat)
    if bevel:
        mod = obj.modifiers.new('Machined edge radii', 'BEVEL')
        mod.width = bevel
        mod.segments = 3
        mod.limit_method = 'ANGLE'
    return obj

def box(name, loc, dims, mat, bevel=.0005, rot=None):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc)
    obj = move_to_collection(bpy.context.object)
    obj.dimensions = dims
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    if rot:
        obj.rotation_euler = rot
    return finish(obj, name, mat, bevel)

def prism(name, outline, width, mat, bevel=.0008):
    n = len(outline)
    verts = [(-width/2, y, z) for y, z in outline] + [(width/2, y, z) for y, z in outline]
    faces = [tuple(reversed(range(n))), tuple(range(n, n*2))]
    faces += [(i, (i+1)%n, (i+1)%n+n, i+n) for i in range(n)]
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(verts, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    collection.objects.link(obj)
    return finish(obj, name, mat, bevel)

def cylinder(name, loc, radius, depth, mat, axis='X', vertices=32):
    rotation = {'X': (0, math.pi/2, 0), 'Y': (math.pi/2, 0, 0), 'Z': (0, 0, 0)}[axis]
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=depth, location=loc, rotation=rotation)
    obj = move_to_collection(bpy.context.object)
    for f in obj.data.polygons:
        f.use_smooth = len(f.vertices) == 4
    return finish(obj, name, mat, .00025)

def join(name, objects, pivot):
    bpy.ops.object.select_all(action='DESELECT')
    for obj in objects:
        bpy.context.view_layer.objects.active = obj
        obj.select_set(True)
        for mod in list(obj.modifiers):
            bpy.ops.object.modifier_apply(modifier=mod.name)
    bpy.context.view_layer.objects.active = objects[0]
    bpy.ops.object.join()
    result = bpy.context.object
    result.name = name
    scene.cursor.location = pivot
    bpy.ops.object.origin_set(type='ORIGIN_CURSOR')
    scene.cursor.location = (0, 0, 0)
    return result

body = []
# Frame, backstrap and grip use shaped profiles; the heel stays in the original
# magazine well so the existing hands and reload animation still line up.
body.append(prism('Frame', [(-.044,.002),(.126,.002),(.126,-.012),(.105,-.019),(.040,-.019),(.012,-.028),(-.012,-.032),(-.044,-.020)], .026, frame_mat, .0018))
body.append(prism('Grip', [(-.043,-.018),(.011,-.019),(.006,-.047),(-.001,-.115),(-.010,-.123),(-.043,-.120),(-.048,-.111),(-.039,-.043)], .030, frame_mat, .003))
body.append(prism('Trigger guard', [( .012,-.015),(.072,-.015),(.073,-.025),(.061,-.050),(.014,-.050),(.009,-.044),(.055,-.044),(.065,-.024),(.012,-.023)], .010, frame_mat, .0008))
body.append(prism('Curved trigger', [(.029,-.020),(.035,-.020),(.038,-.027),(.036,-.037),(.032,-.042),(.029,-.039),(.032,-.031)], .0045, recess_mat, .0005))
body.append(box('Trigger safety', (0,.034,-.031), (.002,.003,.013), slide_mat, .0003))
# Grip panels and subtle moulded crosshatch, physically present in the GLB.
for side in (-1, 1):
    x = side*.0152
    panel = prism('Grip panel', [(-.038,-.041),(.003,-.040),(-.003,-.108),(-.010,-.115),(-.039,-.112),(-.043,-.105)], .001, grip_mat, .0007)
    panel.location.x = x
    body.append(panel)
    for row in range(13):
        z = -.048-row*.0046
        for col in range(8):
            y = -.035+col*.0045 - row*.00028
            body.append(box('Grip stipple', (side*.01572,y,z), (.00020,.0007,.0007), frame_mat, 0))
    body.append(cylinder('Frame pin', (side*.0135,-.012,-.012), .0020, .001, recess_mat))
    body.append(cylinder('Trigger pin', (side*.0135,.016,-.014), .0015, .001, steel_mat))
    body.append(box('Slide stop', (side*.0136,-.004,-.006), (.0015,.020,.003), recess_mat, .0005))
    body.append(box('Magazine release', (side*.0156,.005,-.032), (.0015,.008,.006), recess_mat, .0006))
for y in (.075, .085, .095):
    body.append(box('Accessory rail slot', (0,y,-.0195), (.021,.0025,.001), recess_mat, .0002))

# Slide as its own animated mesh, including sights, serrations and barrel hood.
moving = []
slide_shell = prism('Slide', [(-.055,.003),(.126,.003),(.137,.009),(.137,.026),(.131,.032),(-.050,.032),(-.055,.027)], .026, slide_mat, 0)
# A real cut into the upper right of the slide, not a painted-on port.
cutter = box('Temporary port cutter', (.008,.045,.032), (.016,.030,.010), recess_mat, 0)
bpy.context.view_layer.objects.active = slide_shell
cut = slide_shell.modifiers.new('Ejection port', 'BOOLEAN')
cut.operation = 'DIFFERENCE'
cut.object = cutter
bpy.ops.object.modifier_apply(modifier=cut.name)
bpy.data.objects.remove(cutter, do_unlink=True)
cutters = []
for side in (-1, 1):
    for start, count in ((-.047, 8),(.100, 5)):
        for i in range(count):
            cutters.append(box('Temporary serration', (side*.0132,start+i*.0042,.017), (.0024,.0016,.022), recess_mat, 0))
serrations = join('Temporary serrations', cutters, (0,0,0))
bpy.context.view_layer.objects.active = slide_shell
cut = slide_shell.modifiers.new('Serration cuts', 'BOOLEAN')
cut.operation = 'DIFFERENCE'
cut.object = serrations
bpy.ops.object.modifier_apply(modifier=cut.name)
bpy.data.objects.remove(serrations, do_unlink=True)
edge = slide_shell.modifiers.new('Machined edge radii', 'BEVEL')
edge.width = .001
edge.segments = 2
edge.limit_method = 'ANGLE'
moving.append(slide_shell)
for side in (-1,1):
    # Fine laser markings remain attached to the animated slide.
    for label, y, z, size in (('WARDEN 9', .002, .021, .0042), ('9 x 19', .002, .015, .0028)):
        curve = bpy.data.curves.new('Slide lettering', 'FONT')
        curve.body = label
        curve.size = size
        curve.extrude = .00003
        obj = bpy.data.objects.new('Slide marking', curve)
        collection.objects.link(obj)
        obj.location = (side*.01305, y if side == 1 else y+.026, z)
        obj.rotation_euler = Matrix(((0,0,side),(side,0,0),(0,1,0))).to_euler()
        obj.data.materials.append(mark_mat)
        bpy.ops.object.select_all(action='DESELECT')
        obj.select_set(True)
        bpy.context.view_layer.objects.active = obj
        bpy.ops.object.convert(target='MESH')
        moving.append(bpy.context.object)
moving.append(box('Ejection port recess', (.007,.045,.0275), (.013,.027,.0008), recess_mat, .0003))
moving.append(box('Barrel hood', (.005,.041,.0285), (.010,.019,.001), steel_mat, .0003))
moving.append(box('Rear slide backplate', (0,-.0553,.016), (.020,.0007,.022), recess_mat, .0005))
moving.append(box('Backplate lower seam', (0,-.0558,.007), (.014,.0004,.0006), slide_mat, .0001))
moving.append(box('Rear sight base', (0,-.047,.034), (.019,.010,.004), recess_mat, .0005))
for x in (-.007,.007):
    moving.append(box('Rear sight ear', (x,-.048,.037), (.005,.007,.006), recess_mat, .0004))
    moving.append(cylinder('Rear sight dot', (x,-.052,.038), .0009, .0005, sight_mat, axis='Y', vertices=16))
moving.append(box('Front sight', (0,.124,.035), (.004,.006,.006), recess_mat, .0005))
moving.append(cylinder('Front sight dot', (0,.1205,.036), .0009, .0005, sight_mat, axis='Y', vertices=16))
moving.append(cylinder('Barrel crown', (0,.137,.017), .0064, .002, steel_mat, axis='Y'))
moving.append(cylinder('Bore shadow', (0,.1382,.017), .0042, .0005, recess_mat, axis='Y'))
slide = join('slide', moving, (0,.04,.016))

mag_objects = [box('Magazine body', (0,-.012,-.070), (.020,.029,.100), slide_mat, .001),
               box('Magazine floorplate', (0,-.016,-.122), (.030,.041,.008), frame_mat, .0015)]
mag = join('mag', mag_objects, (0,-.012,-.020))
body_obj = join('body', body, (0,0,0))

# Map each face in its most visible plane, using world dimensions for a
# consistent microtexture scale on all of the separate model components.
for obj in (body_obj, slide, mag):
    uv = obj.data.uv_layers.new(name='Surface UV')
    obj.data.uv_layers.active = uv
    uv.active_render = True
    for poly in obj.data.polygons:
        normal = poly.normal
        axis = max(range(3), key=lambda i: abs(normal[i]))
        coords = ((1, 2), (0, 2), (0, 1))[axis]
        for loop_index in poly.loop_indices:
            vertex = obj.data.vertices[obj.data.loops[loop_index].vertex_index]
            point = obj.matrix_world @ vertex.co
            uv.data[loop_index].uv = (point[coords[0]] * 25, point[coords[1]] * 25)

# Export only weapon meshes; retain the editable scene alongside the game asset.
bpy.ops.object.select_all(action='DESELECT')
for obj in (body_obj, slide, mag):
    obj.select_set(True)
scene.render.engine = 'CYCLES'
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(ROOT, 'tools/weapon/pistol.blend'))
bpy.ops.export_scene.gltf(filepath=os.path.join(ROOT, 'packages/fps-client/src/viewmodel/assets/pistol.glb'), export_format='GLB', use_selection=True)
