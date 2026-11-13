"""Bulwark 5.56: a belt-fed light machine gun, stamped receiver, a hundred linked rounds in a box.

Run from the repository root:
    blender --background --factory-startup --python tools/weapon/lmg.py
or in the Blender session: bkit.run(r"tools/weapon/lmg.py").
It writes packages/fps-client/src/viewmodel/assets/lmg.glb and tools/weapon/lmg.blend.

Gun space and the shared tools are described in gunsmith.py. The rig numbers in
packages/fps-client/src/viewmodel/kit.ts (`lmg`) come from the landmarks below:
the rear sight point between the ears at (0, -0.095, SIGHT_Z), the muzzle at
y = 0.66, the port at (0.026, 0.085, 0.02) and the moving parts. The feed
`cover` hinges up about the X axis through COVER_HINGE; the `mag` is the ammo
box with the end of its belt, laid over the feed tray under the cover (so the
cover opens before the box leaves); the `slide` is the bolt in the port with
its charging handle, which rides a slot on the left at (-0.036, CHARGE_Y, 0.04).
"""
import importlib
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import gunsmith  # noqa: E402

importlib.reload(gunsmith)
soften = gunsmith.soften

g = gunsmith.Gun("lmg")

BORE_Z = 0.03
SIGHT_Z = 0.094
RAKE = math.tan(math.radians(15))
REC_REAR, REC_FRONT = -0.105, 0.2
REC_TOP, REC_BOTTOM = 0.052, -0.012
HG_FRONT = 0.4
MUZZLE = 0.66
COVER_REAR, COVER_FRONT = -0.085, 0.125
COVER_HINGE = (0, COVER_FRONT + 0.003, 0.056)
MAG_PIVOT = (-0.006, 0.136, -0.013)
SLIDE_PIVOT = (0, 0.085, 0.021)
CHARGE_Y = 0.04  # the charging handle, on the left behind the belt: the support hand works it


def grip_y(z):
    """The grip's centre line, raked back toward the bottom."""
    return -0.002 + (z + 0.07) * RAKE


# ---------------------------------------------------------------------------
# Receiver: a stamped steel box with ribs and rivets, the trunnion at its front.
# ---------------------------------------------------------------------------
rec_section = [(-0.024, REC_BOTTOM), (0.024, REC_BOTTOM), (0.025, -0.008), (0.025, 0.048), (0.021, REC_TOP), (-0.021, REC_TOP), (-0.025, 0.048), (-0.025, -0.008)]
receiver = g.sweep("receiver", rec_section, REC_REAR, REC_FRONT, "phosphate", bevel=0.0009)
rcuts = []
# Ejection port low on the right; the charging handle's slot along the left, behind the belt.
rcuts.append(g.slab("port_cut", soften([(0.058, 0.01), (0.112, 0.01), (0.112, 0.031), (0.058, 0.031)], 1), 0.016, "phosphate", 0, x=0.025))
rcuts.append(g.box("charge_slot", (0.006, 0.125, 0.0046), (-0.0255, -0.012, 0.04), "phosphate", 0))
# The feed tray's bed under the cover.
rcuts.append(g.box("tray_bed", (0.036, 0.075, 0.004), (-0.004, 0.108, REC_TOP), "phosphate", 0))
g.cut(receiver, rcuts)
body = [receiver]
for side in (-1, 1):
    # Pressed stiffening ribs along both sides, and the rivets that hold the rails.
    for i, (y0, y1, z) in enumerate(((-0.094, 0.05, 0.004), (-0.094, 0.05, 0.03 if side > 0 else 0.0285))):
        body.append(g.slab(f"rib{side}{i}", soften([(y0, z - 0.0022), (y1, z - 0.0022), (y1 + 0.004, z), (y1, z + 0.0022), (y0, z + 0.0022), (y0 - 0.004, z)], 1), 0.0014, "phosphate", 0.0006, x=side * 0.0254))
    for i, (y, z) in enumerate(((-0.098, 0.044), (-0.098, -0.004), (-0.04, 0.017), (0.02, 0.017), (0.135, -0.004), (0.165, 0.044), (0.165, -0.004))):
        body.append(g.lathe(f"rivet{side}{i}", [(0.0, 0.0), (0.0021, 0.0), (0.0016, 0.0007), (0.0, 0.0009)] if side > 0 else [(0.0, 0.0), (0.0016, 0.0002), (0.0021, 0.0009), (0.0, 0.0009)], (side * 0.025 - (0.0009 if side < 0 else 0), y, z), "steel", axis="X", verts=12))
