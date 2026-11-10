"""Trident 5.56: a bullpup burst rifle, sand polymer shell, the magazine behind the grip.

Run from the repository root:
    blender --background --factory-startup --python tools/weapon/burst.py
or in the Blender session: bkit.run(r"tools/weapon/burst.py").
It writes packages/fps-client/src/viewmodel/assets/burst.glb and tools/weapon/burst.blend.

Gun space and the shared tools are described in gunsmith.py. The rig numbers in
packages/fps-client/src/viewmodel/kit.ts (`burst`) come from the landmarks
below: the rear sight point between the ears at (0, RS_Y, SIGHT_Z), the muzzle
at y = 0.4, the port behind the grip at (0.026, -0.14, 0.031), the bolt's
travel and the magazine's pivot (the magazine sits behind the grip, so the
support hand reaches back for it).
"""
import importlib
import math
import os
import sys

import bmesh

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import gunsmith  # noqa: E402

importlib.reload(gunsmith)
soften = gunsmith.soften

g = gunsmith.Gun("burst")

BORE_Z = 0.034
RAKE = math.tan(math.radians(12))
BUTT, FORE = -0.33, 0.17
MUZZLE = 0.4
TOP = 0.056
RAIL_TOP = TOP + 0.0093
SIGHT_Z = RAIL_TOP + 0.027
RS_Y, FS_Y = -0.105, 0.14
SHELL_W = 0.05
MAG_PIVOT = (0, -0.143, -0.03)
SLIDE_PIVOT = (0, -0.14, 0.031)


def clamp(v):
    return max(0.0, min(1.0, v))


def gy(z):
    """The grip's centre line, raked back toward the bottom."""
    return (z + 0.07) * RAKE


# ---------------------------------------------------------------------------
# Shell: stock, receiver cover, grip and fore-end in one polymer moulding.
# ---------------------------------------------------------------------------
shell_outline = soften([
    (FORE, 0.05, True), (FORE + 0.002, 0.02), (0.164, 0.0), (0.13, -0.007), (0.09, -0.0085),
    (gy(-0.012) + 0.022, -0.0085, True),
    (gy(-0.03) + 0.0205, -0.03), (gy(-0.05) + 0.0195, -0.05), (gy(-0.07) + 0.0205, -0.07), (gy(-0.09) + 0.0195, -0.09),
    (gy(-0.108) + 0.0205, -0.108), (gy(-0.12) + 0.022, -0.1205, True),
    (gy(-0.12) - 0.023, -0.1205, True), (gy(-0.1) - 0.0245, -0.1), (gy(-0.07) - 0.0238, -0.07), (gy(-0.04) - 0.0225, -0.04),
    (gy(-0.024) - 0.027, -0.022), (-0.07, -0.016), (-0.098, -0.015, True),
    (-0.099, -0.034), (-0.104, -0.04, True), (-0.18, -0.04, True), (-0.185, -0.034),
    (-0.187, -0.016), (-0.25, -0.022), (-0.322, -0.042, True),
    (BUTT, TOP, True), (0.03, TOP), (0.1, 0.054),
], 2)


def shell_width(y, z):
    grip = clamp((-0.02 - z) / 0.016) * clamp((y + 0.06) / 0.012)
    fore = clamp((y - 0.085) / 0.03)
    top = clamp((z - 0.04) / 0.016)
    return (1.0 - 0.32 * grip) * (1.0 - 0.12 * fore) * (1.0 - 0.2 * top)


shell = g.slab("shell", shell_outline, SHELL_W, "sand", bevel=0.0045, segments=3, angle=30, taper=shell_width)
# The taper bends the two side faces out of flat. Left as one face each, the cuts
# below read them one way and the bevel another, and a slit opens above the grip.
_sides = bmesh.new()
_sides.from_mesh(shell.data)
bmesh.ops.triangulate(_sides, faces=[f for f in _sides.faces if len(f.verts) > 4])
_sides.to_mesh(shell.data)
_sides.free()
cuts = [g.box("magwell", (0.029, 0.07, 0.07), (0, -0.142, -0.02), "sand", 0)]
cuts.append(g.slab("port_cut", soften([(-0.168, 0.021), (-0.112, 0.021), (-0.112, 0.041), (-0.168, 0.041)], 1), 0.02, "sand", 0, x=0.024))
cuts.append(g.box("charge_slot", (0.012, 0.085, 0.0046), (-0.022, 0.085, 0.04), "sand", 0))
cuts.append(g.cyl("muzzle_hole", 0.013, 0.03, (0, FORE, BORE_Z), "sand", verts=28, bevel=0))
for side in (-1, 1):
    for i in range(4):
        y = 0.098 + i * 0.018
        cuts.append(g.slab(f"fore_vent{side}{i}", soften([(y - 0.005, 0.014, True), (y + 0.001, 0.014, True), (y + 0.006, 0.03, True), (y, 0.03, True)], 2), 0.014, "sand", 0, x=side * 0.022))
    # Long recesses along the stock, and a sling slot through the butt.
    cuts.append(g.slab(f"stock_recess{side}", soften([(-0.31, -0.02), (-0.2, -0.004), (-0.2, 0.012), (-0.31, 0.012)], 2), 0.003, "sand", 0, x=side * SHELL_W / 2))
