# The desktop app's icon: the game's SMG in profile, tilted up, on a rounded
# tile of the menu's ink colour with a signal-green rim light. Renders a
# transparent-cornered PNG for desktop/build/icon.png (electron-builder makes the
# .ico from it).
#
#   bkit.reset(); bkit.run(r"tools/icon/icon.py", out=r"desktop/build/icon.png", weapon="smg")
import math
import bpy
from mathutils import Vector

ROOT = ARGS.get("root", r"C:/Users/Aleix/Documents/CLAUDE/duty-shooter")
OUT = ARGS.get("out", ROOT + "/desktop/build/icon.png")
WEAPON = ARGS.get("weapon", "smg")
SIZE = ARGS.get("size", 512)
TILT = math.radians(ARGS.get("tilt", 28))

INK = (0.0037, 0.0044, 0.0065)        # #0b0e13 in linear
PANEL = (0.0062, 0.0080, 0.0123)      # #12161d
SIGNAL = (0.275, 0.77, 0.58)          # #8fe3c8 in linear

scene = bpy.context.scene

# The weapon, its longest axis laid along X, centred at the origin.
bpy.ops.import_scene.gltf(filepath=f"{ROOT}/packages/fps-client/src/viewmodel/assets/{WEAPON}.glb")
parts = [o for o in bpy.context.selected_objects if o.type == "MESH"]
pivot = bpy.data.objects.new("weapon", None)
# Z first, then the tilt about the camera axis (world Y).
pivot.rotation_mode = "ZYX"
scene.collection.objects.link(pivot)
for o in bpy.context.selected_objects:
    if o.parent is None:
        o.parent = pivot
bpy.context.view_layer.update()

def bounds():
    pts = [o.matrix_world @ Vector(c) for o in parts for c in o.bound_box]
    lo = Vector((min(p[i] for p in pts) for i in range(3)))
    hi = Vector((max(p[i] for p in pts) for i in range(3)))
    return lo, hi

lo, hi = bounds()
size = hi - lo
if size.y > size.x:  # barrel along Y: turn it onto X
    pivot.rotation_euler.z = math.radians(90)
bpy.context.view_layer.update()
lo, hi = bounds()
# Muzzle to the right: the magazine (below the bore) should hang near the middle,
# so flip if the heavy end is on the right. A side-on look from -Y.
pivot.rotation_euler.x = 0
bpy.context.view_layer.update()
if ARGS.get("flip", True):  # muzzle to the right
    pivot.rotation_euler.z += math.pi
pivot.rotation_euler.y = -TILT if ARGS.get("flip", True) else TILT
bpy.context.view_layer.update()
lo, hi = bounds()
centre = (lo + hi) / 2
pivot.location -= centre
bpy.context.view_layer.update()
lo, hi = bounds()
extent = max(hi.x - lo.x, hi.z - lo.z)

# Gunmetal and a lighter steel, so the shape reads at 32 px.
metal = bpy.data.materials.new("icon metal")
metal.use_nodes = True
bsdf = metal.node_tree.nodes["Principled BSDF"]
bsdf.inputs["Base Color"].default_value = (0.22, 0.24, 0.27, 1)
bsdf.inputs["Metallic"].default_value = 0.6
bsdf.inputs["Roughness"].default_value = 0.38
for o in parts:
    o.data.materials.clear()
    o.data.materials.append(metal)

# The tile: a rounded square behind the weapon, a touch lighter at the top.
half = extent * 0.5 / 0.8

def rounded_square(name, y, side, radius):
    """A flat square facing the camera (-Y) with its corners rounded."""
    bpy.ops.mesh.primitive_plane_add(size=1, location=(0, y, 0), rotation=(math.radians(90), 0, 0))
    obj = bpy.context.object
    obj.name = name
    obj.scale = (side, side, 1)
    bpy.ops.object.transform_apply(rotation=True, scale=True)
    round_ = obj.modifiers.new("round", "BEVEL")
    round_.affect = "VERTICES"
    round_.width = radius
    round_.segments = 24
    return obj