body.append(g.box("trunnion", (0.054, 0.03, 0.068), (0, REC_FRONT - 0.013, 0.02), "phosphate", 0.0016))
body.append(g.box("backplate", (0.052, 0.008, 0.066), (0, REC_REAR - 0.002, 0.02), "phosphate", 0.0016))
body.append(g.slab("deflector", soften([(0.046, 0.008), (0.057, 0.008), (0.057, 0.034), (0.05, 0.034)], 1), 0.005, "phosphate", 0.0008, x=0.0265))
body.append(g.text("mark_model", "BULWARK 5.56", (-0.02505, -0.022, 0.017), 0.0062, "engraving", side="-X"))
body.append(g.text("mark_serial", "BW 118204", (-0.02505, -0.022, -0.0055), 0.0026, "engraving", side="-X"))
body.append(g.text("mark_cal", "5.56x45 LINKED", (0.02505, -0.02, 0.0145), 0.003, "engraving", side="+X"))
# The feed tray: a steel bed with guides, seen when the cover is up.
body.append(g.box("tray", (0.035, 0.074, 0.0016), (-0.004, 0.108, REC_TOP - 0.0012), "steel", 0.0003))
for y in (0.075, 0.141):
    body.append(g.box(f"tray_guide{y}", (0.03, 0.003, 0.004), (-0.004, y, REC_TOP + 0.0006), "phosphate", 0.0005))

# Rear sight behind the cover: a drum base and two guard ears (no ring).
# The iron sights fold away under an optic: the ears, hood and post are one part, `irons` (ticket 19).
irons = []
rs_y = -0.095
body.append(g.box("rs_base", (0.03, 0.017, 0.012), (0, rs_y, REC_TOP + 0.006), "phosphate", 0.0012))
for side in (-1, 1):
    irons.append(g.slab(f"rs_ear{side}", soften([(rs_y - 0.0075, REC_TOP + 0.01), (rs_y + 0.0075, REC_TOP + 0.01), (rs_y + 0.004, SIGHT_Z + 0.008, True), (rs_y - 0.004, SIGHT_Z + 0.008, True)], 1), 0.003, "phosphate", 0.0006, x=side * 0.0115))
drum = g.lathe("rs_drum", [(0.0, 0.0), (0.006, 0.0), (0.0066, 0.0008), (0.0066, 0.0068), (0.0, 0.0068)], (-0.015 - 0.0068, rs_y, REC_TOP + 0.0065), "phosphate", axis="X", verts=24)
g.cut(drum, [g.box(f"drum_k{i}", (0.006, 0.001, 0.001), (-0.0185, rs_y + math.cos(i * math.pi / 8) * 0.0067, REC_TOP + 0.0065 + math.sin(i * math.pi / 8) * 0.0067), "phosphate", 0, rot=(i * math.pi / 8, 0, 0)) for i in range(16)])
body.append(drum)

# ---------------------------------------------------------------------------
# Feed cover (part "cover"): hinged at the front, latched at the back, a rail on top.
# ---------------------------------------------------------------------------
cover_section = [(-0.0238, REC_TOP + 0.0006), (0.0238, REC_TOP + 0.0006), (0.0248, 0.056), (0.0248, 0.064), (0.019, 0.07), (-0.019, 0.07), (-0.0248, 0.064), (-0.0248, 0.056)]


def cover_ends(v):
    # The front slopes down to the hinge.
    if v.co.y > COVER_FRONT - 1e-4:
        v.co.y -= max(0.0, v.co.z - 0.058) * 1.4