cuts.append(g.slab("sling_slot", soften([(-0.31, 0.026), (-0.29, 0.026), (-0.29, 0.034), (-0.31, 0.034)], 2), 0.08, "sand", 0))
g.cut(shell, cuts)
body = [shell]
panel = soften([(gy(-0.036) + 0.014, -0.036), (gy(-0.11) + 0.015, -0.11), (gy(-0.11) - 0.019, -0.11), (gy(-0.038) - 0.018, -0.038)], 2)
body.append(g.slab("grip_stipple", panel, SHELL_W + 0.0008, "stipple", bevel=0.0008, segments=2, taper=shell_width))
body.append(g.slab("butt_pad", soften([(BUTT + 0.0005, TOP - 0.001), (-0.322, -0.042), (-0.333, -0.0435), (-0.341, TOP)], 1), 0.046, "rubber", bevel=0.003, segments=3, taper=lambda y, z: 1.0 - 0.2 * clamp((z - 0.04) / 0.016)))
for i in range(6):
    body.append(g.box(f"pad_rib{i}", (0.036, 0.0012, 0.0018), (0, -0.3408 + i * 0.0013, 0.036 - i * 0.014), "rubber", 0.0003))
body.append(g.text("mark_model", "TRIDENT 5.56", (-SHELL_W / 2 - 0.00005, -0.26, 0.026), 0.0062, "polymer", side="-X", depth=0.0004))
body.append(g.text("mark_serial", "TR 77410", (SHELL_W / 2 + 0.00005, -0.26, 0.026), 0.003, "polymer", side="+X", depth=0.0004))

# A guard the whole hand goes through, from the fore-end down to the grip's toe.
guard = g.slab("hand_guard", soften([
    (0.02, -0.006, True), (0.09, -0.006, True), (0.0945, -0.02), (0.081, -0.07), (0.057, -0.108), (0.03, -0.1225),
    (gy(-0.122) + 0.012, -0.1225, True), (gy(-0.03) + 0.012, -0.03, True),
], 2), 0.015, "sand", bevel=0.002)
g.cut(guard, [g.slab("guard_hole", soften([
    (0.03, -0.0145, True), (0.08, -0.0145, True), (0.0838, -0.022), (0.0715, -0.066), (0.0495, -0.1), (0.029, -0.1115),
    (gy(-0.11) + 0.0265, -0.1115), (gy(-0.06) + 0.0265, -0.06), (gy(-0.03) + 0.0275, -0.03),
], 2), 0.04, "sand", 0)])
body.append(guard)
body.append(g.slab("trigger", soften([
    (0.046, -0.0085, True), (0.053, -0.0085, True), (0.0525, -0.018), (0.0495, -0.027), (0.0445, -0.0335), (0.0415, -0.035),
    (0.0402, -0.0335), (0.0435, -0.026), (0.0458, -0.018),
], 2), 0.0066, "nitride", bevel=0.0008))

# Controls: a selector by the thumb (one round or three), the magazine catch behind the well, pins.
for side in (-1, 1):
    x = side * (SHELL_W / 2 + 0.0008)
    body.append(g.cyl(f"selector_hub{side}", 0.0045, 0.0022, (x, -0.04, 0.0), "nitride", axis="X", verts=20, bevel=0.0003))
    body.append(g.slab(f"selector_lever{side}", soften([(-0.042, 0.0028), (-0.022, 0.002), (-0.0205, -0.0015), (-0.038, -0.003)], 1), 0.0022, "nitride", 0.0005, x=x + side * 0.0012))
    for i, (y, z) in enumerate(((-0.085, 0.004), (-0.2, 0.004), (0.06, 0.016))):
        body.append(g.cyl(f"shell_pin{side}{i}", 0.0026, 0.0012, (side * (SHELL_W / 2 * shell_width(y, z) + 0.0003), y, z), "steel", axis="X", verts=14, bevel=0.0002))
