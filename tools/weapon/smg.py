"""Wasp 9: a compact 9 mm submachine gun, magazine through the pistol grip, collapsed wire stock.

Run from the repository root:
    blender --background --factory-startup --python tools/weapon/smg.py
or in the Blender session: bkit.run(r"tools/weapon/smg.py").
It writes packages/fps-client/src/viewmodel/assets/smg.glb and tools/weapon/smg.blend.

Gun space and the shared tools are described in gunsmith.py. The rig numbers in
packages/fps-client/src/viewmodel/kit.ts (`smg`) come from the landmarks below:
the rear sight point between the ears at (0, -0.045, 0.06), the muzzle at y = 0.252, the
port at (0.016, 0.062, 0.017), the bolt's travel, the magazine's pivot and the
spots where the hands go (grip, under the handguard, the magazine's base).
"""
import importlib
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import gunsmith  # noqa: E402

importlib.reload(gunsmith)
soften = gunsmith.soften

g = gunsmith.Gun("smg")

BORE_Z = 0.012
SIGHT_Z = 0.06
RAKE = math.tan(math.radians(14))
REAR, FRONT = -0.072, 0.098  # the receiver
HG_FRONT = 0.205  # the handguard
MUZZLE = 0.252
RAIL_Z = 0.034
RAIL_TOP = RAIL_Z + 0.0093


def grip_y(z):
    """The grip's centre line, raked back toward the bottom."""
    return 0.004 + (z + 0.07) * RAKE


# ---------------------------------------------------------------------------
# Upper receiver: machined aluminium with a full-length rail, port and charging slot.
# ---------------------------------------------------------------------------
upper_section = [(-0.015, 0.0), (0.015, 0.0), (0.015, 0.03), (0.012, RAIL_Z), (-0.012, RAIL_Z), (-0.015, 0.03)]


upper = g.sweep("upper", upper_section, REAR, FRONT, "anodised", bevel=0.0009)
ucuts = []
# Ejection port on the right, the bolt shows through it.
ucuts.append(g.slab("port_cut", soften([(0.04, 0.006), (0.086, 0.006), (0.086, 0.027), (0.04, 0.027)], 1), 0.016, "anodised", 0, x=0.016))
# Charging slot along the left and its rear notch.
ucuts.append(g.box("charge_slot", (0.006, 0.07, 0.0042), (-0.0155, 0.052, 0.022), "anodised", 0))
ucuts.append(g.box("charge_notch", (0.006, 0.006, 0.009), (-0.0155, 0.02, 0.024), "anodised", 0))
# Lightening flutes along both sides under the rail.
for side in (-1, 1):
    ucuts.append(g.slab(f"flute{side}", soften([(-0.06, 0.029), (0.03 if side > 0 else 0.012, 0.029), (0.03 if side > 0 else 0.012, 0.031), (-0.06, 0.031)], 1), 0.0024, "anodised", 0, x=side * 0.0155))
g.cut(upper, ucuts)
body = [upper]
body.append(g.rail("rail", REAR + 0.004, HG_FRONT - 0.002, RAIL_Z, "anodised"))
# Port deflector behind the port, and the forward assist style bump on the right.
body.append(g.slab("deflector", soften([(0.03, 0.0), (0.04, 0.0), (0.04, 0.03), (0.034, 0.03)], 1), 0.004, "anodised", 0.0008, x=0.0162))
# Takedown pins through the receiver, both ends.
for name, y, z in (("pin_front", 0.09, 0.006), ("pin_rear", -0.062, 0.006)):
    body.append(g.cyl(name, 0.0022, 0.0315, (0, y, z), "steel", axis="X", verts=16, bevel=0.0003))
body.append(g.text("mark_model", "WASP 9", (-0.0151, -0.012, 0.014), 0.0052, "engraving", side="-X"))
body.append(g.text("mark_cal", "9x19mm", (0.0151, 0.0, 0.016), 0.0032, "engraving", side="+X"))

# Charging handle: a folding knob riding the left slot.
body.append(g.box("charge_slider", (0.004, 0.012, 0.0038), (-0.0145, 0.074, 0.022), "phosphate", 0.0005))
body.append(g.slab("charge_knob", soften([(0.068, 0.017), (0.082, 0.017), (0.085, 0.022), (0.082, 0.027), (0.068, 0.027), (0.066, 0.022)], 1), 0.009, "polymer", 0.0014, x=-0.0215))
body.append(g.cyl("charge_hinge", 0.0018, 0.012, (-0.0185, 0.075, 0.022), "steel", axis="Y", verts=12, bevel=0.0002))