cover = g.sweep("cover_shell", cover_section, COVER_REAR, COVER_FRONT, "phosphate", bevel=0.0011, shape=cover_ends)
# The belt comes in under its left edge; inside, room for the rounds on the tray.
g.cut(cover, [g.box("feed_mouth", (0.04, 0.071, 0.0115), (-0.012, 0.108, REC_TOP + 0.005), "phosphate", 0)])
cover_parts = [cover]
cover_parts.append(g.rail("cover_rail", COVER_REAR + 0.012, COVER_FRONT - 0.03, 0.07, "phosphate"))
cover_parts.append(g.cyl("cover_hinge", 0.0042, 0.05, (0, COVER_HINGE[1], COVER_HINGE[2]), "steel", axis="X", verts=18, bevel=0.0004))
for side in (-1, 1):
    cover_parts.append(g.slab(f"cover_latch{side}", soften([(COVER_REAR - 0.002, 0.054), (COVER_REAR + 0.012, 0.054), (COVER_REAR + 0.012, 0.064), (COVER_REAR + 0.002, 0.066)], 1), 0.0036, "steel", 0.0007, x=side * 0.0252))
cover_parts.append(g.text("mark_cover", "LIFT TO LOAD", (0.0249, 0.03, 0.06), 0.0026, "white_paint", side="+X"))
g.part("cover", cover_parts, COVER_HINGE)

# ---------------------------------------------------------------------------
# Handguard, barrel, gas system, bipod.
# ---------------------------------------------------------------------------
hg_section = [(-0.021, -0.022), (-0.014, -0.03), (0.014, -0.03), (0.021, -0.022), (0.022, 0.03), (0.016, 0.046), (-0.016, 0.046), (-0.022, 0.03)]
hand = g.sweep("handguard", hg_section, REC_FRONT - 0.001, HG_FRONT, "polymer", bevel=0.002)
hcuts = [g.cyl("hg_bore", 0.0135, 0.04, (0, HG_FRONT, BORE_Z), "polymer", verts=32, bevel=0)]
for side in (-1, 1):
    for i in range(5):
        y = 0.228 + i * 0.036
        hcuts.append(g.slab(f"hg_vent{side}{i}", soften([(y - 0.011, 0.016, True), (y + 0.011, 0.016, True), (y + 0.011, 0.023, True), (y - 0.011, 0.023, True)], 2), 0.008, "polymer", 0, x=side * 0.022))
        hcuts.append(g.box(f"hg_groove{side}{i}", (0.003, 0.024, 0.0022), (side * 0.0216, y, -0.006), "polymer", 0))
for i in range(6):
    hcuts.append(g.plan(f"hg_top_vent{i}", soften([(-0.006, 0.222 + i * 0.03 - 0.008, True), (0.006, 0.222 + i * 0.03 - 0.008, True), (0.006, 0.222 + i * 0.03 + 0.008, True), (-0.006, 0.222 + i * 0.03 + 0.008, True)], 2), 0.01, "polymer", 0, z=0.046))
g.cut(hand, hcuts)
body.append(hand)
body.append(g.box("heat_shield", (0.024, 0.19, 0.002), (0, 0.3, 0.0405), "steel", 0.0004))

