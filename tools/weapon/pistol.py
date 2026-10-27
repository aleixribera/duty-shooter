"""Warden 9: a striker-fired 9 mm service pistol, polymer frame and nitrided slide.

Run from the repository root:
    blender --background --factory-startup --python tools/weapon/pistol.py
or in the Blender session: bkit.run(r"tools/weapon/pistol.py").
It writes packages/fps-client/src/viewmodel/assets/pistol.glb and tools/weapon/pistol.blend.

Gun space and the shared tools are described in gunsmith.py. The rig numbers in
packages/fps-client/src/viewmodel/kit.ts (`pistol`) come from the landmarks
below: the slide's pivot and travel, the magazine's pivot, the rear sight's top
at (0, -0.045, 0.039), the muzzle at y = 0.14 and the port at (0.013, 0.03, 0.024).
"""
import importlib
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import gunsmith  # noqa: E402

importlib.reload(gunsmith)
soften = gunsmith.soften

g = gunsmith.Gun("pistol")

RAKE = math.tan(math.radians(10))  # the grip's backward lean
SLIDE_W = 0.0255
SLIDE_TOP = 0.03
SLIDE_REAR, SLIDE_FRONT = -0.052, 0.136
BORE_Z = 0.016


def front_strap(z):
    return 0.012 + (z + 0.016) * RAKE


def back_strap(z):
    return -0.045 + (z + 0.016) * RAKE


# ---------------------------------------------------------------------------
# Slide: a chamfered-top block with serrations, port, sights and markings.
# ---------------------------------------------------------------------------
w = SLIDE_W / 2
slide_section = [(-w, 0.0006), (w, 0.0006), (w, 0.0235), (w - 0.0042, SLIDE_TOP), (-w + 0.0042, SLIDE_TOP), (-w, 0.0235)]


def slide_nose(v):
    # The front face leans back toward the top, and the lower front is relieved like a duty pistol's.
    if v.co.y > SLIDE_FRONT - 1e-4:
        v.co.y -= max(0.0, v.co.z - 0.012) * 0.22


slide = g.sweep("slide_body", slide_section, SLIDE_REAR, SLIDE_FRONT, "nitride", bevel=0.0009, shape=slide_nose)
cuts = []
# Rear and front cocking serrations, raked forward, on both sides.
for side in (-1, 1):
    for i in range(8):
        y = SLIDE_REAR + 0.006 + i * 0.0032
        cuts.append(g.box(f"rs{side}{i}", (0.0024, 0.0012, 0.026), (side * (w + 0.0004), y, 0.015), "nitride", 0, rot=(math.radians(-10), 0, 0)))
    for i in range(6):
        y = 0.093 + i * 0.0032
        cuts.append(g.box(f"fs{side}{i}", (0.0024, 0.0012, 0.017), (side * (w + 0.0004), y, 0.0135), "nitride", 0, rot=(math.radians(-10), 0, 0)))
# Ejection port, on the right, open through the top.
cuts.append(g.box("port_cut", (0.0135, 0.032, 0.02), (0.0098, 0.034, 0.026), "nitride", 0))
# Bore and recoil spring guide in the muzzle face.
cuts.append(g.cyl("bore_cut", 0.0071, 0.012, (0, SLIDE_FRONT, BORE_Z), "nitride", verts=28, bevel=0))
cuts.append(g.cyl("guide_cut", 0.0046, 0.012, (0, SLIDE_FRONT, 0.0055), "nitride", verts=20, bevel=0))
# A lightening window on each side ahead of the port, and the top slot for the sight dovetails.
for side in (-1, 1):
    cuts.append(g.slab(f"window{side}", soften([(0.064, 0.026), (0.086, 0.026), (0.084, 0.0215), (0.066, 0.0215)], 1), 0.004, "nitride", 0, x=side * w))
cuts.append(g.box("rear_dovetail", (0.03, 0.009, 0.003), (0, -0.0445, SLIDE_TOP), "nitride", 0))
cuts.append(g.box("front_dovetail", (0.03, 0.006, 0.003), (0, 0.127, SLIDE_TOP), "nitride", 0))
g.cut(slide, cuts)

