"""Build the M4's authored detail pass in Blender.

The base JSON comes from export-base.mjs. The .blend keeps that geometry as a
reference; only the detail collection is exported, in the game's metre scale.
"""
import bpy
import json
import math
import os
import sys
from mathutils import Matrix, Vector

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
BASE = os.path.join(ROOT, 'node_modules', 'weapon-work', 'base.json')
OUT = os.path.join(ROOT, 'packages', 'fps-client', 'src', 'viewmodel', 'assets')
os.makedirs(OUT, exist_ok=True)
SOURCE = os.path.join(OUT, 'm4a1-model.blend')
if os.path.exists(SOURCE) and '--overwrite-source' not in sys.argv:
    raise SystemExit('The editable Blender scene already exists. Preserve any manual edits, then pass --overwrite-source to regenerate it.')

bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
scene = bpy.context.scene
scene.unit_settings.system = 'METRIC'

def material(name, color, metallic, roughness):
    m = bpy.data.materials.new(name)
    m.diffuse_color = (*color, 1)
    m.use_nodes = True
    bsdf = m.node_tree.nodes.get('Principled BSDF')
    bsdf.inputs['Base Color'].default_value = (*color, 1)
    bsdf.inputs['Metallic'].default_value = metallic
    bsdf.inputs['Roughness'].default_value = roughness
    if name.startswith('Reference') or name == 'Magazine shell':
        # Fine surface breakup for the editable Blender scene. The game uses
        # its corresponding procedural finish rather than exporting these nodes.
        nodes = m.node_tree.nodes
        links = m.node_tree.links
        geometry = nodes.new('ShaderNodeNewGeometry')
        noise = nodes.new('ShaderNodeTexNoise')
        noise.inputs['Scale'].default_value = 650
        noise.inputs['Detail'].default_value = 2
        noise.inputs['Roughness'].default_value = .65
        links.new(geometry.outputs['Position'], noise.inputs['Vector'])
        mapping = nodes.new('ShaderNodeMapRange')
        mapping.inputs['To Min'].default_value = max(0, roughness - .055)
        mapping.inputs['To Max'].default_value = min(1, roughness + .055)
        links.new(noise.outputs['Fac'], mapping.inputs['Value'])
        links.new(mapping.outputs['Result'], bsdf.inputs['Roughness'])
        bump = nodes.new('ShaderNodeBump')
        bump.inputs['Strength'].default_value = .2
        bump.inputs['Distance'].default_value = .000025
        links.new(noise.outputs['Fac'], bump.inputs['Height'])
        links.new(bump.outputs['Normal'], bsdf.inputs['Normal'])
    return m

anod = material('Reference anodized aluminium', (0.036, 0.039, 0.046), .8, .48)
steel = material('Reference phosphate steel', (0.058, 0.058, 0.054), .55, .62)
polymer = material('Reference polymer', (0.03, 0.03, 0.031), 0, .68)
brass = material('Reference brass', (0.55, 0.34, 0.12), 1, .3)
engraving = material('Laser engraving', (0.19, 0.20, 0.19), .45, .72)
dark = material('Recessed hardware', (0.018, 0.020, 0.021), .5, .74)
paint = material('Muted ivory index paint', (0.32, 0.31, 0.27), .05, .8)
magazine_material = material('Magazine shell', (0.062, 0.064, 0.067), .6, .55)
magazine_ink = material('Magazine markings', (0.26, 0.27, 0.25), .25, .72)

reference = bpy.data.collections.new('REFERENCE - game geometry')
scene.collection.children.link(reference)
details = bpy.data.collections.new('AUTHORED - export')
scene.collection.children.link(details)
magazine_details = bpy.data.collections.new('AUTHORED - moving magazine')
scene.collection.children.link(magazine_details)
pivot_collection = bpy.data.collections.new('PIVOTS - moving parts')
scene.collection.children.link(pivot_collection)
socket_collection = bpy.data.collections.new('SOCKETS - game alignment')
scene.collection.children.link(socket_collection)

def point(x, y, z):
    # Game: +Y up, muzzle -Z. Blender: +Z up, muzzle +Y.
    return (x, -z, y)

def empty(name, location, collection, size=.008):
    obj = bpy.data.objects.new(name, None)
    obj.empty_display_type = 'PLAIN_AXES'
    obj.empty_display_size = size
    obj.location = point(*location)
    collection.objects.link(obj)
    return obj