body.append(g.lathe("barrel", [(0.0, 0.0), (0.0122, 0.0), (0.0122, 0.2), (0.0112, 0.215), (0.0108, 0.25), (0.0098, 0.41), (0.0, 0.41)], (0, REC_FRONT, BORE_Z), "blued", verts=28, segments=2))
body.append(g.cyl("gas_tube", 0.0062, 0.235, (0, REC_FRONT + 0.1175, BORE_Z - 0.023), "phosphate", verts=24, bevel=0.0004))
gas = g.slab("gas_block", soften([(0.412, BORE_Z + 0.0135), (0.45, BORE_Z + 0.0135), (0.45, BORE_Z - 0.026), (0.444, BORE_Z - 0.032), (0.418, BORE_Z - 0.032), (0.412, BORE_Z - 0.026)], 1), 0.028, "phosphate", bevel=0.0016)
body.append(gas)
reg = g.lathe("gas_regulator", [(0.0, 0.0), (0.0072, 0.0), (0.0078, 0.001), (0.0078, 0.011), (0.006, 0.013), (0.0, 0.013)], (0, 0.45, BORE_Z - 0.023), "phosphate", verts=24)
g.cut(reg, [g.box(f"reg_k{i}", (0.0012, 0.009, 0.0012), (math.cos(i * math.pi / 6) * 0.0079, 0.4565, BORE_Z - 0.023 + math.sin(i * math.pi / 6) * 0.0079), "phosphate", 0, rot=(0, -i * math.pi / 6, 0)) for i in range(12)])
body.append(reg)
fh = g.lathe("flash_hider", [(0.0, 0.0), (0.0102, 0.0), (0.0112, 0.004), (0.0112, 0.04), (0.0102, 0.044), (0.0, 0.044)], (0, MUZZLE - 0.044, BORE_Z), "phosphate", verts=36, segments=2)
fcuts = [g.cyl("fh_bore", 0.0056, 0.05, (0, MUZZLE - 0.01, BORE_Z), "phosphate", verts=24, bevel=0)]
for i in range(5):
    a = math.radians(90 + 72 * i)
    fcuts.append(g.box(f"fh_slot{i}", (0.0034, 0.026, 0.012), (math.cos(a) * 0.0098, MUZZLE - 0.019, BORE_Z + math.sin(a) * 0.0098), "phosphate", 0, rot=(0, -a + math.pi / 2, 0)))
g.cut(fh, fcuts)
body.append(fh)

# The carry handle, folded down along the right of the handguard.
body.append(g.cyl("handle_grip", 0.0078, 0.08, (0.0335, 0.262, 0.014), "polymer", verts=20, bevel=0.0012))
body.append(g.pipe("handle_stem", [(0.0, 0.232, 0.05), (0.014, 0.232, 0.05), (0.026, 0.232, 0.04), (0.0335, 0.232, 0.026), (0.0335, 0.232, 0.014)], 0.0034, "phosphate", verts=12))
body.append(g.box("handle_collar", (0.03, 0.016, 0.01), (0, 0.232, 0.05), "phosphate", 0.0012))

# Front sight: a tall guarded post on the gas block.
fs_y = 0.431
body.append(g.slab("fs_tower", soften([(fs_y - 0.013, BORE_Z + 0.0125, True), (fs_y + 0.013, BORE_Z + 0.0125, True), (fs_y + 0.006, SIGHT_Z - 0.014), (fs_y - 0.006, SIGHT_Z - 0.014)], 1), 0.011, "phosphate", 0.0008))
for side in (-1, 1):
    irons.append(g.slab(f"fs_ear{side}", soften([(fs_y - 0.006, SIGHT_Z - 0.016), (fs_y + 0.006, SIGHT_Z - 0.016), (fs_y + 0.004, SIGHT_Z + 0.007, True), (fs_y - 0.004, SIGHT_Z + 0.007, True)], 1), 0.0026, "phosphate", 0.0006, x=side * 0.0078))
irons.append(g.box("fs_bridge", (0.018, 0.011, 0.0035), (0, fs_y, SIGHT_Z - 0.0145), "phosphate", 0.0006))
irons.append(g.slab("fs_post", [(fs_y - 0.0016, SIGHT_Z - 0.014), (fs_y + 0.0016, SIGHT_Z - 0.014), (fs_y + 0.0009, SIGHT_Z), (fs_y - 0.0009, SIGHT_Z)], 0.0022, "phosphate", 0.0003))
irons.append(g.cyl("fs_dot", 0.0007, 0.0006, (0, fs_y - 0.0016, SIGHT_Z - 0.0012), "green_insert", verts=12, bevel=0))
g.part("irons", irons, (0, 0, 0))

