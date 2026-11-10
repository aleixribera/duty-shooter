"""Vantage 7.62: a semi-automatic marksman rifle, walnut thumbhole stock, a 2x prism optic.

Run from the repository root:
    blender --background --factory-startup --python tools/weapon/dmr.py
or in the Blender session: bkit.run(r"tools/weapon/dmr.py").
It writes packages/fps-client/src/viewmodel/assets/dmr.glb and tools/weapon/dmr.blend.

Gun space and the shared tools are described in gunsmith.py. The rig numbers in
packages/fps-client/src/viewmodel/kit.ts (`dmr`) come from the landmarks below:
the optic's axis at z = OPTIC_Z (0.0892) with its rear rim at y = OPTIC_REAR (the rig's
sight point: the eye sits on that axis and looks through the tube, which is
open, at the reticle's chevron), the muzzle at y = 0.7, the port at
(0.019, 0.06, 0.03), the bolt's travel and the magazine's pivot.
"""
import importlib
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import gunsmith  # noqa: E402

importlib.reload(gunsmith)
soften = gunsmith.soften

g = gunsmith.Gun("dmr")

BORE_Z = 0.03
REC_REAR, REC_FRONT = -0.09, 0.13
MUZZLE = 0.7
RAIL_Z = 0.047
RAIL_TOP = RAIL_Z + 0.0093
OPTIC_R = 0.021  # the clear tube: short and wide, so the view through it is a wide one
OPTIC_WALL = 0.0034
OPTIC_Z = RAIL_TOP + 0.0085 + OPTIC_R + OPTIC_WALL
OPTIC_REAR, OPTIC_FRONT = -0.03, 0.012
MAG_PIVOT = (0, 0.08, -0.02)
SLIDE_PIVOT = (0, 0.06, 0.03)


def clamp(v):
    return max(0.0, min(1.0, v))


# ---------------------------------------------------------------------------
# Stock: one piece of walnut, thumbhole grip, long fore-end.
# ---------------------------------------------------------------------------
stock_outline = soften([
    (0.345, 0.0125, True), (0.35, 0.004), (0.345, -0.012), (0.3, -0.02), (0.2, -0.024), (0.125, -0.0285),
    (0.03, -0.0295), (-0.008, -0.0295, True),
    (-0.012, -0.045), (-0.02, -0.075), (-0.028, -0.105), (-0.032, -0.119, True),
    (-0.07, -0.119, True), (-0.07, -0.1), (-0.064, -0.07), (-0.062, -0.052),
    (-0.085, -0.05), (-0.14, -0.06), (-0.24, -0.082), (-0.352, -0.104, True),
    (-0.357, 0.032, True), (-0.3, 0.038), (-0.2, 0.036), (-0.13, 0.028), (-0.1, 0.014), (-0.085, 0.0045, True),
    (0.132, 0.0045, True), (0.14, 0.0125, True),
], 2)


def stock_width(y, z):
    fore = clamp((y - 0.13) / 0.05)
    grip = clamp((-0.04 - z) / 0.025) * clamp((y + 0.082) / 0.012)
    butt = clamp((-0.2 - y) / 0.1)
    return 1.0 - 0.12 * fore - 0.26 * grip - 0.06 * butt


STOCK_W = 0.044
stock = g.slab("stock", stock_outline, STOCK_W, "walnut", bevel=0.0065, segments=3, angle=30, taper=stock_width)
scuts = [g.slab("thumbhole", soften([(-0.078, -0.036), (-0.082, -0.004), (-0.105, 0.004), (-0.17, 0.012), (-0.2, -0.01), (-0.19, -0.05), (-0.14, -0.044), (-0.1, -0.038)], 2), 0.08, "walnut_raw", 0)]
scuts.append(g.box("receiver_bed", (0.0362, REC_FRONT - REC_REAR + 0.002, 0.04), (0, (REC_FRONT + REC_REAR) / 2, 0.016), "walnut", 0))
scuts.append(g.cyl("barrel_channel", 0.0125, 0.24, (0, 0.25, BORE_Z), "walnut", verts=28, bevel=0))
scuts.append(g.box("magwell", (0.027, 0.074, 0.06), (0, 0.08, -0.02), "walnut", 0))
for side in (-1, 1):
    # Finger grooves along the fore-end.
    scuts.append(g.slab(f"fore_groove{side}", soften([(0.16, -0.001), (0.32, 0.0), (0.32, -0.006), (0.16, -0.008)], 2), 0.005, "walnut", 0, x=side * STOCK_W * 0.44))
