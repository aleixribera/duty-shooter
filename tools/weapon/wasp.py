"""Build the Wasp 9 first-person asset in Blender.

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
tempfile.tempdir = os.path.join(ROOT, 'node_modules', 'weapon-work', 'tmp')
os.makedirs(tempfile.tempdir, exist_ok=True)
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
scene = bpy.context.scene
scene.unit_settings.system = 'METRIC'
collection = bpy.data.collections.new('Wasp 9')
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
        mod.segments = 2
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
# Stamped receiver with a cut ejection port and a separate top cover.
receiver = prism('Receiver', [(-.065,-.024),(.174,-.024),(.185,-.017),(.185,.025),(.176,.033),(-.060,.033),(-.065,.026)], .042, slide_mat, 0)
cutter = box('Temporary port cutter', (.022,.080,.019), (.009,.045,.018), recess_mat, 0)
bpy.context.view_layer.objects.active = receiver
cut = receiver.modifiers.new('Ejection port', 'BOOLEAN')
cut.operation = 'DIFFERENCE'
cut.object = cutter
bpy.ops.object.modifier_apply(modifier=cut.name)
bpy.data.objects.remove(cutter, do_unlink=True)
edge = receiver.modifiers.new('Receiver edge radius', 'BEVEL')
edge.width = .0012
edge.segments = 2
body.append(receiver)
body.append(box('Port interior', (.019,.080,.019), (.002,.042,.015), recess_mat, .0005))
body.append(box('Bolt face', (.020,.074,.018), (.001,.025,.010), steel_mat, .0004))
body.append(box('Top cover', (0,.057,.036), (.039,.222,.008), recess_mat, .0012))
body.append(box('Cover center channel', (0,.060,.040), (.009,.145,.001), slide_mat, .0002))
for i in range(8):
    body.append(box('Cover pressed rib', (0,-.010+i*.022,.041), (.038,.0028,.0025), slide_mat, .0003))
body.append(box('Charging handle rail', (0,.112,.044), (.013,.032,.004), steel_mat, .0005))
body.append(box('Charging handle', (0,.11,.049), (.018,.016,.008), recess_mat, .0014))
for side in (-1, 1):
    for i in range(3):
        body.append(box('Handle grip groove', (side*.0091,.105+i*.004,.049), (.0004,.001,.005), slide_mat, 0))
    # Receiver stamping and its fixed pins.
    body.append(box('Receiver lower seam', (side*.0212,.053,-.017), (.0005,.210,.0012), recess_mat, .00015))
    for y,z in ((-.048,.007),(.016,-.012),(.154,.006)):
        body.append(cylinder('Receiver pin', (side*.0215,y,z), .0022,.001, recess_mat, vertices=20))
    body.append(cylinder('Selector pivot', (side*.0218,-.020,-.017), .003,.0015, steel_mat, vertices=20))
    body.append(box('Selector lever', (side*.0228,-.013,-.016), (.0015,.015,.0025), recess_mat, .0005))
    for label, y, z, size in (('WASP 9', .009, .001, .004), ('9 x 19', .010, -.005, .0025)):
        curve = bpy.data.curves.new('Receiver lettering', 'FONT')
        curve.body = label
        curve.size = size
        curve.extrude = .00003
        obj = bpy.data.objects.new('Receiver marking', curve)
        collection.objects.link(obj)
        obj.location = (side*.02105, y if side == 1 else y+.022, z)
        obj.rotation_euler = Matrix(((0,0,side),(side,0,0),(0,1,0))).to_euler()
        obj.data.materials.append(mark_mat)
        bpy.ops.object.select_all(action='DESELECT')
        obj.select_set(True)
        bpy.context.view_layer.objects.active = obj
        bpy.ops.object.convert(target='MESH')
        body.append(bpy.context.object)

# Grip encloses the magazine. A shaped guard and curved trigger replace the
# previous rectangular opening; grip ribs are shallow moulded details.
body.append(prism('Grip', [(-.014,-.021),(.029,-.021),(.027,-.110),(.020,-.120),(-.021,-.119),(-.023,-.107)], .036, frame_mat, .0025))
body.append(prism('Trigger guard', [(.029,-.022),(.085,-.022),(.083,-.031),(.074,-.060),(.029,-.060),(.029,-.054),(.069,-.054),(.076,-.031),(.029,-.031)], .010, slide_mat, .0008))
body.append(prism('Trigger', [(.043,-.026),(.049,-.026),(.052,-.034),(.050,-.044),(.046,-.049),(.043,-.046),(.046,-.037)], .0045, recess_mat, .0005))
for side in (-1, 1):
    body.append(box('Grip panel', (side*.0182,.003,-.070), (.0008,.033,.073), grip_mat, .001))
    for i in range(12):
        body.append(box('Grip rib', (side*.0188,.003,-.039-i*.0055), (.0005,.031,.001), frame_mat, .00015))
    body.append(cylinder('Grip panel screw', (side*.019,-.008,-.103), .0018,.0008, steel_mat, vertices=16))

# Front handguard, barrel nut, hollow-looking crown and protected iron sights.
body.append(prism('Front handguard', [(.101,-.021),(.177,-.021),(.184,-.016),(.181,.005),(.104,.005)], .044, frame_mat, .002))
for side in (-1,1):
    for i in range(5):
        body.append(box('Handguard groove', (side*.0222,.113+i*.012,-.007), (.0004,.002,.014), recess_mat, .0002))
body.append(cylinder('Barrel', (0,.218,.010), .0075,.064, steel_mat, axis='Y'))
body.append(cylinder('Barrel nut', (0,.191,.010), .014,.021, slide_mat, axis='Y', vertices=24))
for i in range(10):
    angle = i*math.tau/10
    x,z = math.sin(angle)*.0137, .010+math.cos(angle)*.0137
    body.append(box('Nut knurl', (x,.191,z), (.0013,.016,.0013), recess_mat, .0001))
body.append(cylinder('Muzzle crown', (0,.251,.010), .0076,.002, steel_mat, axis='Y'))
body.append(cylinder('Bore', (0,.2522,.010), .0045,.0004, recess_mat, axis='Y'))
body.append(box('Rear sight base', (0,-.045,.046), (.024,.012,.008), slide_mat, .001))
for x in (-.009,.009):
    body.append(box('Rear sight ear', (x,-.045,.054), (.006,.010,.012), slide_mat, .0007))
body.append(box('Front sight base', (0,.168,.045), (.022,.011,.007), slide_mat, .0008))
for x in (-.009,.009):
    body.append(box('Front sight wing', (x,.168,.054), (.004,.007,.016), slide_mat, .0005))
body.append(box('Front sight post', (0,.168,.055), (.003,.005,.014), steel_mat, .0004))

# The folded metal stock follows the original low profile so it stays clear of
# both hands and the ejected magazine during existing animations.
for x in (-.017,.017):
    body.append(cylinder('Folded stock strut', (x,.045,-.032), .0035,.202, recess_mat, axis='Y', vertices=16))
    body.append(cylinder('Stock hinge', (x,-.055,-.021), .005,.006, steel_mat, axis='X', vertices=20))
body.append(box('Folded stock toe', (0,.147,-.032), (.041,.010,.029), slide_mat, .0015))
body.append(box('Rear sling mount', (0,-.065,-.012), (.047,.008,.010), slide_mat, .001))

mag_parts = [box('Magazine shell', (0,.004,-.130), (.026,.030,.160), slide_mat, .0012),
             box('Magazine floorplate', (0,.004,-.210), (.030,.036,.008), recess_mat, .001)]
for side in (-1,1):
    for z in (-.140,-.155,-.170,-.185):
        mag_parts.append(cylinder('Magazine witness', (side*.0132,.005,z), .0014,.0006, recess_mat, vertices=12))
mag = join('mag', mag_parts, (0,.004,-.040))
body_obj = join('body', body, (0,0,0))
for obj in (body_obj, mag):
    uv = obj.data.uv_layers.new(name='Surface UV')
    obj.data.uv_layers.active = uv
    uv.active_render = True
    for poly in obj.data.polygons:
        axis = max(range(3), key=lambda i: abs(poly.normal[i]))
        coords = ((1, 2), (0, 2), (0, 1))[axis]
        for loop_index in poly.loop_indices:
            vertex = obj.data.vertices[obj.data.loops[loop_index].vertex_index]
            point = obj.matrix_world @ vertex.co
            uv.data[loop_index].uv = (point[coords[0]] * 25, point[coords[1]] * 25)

bpy.ops.object.select_all(action='DESELECT')
for obj in (body_obj, mag):
    obj.select_set(True)
scene.render.engine = 'CYCLES'
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(ROOT, 'tools/weapon/smg.blend'))
bpy.ops.export_scene.gltf(filepath=os.path.join(ROOT, 'packages/fps-client/src/viewmodel/assets/smg.glb'), export_format='GLB', use_selection=True)



