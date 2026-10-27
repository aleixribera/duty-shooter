"""Build the Harrow 12 first-person asset in Blender.

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
collection = bpy.data.collections.new('Harrow 12')
scene.collection.children.link(collection)

def material(name, color, metal, rough):
    mat = bpy.data.materials.new(name)
    mat.diffuse_color = (*color, 1)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get('Principled BSDF')
    bsdf.inputs['Base Color'].default_value = (*color, 1)
    bsdf.inputs['Metallic'].default_value = metal
    bsdf.inputs['Roughness'].default_value = rough
    if name in ('Black nitride slide', 'Moulded charcoal polymer', 'Grip texture', 'Barrel steel', 'Walnut'):
        # Fine, restrained surface variation.  The texture is packed into the
        # blend and exported with the GLB so the game sees the same finish.
        rng = random.Random(name)
        image = bpy.data.images.new(name + ' microtexture', width=128, height=128)
        pixels = []
        for i in range(128 * 128):
            u, v = i % 128, i // 128
            grain = rng.uniform(.90, 1.10)
            if name == 'Walnut':
                grain *= .82 + .18 * math.sin(u*.18 + math.sin(v*.035)*1.5) + .08 * math.sin(u*.53 + v*.012)
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
wood_mat = material('Walnut', (.20, .082, .036), 0, .42)
checkering_mat = material('Dark walnut checkering', (.095, .035, .015), 0, .68)
brass_mat = material('Brass bead', (.54, .32, .095), .85, .35)

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

def forend():
    # Elliptical section and tapered ends give the sliding walnut a full,
    # rounded shape without changing its existing animation pivot.
    rings = [(.267,.018,.018),(.275,.022,.021),(.292,.023,.022),(.427,.023,.022),(.445,.021,.020),(.452,.018,.018)]
    n = 24
    verts = [(rx*math.cos(i*math.tau/n), y, -.008+rz*math.sin(i*math.tau/n)) for y,rx,rz in rings for i in range(n)]
    faces = [tuple(reversed(range(n))), tuple(range((len(rings)-1)*n,len(rings)*n))]
    for r in range(len(rings)-1):
        faces.extend((r*n+i,r*n+(i+1)%n,(r+1)*n+(i+1)%n,(r+1)*n+i) for i in range(n))
    mesh = bpy.data.meshes.new('Turned walnut forend')
    mesh.from_pydata(verts, [], faces)
    mesh.update()
    obj = bpy.data.objects.new('Turned walnut forend', mesh)
    collection.objects.link(obj)
    for poly in mesh.polygons:
        poly.use_smooth = len(poly.vertices) == 4
    return finish(obj, 'Turned walnut forend', wood_mat, .0007)

body = []
receiver = prism('Receiver', [(-.052,-.021),(.162,-.021),(.173,-.012),(.173,.030),(.162,.039),(-.046,.039),(-.052,.032)], .036, slide_mat, 0)
# Real cutouts in the ejection and loading ports expose their dark recesses.
for name,loc,dims in (('Ejection port',(.0185,.071,.017),(.008,.060,.023)),('Loading port',(0,.078,-.021),(.022,.067,.008))):
    cutter = box('Temporary cutter', loc, dims, recess_mat, 0)
    bpy.context.view_layer.objects.active = receiver
    cut = receiver.modifiers.new(name, 'BOOLEAN')
    cut.operation = 'DIFFERENCE'
    cut.object = cutter
    bpy.ops.object.modifier_apply(modifier=cut.name)
    bpy.data.objects.remove(cutter, do_unlink=True)
edge = receiver.modifiers.new('Receiver edge radius', 'BEVEL')
edge.width = .0016
edge.segments = 2
body.append(receiver)
body.append(box('Ejection port interior', (.015,.071,.017), (.001,.055,.019), recess_mat, .0003))
body.append(box('Bolt', (.0158,.057,.016), (.001,.026,.014), steel_mat, .0004))
body.append(box('Loading port interior', (0,.078,-.017), (.019,.062,.0007), recess_mat, .0003))
body.append(prism('Trigger guard', [(-.004,-.022),(.088,-.022),(.086,-.031),(.072,-.061),(-.003,-.060),(-.003,-.054),(.066,-.054),(.077,-.031),(-.004,-.031)], .011, slide_mat, .0008))
body.append(prism('Trigger', [(.033,-.025),(.039,-.025),(.043,-.034),(.040,-.044),(.036,-.049),(.033,-.046),(.036,-.037)], .005, steel_mat, .0004))
for side in (-1,1):
    for y,z in ((-.037,-.007),(.010,-.015),(.139,-.010)):
        body.append(cylinder('Receiver pin', (side*.0183,y,z), .002,.0008, recess_mat, vertices=16))
    body.append(cylinder('Safety button', (side*.019,.010,-.030), .003,.002, steel_mat, vertices=20))
    for label, y, z, size in (('HARROW 12',-.030,.016,.004),('12 GA',-.029,.010,.0025)):
        curve = bpy.data.curves.new('Receiver lettering', 'FONT')
        curve.body, curve.size, curve.extrude = label, size, .00003
        obj = bpy.data.objects.new('Receiver marking', curve)
        collection.objects.link(obj)
        obj.location = (side*.0181, y if side == 1 else y+.028, z)
        obj.rotation_euler = Matrix(((0,0,side),(side,0,0),(0,1,0))).to_euler()
        obj.data.materials.append(mark_mat)
        bpy.ops.object.select_all(action='DESELECT')
        obj.select_set(True)
        bpy.context.view_layer.objects.active = obj
        bpy.ops.object.convert(target='MESH')
        body.append(bpy.context.object)

# Solid walnut stock with a sculpted wrist and cheek, checkered side panels,
# and a stepped rubber recoil pad. Shapes preserve the original hand socket.
body.append(prism('Walnut stock', [(-.050,.030),(-.050,-.026),(-.075,-.045),(-.103,-.059),(-.149,-.073),(-.365,-.130),(-.381,-.129),(-.381,-.014),(-.352,-.010),(-.148,.001),(-.088,.008)], .040, wood_mat, .0045))
body.append(prism('Grip checkering', [(-.066,-.034),(-.079,-.042),(-.113,-.052),(-.121,-.043),(-.105,-.026),(-.076,-.018)], .041, checkering_mat, .0006))
for side in (-1,1):
    for i in range(7):
        body.append(box('Stock grip line', (side*.0208,-.089,-.025-i*.003), (.0004,.026,.0005), wood_mat, 0))
    body.append(cylinder('Stock bolt', (side*.0204,-.085,-.007), .0018,.0008, steel_mat, vertices=16))
body.append(prism('Recoil pad', [(-.381,-.130),(-.393,-.130),(-.393,-.013),(-.381,-.014)], .042, frame_mat, .002))
body.append(box('Pad spacer', (0,-.381,-.072), (.041,.002,.110), recess_mat, .0004))
for z in (-.115,-.090,-.065,-.040,-.020):
    body.append(box('Recoil pad groove', (0,-.3935,z), (.037,.0007,.001), recess_mat, .0002))

# Barrel, magazine tube and clamp, kept on the existing muzzle axis.
body.append(cylinder('Barrel', (0,.420,.022), .0115,.500, slide_mat, axis='Y'))
body.append(cylinder('Muzzle rim', (0,.670,.022), .0117,.002, steel_mat, axis='Y'))
body.append(cylinder('Bore', (0,.6713,.022), .0088,.0004, recess_mat, axis='Y'))
body.append(cylinder('Magazine tube', (0,.380,-.008), .0105,.420, recess_mat, axis='Y'))
body.append(cylinder('Magazine cap', (0,.600,-.008), .012,.020, slide_mat, axis='Y', vertices=24))
body.append(box('Barrel clamp', (0,.584,.007), (.016,.014,.045), slide_mat, .001))
body.append(box('Vent rib', (0,.420,.035), (.008,.480,.003), steel_mat, .0004))
body.append(cylinder('Front bead', (0,.665,.039), .0023,.004, brass_mat, axis='Z', vertices=20))
body.append(box('Rear sight base', (0,-.038,.044), (.016,.012,.008), recess_mat, .0005))
for x in (-.006,.006):
    body.append(box('Rear sight ear', (x,-.038,.052), (.004,.008,.009), slide_mat, .0005))

pump_parts = [forend()]
for x in (-.008,.008):
    pump_parts.append(cylinder('Pump action bar', (x,.225,-.017), .002,.130, steel_mat, axis='Y', vertices=12))
for y in (.288,.295,.302,.418,.425,.432):
    ring = cylinder('Forend grip band', (0,y,-.008), .023,.0012, grip_mat, axis='Y', vertices=24)
    ring.scale.z = .96
    pump_parts.append(ring)
pump = join('pump', pump_parts, (0,.360,-.008))
body_obj = join('body', body, (0,0,0))
for obj in (body_obj, pump):
    uv = obj.data.uv_layers.new(name='Surface UV')
    for poly in obj.data.polygons:
        axis = max(range(3), key=lambda i: abs(poly.normal[i]))
        coords = ((1, 2), (0, 2), (0, 1))[axis]
        material = obj.data.materials[poly.material_index]
        scale = 6 if material.name == 'Walnut' else 25
        for loop_index in poly.loop_indices:
            vertex = obj.data.vertices[obj.data.loops[loop_index].vertex_index]
            point = obj.matrix_world @ vertex.co
            uv.data[loop_index].uv = (point[coords[1]]*scale, point[coords[0]]*scale)

bpy.ops.object.select_all(action='DESELECT')
for obj in (body_obj, pump):
    obj.select_set(True)
scene.render.engine = 'CYCLES'
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(ROOT, 'tools/weapon/shotgun.blend'))
bpy.ops.export_scene.gltf(filepath=os.path.join(ROOT, 'packages/fps-client/src/viewmodel/assets/shotgun.glb'), export_format='GLB', use_selection=True)


