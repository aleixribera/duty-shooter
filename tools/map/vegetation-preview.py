"""Renders the plant kit with its foliage atlas in EEVEE, to look at before the game (ticket 62):

    blender -b --factory-startup --python tools/map/vegetation-preview.py -- OUT_DIR [asset ...]

Builds tools/map/vegetation.py, puts the atlas (apps/range/public/textures/foliage.webp)
on the leaf cards, alpha-clipped at 0.5 as the game does, and renders each
asset from the side, three-quarter above and below in low warm sun and a sky
fill: one sheet per asset in OUT_DIR. The export doesn't use any of this.
"""
import math
import os
import sys

import bpy
from mathutils import Vector

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.join(HERE, "..", "..")
argv = sys.argv[sys.argv.index("--") + 1:]
out_dir = os.path.abspath(argv[0])
only = set(argv[1:])

sys.path.insert(0, os.path.join(os.path.expanduser("~"), ".claude", "skills", "blender", "scripts"))
import bkit  # noqa: E402

bkit.reset()
bkit.run(os.path.join(HERE, "vegetation.py"), export=False)

atlas = bpy.data.images.load(os.path.join(ROOT, "apps", "range", "public", "textures", "foliage.webp"))
atlas.alpha_mode = "STRAIGHT"


def textured(mat):
    """The material with the atlas: colour times its own, alpha clipped, AO from the vertex colour."""
    mat.use_nodes = True
    nt = mat.node_tree
    bsdf = next(n for n in nt.nodes if n.type == "BSDF_PRINCIPLED")
    tex = nt.nodes.new("ShaderNodeTexImage")
    tex.image = atlas
    tex.interpolation = "Cubic"
    ao = nt.nodes.new("ShaderNodeVertexColor")
    ao.layer_name = "Color"
    mul = nt.nodes.new("ShaderNodeMix")
    mul.data_type = "RGBA"
    mul.blend_type = "MULTIPLY"
    mul.inputs["Factor"].default_value = 1.0
    nt.links.new(tex.outputs["Color"], mul.inputs[6])
    nt.links.new(ao.outputs["Color"], mul.inputs[7])
    nt.links.new(mul.outputs[2], bsdf.inputs["Base Color"])
    clip = nt.nodes.new("ShaderNodeMath")
    clip.operation = "GREATER_THAN"
    clip.inputs[1].default_value = 0.5
    nt.links.new(tex.outputs["Alpha"], clip.inputs[0])
    nt.links.new(clip.outputs[0], bsdf.inputs["Alpha"])
    if "Subsurface Weight" in bsdf.inputs:
        bsdf.inputs["Transmission Weight"].default_value = 0.0
    mat.surface_render_method = "DITHERED"
    mat.use_backface_culling = False


for m in bpy.data.materials:
    if m.name.startswith("plant."):
        textured(m)

scene = bpy.context.scene
scene.render.engine = "BLENDER_EEVEE"
scene.render.film_transparent = False
scene.render.resolution_x = scene.render.resolution_y = 420
world = scene.world or bpy.data.worlds.new("World")
scene.world = world
world.use_nodes = True
bg = next(n for n in world.node_tree.nodes if n.type == "BACKGROUND")
bg.inputs["Color"].default_value = (0.32, 0.36, 0.48, 1)
bg.inputs["Strength"].default_value = 0.8
sun = bpy.data.objects.new("sun", bpy.data.lights.new("sun", "SUN"))
sun.data.energy = 3.5
sun.data.color = (1.0, 0.78, 0.55)
sun.rotation_euler = (math.radians(70), 0, math.radians(-135))
scene.collection.objects.link(sun)
ground = bpy.data.meshes.new("ground")
ground.from_pydata([(-40, -40, 0), (40, -40, 0), (40, 40, 0), (-40, 40, 0)], [], [(0, 1, 2, 3)])
g = bpy.data.objects.new("ground", ground)
g.data.materials.append(bkit.material("ground", (0.12, 0.1, 0.08), 1.0))
scene.collection.objects.link(g)

cam = bpy.data.objects.new("cam", bpy.data.cameras.new("cam"))
cam.data.lens = 40
scene.collection.objects.link(cam)
scene.camera = cam

assets = [o for o in bpy.data.objects if o.type == "MESH" and o.name != "ground"]
os.makedirs(out_dir, exist_ok=True)
# (yaw, pitch) of each view, degrees: side on, from above at three-quarters, from below, and against the sun.
VIEWS = {"side": (-90, 2), "above": (-45, 30), "below": (-60, -18), "backlit": (45, 6)}

for a in assets:
    if only and a.name not in only:
        continue
    for o in assets:
        o.hide_render = o is not a
    lo = Vector([min((a.matrix_world @ Vector(c))[k] for c in a.bound_box) for k in range(3)])
    hi = Vector([max((a.matrix_world @ Vector(c))[k] for c in a.bound_box) for k in range(3)])
    mid = (lo + hi) / 2
    reach = max((hi - lo).length, 0.5) * 1.15
    for view, (yaw, pitch) in VIEWS.items():
        y, p = math.radians(yaw), math.radians(pitch)
        d = Vector((math.cos(p) * math.cos(y), math.cos(p) * math.sin(y), math.sin(p)))
        cam.location = mid + d * reach
        if cam.location.z < 0.15:
            cam.location.z = 0.15
        cam.rotation_euler = (mid - cam.location).to_track_quat("-Z", "Y").to_euler()
        scene.render.filepath = os.path.join(out_dir, f"{a.name}--{view}.png")
        bpy.ops.render.render(write_still=True)
print("PREVIEWS " + out_dir)