body.append(g.text("mark_one", "1", (-SHELL_W / 2 - 0.00005, -0.052, 0.008), 0.0034, "white_paint", side="-X"))
body.append(g.text("mark_three", "3", (-SHELL_W / 2 - 0.00005, -0.028, 0.009), 0.0034, "red_insert", side="-X"))
body.append(g.slab("mag_catch", soften([(-0.196, -0.018), (-0.186, -0.018), (-0.1845, -0.044), (-0.192, -0.048)], 1), 0.016, "polymer", 0.0012))
body.append(g.slab("deflector", soften([(-0.108, 0.02), (-0.099, 0.02), (-0.099, 0.043), (-0.105, 0.043)], 1), 0.005, "polymer", 0.0008, x=SHELL_W / 2 + 0.001))

# ---------------------------------------------------------------------------
# Rail and sights: guard ears at the back, a hooded post at the front.
# ---------------------------------------------------------------------------
body.append(g.rail("rail", -0.2, 0.158, TOP - 0.0006, "anodised"))
body.append(g.box("rs_clamp", (0.024, 0.016, 0.006), (0, RS_Y + 0.001, RAIL_TOP + 0.002), "phosphate", 0.0008))
body.append(g.cyl("rs_clamp_knob", 0.004, 0.005, (0.0145, RS_Y + 0.001, RAIL_TOP + 0.002), "phosphate", axis="X", verts=18, bevel=0.0004))
for side in (-1, 1):
    body.append(g.slab(f"rs_ear{side}", soften([(RS_Y - 0.007, RAIL_TOP + 0.004), (RS_Y + 0.008, RAIL_TOP + 0.004), (RS_Y + 0.004, SIGHT_Z + 0.008, True), (RS_Y - 0.004, SIGHT_Z + 0.008, True)], 1), 0.0028, "phosphate", 0.0006, x=side * 0.0105))
body.append(g.box("fs_clamp", (0.024, 0.014, 0.006), (0, FS_Y, RAIL_TOP + 0.002), "phosphate", 0.0008))
hood = g.slab("fs_hood", soften([(FS_Y - 0.005, RAIL_TOP + 0.004), (FS_Y + 0.005, RAIL_TOP + 0.004), (FS_Y + 0.004, SIGHT_Z + 0.008, True), (FS_Y - 0.004, SIGHT_Z + 0.008, True)], 1), 0.021, "phosphate", 0.0007)
g.cut(hood, [g.slab("fs_window", soften([(FS_Y - 0.01, RAIL_TOP + 0.0075, True), (FS_Y + 0.01, RAIL_TOP + 0.0075, True), (FS_Y + 0.01, SIGHT_Z + 0.0055, True), (FS_Y - 0.01, SIGHT_Z + 0.0055, True)], 2), 0.015, "phosphate", 0)])
body.append(hood)
body.append(g.slab("fs_post", [(FS_Y - 0.0016, RAIL_TOP + 0.007), (FS_Y + 0.0016, RAIL_TOP + 0.007), (FS_Y + 0.0009, SIGHT_Z), (FS_Y - 0.0009, SIGHT_Z)], 0.0022, "phosphate", 0.0003))
body.append(g.cyl("fs_dot", 0.0007, 0.0006, (0, FS_Y - 0.0016, SIGHT_Z - 0.0012), "green_insert", verts=12, bevel=0))