g.cut(stock, scuts)
body = [stock]
body.append(g.slab("grip_checker", soften([(-0.019, -0.05), (-0.03, -0.108), (-0.064, -0.108), (-0.059, -0.056)], 2), STOCK_W + 0.0008, "checkered", bevel=0.0007, segments=2, taper=stock_width))
body.append(g.slab("cheek_pad", soften([(-0.16, 0.026), (-0.3, 0.031), (-0.3, 0.047), (-0.285, 0.051), (-0.175, 0.049), (-0.16, 0.044)], 2), 0.037, "rubber", bevel=0.004, segments=3))
body.append(g.slab("butt_plate", soften([(-0.3565, 0.0325), (-0.3515, -0.1045), (-0.362, -0.1055), (-0.367, 0.034)], 1), 0.04, "rubber", bevel=0.003, segments=3))
for i in range(8):
    body.append(g.box(f"butt_rib{i}", (0.037, 0.0012, 0.0018), (0, -0.3655 + i * 0.00058, 0.02 - i * 0.016), "rubber", 0.0003))
body.append(g.sweep("fore_cap", [(-0.019, -0.014), (0.019, -0.014), (0.0195, 0.0), (0.019, 0.0135), (-0.019, 0.0135), (-0.0195, 0.0)], 0.343, 0.352, "blued", bevel=0.0012))
for name, y, z in (("swivel_front", 0.3, -0.021), ("swivel_rear", -0.3, -0.094)):
    body.append(g.cyl(name + "_stud", 0.0036, 0.009, (0, y, z - 0.003), "steel", axis="Z", verts=14, bevel=0.0004))
    body.append(g.torus(name, 0.0085, 0.0015, (0, y, z - 0.014), "steel", rot=(0, math.pi / 2, 0), verts=20, ring=8))

# ---------------------------------------------------------------------------
# Receiver: milled steel under a rounded dust cover, a rail along the top.
# ---------------------------------------------------------------------------
rec_section = [(-0.017, -0.004), (0.017, -0.004), (0.018, 0.0), (0.018, 0.034), (0.0125, 0.044), (0.005, RAIL_Z), (-0.005, RAIL_Z), (-0.0125, 0.044), (-0.018, 0.034), (-0.018, 0.0)]
receiver = g.sweep("receiver", rec_section, REC_REAR, REC_FRONT, "blued", bevel=0.001)
rcuts = [g.slab("port_cut", soften([(0.02, 0.02), (0.098, 0.02), (0.098, 0.04), (0.02, 0.04)], 1), 0.016, "blued", 0, x=0.018)]
rcuts.append(g.box("handle_slot", (0.006, 0.09, 0.0045), (0.018, 0.0, 0.03), "blued", 0))
for side in (-1, 1):
    rcuts.append(g.slab(f"rec_flute{side}", soften([(-0.075, 0.008), (0.0, 0.008), (0.0, 0.012), (-0.075, 0.012)], 1), 0.002, "blued", 0, x=side * 0.018))
g.cut(receiver, rcuts)
body.append(receiver)
body.append(g.rail("rail", REC_REAR + 0.012, REC_FRONT - 0.02, RAIL_Z - 0.0006, "anodised"))
body.append(g.box("rear_tang", (0.03, 0.012, 0.03), (0, REC_REAR - 0.003, 0.02), "blued", 0.003))
body.append(g.text("mark_model", "VANTAGE 7.62", (-0.01805, 0.05, 0.022), 0.0052, "engraving", side="-X"))
body.append(g.text("mark_serial", "VT 30566", (-0.01805, 0.05, 0.0105), 0.0024, "engraving", side="-X"))
body.append(g.text("mark_cal", "7.62x51", (0.01805, -0.045, 0.02), 0.003, "engraving", side="+X"))
# Safety lever on the right, the magazine catch behind the well, pins.
body.append(g.cyl("safety_hub", 0.0042, 0.0022, (0.0188, -0.062, 0.012), "steel", axis="X", verts=18, bevel=0.0003))
body.append(g.slab("safety_lever", soften([(-0.064, 0.0145), (-0.036, 0.0165), (-0.034, 0.012), (-0.062, 0.0085)], 1), 0.0022, "blued", 0.0005, x=0.0206))
body.append(g.text("mark_safe", "S", (0.01805, -0.028, 0.0215), 0.0026, "white_paint", side="+X"))
body.append(g.text("mark_fire", "F", (0.01805, -0.028, 0.0045), 0.0026, "red_insert", side="+X"))
for i, (y, z) in enumerate(((0.115, 0.004), (-0.01, 0.002), (-0.075, 0.004))):
    body.append(g.cyl(f"pin{i}", 0.0019, 0.0368, (0, y, z), "steel", axis="X", verts=12, bevel=0.0002))