# ---------------------------------------------------------------------------
# Handguard: a slim octagonal tube with slots, a hand stop at the front.
# ---------------------------------------------------------------------------
hg_section = [(-0.018, -0.021), (-0.0135, -0.026), (0.0135, -0.026), (0.018, -0.021), (0.018, 0.029), (0.0145, RAIL_Z), (-0.0145, RAIL_Z), (-0.018, 0.029)]
hand = g.sweep("handguard", hg_section, FRONT - 0.002, HG_FRONT, "anodised", bevel=0.0009)
hcuts = [g.cyl("hg_bore", 0.0112, 0.03, (0, HG_FRONT, BORE_Z), "anodised", verts=32, bevel=0)]
for side in (-1, 1):
    for i, y in enumerate((0.124, 0.168)):
        hcuts.append(g.slab(f"mlok{side}{i}", soften([(y - 0.016, 0.0005, True), (y + 0.016, 0.0005, True), (y + 0.016, 0.0075, True), (y - 0.016, 0.0075, True)], 2), 0.006, "anodised", 0, x=side * 0.018))
    for i, y in enumerate((0.112, 0.14, 0.168, 0.193)):
        hcuts.append(g.cyl(f"vent{side}{i}", 0.0032, 0.008, (side * 0.018, y, 0.019), "anodised", axis="X", verts=16, bevel=0))
for i, y in enumerate((0.124, 0.168)):
    hcuts.append(g.plan(f"mlok_bottom{i}", soften([(-0.0035, y - 0.016, True), (0.0035, y - 0.016, True), (0.0035, y + 0.016, True), (-0.0035, y + 0.016, True)], 2), 0.008, "anodised", 0, z=-0.026))
g.cut(hand, hcuts)
body.append(hand)
body.append(g.slab("hand_stop", soften([(0.184, -0.024), (0.203, -0.024), (0.201, -0.031), (0.193, -0.041, True), (0.188, -0.041, True), (0.186, -0.031)], 2), 0.016, "polymer", 0.002, segments=3))
for side in (-1, 1):
    body.append(g.cyl(f"hg_screw{side}", 0.0022, 0.0012, (side * 0.0183, 0.104, 0.006), "steel", axis="X", verts=14, bevel=0.0002))

# Barrel and a three-prong flash hider.
body.append(g.cyl("barrel", 0.0074, 0.09, (0, 0.18, BORE_Z), "nitride", verts=32, bevel=0.0003))
fh = g.lathe("flash_hider", [(0.0, 0.0), (0.0098, 0.0), (0.0102, 0.003), (0.0102, 0.024), (0.0094, 0.0262), (0.0, 0.0262)], (0, 0.226, BORE_Z), "phosphate", verts=36, segments=2)
fcuts = [g.cyl("fh_bore", 0.0062, 0.03, (0, MUZZLE, BORE_Z), "phosphate", verts=24, bevel=0)]
for i in range(3):
    a = math.radians(90 + 120 * i)
    fcuts.append(g.box(f"fh_slot{i}", (0.004, 0.019, 0.012), (math.cos(a) * 0.009, MUZZLE - 0.008, BORE_Z + math.sin(a) * 0.009), "phosphate", 0, rot=(0, -a + math.pi / 2, 0)))
g.cut(fh, fcuts)
body.append(fh)
body.append(g.cyl("barrel_nut", 0.0118, 0.006, (0, HG_FRONT - 0.001, BORE_Z), "phosphate", verts=32, bevel=0.0005))

# ---------------------------------------------------------------------------
# Sights: two guard ears at the back frame a hooded post at the front (no aperture ring).
# ---------------------------------------------------------------------------
rs_y = -0.045
body.append(g.box("rs_clamp", (0.024, 0.016, 0.006), (0, rs_y + 0.001, RAIL_TOP + 0.002), "phosphate", 0.0008))
body.append(g.cyl("rs_clamp_knob", 0.004, 0.005, (0.0145, rs_y + 0.001, RAIL_TOP + 0.002), "phosphate", axis="X", verts=18, bevel=0.0004))
for side in (-1, 1):
    body.append(g.slab(f"rs_ear{side}", soften([(rs_y - 0.007, RAIL_TOP + 0.004), (rs_y + 0.008, RAIL_TOP + 0.004), (rs_y + 0.004, SIGHT_Z + 0.008, True), (rs_y - 0.004, SIGHT_Z + 0.008, True)], 1), 0.0028, "phosphate", 0.0006, x=side * 0.0105))