tile = rounded_square("tile", extent, half * 2 * 0.95, half * 0.32)
tile_mat = bpy.data.materials.new("icon tile")
tile_mat.use_nodes = True
nodes = tile_mat.node_tree.nodes
links = tile_mat.node_tree.links
nodes.clear()
out = nodes.new("ShaderNodeOutputMaterial")
emit = nodes.new("ShaderNodeEmission")
ramp = nodes.new("ShaderNodeValToRGB")
coord = nodes.new("ShaderNodeTexCoord")
sep = nodes.new("ShaderNodeSeparateXYZ")
links.new(coord.outputs["Generated"], sep.inputs[0])
links.new(sep.outputs["Z"], ramp.inputs["Fac"])
ramp.color_ramp.elements[0].color = (*INK, 1)
ramp.color_ramp.elements[1].color = (PANEL[0] * 2.2, PANEL[1] * 2.2, PANEL[2] * 2.2, 1)
links.new(ramp.outputs["Color"], emit.inputs["Color"])
links.new(emit.outputs["Emission"], out.inputs["Surface"])
tile.data.materials.append(tile_mat)

# A thin signal-green ring on the tile's edge.
ring = rounded_square("ring", extent * 1.05, half * 2, half * 0.35)
ring_mat = bpy.data.materials.new("icon ring")
ring_mat.use_nodes = True
rn = ring_mat.node_tree.nodes
rn.clear()
ro = rn.new("ShaderNodeOutputMaterial")
re = rn.new("ShaderNodeEmission")
re.inputs["Color"].default_value = (*SIGNAL, 1)
re.inputs["Strength"].default_value = 1.0
ring_mat.node_tree.links.new(re.outputs["Emission"], ro.inputs["Surface"])
ring.data.materials.append(ring_mat)

# Lights: a soft key from the upper left, a signal-green rim from behind right.
def area(name, loc, rot, energy, colour, size):
    data = bpy.data.lights.new(name, "AREA")
    data.energy = energy
    data.color = colour
    data.size = size
    light = bpy.data.objects.new(name, data)
    light.location = loc
    light.rotation_euler = rot
    scene.collection.objects.link(light)

s = extent
area("key", (-s * 0.6, -s * 1.2, s * 0.9), (math.radians(55), 0, math.radians(-25)), 60 * s * s, (1, 0.97, 0.92), s)
area("rim", (s * 0.8, s * 0.4, s * 0.6), (math.radians(-70), 0, math.radians(-130)), 280 * s * s, SIGNAL, s * 0.6)
area("fill", (s * 0.3, -s * 1.0, -s * 0.7), (math.radians(120), 0, math.radians(15)), 20 * s * s, (0.7, 0.8, 1.0), s)

# An orthographic camera from the front (-Y), framing the tile exactly.
cam_data = bpy.data.cameras.new("icon")
cam_data.type = "ORTHO"
cam_data.ortho_scale = half * 2
cam = bpy.data.objects.new("icon", cam_data)
cam.location = (0, -s * 3, 0)
cam.rotation_euler = (math.radians(90), 0, 0)
scene.collection.objects.link(cam)
scene.camera = cam

world = bpy.data.worlds.new("icon") if not scene.world else scene.world
scene.world = world
world.use_nodes = True
world.node_tree.nodes["Background"].inputs["Strength"].default_value = 0.15

scene.render.engine = "BLENDER_EEVEE"
scene.render.resolution_x = SIZE
scene.render.resolution_y = SIZE
scene.render.film_transparent = True
scene.render.image_settings.file_format = "PNG"
scene.render.image_settings.color_mode = "RGBA"
scene.view_settings.view_transform = "AgX"
scene.view_settings.look = "AgX - Punchy"
scene.render.filepath = OUT
bpy.ops.render.render(write_still=True)

result = {"out": OUT, "extent": round(extent, 3), "parts": [o.name for o in parts]}
