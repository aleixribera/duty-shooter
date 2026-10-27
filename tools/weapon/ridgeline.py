"""Build the Ridgeline rifle first-person asset in Blender.

Run from the repository root with Blender in background mode. Coordinates and
moving-part origins match kit.ts; the source scene remains editable and the
export contains only the asset collection.
"""
import math
import os
import random
import bpy
from mathutils import Matrix, Vector

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
scene = bpy.context.scene
scene.unit_settings.system = 'METRIC'
collection = bpy.data.collections.new('Ridgeline')
scene.collection.children.link(collection)

def material(name, color, metal, rough):
    mat = bpy.data.materials.new(name)
    mat.diffuse_color = (*color, 1)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get('Principled BSDF')
    bsdf.inputs['Base Color'].default_value = (*color, 1)
    bsdf.inputs['Metallic'].default_value = metal
    bsdf.inputs['Roughness'].default_value = rough
    if name in ('Black nitride slide', 'Moulded charcoal polymer', 'Grip texture', 'Barrel steel', 'Olive stock'):
        # Fine, restrained surface variation.  The texture is packed into the
        # blend and exported with the GLB so the game sees the same finish.
        rng = random.Random(name)
        image = bpy.data.images.new(name + ' microtexture', width=128, height=128)
        pixels = []
        for _ in range(128 * 128):
            grain = rng.uniform(.90, 1.10)
            pixels.extend((color[0]*grain, color[1]*grain, color[2]*grain, 1))
        image.pixels.foreach_set(pixels)
        image.pack()
        image_node = mat.node_tree.nodes.new('ShaderNodeTexImage')
        image_node.image = image
        mat.node_tree.links.new(image_node.outputs['Color'], bsdf.inputs['Base Color'])
    return mat

slide_mat = material('Black nitride slide', (.055, .061, .064), .78, .36)
frame_mat = material('Moulded charcoal polymer', (.034, .038, .039), .04, .69)
grip_mat = material('Grip texture', (.022, .024, .024), 0, .84)
recess_mat = material('Recessed steel', (.013, .015, .016), .55, .58)
steel_mat = material('Barrel steel', (.105, .112, .113), .82, .32)
mark_mat = material('Engraving', (.19, .20, .19), .30, .64)
sight_mat = material('Sight inlay', (.70, .72, .62), 0, .5)
olive_mat = material('Olive stock', (.105, .12, .070), .02, .75)
lens_mat = material('Coated scope glass', (.018, .045, .055), .35, .18)

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