pivots = {
    'magazine': empty('Magazine pivot', (0, -.0235, -.134), pivot_collection),
    'chargingHandle': empty('Charging handle pivot', (0, 0, 0), pivot_collection),
    'bolt': empty('Bolt pivot', (0, 0, 0), pivot_collection),
    'boltCatch': empty('Bolt catch pivot', (-.015, -.0175, -.104), pivot_collection),
}
for name, loc in (
    ('Muzzle', (0, 0, -.576)), ('Ejection port', (.0145, .0005, -.089)),
    ('Rear sight', (0, .066, -.022)), ('Front sight', (0, .066, -.3555)),
    ('Right grip', (.0152, -.074, .004)), ('Left handguard', (-.0369, -.0285, -.2642)),
):
    marker = empty(name, loc, socket_collection, .004)
    marker.hide_set(True)

with open(BASE, encoding='utf8') as f:
    meshes = json.load(f)
for item in meshes:
    a = item['positions']
    pos = item['parentPosition']
    verts = [point(a[i] + pos[0], a[i+1] + pos[1], a[i+2] + pos[2]) for i in range(0, len(a), 3)]
    idx = item['indices']
    faces = [idx[i:i+3] for i in range(0, len(idx), 3)]
    mesh = bpy.data.meshes.new(item['name'])
    mesh.from_pydata(verts, [], faces)
    mesh.update()
    normals = item['normals']
    for polygon in mesh.polygons:
        polygon.use_smooth = True
    mesh.normals_split_custom_set([
        point(normals[loop.vertex_index*3], normals[loop.vertex_index*3+1], normals[loop.vertex_index*3+2])
        for loop in mesh.loops
    ])
    obj = bpy.data.objects.new('REFERENCE ' + item['name'], mesh)
    reference.objects.link(obj)
    if item['parent'] in pivots:
        obj.parent = pivots[item['parent']]
        obj.location = -pivots[item['parent']].location
    # The authored shell replaces these pieces; retain them only for reference.
    if item['name'] in ('upperReceiver', 'lowerReceiverBody', 'magwell', 'handguard', 'stock', 'polymer', 'magazineBody', 'muzzleDevice', 'rearSightBody'):
        obj.hide_set(True)
        obj.hide_render = True
    mat = brass if item['name'] == 'cartridges' else polymer if item['name'] in ('polymer', 'magazineBody') else steel if item['name'] in ('steel', 'boltCarrier', 'boltCatch') else anod
    mesh.materials.append(mat)

def move_to_details(obj):
    for collection in list(obj.users_collection):
        collection.objects.unlink(obj)
    details.objects.link(obj)
    return obj

def side_text(text, x, y, z, size, mat, side=1, collection=details):
    curve = bpy.data.curves.new('stamp ' + text, 'FONT')
    curve.body = text
    curve.size = size
    curve.space_character = 1.1
    obj = bpy.data.objects.new('stamp ' + text, curve)
    collection.objects.link(obj)
    # Local text X follows the receiver toward the muzzle, Y is upward.
    if side > 0:
        basis = Matrix(((0, 0, 1), (1, 0, 0), (0, 1, 0)))
    else:
        basis = Matrix(((0, 0, -1), (-1, 0, 0), (0, 1, 0)))
    obj.rotation_euler = basis.to_euler()
    obj.location = point(x, y, z)
    curve.materials.append(mat)
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    bpy.ops.object.convert(target='MESH')
    obj.select_set(False)
    return obj

def top_text(text, x, y, z, size):
    curve = bpy.data.curves.new('rail ' + text, 'FONT')
    curve.body = text
    curve.size = size
    obj = bpy.data.objects.new('rail ' + text, curve)
    details.objects.link(obj)
    obj.location = point(x, y, z)
    obj.rotation_euler[2] = math.pi / 2
    curve.materials.append(paint)
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    bpy.ops.object.convert(target='MESH')
    obj.select_set(False)

def box(name, location, size, mat, bevel=0):
    bpy.ops.mesh.primitive_cube_add(size=1, location=point(*location))
    obj = move_to_details(bpy.context.object)
    obj.name = name
    obj.dimensions = (size[0], size[2], size[1])
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    obj.data.materials.append(mat)
    if bevel:
        mod = obj.modifiers.new('Machined edge', 'BEVEL')
        mod.width = bevel
        mod.segments = 3
        mod.affect = 'EDGES'
        obj.modifiers.new('Weighted normals', 'WEIGHTED_NORMAL')
    return obj