# Bipod, folded forward under the barrel.
body.append(g.tube("bipod_yoke", 0.0128, 0.0098, 0.016, (0, 0.47, BORE_Z), "phosphate", verts=32))
body.append(g.box("bipod_head", (0.04, 0.014, 0.012), (0, 0.47, BORE_Z - 0.0165), "phosphate", 0.0016))
for side in (-1, 1):
    x = side * 0.0155
    body.append(g.cyl(f"bipod_leg{side}", 0.0046, 0.15, (x, 0.548, BORE_Z - 0.019), "phosphate", verts=16, bevel=0.0005))
    body.append(g.cyl(f"bipod_inner{side}", 0.0036, 0.03, (x, 0.633, BORE_Z - 0.019), "steel", verts=14, bevel=0.0003))
    body.append(g.box(f"bipod_foot{side}", (0.011, 0.007, 0.016), (x, 0.649, BORE_Z - 0.021), "phosphate", 0.0014))
    body.append(g.tube(f"bipod_collar{side}", 0.0058, 0.0044, 0.008, (x, 0.618, BORE_Z - 0.019), "phosphate", verts=18))

# ---------------------------------------------------------------------------
# Trigger housing and grip, one polymer moulding.
# ---------------------------------------------------------------------------
lower_outline = soften([
    (-0.062, -0.0105, True), (0.082, -0.0105, True), (0.082, -0.02), (0.076, -0.026),
    (grip_y(-0.026) + 0.021, -0.026, True),
    (grip_y(-0.04) + 0.0205, -0.04), (grip_y(-0.056) + 0.019, -0.056), (grip_y(-0.072) + 0.0208, -0.072),
    (grip_y(-0.088) + 0.019, -0.088), (grip_y(-0.104) + 0.0208, -0.104), (grip_y(-0.118) + 0.022, -0.118, True),
    (grip_y(-0.118) - 0.023, -0.118, True), (grip_y(-0.1) - 0.0245, -0.1), (grip_y(-0.07) - 0.0238, -0.07),
    (grip_y(-0.04) - 0.022, -0.04), (grip_y(-0.028) - 0.027, -0.0255), (-0.062, -0.022),
], 2)


def lower_width(y, z):
    t = min(1.0, max(0.0, (-0.028 - z) / 0.016))
    front = min(1.0, max(0.0, (y - grip_y(z) - 0.008) / 0.014)) * t
    return (1.0 - 0.1 * t) * (1.0 - 0.12 * front)


lower = g.slab("lower", lower_outline, 0.036, "polymer", bevel=0.0035, segments=3, angle=30, taper=lower_width)
body.append(lower)
panel = soften([(grip_y(-0.036) + 0.014, -0.036), (grip_y(-0.108) + 0.015, -0.108), (grip_y(-0.108) - 0.019, -0.108), (grip_y(-0.038) - 0.018, -0.038)], 2)
body.append(g.slab("grip_stipple", panel, 0.036 + 0.0008, "stipple", bevel=0.0008, segments=2, taper=lower_width))
tg = g.slab("trigger_guard", soften([
    (grip_y(-0.026) + 0.016, -0.022), (0.08, -0.022), (0.084, -0.028), (0.083, -0.05), (0.077, -0.058),
    (grip_y(-0.056) + 0.03, -0.058), (grip_y(-0.05) + 0.019, -0.05),
], 2), 0.013, "polymer", bevel=0.0018)
g.cut(tg, [g.slab("tg_hole", soften([
    (grip_y(-0.028) + 0.024, -0.0262, True), (0.076, -0.0262, True), (0.0775, -0.03), (0.077, -0.047), (0.073, -0.0525),
    (grip_y(-0.05) + 0.03, -0.0525), (grip_y(-0.044) + 0.022, -0.044),
], 2), 0.03, "polymer", 0)])
body.append(tg)
body.append(g.slab("trigger", soften([
    (0.046, -0.02, True), (0.053, -0.02, True), (0.0525, -0.03), (0.0495, -0.039), (0.0445, -0.0455), (0.0415, -0.047),
    (0.0402, -0.0455), (0.0435, -0.038), (0.0458, -0.03),
], 2), 0.0066, "nitride", bevel=0.0008))
# A cross-bolt safety above the grip, and the housing's pins.
body.append(g.cyl("safety", 0.0036, 0.042, (0, 0.012, -0.0175), "steel", axis="X", verts=18, bevel=0.0005))
body.append(g.cyl("safety_band", 0.0037, 0.0018, (-0.019, 0.012, -0.0175), "red_paint", axis="X", verts=18, bevel=0))
for i, y in enumerate((-0.05, 0.07)):
    body.append(g.cyl(f"housing_pin{i}", 0.0024, 0.038, (0, y, -0.0155), "steel", axis="X", verts=14, bevel=0.0003))