fs_y = 0.19
body.append(g.box("fs_clamp", (0.024, 0.014, 0.006), (0, fs_y, RAIL_TOP + 0.002), "phosphate", 0.0008))
hood = g.slab("fs_hood", soften([(fs_y - 0.005, RAIL_TOP + 0.004), (fs_y + 0.005, RAIL_TOP + 0.004), (fs_y + 0.004, SIGHT_Z + 0.008, True), (fs_y - 0.004, SIGHT_Z + 0.008, True)], 1), 0.021, "phosphate", 0.0007)
g.cut(hood, [g.slab("fs_window", soften([(fs_y - 0.01, RAIL_TOP + 0.0075, True), (fs_y + 0.01, RAIL_TOP + 0.0075, True), (fs_y + 0.01, SIGHT_Z + 0.0055, True), (fs_y - 0.01, SIGHT_Z + 0.0055, True)], 2), 0.015, "phosphate", 0)])
body.append(hood)
body.append(g.slab("fs_post", [(fs_y - 0.0016, RAIL_TOP + 0.007), (fs_y + 0.0016, RAIL_TOP + 0.007), (fs_y + 0.0009, SIGHT_Z), (fs_y - 0.0009, SIGHT_Z)], 0.0022, "phosphate", 0.0003))
body.append(g.cyl("fs_dot", 0.0007, 0.0006, (0, fs_y - 0.0016, SIGHT_Z - 0.0012), "green_insert", verts=12, bevel=0))

# ---------------------------------------------------------------------------
# Lower receiver and grip: one polymer moulding, the magazine runs through the grip.
# ---------------------------------------------------------------------------
lower_outline = soften([
    (REAR, 0.0012, True), (FRONT + 0.001, 0.0012, True), (FRONT + 0.001, -0.012), (FRONT - 0.005, -0.0205), (0.088, -0.022),
    (grip_y(-0.022) + 0.021, -0.022, True),
    (grip_y(-0.036) + 0.0215, -0.036), (grip_y(-0.05) + 0.0195, -0.05), (grip_y(-0.064) + 0.0218, -0.064),
    (grip_y(-0.078) + 0.0196, -0.078), (grip_y(-0.092) + 0.0218, -0.092), (grip_y(-0.106) + 0.02, -0.106),
    (grip_y(-0.118) + 0.0225, -0.118), (grip_y(-0.124) + 0.021, -0.1245, True),
    (grip_y(-0.124) - 0.022, -0.1245, True), (grip_y(-0.118) - 0.0235, -0.118),
    (grip_y(-0.09) - 0.0245, -0.09), (grip_y(-0.05) - 0.0225, -0.05), (grip_y(-0.03) - 0.021, -0.03),
    (grip_y(-0.022) - 0.026, -0.0205), (-0.05, -0.019), (REAR + 0.004, -0.017), (REAR, -0.012),
], 2)


def lower_width(y, z):
    # The grip swells below the receiver and narrows toward the front strap.
    t = min(1.0, max(0.0, (-0.024 - z) / 0.016))
    front = min(1.0, max(0.0, (y - grip_y(z) - 0.008) / 0.014)) * t
    return (1.0 + 0.08 * t) * (1.0 - 0.12 * front)


lower = g.slab("lower", lower_outline, 0.031, "polymer", bevel=0.0035, segments=4, angle=30, taper=lower_width)
lcuts = [g.slab("magwell", [
    (grip_y(-0.13) + 0.0175, -0.132), (grip_y(-0.13) - 0.0185, -0.132), (grip_y(-0.112) - 0.0175, -0.112), (grip_y(-0.112) + 0.0165, -0.112),
], 0.0255, "polymer", 0)]
# Rod channels for the stock along both sides.
for side in (-1, 1):
    lcuts.append(g.cyl(f"rod_channel{side}", 0.0046, 0.12, (side * 0.0185, -0.015, -0.009), "polymer", verts=20, bevel=0))
g.cut(lower, lcuts)
body.append(lower)

# Stippled grip panels, both sides and the back strap.
panel = soften([
    (grip_y(-0.032) + 0.014, -0.032), (grip_y(-0.11) + 0.015, -0.11), (grip_y(-0.11) - 0.019, -0.11), (grip_y(-0.034) - 0.019, -0.034),
], 2)
body.append(g.slab("grip_stipple", panel, 0.031 + 0.0008, "stipple", bevel=0.0008, segments=2, taper=lower_width))
back = [(grip_y(-0.04) - 0.025, -0.04), (grip_y(-0.04) - 0.017, -0.04), (grip_y(-0.112) - 0.019, -0.112), (grip_y(-0.112) - 0.0265, -0.112)]
body.append(g.slab("back_stipple", back, 0.024, "stipple", bevel=0.003))