def magazine_well():
    # Separate forged lower: a tapered side profile, rolled edges and a real
    # through cavity so an empty reload does not reveal a solid block.
    profile = [(-.1710, -.025), (-.0990, -.025), (-.0990, -.070),
               (-.1025, -.079), (-.1690, -.079), (-.1730, -.073)]
    vertices = [point(x, y, z) for x in (-.0145, .0145) for z, y in profile]
    n = len(profile)
    faces = [tuple(range(n - 1, -1, -1)), tuple(range(n, 2 * n))]
    faces += [(i, (i + 1) % n, (i + 1) % n + n, i + n) for i in range(n)]
    mesh = bpy.data.meshes.new('Forged magwell')
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    obj = bpy.data.objects.new('authored_magwell', mesh)
    details.objects.link(obj)
    mesh.materials.append(anod)
    import bmesh
    bm = bmesh.new()
    bm.from_mesh(mesh)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(mesh)
    bm.free()

    bpy.ops.mesh.primitive_cube_add(size=1, location=point(0, -.052, -.134))
    cutter = bpy.context.object
    cutter.dimensions = (.0256, .0675, .080)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    mod = obj.modifiers.new('Magazine cavity', 'BOOLEAN')
    mod.operation = 'DIFFERENCE'
    mod.object = cutter
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.modifier_apply(modifier=mod.name)
    bpy.data.objects.remove(cutter, do_unlink=True)
    bevel = obj.modifiers.new('Forged edge radii', 'BEVEL')
    bevel.width = .0011
    bevel.segments = 3
    obj.modifiers.new('Weighted normals', 'WEIGHTED_NORMAL')
    return obj

magazine_well()

def upper_receiver():
    # A shaped receiver shell with a bore and an open ejection port. Both
    # openings are modeled rather than painted on, so the animated bolt remains
    # visible through the port.
    outline = [(-.180, -.013), (-.008, -.013), (.001, -.010), (.002, .012),
               (-.003, .0215), (-.176, .0215), (-.180, .018)]
    n = len(outline)
    verts = [point(x, y, z) for x in (-.0145, .0145) for z, y in outline]
    faces = [tuple(range(n - 1, -1, -1)), tuple(range(n, 2*n))]
    faces += [(i, (i+1) % n, (i+1) % n+n, i+n) for i in range(n)]
    mesh = bpy.data.meshes.new('Upper receiver forging')
    mesh.from_pydata(verts, [], faces)
    mesh.update()
    obj = bpy.data.objects.new('upper receiver forging', mesh)
    details.objects.link(obj)
    mesh.materials.append(anod)
    import bmesh
    bm = bmesh.new()
    bm.from_mesh(mesh)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(mesh)
    bm.free()

    def subtract(cutter, label):
        modifier = obj.modifiers.new(label, 'BOOLEAN')
        modifier.operation = 'DIFFERENCE'
        modifier.object = cutter
        bpy.context.view_layer.objects.active = obj
        bpy.ops.object.modifier_apply(modifier=modifier.name)
        bpy.data.objects.remove(cutter, do_unlink=True)

    bpy.ops.mesh.primitive_cylinder_add(vertices=48, radius=.0125, depth=.20,
                                        location=point(0, 0, -.09), rotation=(math.pi/2, 0, 0))
    subtract(bpy.context.object, 'Bore')
    bpy.ops.mesh.primitive_cube_add(size=1, location=point(.012, .0005, -.089))
    cutter = bpy.context.object
    cutter.dimensions = (.018, .064, .016)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    subtract(cutter, 'Ejection port')
    bevel = obj.modifiers.new('Receiver edge radii', 'BEVEL')
    bevel.width = .00065
    bevel.segments = 3
    obj.modifiers.new('Weighted normals', 'WEIGHTED_NORMAL')
    return obj

upper_receiver()

def lower_receiver():
    # Follow the original controls and hand geometry while replacing the
    # large receiver face with a gently rounded, forged shell.
    outline = [(-.1805, -.013), (0, -.013), (0, .0135), (.0115, .0135),
               (.0115, -.017), (.004, -.029), (-.006, -.0315), (-.048, -.0315),
               (-.0985, -.0315), (-.0985, -.024), (-.169, -.024),
               (-.170, -.030), (-.1805, -.028)]
    n = len(outline)
    vertices = [point(x, y, z) for x in (-.014, .014) for z, y in outline]
    faces = [tuple(range(n-1, -1, -1)), tuple(range(n, 2*n))]
    faces += [(i, (i+1)%n, (i+1)%n+n, i+n) for i in range(n)]
    mesh = bpy.data.meshes.new('Lower receiver forging')
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    obj = bpy.data.objects.new('lower receiver forging', mesh)
    details.objects.link(obj)
    mesh.materials.append(anod)
    import bmesh
    bm = bmesh.new()
    bm.from_mesh(mesh)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(mesh)
    bm.free()
    bevel = obj.modifiers.new('Forged edge radii', 'BEVEL')
    bevel.width = .0012
    bevel.segments = 4
    obj.modifiers.new('Weighted normals', 'WEIGHTED_NORMAL')
    return obj

lower_receiver()