# ---------------------------------------------------------------------------
# Stock: a fixed polymer stock with a lightening window, a hinged shoulder rest and a rubber pad.
# ---------------------------------------------------------------------------
stock = g.slab("stock", soften([
    (REC_REAR - 0.004, 0.05, True), (-0.2, 0.053), (-0.325, 0.053), (-0.34, 0.048, True), (-0.345, -0.07, True), (-0.325, -0.08),
    (-0.29, -0.074), (-0.2, -0.04), (-0.13, -0.016), (REC_REAR - 0.004, -0.012, True),
], 2), 0.04, "polymer", bevel=0.006, segments=3, angle=30)
g.cut(stock, [g.slab("stock_window", soften([(-0.15, 0.03), (-0.3, 0.03), (-0.3, -0.045), (-0.2, -0.016), (-0.15, -0.002)], 2), 0.06, "polymer", 0)])
body.append(stock)
body.append(g.slab("butt_pad", soften([(-0.3395, 0.049), (-0.3445, -0.0705), (-0.3555, -0.0712), (-0.3505, 0.0505)], 1), 0.039, "rubber", bevel=0.003, segments=3))
for i in range(7):
    body.append(g.box(f"pad_rib{i}", (0.036, 0.0012, 0.0018), (0, -0.3536 + i * 0.0006, -0.055 + i * 0.016), "rubber", 0.0003))
body.append(g.slab("shoulder_rest", soften([(-0.262, 0.0555), (-0.342, 0.0555), (-0.342, 0.0595), (-0.262, 0.0595)], 1), 0.03, "phosphate", 0.0012))
body.append(g.cyl("rest_hinge", 0.0032, 0.034, (0, -0.342, 0.056), "steel", axis="X", verts=14, bevel=0.0003))
for side in (-1, 1):
    body.append(g.tube(f"sling_loop{side}", 0.0058, 0.004, 0.003, (side * 0.021, -0.305, 0.036), "steel", axis="X", verts=20))

# ---------------------------------------------------------------------------
# Bolt and charging handle (part "slide"): the bolt shows in the port on the right, the handle rides the left-hand slot.
# ---------------------------------------------------------------------------
bolt = [g.box("bolt_body", (0.009, 0.058, 0.017), (0.0195, 0.085, 0.0205), "blued", 0.0012)]
bolt.append(g.box("bolt_face", (0.004, 0.006, 0.011), (0.0222, 0.1115, 0.0205), "steel", 0.0006))
for i in range(3):
    bolt.append(g.box(f"bolt_groove{i}", (0.0012, 0.034, 0.0012), (0.0241, 0.08, 0.0155 + i * 0.0035), "blued", 0.0002))
bolt.append(g.box("charge_slider", (0.005, 0.016, 0.0042), (-0.0248, CHARGE_Y, 0.04), "phosphate", 0.0005))
bolt.append(g.lathe("charge_knob", [(0.0, 0.0), (0.0046, 0.0), (0.0058, 0.002), (0.0058, 0.0168), (0.005, 0.018), (0.0, 0.018)], (-0.0268 - 0.018, CHARGE_Y, 0.04), "polymer", axis="X", verts=22))
g.part("slide", bolt, SLIDE_PIVOT)