slide_parts = [slide]
# The barrel: its hood shows in the port, the crown at the muzzle.
slide_parts.append(g.box("barrel_hood", (0.0115, 0.036, 0.013), (0.0005, 0.033, 0.0225), "nitride", 0.0006))
slide_parts.append(g.box("chamber_flat", (0.009, 0.006, 0.0025), (0.0005, 0.0165, 0.0293), "steel", 0.0004))
slide_parts.append(g.tube("barrel", 0.0069, 0.0046, 0.11, (0, 0.081, BORE_Z), "nitride", verts=32))
slide_parts.append(g.lathe("bore", [(0.0046, 0.0), (0.0046, 0.004), (0.0, 0.0042)], (0, SLIDE_FRONT - 0.006, BORE_Z), "blued", verts=24))
slide_parts.append(g.lathe("guide_rod", [(0.0033, 0.0), (0.0033, 0.008), (0.0026, 0.0088), (0.0, 0.0088)], (0, SLIDE_FRONT - 0.01, 0.0055), "steel", verts=20))
# Extractor and loaded-chamber flat on the right, striker cover plate at the back.
slide_parts.append(g.slab("extractor", soften([(0.006, 0.019), (0.0175, 0.0195), (0.0175, 0.0235), (0.006, 0.0235)], 1), 0.0016, "steel", 0.0003, x=w + 0.0003))
slide_parts.append(g.box("cover_plate", (0.017, 0.0016, 0.019), (0, SLIDE_REAR - 0.0004, 0.0135), "polymer", 0.0005))
slide_parts.append(g.cyl("striker_hole", 0.0018, 0.001, (0, SLIDE_REAR - 0.0012, 0.0175), "blued", verts=12, bevel=0))
# Rear sight: a dovetailed block with a U notch and two white dots.
rear = g.slab("rear_sight", soften([(-0.0505, 0.0285), (-0.04, 0.0285), (-0.0405, 0.0352), (-0.0425, 0.039, True), (-0.0505, 0.039, True)], 1), 0.0205, "nitride", 0.0005)
g.cut(rear, [g.box("notch", (0.0034, 0.02, 0.006), (0, -0.045, 0.039), "nitride", 0)])
slide_parts.append(rear)
for side in (-1, 1):
    slide_parts.append(g.cyl(f"rear_dot{side}", 0.0011, 0.0008, (side * 0.0058, -0.0507, 0.0352), "white_paint", verts=14, bevel=0))
slide_parts.append(g.box("rear_screw", (0.003, 0.003, 0.0004), (0, -0.044, 0.0391), "steel", 0.0002))
# Front sight: a tapered post with a fibre insert facing the shooter.
slide_parts.append(g.slab("front_sight", soften([(0.124, 0.0285), (0.1305, 0.0285), (0.1295, 0.0385, True), (0.1255, 0.0385, True)], 1), 0.0034, "nitride", 0.0004))
slide_parts.append(g.slab("front_base", [(0.1225, 0.0285), (0.1315, 0.0285), (0.131, 0.0315), (0.123, 0.0315)], 0.0064, "nitride", 0.0004))
slide_parts.append(g.cyl("front_insert", 0.0011, 0.0006, (0, 0.1242, 0.0355), "green_insert", verts=14, bevel=0))
# Markings: the model on the left, calibre ahead of the port on the right.
slide_parts.append(g.text("mark_model", "WARDEN 9", (-w - 0.00005, 0.052, 0.0135), 0.0042, "engraving", side="-X"))
slide_parts.append(g.text("mark_cal", "9x19", (-w - 0.00005, 0.01, 0.0135), 0.0034, "engraving", side="-X"))
slide_parts.append(g.text("mark_serial", "WD 04417", (w + 0.00005, 0.072, 0.0115), 0.0028, "engraving", side="+X"))
g.part("slide", slide_parts, (0, 0.04, BORE_Z))

# ---------------------------------------------------------------------------
# Frame: dust cover with an accessory rail, raked grip, trigger guard, controls.
# ---------------------------------------------------------------------------
frame_outline = soften([
    (0.1275, 0.0, True), (0.1295, -0.006), (0.1265, -0.0125), (0.12, -0.0158),
    (0.07, -0.0162), (0.03, -0.0162), (front_strap(-0.016), -0.016),
    (front_strap(-0.032) + 0.0006, -0.032), (front_strap(-0.044) + 0.002, -0.044), (front_strap(-0.056) + 0.0004, -0.056),
    (front_strap(-0.08) + 0.0012, -0.08), (front_strap(-0.104) + 0.0006, -0.104),
    (front_strap(-0.114) + 0.0028, -0.1135), (front_strap(-0.117) + 0.002, -0.1165, True),
    (back_strap(-0.117) - 0.0025, -0.1165, True), (back_strap(-0.112) - 0.0032, -0.112),
    (back_strap(-0.09) - 0.0042, -0.09), (back_strap(-0.06) - 0.0036, -0.06), (back_strap(-0.035) - 0.0006, -0.035),
    (-0.051, -0.022), (-0.061, -0.0135), (-0.0635, -0.0095), (-0.059, -0.0055), (-0.0525, -0.002), (-0.052, 0.0, True),
], 2)