def handguard_rail():
    # An original, compact ventilated rail that fits the existing M4 barrel,
    # front sight and hand positions. Both end faces and the slots are open.
    outer = [(-.018, -.0235), (.018, -.0235), (.024, -.0175), (.024, .0175),
             (.018, .0235), (-.018, .0235), (-.024, .0175), (-.024, -.0175)]
    inner = [(x * .73, y * .73) for x, y in outer]
    verts = []
    for z in (-.198, -.337):
        for ring in (outer, inner):
            verts.extend(point(x, y, z) for x, y in ring)
    faces = []
    for i in range(8):
        j = (i + 1) % 8
        faces.extend([(i, j, 16+j, 16+i), (8+j, 8+i, 24+i, 24+j),
                      (j, i, 8+i, 8+j), (16+i, 16+j, 24+j, 24+i)])
    mesh = bpy.data.meshes.new('Ventilated handguard')
    mesh.from_pydata(verts, [], faces)
    mesh.update()
    obj = bpy.data.objects.new('handguard rail body', mesh)
    details.objects.link(obj)
    mesh.materials.append(anod)
    import bmesh
    bm = bmesh.new()
    bm.from_mesh(mesh)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(mesh)
    bm.free()

    # Three rows of radiused ventilation slots cut clean through the tube. A
    # small chamfer catches light without a painted white outline.
    for y, z, length in ((y, z, .016 if y == 0 else .012)
                         for y in (-.010, 0, .010)
                         for z in (-.218, -.244, -.270, -.296, -.322)):
        bpy.ops.mesh.primitive_cube_add(size=1, location=point(0, y, z))
        cutter = bpy.context.object
        cutter.dimensions = (.065, length, .0050)
        bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
        bevel = cutter.modifiers.new('Rounded slot ends', 'BEVEL')
        bevel.width = .0022
        bevel.segments = 4
        bpy.context.view_layer.objects.active = cutter
        bpy.ops.object.modifier_apply(modifier=bevel.name)
        mod = obj.modifiers.new('Vent', 'BOOLEAN')
        mod.operation = 'DIFFERENCE'
        mod.object = cutter
        bpy.context.view_layer.objects.active = obj
        bpy.ops.object.modifier_apply(modifier=mod.name)
        bpy.data.objects.remove(cutter, do_unlink=True)
    bevel = obj.modifiers.new('Machined edge radii', 'BEVEL')
    bevel.width = .00055
    bevel.segments = 3
    obj.modifiers.new('Weighted normals', 'WEIGHTED_NORMAL')

    # Continuous top rail with individual cross-slots, aligned to the receiver
    # rail but kept below the original iron-sight axis.
    box('handguard rail base', (0, .0248, -.2675), (.019, .0030, .139), anod, .00035)
    for i in range(13):
        box('rail tooth %02d' % i, (0, .0271, -.207 - .01*i),
            (.020, .002, .0053), anod, .0003)

    # Fasteners and contrasting mounting collars give the rail a believable
    # assembly rather than one uninterrupted extrusion.
    for side in (-1, 1):
        for z in (-.205, -.330):
            bpy.ops.mesh.primitive_cylinder_add(vertices=16, radius=.0019, depth=.0005,
                                                location=point(side*.02415, -.010, z),
                                                rotation=(0, math.pi/2, 0))
            screw = move_to_details(bpy.context.object)
            screw.name = 'rail mounting screw'
            screw.data.materials.append(dark)
            bevel = screw.modifiers.new('Rim', 'BEVEL')
            bevel.width = .0002
            bevel.segments = 2
            screw.modifiers.new('Weighted normals', 'WEIGHTED_NORMAL')
    return obj

handguard_rail()

def muzzle_device():
    # Turned steel with a through bore and five real radial ports. The retained
    # M4 muzzle socket stays at the forward end for flash and projectile FX.
    bpy.ops.mesh.primitive_cylinder_add(vertices=64, radius=.011, depth=.047,
                                        location=point(0, 0, -.5525), rotation=(math.pi/2, 0, 0))
    obj = move_to_details(bpy.context.object)
    obj.name = 'ported muzzle device'
    obj.data.materials.append(steel)
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)

    def subtract(cutter, label):
        mod = obj.modifiers.new(label, 'BOOLEAN')
        mod.operation = 'DIFFERENCE'
        mod.object = cutter
        bpy.context.view_layer.objects.active = obj
        bpy.ops.object.modifier_apply(modifier=mod.name)
        bpy.data.objects.remove(cutter, do_unlink=True)

    bpy.ops.mesh.primitive_cylinder_add(vertices=48, radius=.0063, depth=.055,
                                        location=point(0, 0, -.5525), rotation=(math.pi/2, 0, 0))
    subtract(bpy.context.object, 'Muzzle bore')
    for angle in (30, 90, 150, 210, 330):
        theta = math.radians(angle)
        bpy.ops.mesh.primitive_cube_add(size=1, location=point(.009*math.cos(theta), .009*math.sin(theta), -.556))
        cutter = bpy.context.object
        cutter.dimensions = (.012, .027, .0029)
        bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
        bevel = cutter.modifiers.new('Port radius', 'BEVEL')
        bevel.width = .0013
        bevel.segments = 3
        bpy.context.view_layer.objects.active = cutter
        bpy.ops.object.modifier_apply(modifier=bevel.name)
        cutter.rotation_euler[1] = -theta
        subtract(cutter, 'Radial port')
    bevel = obj.modifiers.new('Turned edges', 'BEVEL')
    bevel.width = .00035
    bevel.segments = 3
    obj.modifiers.new('Weighted normals', 'WEIGHTED_NORMAL')
    return obj