# Trigger guard, trigger, magazine catch.
guard = g.slab("guard", soften([
    (-0.012, -0.028), (0.044, -0.028), (0.045, -0.034), (0.04, -0.05), (0.03, -0.057), (0.006, -0.0575), (-0.006, -0.052), (-0.012, -0.04),
], 2), 0.014, "blued", bevel=0.0016)
g.cut(guard, [g.slab("guard_hole", soften([
    (-0.004, -0.0318, True), (0.0385, -0.0318, True), (0.039, -0.036), (0.035, -0.0475), (0.028, -0.0525), (0.008, -0.053), (-0.0015, -0.0485), (-0.0055, -0.04),
], 2), 0.03, "blued", 0)])
body.append(guard)
body.append(g.slab("trigger", soften([
    (0.014, -0.027, True), (0.021, -0.027, True), (0.0205, -0.034), (0.0178, -0.042), (0.0135, -0.048), (0.011, -0.0492),
    (0.0098, -0.048), (0.0125, -0.041), (0.0146, -0.034),
], 2), 0.0064, "steel", bevel=0.0008))
body.append(g.slab("mag_catch", soften([(0.036, -0.03), (0.0425, -0.03), (0.044, -0.046), (0.039, -0.0485)], 1), 0.011, "blued", 0.001))

# ---------------------------------------------------------------------------
# Barrel, gas block, handguard cover, muzzle brake.
# ---------------------------------------------------------------------------
body.append(g.lathe("barrel", [(0.0, 0.0), (0.0118, 0.0), (0.0118, 0.03), (0.0102, 0.05), (0.0094, 0.24), (0.0086, 0.3), (0.0082, 0.53), (0.0, 0.53)], (0, REC_FRONT, BORE_Z), "blued", verts=32, segments=2))
cover = g.sweep("handguard", [(-0.0185, 0.0128), (0.0185, 0.0128), (0.0185, 0.034), (0.0125, 0.046), (-0.0125, 0.046), (-0.0185, 0.034)], REC_FRONT + 0.004, 0.335, "polymer", bevel=0.0022)
hcuts = [g.cyl("hg_bore", 0.0125, 0.24, (0, 0.24, BORE_Z), "polymer", verts=28, bevel=0)]
for side in (-1, 1):
    for i in range(6):
        y = 0.16 + i * 0.03
        hcuts.append(g.slab(f"hg_vent{side}{i}", soften([(y - 0.009, 0.022, True), (y + 0.009, 0.022, True), (y + 0.012, 0.029, True), (y - 0.006, 0.029, True)], 2), 0.012, "polymer", 0, x=side * 0.0185))
g.cut(cover, hcuts)
body.append(cover)
gas = g.slab("gas_block", soften([(0.36, BORE_Z - 0.0125), (0.392, BORE_Z - 0.0125), (0.392, BORE_Z + 0.021), (0.385, BORE_Z + 0.028), (0.366, BORE_Z + 0.028), (0.36, BORE_Z + 0.021)], 1), 0.024, "phosphate", bevel=0.0016)
body.append(gas)
body.append(g.cyl("gas_tube", 0.0052, 0.06, (0, 0.335, BORE_Z + 0.0185), "phosphate", verts=18, bevel=0.0004))
body.append(g.cyl("gas_plug", 0.0056, 0.008, (0, 0.395, BORE_Z + 0.0185), "steel", verts=6, bevel=0.0004))
body.append(g.slab("front_post_base", soften([(0.366, BORE_Z + 0.027), (0.386, BORE_Z + 0.027), (0.381, BORE_Z + 0.036), (0.371, BORE_Z + 0.036)], 1), 0.008, "phosphate", 0.0006))
brake = g.lathe("brake", [(0.0, 0.0), (0.0108, 0.0), (0.0118, 0.004), (0.0118, 0.058), (0.0104, 0.062), (0.0, 0.062)], (0, MUZZLE - 0.062, BORE_Z), "phosphate", verts=36, segments=2)
bcuts = [g.cyl("brake_bore", 0.0048, 0.07, (0, MUZZLE - 0.03, BORE_Z), "phosphate", verts=20, bevel=0)]
for i in range(5):
    bcuts.append(g.box(f"brake_slot{i}", (0.04, 0.0058, 0.0075), (0, MUZZLE - 0.05 + i * 0.0105, BORE_Z + 0.0022), "phosphate", 0))