def grip_width(y, z):
    # The grip swells to 30 mm below the frame rails and narrows toward the front strap.
    t = min(1.0, max(0.0, (-0.014 - z) / 0.014)) if y < 0.03 else 0.0
    narrow = 1.0 - 0.1 * min(1.0, max(0.0, (y - front_strap(z) + 0.012) / 0.012)) * t
    return (1.0 + 0.27 * t) * narrow


frame = g.slab("frame", frame_outline, 0.0236, "polymer", bevel=0.0042, segments=4, angle=30, taper=grip_width)
fcuts = []
# Rail grooves along the dust cover and one cross slot.
for side in (-1, 1):
    fcuts.append(g.box(f"rail_groove{side}", (0.0035, 0.07, 0.0028), (side * 0.0125, 0.094, -0.0118), "polymer", 0))
fcuts.append(g.box("rail_slot", (0.03, 0.0042, 0.0045), (0, 0.094, -0.0165), "polymer", 0))
# Magwell mouth at the bottom of the grip.
fcuts.append(g.slab("magwell", [(front_strap(-0.12) - 0.003, -0.122), (back_strap(-0.12) + 0.0065, -0.122), (back_strap(-0.11) + 0.0065, -0.11), (front_strap(-0.11) - 0.003, -0.11)], 0.0205, "polymer", 0))
g.cut(frame, fcuts)
frame_parts = [frame]

# Stippled panels on both grip sides, the front strap and the back strap.
panel = soften([
    (front_strap(-0.026) - 0.004, -0.026), (front_strap(-0.104) - 0.0035, -0.104),
    (back_strap(-0.104) + 0.0015, -0.104), (back_strap(-0.04) + 0.001, -0.04), (back_strap(-0.03) + 0.004, -0.028),
], 2)
frame_parts.append(g.slab("stipple_sides", panel, 0.0236 + 0.0008, "stipple", bevel=0.0007, segments=2, taper=grip_width))
front_panel = [(front_strap(-0.03) - 0.0048, -0.03), (front_strap(-0.03) + 0.0011, -0.03), (front_strap(-0.105) + 0.0011, -0.105), (front_strap(-0.105) - 0.0048, -0.105)]
frame_parts.append(g.slab("stipple_front", front_panel, 0.02, "stipple", bevel=0.0028, taper=grip_width))
back_panel = [(back_strap(-0.05) - 0.0040, -0.05), (back_strap(-0.05) + 0.004, -0.05), (back_strap(-0.104) + 0.004, -0.104), (back_strap(-0.104) - 0.0035, -0.104)]
frame_parts.append(g.slab("stipple_back", back_panel, 0.022, "stipple", bevel=0.0035, taper=grip_width))

# Trigger guard: squared, undercut where it meets the grip, serrated at the front.
guard = g.slab("guard", soften([
    (0.006, -0.0135), (0.065, -0.0135), (0.0705, -0.018), (0.0695, -0.037), (0.065, -0.0445), (0.057, -0.047),
    (0.017, -0.0462), (0.0095, -0.0425), (0.0068, -0.035),
], 2), 0.0118, "polymer", bevel=0.0018, segments=3)
g.cut(guard, [g.slab("guard_hole", soften([
    (0.0145, -0.0163, True), (0.0595, -0.0163, True), (0.0635, -0.0205), (0.0628, -0.0355), (0.0585, -0.0415),
    (0.0175, -0.0415), (0.0128, -0.037), (0.0122, -0.028),
], 2), 0.03, "polymer", 0)] + [g.box(f"guard_serr{i}", (0.014, 0.0012, 0.0011), (0.0, 0.0705, -0.0215 - i * 0.0022), "polymer", 0, rot=(0, 0, 0)) for i in range(7)])
frame_parts.append(guard)

# Trigger with its safety blade.
trigger = g.slab("trigger", soften([
    (0.0345, -0.0125, True), (0.0415, -0.0125, True), (0.0405, -0.02), (0.037, -0.029), (0.0325, -0.0365), (0.0295, -0.0385),
    (0.0278, -0.0372), (0.0302, -0.03), (0.0335, -0.022), (0.0345, -0.0175),
], 2), 0.0062, "polymer", bevel=0.0009)
g.cut(trigger, [g.box("blade_slot", (0.0018, 0.012, 0.03), (0, 0.033, -0.026), "polymer", 0, rot=(math.radians(-28), 0, 0))])
frame_parts.append(trigger)
frame_parts.append(g.slab("safety_blade", soften([(0.0372, -0.016), (0.0392, -0.016), (0.0352, -0.03), (0.0318, -0.0355), (0.0305, -0.0345), (0.0345, -0.027)], 1), 0.0016, "polymer", 0.0003))