muzzle_device()

def rear_sight():
    # Folded base only: leave the front sight visible when aiming.
    box('sight clamp base', (0, .0283, -.0215), (.025, .012, .031), anod, .001)

rear_sight()

def adjustable_stock():
    # A lightened, reinforced polymer stock around the original buffer tube.
    # The broad cheek rest and rubber heel pad keep its first-person silhouette
    # familiar while the open webbing adds depth when the weapon is inspected.
    outline = [(.106, .019), (.150, .021), (.247, .023), (.257, .016),
               (.257, -.078), (.247, -.092), (.225, -.088), (.194, -.071),
               (.156, -.046), (.118, -.025), (.106, -.022)]
    n = len(outline)
    verts = [point(x, y, z) for x in (-.018, .018) for z, y in outline]
    faces = [tuple(range(n - 1, -1, -1)), tuple(range(n, 2*n))]
    faces += [(i, (i+1) % n, (i+1) % n+n, i+n) for i in range(n)]
    mesh = bpy.data.meshes.new('Stock shell')
    mesh.from_pydata(verts, [], faces)
    mesh.update()
    obj = bpy.data.objects.new('stock shell', mesh)
    details.objects.link(obj)
    mesh.materials.append(polymer)
    import bmesh
    bm = bmesh.new()
    bm.from_mesh(mesh)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(mesh)
    bm.free()

    # Molded lightening window, angled with the lower stock brace.
    cut = [(.166, -.032), (.226, -.032), (.235, -.040), (.235, -.066),
           (.224, -.070), (.187, -.050)]
    cn = len(cut)
    cv = [point(x, y, z) for x in (-.03, .03) for z, y in cut]
    cf = [tuple(range(cn-1, -1, -1)), tuple(range(cn, 2*cn))]
    cf += [(i, (i+1) % cn, (i+1) % cn+cn, i+cn) for i in range(cn)]
    cm = bpy.data.meshes.new('stock window cutter')
    cm.from_pydata(cv, [], cf)
    cm.update()
    cutter = bpy.data.objects.new('stock window cutter', cm)
    scene.collection.objects.link(cutter)
    bm = bmesh.new()
    bm.from_mesh(cm)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(cm)
    bm.free()
    mod = obj.modifiers.new('Open stock web', 'BOOLEAN')
    mod.operation = 'DIFFERENCE'
    mod.object = cutter
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.modifier_apply(modifier=mod.name)
    bpy.data.objects.remove(cutter, do_unlink=True)
    bevel = obj.modifiers.new('Molded edge radii', 'BEVEL')
    bevel.width = .0022
    bevel.segments = 4
    obj.modifiers.new('Weighted normals', 'WEIGHTED_NORMAL')

    box('cheek weld', (0, .022, .197), (.037, .006, .100), polymer, .002)
    box('rubber shoulder pad', (0, -.035, .259), (.039, .105, .010), dark, .0035)
    for y in (-.071, -.057, -.043, -.029, -.015, -.001, .013):
        box('butt pad traction', (0, y, .2642), (.031, .0011, .0005), engraving, .00015)
    # A molded adjustment lever remains in reach of the existing tube.
    box('stock adjuster', (0, -.028, .129), (.014, .006, .034), dark, .0015)
    # A shallow reinforced side web catches a narrow highlight without
    # closing the lightening window or changing the weapon's envelope.
    panel = [(.126, .010), (.238, .011), (.244, .005), (.240, -.016),
             (.154, -.016), (.126, -.012)]
    for side in (-1, 1):
        n = len(panel)
        vertices = [point(x, y, z) for x in (side*.0179, side*.01845) for z, y in panel]
        panel_faces = [tuple(range(n-1, -1, -1)), tuple(range(n, 2*n))]
        panel_faces += [(i, (i+1)%n, (i+1)%n+n, i+n) for i in range(n)]
        pm = bpy.data.meshes.new('Molded stock web')
        pm.from_pydata(vertices, [], panel_faces)
        pm.update()
        web = bpy.data.objects.new('stock side web', pm)
        details.objects.link(web)
        pm.materials.append(polymer)
        bm = bmesh.new()
        bm.from_mesh(pm)
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        bm.to_mesh(pm)
        bm.free()
        roundover = web.modifiers.new('Molded rim', 'BEVEL')
        roundover.width = .00015
        roundover.segments = 3
        web.modifiers.new('Weighted normals', 'WEIGHTED_NORMAL')
        # Recessed sling socket and two small assembly pins. Their stepped
        # rims give the otherwise broad polymer shell readable scale.
        for z, y, radius in ((.239, -.077, .0038), (.143, -.004, .0013), (.229, -.004, .0013)):
            for mat, r, depth, x in ((anod, radius, .0006, .01855),
                                     (dark, radius*.48, .0003, .01895)):
                bpy.ops.mesh.primitive_cylinder_add(vertices=24, radius=r, depth=depth,
                                                    location=point(side*x, y, z),
                                                    rotation=(0, math.pi/2, 0))
                pin = move_to_details(bpy.context.object)
                pin.name = 'stock socket' if radius > .002 else 'stock assembly pin'
                pin.data.materials.append(mat)
                edge = pin.modifiers.new('Pin rim', 'BEVEL')
                edge.width = .00007
                edge.segments = 2
                pin.modifiers.new('Weighted normals', 'WEIGHTED_NORMAL')
    return obj