# ---------------------------------------------------------------------------
# Barrel and a three-prong flash hider.
# ---------------------------------------------------------------------------
body.append(g.cyl("barrel", 0.0082, MUZZLE - 0.04 - FORE + 0.02, (0, (FORE - 0.02 + MUZZLE - 0.04) / 2, BORE_Z), "nitride", verts=32, bevel=0.0003))
body.append(g.cyl("barrel_nut", 0.0124, 0.008, (0, FORE + 0.003, BORE_Z), "phosphate", verts=12, bevel=0.0006))
body.append(g.cyl("gas_collar", 0.0105, 0.022, (0, 0.235, BORE_Z), "phosphate", verts=28, bevel=0.0008))
fh = g.lathe("flash_hider", [(0.0, 0.0), (0.0098, 0.0), (0.0108, 0.004), (0.0108, 0.05), (0.0098, 0.054), (0.0, 0.054)], (0, MUZZLE - 0.054, BORE_Z), "phosphate", verts=36, segments=2)
fcuts = [g.cyl("fh_bore", 0.0064, 0.05, (0, MUZZLE - 0.018, BORE_Z), "phosphate", verts=24, bevel=0)]
for i in range(3):
    a = math.radians(30 + 120 * i)
    fcuts.append(g.box(f"fh_slot{i}", (0.0048, 0.04, 0.014), (math.cos(a) * 0.009, MUZZLE - 0.017, BORE_Z + math.sin(a) * 0.009), "phosphate", 0, rot=(0, -a + math.pi / 2, 0)))
g.cut(fh, fcuts)
body.append(fh)

# ---------------------------------------------------------------------------
# Bolt and charging handle (part "slide"): the bolt shows in the port behind the grip.
# ---------------------------------------------------------------------------
bolt = [g.box("bolt_body", (0.009, 0.052, 0.018), (0.0185, -0.14, 0.031), "blued", 0.0012)]
bolt.append(g.box("bolt_face", (0.004, 0.006, 0.012), (0.0212, -0.116, 0.031), "steel", 0.0006))
for i in range(3):
    bolt.append(g.box(f"bolt_groove{i}", (0.0012, 0.032, 0.0012), (0.0231, -0.145, 0.026 + i * 0.0035), "blued", 0.0002))
bolt.append(g.box("charge_stem", (0.008, 0.008, 0.0042), (-0.022, 0.122, 0.04), "phosphate", 0.0006))
bolt.append(g.slab("charge_knob", soften([(0.114, 0.035), (0.13, 0.035), (0.133, 0.04), (0.13, 0.045), (0.114, 0.045), (0.112, 0.04)], 1), 0.008, "polymer", 0.0014, x=-0.0285))
g.part("slide", bolt, SLIDE_PIVOT)

# ---------------------------------------------------------------------------
# Magazine: a curved thirty-round polymer magazine, a round on top.
# ---------------------------------------------------------------------------
mag_body = g.slab("mag_body", soften([
    (-0.112, -0.003, True), (-0.174, -0.003, True), (-0.172, -0.06), (-0.164, -0.115), (-0.152, -0.166, True),
    (-0.094, -0.153, True), (-0.104, -0.108), (-0.1105, -0.06),
], 2), 0.0235, "polymer", bevel=0.0018, segments=3)
mcuts = []
for side in (-1, 1):
    mcuts.append(g.slab(f"mag_window{side}", soften([(-0.146, -0.06), (-0.14, -0.06), (-0.128, -0.14), (-0.134, -0.141)], 1), 0.0016, "polymer", 0, x=side * 0.01175))
    for i in range(5):
        mcuts.append(g.box(f"mag_grip{side}{i}", (0.0014, 0.03, 0.0016), (side * 0.01175, -0.128 + i * 0.0012, -0.125 - i * 0.0066), "polymer", 0, rot=(math.radians(-14), 0, 0)))
g.cut(mag_body, mcuts)
mag = [mag_body]
mag.append(g.slab("mag_base", soften([(-0.156, -0.1635), (-0.0915, -0.149), (-0.09, -0.156, True), (-0.1565, -0.1715, True)], 2), 0.027, "polymer", bevel=0.002, segments=2))
mag.append(g.lathe("round_case", [(0.0, 0.0), (0.0047, 0.0), (0.0047, 0.001), (0.0042, 0.0014), (0.0048, 0.002), (0.0047, 0.036), (0.0032, 0.04), (0.0032, 0.0445), (0.0, 0.0445)], (0, -0.173, 0.0005), "brass", verts=20))
mag.append(g.lathe("round_bullet", [(0.0028, 0.0), (0.0028, 0.004), (0.0018, 0.01), (0.0006, 0.0128), (0.0, 0.013)], (0, -0.1285, 0.0005), "copper", verts=20))
mag.append(g.text("mag_count", "30", (-0.01178, -0.13, -0.15), 0.0042, "engraving", side="-X", rot=math.radians(-14)))
g.part("mag", mag, MAG_PIVOT)

result = g.finish(texture=2048, draft=globals().get("ARGS", {}).get("draft", False))