g.cut(brake, bcuts)
body.append(brake)
body.append(g.cyl("barrel_band", 0.0105, 0.01, (0, 0.52, BORE_Z), "phosphate", verts=28, bevel=0.0006))

# ---------------------------------------------------------------------------
# Prism optic: a short open tube on a clamp, the reticle's chevron on its axis.
# ---------------------------------------------------------------------------
mid = (OPTIC_REAR + OPTIC_FRONT) / 2
body.append(g.tube("optic_tube", OPTIC_R + OPTIC_WALL, OPTIC_R, OPTIC_FRONT - OPTIC_REAR, (0, mid, OPTIC_Z), "anodised", verts=48, bevel=0.0006))
body.append(g.tube("optic_hood", OPTIC_R + 0.0046, OPTIC_R + 0.0006, 0.012, (0, OPTIC_FRONT + 0.004, OPTIC_Z), "anodised", verts=48, bevel=0.0006))
body.append(g.tube("optic_eyecup", OPTIC_R + 0.0048, OPTIC_R + 0.0004, 0.008, (0, OPTIC_REAR - 0.002, OPTIC_Z), "rubber", verts=48, bevel=0.0012))
body.append(g.box("optic_saddle", (0.026, 0.026, 0.01), (0, mid, OPTIC_Z + OPTIC_R + 0.0036), "anodised", 0.002))
body.append(g.box("optic_base", (0.031, 0.046, 0.0125), (0, mid, RAIL_TOP + 0.0052), "anodised", 0.0014))
for i, y in enumerate((mid - 0.015, mid + 0.015)):
    knob = g.lathe(f"optic_clamp{i}", [(0.0, 0.0), (0.0052, 0.0), (0.006, 0.0012), (0.006, 0.0075), (0.0, 0.0075)], (-0.0155 - 0.0075, y, RAIL_TOP + 0.004), "anodised", axis="X", verts=6)
    body.append(knob)


def turret(name, axis, loc, r, h):
    grow = -1 if axis == "X" and loc[0] < 0 else 1
    t = g.lathe(name, [(0.0, 0.0), (r, 0.0), (r, h - 0.0015), (r - 0.0012, h), (0.0, h)] if grow > 0 else [(0.0, 0.0), (r - 0.0012, 0.0), (r, 0.0015), (r, h), (0.0, h)],
                loc if grow > 0 else (loc[0] - h, loc[1], loc[2]), "anodised", axis=axis, verts=28)
    cuts = []
    for i in range(14):
        a = 2 * math.pi * i / 14
        if axis == "Z":
            cuts.append(g.box(f"{name}_k{i}", (0.0012, 0.0012, h), (loc[0] + math.cos(a) * r, loc[1] + math.sin(a) * r, loc[2] + h / 2 + 0.002), "anodised", 0, rot=(0, 0, a)))
        else:
            cuts.append(g.box(f"{name}_k{i}", (h, 0.0012, 0.0012), (loc[0] + grow * (h / 2 + 0.002), loc[1] + math.cos(a) * r, loc[2] + math.sin(a) * r), "anodised", 0, rot=(a, 0, 0)))
    g.cut(t, cuts)
    return t