adjustable_stock()

def pistol_grip():
    # Sculpt a rounded palm swell and a gentle front-strap contour within the
    # old grip envelope, retaining the existing procedural hand placement.
    profile = [(-.049, -.030), (-.046, -.046), (-.040, -.056), (-.041, -.064),
               (-.033, -.078), (-.024, -.095), (-.018, -.112), (-.013, -.116),
               (.020, -.111), (.021, -.105), (.016, -.088), (.008, -.066),
               (.002, -.047), (.001, -.032), (-.009, -.030)]
    n = len(profile)
    verts = [point(x, y, z) for x in (-.014, .014) for z, y in profile]
    faces = [tuple(range(n-1, -1, -1)), tuple(range(n, 2*n))]
    faces += [(i, (i+1)%n, (i+1)%n+n, i+n) for i in range(n)]
    mesh = bpy.data.meshes.new('Ergonomic grip shell')
    mesh.from_pydata(verts, [], faces)
    mesh.update()
    obj = bpy.data.objects.new('grip shell', mesh)
    details.objects.link(obj)
    mesh.materials.append(polymer)
    import bmesh
    bm = bmesh.new()
    bm.from_mesh(mesh)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(mesh)
    bm.free()
    bevel = obj.modifiers.new('Molded grip radii', 'BEVEL')
    bevel.width = .0025
    bevel.segments = 5
    obj.modifiers.new('Weighted normals', 'WEIGHTED_NORMAL')

    # Narrow, understated traction bars on each side. They sit just proud of
    # the shell and stop short of the curved edge and trigger finger.
    for side in (-1, 1):
        for i in range(8):
            y = -.065 - i*.005
            z = -.012 + i*.0016
            bar = box('grip traction', (side*.01412, y, z), (.00025, .00045, .019), dark, .00010)
            bar.rotation_euler[0] = -.18
    return obj

pistol_grip()

def magazine_frame(s):
    straight, radius = .058, .3
    if s <= straight:
        return (0, -s), (-1, 0), (0, -1)
    phi = (s - straight) / radius
    return ((-radius + radius*math.cos(phi), -straight - radius*math.sin(phi)),
            (-math.cos(phi), math.sin(phi)), (-math.sin(phi), -math.cos(phi)))

def magazine_part(name, outline, half_width, bevel_width):
    n = len(outline)
    vertices = [point(x, y, z) for x in (-half_width, half_width) for z, y in outline]
    faces = [tuple(range(n-1, -1, -1)), tuple(range(n, 2*n))]
    faces += [(i, (i+1)%n, (i+1)%n+n, i+n) for i in range(n)]
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    magazine_details.objects.link(obj)
    mesh.materials.append(magazine_material)
    import bmesh
    bm = bmesh.new()
    bm.from_mesh(mesh)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(mesh)
    bm.free()
    if bevel_width:
        bevel = obj.modifiers.new('Pressed edge', 'BEVEL')
        bevel.width = bevel_width
        bevel.segments = 3
        obj.modifiers.new('Weighted normals', 'WEIGHTED_NORMAL')
    return obj