def tapered(name, y0, y1, r0, r1, z, mat, n=32):
    verts = [(r*math.cos(i*math.tau/n),y,z+r*math.sin(i*math.tau/n)) for y,r in ((y0,r0),(y1,r1)) for i in range(n)]
    faces = [tuple(reversed(range(n))), tuple(range(n,n*2))]
    faces.extend((i,(i+1)%n,(i+1)%n+n,i+n) for i in range(n))
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(verts, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    collection.objects.link(obj)
    for poly in mesh.polygons:
        poly.use_smooth = len(poly.vertices) == 4
    return finish(obj, name, mat, .0005)

body = []
# Stock and cheek piece: separate moulded contours, with small inset hardware.
body.append(prism('Sporter stock', [(-.044,.001),(.400,.001),(.400,-.028),(.060,-.037),(.008,-.033),(-.022,-.107),(-.061,-.110),(-.061,-.066),(-.380,-.111),(-.410,-.108),(-.410,.030),(-.145,.033),(-.085,.011)], .045, olive_mat, .0045))
body.append(prism('Raised cheek rest', [(-.355,.031),(-.155,.032),(-.130,.040),(-.165,.055),(-.340,.054),(-.355,.048)], .037, olive_mat, .003))
body.append(prism('Rubber recoil pad', [(-.410,-.109),(-.425,-.109),(-.425,.030),(-.410,.030)], .047, frame_mat, .002))
body.append(box('Pad spacer', (0,-.411,-.039), (.046,.002,.133), recess_mat, .0005))
for z in (-.09,-.065,-.04,-.015,.01):
    body.append(box('Pad groove', (0,-.4255,z), (.040,.0006,.001), recess_mat, .0001))
for side in (-1,1):
    body.append(box('Grip panel', (side*.0228,-.041,-.065), (.0008,.037,.056), grip_mat, .001))
    for i in range(10):
        body.append(box('Grip texture rib', (side*.0234,-.041,-.042-i*.0045), (.0005,.031,.0007), olive_mat, .0001))
    body.append(cylinder('Stock fastener', (side*.023,.115,-.020), .002,.001, steel_mat, vertices=16))
    body.append(box('Forend inset', (side*.0228,.250,-.018), (.0007,.215,.012), grip_mat, .0007))
    for i in range(7):
        body.append(box('Forend grip notch', (side*.0233,.170+i*.025,-.018), (.0005,.003,.009), olive_mat, .0001))

# Machined receiver cut for the ejection port, a free-floating tapered barrel,
# and a dark bore at the crown.
receiver = cylinder('Action receiver', (0,.060,.012), .018,.220, slide_mat, axis='Y', vertices=32)
for mod in list(receiver.modifiers):
    bpy.context.view_layer.objects.active = receiver
    bpy.ops.object.modifier_apply(modifier=mod.name)
cutter = box('Temporary ejection cutter', (.016,.043,.020), (.012,.060,.022), recess_mat, 0)
bpy.context.view_layer.objects.active = receiver
cut = receiver.modifiers.new('Ejection port', 'BOOLEAN')
cut.operation = 'DIFFERENCE'
cut.object = cutter
bpy.ops.object.modifier_apply(modifier=cut.name)
bpy.data.objects.remove(cutter, do_unlink=True)
body.append(receiver)
body.append(box('Ejection port well', (.010,.043,.020), (.001,.056,.018), recess_mat, .0004))
body.append(tapered('Heavy tapered barrel', .170,.790,.0135,.0105,.012, slide_mat))
body.append(cylinder('Muzzle crown', (0,.796,.012), .0115,.012, steel_mat, axis='Y'))
body.append(cylinder('Bore', (0,.8023,.012), .0064,.0005, recess_mat, axis='Y'))
body.append(prism('Trigger guard', [(0,-.035),(.080,-.035),(.075,-.043),(.068,-.071),(0,-.068),(0,-.062),(.062,-.062),(.069,-.043),(0,-.043)], .011, slide_mat, .0008))
body.append(prism('Trigger', [(.030,-.039),(.036,-.039),(.039,-.047),(.037,-.058),(.033,-.061),(.030,-.058),(.033,-.049)], .0045, steel_mat, .0004))

# Scope mounting rail, clamps, bell transitions, lenses, knurled controls and
# engraved index marks. The eye-side lens remains at the existing sight socket.
body.append(box('Scope rail base', (0,.054,.033), (.029,.205,.006), recess_mat, .0006))
for y in (-.015,.015,.045,.075,.105,.135):
    body.append(box('Rail cross slot', (0,y,.037), (.031,.003,.002), slide_mat, .0002))
body.append(cylinder('Scope tube', (0,.060,.072), .015,.200, recess_mat, axis='Y'))
body.append(tapered('Objective transition', .135,.175,.015,.022,.072, recess_mat))
body.append(tapered('Objective bell', .175,.235,.022,.024,.072, slide_mat))
body.append(cylinder('Objective rim', (0,.235,.072), .0245,.004, recess_mat, axis='Y'))
body.append(cylinder('Objective lens', (0,.2372,.072), .0215,.0005, lens_mat, axis='Y'))
body.append(tapered('Ocular transition', -.045,-.015,.020,.015,.072, recess_mat))
body.append(cylinder('Ocular bell', (0,-.078,.072), .020,.066, slide_mat, axis='Y'))
body.append(cylinder('Ocular rim', (0,-.110,.072), .0205,.004, recess_mat, axis='Y'))
body.append(cylinder('Ocular lens', (0,-.1122,.072), .017,.0005, lens_mat, axis='Y'))
for y in (-.062,-.068,-.074,-.080,-.086,-.092):
    body.append(cylinder('Focus ring groove', (0,y,.072), .0203,.0012, recess_mat, axis='Y', vertices=24))
for y in (0,.130):
    body.append(box('Scope clamp', (0,y,.047), (.035,.014,.043), slide_mat, .001))
    body.append(cylinder('Scope ring', (0,y,.072), .017,.014, slide_mat, axis='Y', vertices=24))
    for side in (-1,1):
        body.append(cylinder('Ring screw', (side*.018,y,.059), .0015,.001, steel_mat, vertices=12))
body.append(cylinder('Elevation turret', (0,.060,.095), .010,.022, slide_mat, axis='Z', vertices=24))
body.append(cylinder('Elevation cap', (0,.060,.108), .011,.006, recess_mat, axis='Z', vertices=24))
body.append(cylinder('Windage turret', (.022,.060,.072), .010,.022, slide_mat, axis='X', vertices=24))
body.append(cylinder('Windage cap', (.035,.060,.072), .011,.006, recess_mat, axis='X', vertices=24))
for i in range(12):
    angle = i*math.tau/12
    body.append(box('Elevation cap knurl', (.0108*math.cos(angle),.060+.0108*math.sin(angle),.108), (.001,.001,.005), steel_mat, 0))
    body.append(box('Windage cap knurl', (.035,.060+.0108*math.cos(angle),.072+.0108*math.sin(angle)), (.005,.001,.001), steel_mat, 0))

bolt_parts = [cylinder('Bolt body', (0,-.030,.012), .009,.050, steel_mat, axis='Y', vertices=24),
              cylinder('Bolt arm', (.030,-.035,.012), .0035,.045, steel_mat, axis='X', vertices=16),
              cylinder('Bolt knob', (.055,-.035,.012), .008,.016, recess_mat, axis='X', vertices=20)]
bolt = join('bolt', bolt_parts, (0,-.030,.012))
mag_parts = [box('Magazine', (0,.070,-.035), (.030,.080,.040), slide_mat, .0015),
             box('Magazine floorplate', (0,.070,-.056), (.032,.082,.003), recess_mat, .0007)]
mag = join('mag', mag_parts, (0,.070,-.020))
body_obj = join('body', body, (0,0,0))
for obj in (body_obj, bolt, mag):
    uv = obj.data.uv_layers.new(name='Surface UV')
    for poly in obj.data.polygons:
        axis = max(range(3), key=lambda i: abs(poly.normal[i]))
        coords = ((1, 2), (0, 2), (0, 1))[axis]
        for loop_index in poly.loop_indices:
            vertex = obj.data.vertices[obj.data.loops[loop_index].vertex_index]
            point = obj.matrix_world @ vertex.co
            uv.data[loop_index].uv = (point[coords[0]]*25, point[coords[1]]*25)

bpy.ops.object.select_all(action='DESELECT')
for obj in (body_obj, bolt, mag):
    obj.select_set(True)
scene.render.engine = 'CYCLES'
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(ROOT, 'tools/weapon/sniper.blend'))
bpy.ops.export_scene.gltf(filepath=os.path.join(ROOT, 'packages/fps-client/src/viewmodel/assets/sniper.glb'), export_format='GLB', use_selection=True)