# Trigger guard, squared and undercut, and the trigger.
tg = g.slab("trigger_guard", soften([
    (grip_y(-0.022) + 0.016, -0.02), (0.09, -0.02), (0.094, -0.026), (0.093, -0.045), (0.087, -0.052),
    (grip_y(-0.05) + 0.03, -0.052), (grip_y(-0.046) + 0.019, -0.046),
], 2), 0.012, "polymer", bevel=0.0018)
g.cut(tg, [g.slab("tg_hole", soften([
    (grip_y(-0.024) + 0.024, -0.0235, True), (0.086, -0.0235, True), (0.0875, -0.028), (0.087, -0.042), (0.083, -0.0465),
    (grip_y(-0.046) + 0.03, -0.0465), (grip_y(-0.04) + 0.022, -0.04),
], 2), 0.03, "polymer", 0)])
body.append(tg)
trigger = g.slab("trigger", soften([
    (0.054, -0.019, True), (0.061, -0.019, True), (0.0605, -0.026), (0.0575, -0.035), (0.0525, -0.0415), (0.0495, -0.043),
    (0.0482, -0.0415), (0.0515, -0.034), (0.0538, -0.026),
], 2), 0.0062, "nitride", bevel=0.0008)
body.append(trigger)
for i in range(4):
    body.append(g.box(f"trigger_rib{i}", (0.0064, 0.0008, 0.001), (0, 0.0535 - i * 0.0011, -0.029 - i * 0.0028), "nitride", 0.0001, rot=(math.radians(-40), 0, 0)))

# Ambidextrous selector, magazine release, bolt release, pins.
for side in (-1, 1):
    x = side * 0.0168
    body.append(g.cyl(f"selector_hub{side}", 0.0042, 0.0022, (x, -0.034, -0.009), "nitride", axis="X", verts=20, bevel=0.0003))
    body.append(g.slab(f"selector_lever{side}", soften([(-0.036, -0.0065), (-0.016, -0.0072), (-0.0145, -0.0105), (-0.032, -0.0118)], 1), 0.0022, "nitride", 0.0005, x=x + side * 0.0012))
for side in (-1, 1):
    body.append(g.cyl(f"pin_trigger{side}", 0.0016, 0.0012, (side * 0.0158, 0.057, -0.008), "steel", axis="X", verts=12, bevel=0.0002))
    body.append(g.cyl(f"pin_hammer{side}", 0.0016, 0.0012, (side * 0.0158, 0.07, -0.006), "steel", axis="X", verts=12, bevel=0.0002))
body.append(g.cyl("mag_release", 0.0042, 0.004, (-0.0165, grip_y(-0.026) + 0.026, -0.03), "polymer", axis="X", verts=20, bevel=0.0007))
body.append(g.slab("bolt_release", soften([(0.0, -0.002), (0.014, -0.002), (0.016, -0.0065), (0.002, -0.008)], 1), 0.002, "nitride", 0.0005, x=-0.0168))
body.append(g.text("mark_safe", "S", (-0.01575, -0.046, -0.003), 0.0028, "white_paint", side="-X"))
body.append(g.text("mark_fire", "F", (-0.01575, -0.022, -0.003), 0.0028, "red_insert", side="-X"))
body.append(g.text("mark_serial", "WSP 20931", (-0.0157, 0.072, -0.013), 0.0023, "polymer", side="-X", depth=0.0003))
body.append(g.cyl("qd_socket", 0.0055, 0.0024, (0.0165, -0.06, -0.008), "steel", axis="X", verts=24, bevel=0.0004))

# ---------------------------------------------------------------------------
# Stock: a wire stock collapsed against the receiver, rubber butt pad.
# ---------------------------------------------------------------------------
for side in (-1, 1):
    body.append(g.cyl(f"stock_rod{side}", 0.0039, 0.13, (side * 0.0185, -0.024, -0.009), "blued", verts=20, bevel=0.0003))
    body.append(g.box(f"rod_guide{side}", (0.0045, 0.012, 0.011), (side * 0.0172, 0.035, -0.009), "nitride", 0.0012))