def rebuilt_magazine():
    # Preserve the old centerline and insertion dimensions so the animated
    # magazine and the visible cartridges remain aligned with the magwell.
    rear, front = [], []
    for i in range(25):
        c, normal, _ = magazine_frame(.17 * i / 24)
        rear.append((c[0] - normal[0]*.032, c[1] - normal[1]*.032))
        front.append((c[0] + normal[0]*.032, c[1] + normal[1]*.032))
    magazine_part('curved magazine shell', rear + list(reversed(front)), .01125, .0016)
    c, normal, tangent = magazine_frame(.17)
    floor = [(c[0]+normal[0]*u+tangent[0]*v, c[1]+normal[1]*u+tangent[1]*v)
             for u, v in [(-.034, -.0005), (.034, -.0005), (.034, .006), (-.034, .006)]]
    magazine_part('reinforced floor plate', floor, .0127, .0012)

    # Shallow, radiused stamped bands follow the magazine's curve. They are
    # geometry, so their highlights remain stable in reload and inspect views.
    for s in (.072, .090, .108, .126, .144):
        c, normal, tangent = magazine_frame(s)
        rib = [(c[0]+normal[0]*u+tangent[0]*v, c[1]+normal[1]*u+tangent[1]*v)
               for u, v in [(-.026, -.00075), (.026, -.00075), (.026, .00075), (-.026, .00075)]]
        magazine_part('pressed magazine band', rib, .01155, .00035)
    side_text('5.56', .01158, -.116, -.020, .0026, magazine_ink, 1, magazine_details)
    side_text('30', .01158, -.123, -.020, .0022, magazine_ink, 1, magazine_details)
    side_text('5.56', -.01158, -.116, -.020, .0026, magazine_ink, -1, magazine_details)
    side_text('30', -.01158, -.123, -.020, .0022, magazine_ink, -1, magazine_details)

rebuilt_magazine()