# Steel rails and pins: trigger pin, locking block pin, trigger housing pin, both sides.
frame_w = 0.0236 / 2
for name, y, z in (("pin_trigger", 0.039, -0.0085), ("pin_block", 0.058, -0.0075), ("pin_housing", -0.034, -0.0075)):
    frame_parts.append(g.cyl(name, 0.0014, 0.0236 + 0.0005, (0, y, z), "steel", axis="X", verts=14, bevel=0.0002))
# Slide stop lever on the left, takedown lever both sides.
frame_parts.append(g.slab("slide_stop", soften([
    (0.004, -0.0015, True), (0.034, -0.0015, True), (0.034, -0.0055), (0.017, -0.0062), (0.012, -0.0105), (0.006, -0.0108), (0.0035, -0.0065),
], 1), 0.0016, "nitride", 0.0004, x=-frame_w - 0.0008))
for side in (-1, 1):
    frame_parts.append(g.box(f"takedown{side}", (0.0018, 0.0075, 0.0034), (side * (frame_w + 0.0006), 0.051, -0.0025), "nitride", 0.0005))
# Magazine release, both sides, with grooves.
mr = g.slab("mag_release", soften([(0.0045, -0.0175), (0.011, -0.0175), (0.011, -0.0262), (0.0045, -0.0262)], 1), 0.0236 * 1.2 + 0.0025, "polymer", 0.0008, taper=lambda y, z: 1.0)
g.cut(mr, [g.box(f"mr_groove{i}", (0.04, 0.0006, 0.009), (0, 0.0062 + i * 0.0018, -0.0218), "polymer", 0) for i in range(3)])
frame_parts.append(mr)
# Moulded maker's mark on the dust cover, and the steel serial plate ahead of the rail slot.
frame_parts.append(g.text("mark_frame", "WARDEN ARMS", (-frame_w - 0.00005, 0.075, -0.0085), 0.0026, "polymer", side="-X", depth=0.0003))
frame_parts.append(g.box("serial_plate", (0.0244, 0.009, 0.0022), (0, 0.112, -0.0151), "steel", 0.0003))

# ---------------------------------------------------------------------------
# Magazine: steel tube raked with the grip, polymer base, a round on top.
# ---------------------------------------------------------------------------
MAG_PIVOT = (0, -0.012, -0.02)


def mag_y(z):
    return MAG_PIVOT[1] + (z - MAG_PIVOT[2]) * RAKE


mag_body = g.slab("mag_body", [
    (mag_y(-0.0105) + 0.0135, -0.0105), (mag_y(-0.0105) - 0.0145, -0.0105),
    (mag_y(-0.114) - 0.0145, -0.114), (mag_y(-0.114) + 0.0135, -0.114),
], 0.0196, "nitride", bevel=0.0018, segments=3)
g.cut(mag_body, [g.cyl(f"witness{i}", 0.0016, 0.004, (0, mag_y(-0.03 - i * 0.012) - 0.0145, -0.03 - i * 0.012), "nitride", axis="Y", verts=12, bevel=0) for i in range(6)])
mag_parts = [mag_body]
mag_parts.append(g.slab("mag_base", soften([
    (mag_y(-0.1175) + 0.0172, -0.1135), (mag_y(-0.117) + 0.019, -0.1185), (mag_y(-0.122) + 0.016, -0.1218, True),
    (mag_y(-0.122) - 0.019, -0.1218, True), (mag_y(-0.117) - 0.0205, -0.1185), (mag_y(-0.114) - 0.0182, -0.1135),
], 2), 0.0245, "polymer", bevel=0.0022, segments=3))
mag_parts.append(g.box("mag_follower_lip", (0.0175, 0.02, 0.0015), (0, mag_y(-0.01) - 0.004, -0.0098), "nitride", 0.0004))
# The top round: brass case and a copper-jacketed bullet, nose forward.
case_y = mag_y(0.0) - 0.005
mag_parts.append(g.lathe("round_case", [(0.0, 0.0), (0.0045, 0.0), (0.0045, 0.0012), (0.004, 0.0016), (0.0048, 0.0022), (0.0049, 0.019), (0.0, 0.019)], (0, case_y - 0.01, -0.0055), "brass", verts=24))
mag_parts.append(g.lathe("round_bullet", [(0.0045, 0.0), (0.0045, 0.004), (0.0038, 0.008), (0.0018, 0.0108), (0.0, 0.0112)], (0, case_y + 0.009, -0.0055), "copper", verts=24))
mag_parts.append(g.text("mag_count", "17", (-0.0098 - 0.00005, mag_y(-0.06) - 0.004, -0.06), 0.0035, "engraving", side="-X"))
g.part("mag", mag_parts, MAG_PIVOT)

result = g.finish(texture=2048, draft=globals().get("ARGS", {}).get("draft", False))