body.append(turret("optic_elevation", "Z", (0, mid, OPTIC_Z + OPTIC_R + 0.008), 0.0078, 0.007))
body.append(turret("optic_windage", "X", (OPTIC_R + 0.003, mid, OPTIC_Z), 0.0074, 0.0075))
body.append(turret("optic_light", "X", (-OPTIC_R - 0.003, mid, OPTIC_Z), 0.0088, 0.0095))
body.append(g.text("mark_optic", "2x", (-OPTIC_R - 0.0127, mid, OPTIC_Z), 0.0048, "white_paint", side="-X"))
# The reticle: a post up from the tube's floor, a chevron whose point is the aim, two side bars.
RET = 0.00032
body.append(g.box("reticle_post", (RET, RET, OPTIC_R - 0.0042), (0, mid, OPTIC_Z - 0.0042 - (OPTIC_R - 0.0042) / 2), "red_insert", 0))
for side in (-1, 1):
    body.append(g.box(f"reticle_chevron{side}", (RET, RET, 0.0034), (side * 0.00098, mid, OPTIC_Z - 0.0014), "red_insert", 0, rot=(0, side * math.radians(35), 0)))
    body.append(g.box(f"reticle_bar{side}", (0.0062, RET, RET), (side * (OPTIC_R - 0.0031), mid, OPTIC_Z), "red_insert", 0))

# ---------------------------------------------------------------------------
# Bolt carrier (part "slide"): it shows in the port, its handle rides the slot on the right.
# ---------------------------------------------------------------------------
bolt = [g.box("carrier", (0.008, 0.074, 0.017), (0.0132, 0.059, 0.03), "steel", 0.0012)]
bolt.append(g.box("bolt_face", (0.004, 0.006, 0.011), (0.015, 0.0945, 0.03), "nitride", 0.0006))
for i in range(3):
    bolt.append(g.box(f"carrier_groove{i}", (0.0012, 0.04, 0.0012), (0.0173, 0.05, 0.025 + i * 0.0035), "steel", 0.0002))
bolt.append(g.box("handle_stem", (0.008, 0.007, 0.0042), (0.02, 0.036, 0.03), "steel", 0.0006))
bolt.append(g.lathe("handle_knob", [(0.0, 0.0), (0.0042, 0.0), (0.0052, 0.002), (0.0052, 0.011), (0.004, 0.013), (0.0, 0.013)], (0.0225, 0.036, 0.03), "steel", axis="X", verts=20))
g.part("slide", bolt, SLIDE_PIVOT)

# ---------------------------------------------------------------------------
# Magazine: a steel box for twelve rounds, a 7.62 round on top.
# ---------------------------------------------------------------------------
mag_body = g.slab("mag_body", soften([(0.045, -0.002), (0.115, -0.002), (0.117, -0.05), (0.1205, -0.0935), (0.049, -0.099), (0.0455, -0.05)], 1), 0.0245, "phosphate", bevel=0.0018, segments=3)
g.cut(mag_body, [g.box(f"mag_rib{i}", (0.03, 0.05, 0.0014), (0, 0.083, -0.042 - i * 0.014), "phosphate", 0, rot=(math.radians(-4), 0, 0)) for i in range(4)])
mag = [mag_body]
mag.append(g.slab("mag_base", soften([(0.0465, -0.097), (0.1225, -0.0915), (0.1235, -0.098, True), (0.0465, -0.104, True)], 2), 0.0275, "phosphate", bevel=0.0018, segments=2))
mag.append(g.box("mag_lug", (0.012, 0.004, 0.006), (0, 0.0435, -0.036), "phosphate", 0.0008))
mag.append(g.lathe("round_case", [(0.0, 0.0), (0.0059, 0.0), (0.0059, 0.0012), (0.0052, 0.0018), (0.006, 0.0026), (0.006, 0.039), (0.0055, 0.043), (0.0044, 0.046), (0.0044, 0.051), (0.0, 0.051)], (0, 0.047, 0.0), "brass", verts=22))
mag.append(g.lathe("round_bullet", [(0.0039, 0.0), (0.0039, 0.006), (0.0032, 0.011), (0.0016, 0.015), (0.0, 0.016)], (0, 0.098, 0.0), "copper", verts=22))
mag.append(g.text("mag_count", "12", (-0.01228, 0.082, -0.075), 0.0048, "engraving", side="-X"))
g.part("mag", mag, MAG_PIVOT)

result = g.finish(texture=2048, draft=globals().get("ARGS", {}).get("draft", False))