def forged_panel(name, side, profile, thickness, mat):
    """A shallow, rounded forging detail on a receiver side (z, y profile)."""
    inner = side * .01435
    outer = side * (.01435 + thickness)
    verts = [point(x, y, z) for x in (inner, outer) for z, y in profile]
    count = len(profile)
    faces = [tuple(range(count - 1, -1, -1)), tuple(range(count, 2 * count))]
    faces += [(i, (i+1) % count, (i+1) % count + count, i + count) for i in range(count)]
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(verts, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    details.objects.link(obj)
    mesh.materials.append(mat)
    import bmesh
    bm = bmesh.new()
    bm.from_mesh(mesh)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(mesh)
    bm.free()
    bevel = obj.modifiers.new('Soft forged edges', 'BEVEL')
    bevel.width = .00018
    bevel.segments = 3
    obj.modifiers.new('Weighted normals', 'WEIGHTED_NORMAL')

# Shallow reinforcing rails break up the receiver's large planar faces. The
# right side is kept clear of the ejection port and the animated controls.
forged_panel('left upper forging', -1,
             [(-.177, .015), (-.012, .015), (-.009, .012), (-.011, .010),
              (-.165, .010), (-.177, .006)], .0007, anod)
forged_panel('left lower forging', -1,
             [(-.175, -.010), (-.070, -.010), (-.060, -.012), (-.059, -.014),
              (-.169, -.014), (-.175, -.013)], .00065, anod)
forged_panel('right upper forging', 1,
             [(-.176, .016), (-.011, .016), (-.009, .013), (-.011, .011),
              (-.176, .011)], .00055, anod)

# A restrained fictional manufacturer's stamp, calibre, serial and safety marks.
# These sit just proud of the flat receiver faces to avoid depth fighting.
side_text('DUTY ARMS', .01455, -.043, -.162, .0030, engraving)
side_text('M4A1  /  5.56', .01455, -.048, -.162, .00225, engraving)
side_text('DS  024-0719', .01455, -.052, -.162, .0019, engraving)
side_text('DUTY ARMS', -.01455, -.043, -.158, .0030, engraving, -1)
side_text('M4A1  /  5.56', -.01455, -.048, -.158, .00225, engraving, -1)
side_text('DS  024-0719', -.01455, -.052, -.158, .0019, engraving, -1)
side_text('CAL 5.56 MM', .01468, .014, -.166, .0017, engraving)
side_text('SAFE', -.01418, -.014, -.050, .00165, paint, -1)
side_text('SEMI', -.01418, -.026, -.053, .00165, paint, -1)
side_text('AUTO', -.01418, -.025, -.022, .00165, paint, -1)

# Subtle witness lines and inspection marks on receiver and stock.
for z in (-.160, -.155, -.150):
    box('inspection mark', (.01457, -.0565, z), (.00008, .00045, .0028), engraving)

# Numbered receiver rail: small painted indices make the top face read as a
# machined part when seen close to the camera in the inspect animation.
for i, z in enumerate((-.027, -.047, -.067, -.087, -.107, -.127, -.147, -.167)):
    top_text(str(i * 2 + 2), -.0042, .03008, z, .00145)
for i, z in enumerate((-.207, -.227, -.247, -.267, -.287, -.307, -.327)):
    top_text(str(i * 2 + 20), -.0042, .02815, z, .00135)

# Quiet molded identification on the stock's reinforced cheek area.
side_text('DS', .0185, -.004, .150, .0028, engraving)
side_text('DS', -.0185, -.004, .224, .0028, engraving, -1)

# A small contrasting inset around the front sight retaining pin.
for side in (-1, 1):
    for z in (-.348, -.366):
        box('front sight pin inset', (side * .00605, .016, z), (.00018, .0022, .0022), dark, .00005)

# Export only authored pieces; keep the complete editable reference in .blend.
bpy.ops.object.select_all(action='DESELECT')
for obj in magazine_details.objects:
    obj.parent = pivots['magazine']
# Open the editable scene framed on the weapon rather than at Blender's
# default distant grid. No object is selected, so details remain easy to see.
for screen in bpy.data.screens:
    for area in screen.areas:
        if area.type == 'VIEW_3D':
            space = area.spaces.active
            if space.region_3d:
                space.region_3d.view_location = (0, .17, -.025)
                space.region_3d.view_distance = 1.15
                space.region_3d.view_rotation = Vector((-1.25, .7, -.55)).to_track_quat('-Z', 'Y')
                space.region_3d.view_perspective = 'PERSP'
bpy.context.preferences.filepaths.save_version = 0
bpy.ops.wm.save_as_mainfile(filepath=SOURCE)
for obj in magazine_details.objects:
    # Keep local positions when detaching for glTF: the client parents these
    # pieces to its own magazine mount.
    obj.parent = None
# Join the markings by material; the magwell stays separate so the game can
# give it the same procedural finish as the receiver.
bpy.ops.object.select_all(action='DESELECT')
for obj in list(details.objects) + list(magazine_details.objects):
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    for modifier in list(obj.modifiers):
        bpy.ops.object.modifier_apply(modifier=modifier.name)
    obj.select_set(False)

# Bake a restrained convex-edge mask into vertex color for the game's
# procedural finish. This is generated after bevels and before joining, so
# flat surfaces remain coated and small rounded edges can catch subtle wear.
def bake_edge_mask(obj):
    import bmesh
    from mathutils import noise
    mesh = obj.data
    bm = bmesh.new()
    bm.from_mesh(mesh)
    bm.verts.ensure_lookup_table()
    values = [0.0] * len(mesh.vertices)
    for edge in bm.edges:
        if edge.is_manifold and edge.is_convex and edge.calc_face_angle(0.0) > .20:
            for vertex in edge.verts:
                values[vertex.index] = 1.0
    bm.free()
    color = mesh.color_attributes.new(name='Surface', type='FLOAT_COLOR', domain='POINT')
    for index, value in enumerate(values):
        position = obj.matrix_world @ mesh.vertices[index].co
        # Spatially correlated patches avoid an artificial uniform outline.
        broad = noise.noise(position * 45 + Vector((14.1, 2.8, 5.3)))
        fine = noise.noise(position * 160 + Vector((3.2, 19.4, 7.1)))
        amount = max(0.0, min(1.0, (broad * .7 + fine * .3 - .08) / .2))
        color.data[index].color = (1.0, value * amount, 1.0, 1.0)

bpy.context.view_layer.update()
for obj in list(details.objects) + list(magazine_details.objects):
    if obj.type == 'MESH' and obj.data.materials and obj.data.materials[0] in (anod, steel, polymer, magazine_material):
        bake_edge_mask(obj)

for mat in (anod, polymer, steel, engraving, dark, paint):
    objects = [obj for obj in details.objects if obj.data.materials and obj.data.materials[0] == mat]
    for obj in objects:
        obj.select_set(True)
    if objects:
        bpy.context.view_layer.objects.active = objects[0]
        if len(objects) > 1:
            bpy.ops.object.join()
        objects[0].name = ('authored_magwell' if mat == anod else
                           'authored_stock' if mat == polymer else
                           'authored_muzzle' if mat == steel else 'detail ' + mat.name)
    bpy.ops.object.select_all(action='DESELECT')
for mat, name in ((magazine_material, 'authored_magazine'), (magazine_ink, 'authored_magazine_marks')):
    objects = [obj for obj in magazine_details.objects if obj.data.materials and obj.data.materials[0] == mat]
    for obj in objects:
        obj.select_set(True)
    if objects:
        bpy.context.view_layer.objects.active = objects[0]
        if len(objects) > 1:
            bpy.ops.object.join()
        objects[0].name = name
    bpy.ops.object.select_all(action='DESELECT')
for obj in list(details.objects) + list(magazine_details.objects):
    obj.select_set(True)
bpy.ops.export_scene.gltf(filepath=os.path.join(OUT, 'm4a1-details.glb'), export_format='GLB',
                          use_selection=True, export_apply=True, export_vertex_color='NAME',
                          export_vertex_color_name='Surface', export_all_vertex_colors=False)