# The butt: a moulded frame closing the back of the receiver below the sight line, deeper at heel and toe.
butt = g.slab("butt", soften([
    (-0.0723, 0.012), (-0.0723, -0.016), (-0.079, -0.03), (-0.08, -0.05), (-0.088, -0.058, True),
    (-0.0915, -0.058, True), (-0.0915, 0.012, True), (-0.086, 0.015), (-0.078, 0.015),
], 2), 0.044, "polymer", bevel=0.003, segments=3, taper=lambda y, z: 1.0 - 0.12 * max(0.0, min(1.0, (-0.075 - y) / 0.015)))
g.cut(butt, [g.slab("butt_window", soften([(-0.06, -0.046, True), (-0.06, 0.002, True), (-0.11, 0.002, True), (-0.11, -0.046, True)], 2), 0.03, "polymer", 0)])
body.append(butt)
body.append(g.slab("butt_pad", soften([(-0.0975, 0.011), (-0.0905, 0.012), (-0.0905, -0.0575), (-0.0975, -0.0565)], 2), 0.041, "rubber", bevel=0.0022, segments=3))
for i in range(5):
    body.append(g.box(f"pad_rib{i}", (0.038, 0.0012, 0.0016), (0, -0.0979, 0.002 - i * 0.012), "rubber", 0.0003))

# ---------------------------------------------------------------------------
# Bolt: seen through the port, it cycles back on every shot (part "slide").
# ---------------------------------------------------------------------------
bolt = [g.box("bolt_body", (0.009, 0.05, 0.02), (0.0095, 0.063, 0.0165), "blued", 0.0012)]
bolt.append(g.box("bolt_face", (0.004, 0.006, 0.012), (0.0125, 0.0875, 0.0165), "steel", 0.0006))
bolt.append(g.slab("extractor", soften([(0.074, 0.0225), (0.089, 0.0225), (0.089, 0.0262), (0.074, 0.0262)], 1), 0.0016, "steel", 0.0003, x=0.0142))
for i in range(3):
    bolt.append(g.box(f"bolt_groove{i}", (0.0012, 0.03, 0.0012), (0.0141, 0.058, 0.0105 + i * 0.0035), "blued", 0.0002))
g.part("slide", bolt, (0, 0.063, 0.0165))

# ---------------------------------------------------------------------------
# Magazine: a steel double-stack box raked with the grip, polymer base, a round on top.
# ---------------------------------------------------------------------------
MAG_PIVOT = (0, grip_y(-0.03), -0.03)


def mag_y(z):
    return grip_y(z)


mag_body = g.slab("mag_body", [
    (mag_y(-0.004) + 0.016, -0.004), (mag_y(-0.004) - 0.0155, -0.004),
    (mag_y(-0.13) - 0.0155, -0.13), (mag_y(-0.13) + 0.016, -0.13),
], 0.0218, "phosphate", bevel=0.0018, segments=3)
g.cut(mag_body, [g.cyl(f"witness{i}", 0.0017, 0.004, (0, mag_y(-0.04 - i * 0.015) - 0.0155, -0.04 - i * 0.015), "phosphate", axis="Y", verts=12, bevel=0) for i in range(6)])
mag_parts = [mag_body]
for side in (-1, 1):
    mag_parts.append(g.slab(f"mag_rib{side}", soften([
        (mag_y(-0.03) + 0.004, -0.03), (mag_y(-0.03) + 0.008, -0.03), (mag_y(-0.12) + 0.008, -0.12), (mag_y(-0.12) + 0.004, -0.12),
    ], 1), 0.0016, "phosphate", 0.0004, x=side * 0.0112))
mag_parts.append(g.slab("mag_base", soften([
    (mag_y(-0.131) + 0.0185, -0.1295), (mag_y(-0.133) + 0.021, -0.1335), (mag_y(-0.139) + 0.019, -0.1395, True),
    (mag_y(-0.139) - 0.02, -0.1395, True), (mag_y(-0.133) - 0.0215, -0.1335), (mag_y(-0.131) - 0.0185, -0.1295),
], 2), 0.0272, "polymer", bevel=0.0022, segments=3))
mag_parts.append(g.box("mag_lip", (0.0185, 0.022, 0.0016), (0, mag_y(-0.004) - 0.003, -0.0035), "phosphate", 0.0004))
case_y = mag_y(0.0) - 0.002
mag_parts.append(g.lathe("round_case", [(0.0, 0.0), (0.0045, 0.0), (0.0045, 0.0012), (0.004, 0.0016), (0.0048, 0.0022), (0.0049, 0.019), (0.0, 0.019)], (0, case_y - 0.01, -0.0005), "brass", verts=24))
mag_parts.append(g.lathe("round_bullet", [(0.0045, 0.0), (0.0045, 0.004), (0.0038, 0.008), (0.0018, 0.0108), (0.0, 0.0112)], (0, case_y + 0.009, -0.0005), "copper", verts=24))
mag_parts.append(g.text("mag_count", "30", (-0.0109 - 0.00005, mag_y(-0.115) - 0.002, -0.115), 0.0042, "engraving", side="-X"))
g.part("mag", mag_parts, MAG_PIVOT)

result = g.finish(texture=2048, draft=globals().get("ARGS", {}).get("draft", False))