# ---------------------------------------------------------------------------
# Ammo box and belt (part "mag"): an olive steel box under the receiver, its belt up the left side onto the tray.
# ---------------------------------------------------------------------------
BOX_X, BOX_W = -0.006, 0.066
box = g.slab("box", soften([(0.086, -0.0135), (0.186, -0.0135), (0.186, -0.12), (0.18, -0.128), (0.092, -0.128), (0.086, -0.12)], 1), BOX_W, "olive_paint", bevel=0.003, x=BOX_X, segments=2)
bxc = []
for side in (-1, 1):
    for i in range(3):
        bxc.append(g.slab(f"box_press{side}{i}", soften([(0.096 + i * 0.03, -0.034), (0.116 + i * 0.03, -0.034), (0.116 + i * 0.03, -0.112), (0.096 + i * 0.03, -0.112)], 2), 0.0022, "olive_paint", 0, x=BOX_X + side * BOX_W / 2))
g.cut(box, bxc)
mag = [box]
mag.append(g.slab("box_lid", soften([(0.0845, -0.012), (0.1875, -0.012), (0.1875, -0.024), (0.0845, -0.024)], 1), BOX_W + 0.003, "olive_paint", bevel=0.0012, x=BOX_X))
mag.append(g.box("box_latch", (0.014, 0.003, 0.018), (BOX_X, 0.1885, -0.027), "steel", 0.0008))
mag.append(g.box("box_chute", (0.013, 0.066, 0.016), (-0.0325, 0.108, -0.016), "olive_paint", 0.0016))
mag.append(g.text("box_mark", "100 RDS", (BOX_X - BOX_W / 2 - 0.0016, 0.136, -0.066), 0.0085, "yellow_paint", side="-X"))
mag.append(g.text("box_mark2", "5.56 LINKED 4+1", (BOX_X - BOX_W / 2 - 0.0016, 0.136, -0.082), 0.0042, "yellow_paint", side="-X"))
mag.append(g.text("box_mark_r", "100 RDS", (BOX_X + BOX_W / 2 + 0.0016, 0.136, -0.066), 0.0085, "yellow_paint", side="+X"))
ROUND_Y = 0.08
belt = [(-0.0312, -0.0075), (-0.0312, 0.004), (-0.0312, 0.0155), (-0.0312, 0.027), (-0.0312, 0.0385), (-0.0288, 0.0495), (-0.0195, 0.0562), (-0.008, 0.0574)]
for i, (x, z) in enumerate(belt):
    mag.append(g.lathe(f"belt_case{i}", [(0.0, 0.0), (0.0047, 0.0), (0.0047, 0.001), (0.0042, 0.0014), (0.0048, 0.002), (0.0047, 0.036), (0.0032, 0.04), (0.0032, 0.0445), (0.0, 0.0445)], (x, ROUND_Y, z), "brass", verts=14))
    mag.append(g.lathe(f"belt_bullet{i}", [(0.0028, 0.0), (0.0028, 0.004), (0.0018, 0.01), (0.0006, 0.0128), (0.0, 0.013)], (x, ROUND_Y + 0.0445, z), "copper", verts=14))
    mag.append(g.tube(f"belt_link{i}", 0.0056, 0.0046, 0.013, (x, ROUND_Y + 0.02, z), "phosphate", verts=14, bevel=0.0002))
    if i:
        px, pz = belt[i - 1]
        mag.append(g.box(f"belt_tie{i}", (0.0022, 0.007, math.hypot(x - px, z - pz) - 0.006), ((x + px) / 2 - 0.0034 * (1 if i < 6 else 0), ROUND_Y + 0.031, (z + pz) / 2 + (0.0034 if i >= 6 else 0)), "phosphate", 0.0003, rot=(0, math.atan2(x - px, z - pz), 0)))
g.part("mag", mag, MAG_PIVOT)

result = g.finish(texture=2048, draft=globals().get("ARGS", {}).get("draft", False))
