"""Ridgeline: a .308 bolt-action precision rifle, composite stock, fluted barrel and a 4-16x scope.

Run from the repository root:
    blender --background --factory-startup --python tools/weapon/sniper.py
or in the Blender session: bkit.run(r"tools/weapon/sniper.py").
It writes packages/fps-client/src/viewmodel/assets/sniper.glb and tools/weapon/sniper.blend.

Gun space and the shared tools are described in gunsmith.py. The rig numbers in
packages/fps-client/src/viewmodel/kit.ts (`sniper`) come from the landmarks
below: the scope's eyepiece at (0, -0.111, 0.072), the muzzle at y = 0.8, the
port at (0.016, 0.035, 0.02), the bolt's pivot on the bore (it turns about the
bore, then pulls back `travel`; the viewmodel reaches for its knob at
(0.055, -0.035, 0.024)), the magazine's pivot and the palms on the grip and
under the forend.
"""
import importlib
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import gunsmith  # noqa: E402

importlib.reload(gunsmith)
soften = gunsmith.soften

g = gunsmith.Gun("sniper")

BORE_Z = 0.012
SCOPE_Z = 0.072
REC_REAR, REC_FRONT = -0.068, 0.13
REC_R = 0.0175
MUZZLE = 0.8
RAIL_Z = 0.0275
RAIL_TOP = RAIL_Z + 0.0093
BOLT_PIVOT = (0, -0.03, BORE_Z)
MAG_PIVOT = (0, 0.075, -0.02)

# ---------------------------------------------------------------------------
# Action: a round receiver with a flat-bottomed recoil lug, port and handle notch.
# ---------------------------------------------------------------------------
receiver = g.lathe("receiver", [(0.0, 0.0), (REC_R - 0.002, 0.0), (REC_R, 0.002), (REC_R, REC_FRONT - REC_REAR - 0.002), (REC_R - 0.002, REC_FRONT - REC_REAR), (0.0, REC_FRONT - REC_REAR)],
                   (0, REC_REAR, BORE_Z), "nitride", verts=48, segments=2)
rcuts = [g.slab("port_cut", soften([(0.0, 0.0145), (0.07, 0.0145), (0.07, 0.033), (0.0, 0.033)], 1), 0.02, "nitride", 0, x=0.018)]
rcuts.append(g.slab("handle_notch", soften([(-0.068, 0.0), (-0.052, 0.0), (-0.052, 0.0135), (-0.068, 0.0135)], 1), 0.02, "nitride", 0, x=0.018))
rcuts.append(g.cyl("bolt_way", 0.0098, 0.15, (0, 0.0, BORE_Z), "nitride", verts=32, bevel=0))
g.cut(receiver, rcuts)
body = [receiver]
body.append(g.box("recoil_lug", (0.03, 0.012, 0.012), (0, REC_FRONT - 0.012, BORE_Z - REC_R + 0.002), "nitride", 0.001))
body.append(g.rail("scope_rail", REC_REAR + 0.002, REC_FRONT - 0.002, RAIL_Z, "anodised"))
for y in (-0.05, 0.03, 0.11):
    for side in (-1, 1):
        body.append(g.cyl(f"rail_screw{side}{y}", 0.0021, 0.001, (side * 0.0108, y, RAIL_Z + 0.0005), "steel", axis="X", verts=12, bevel=0))
body.append(g.text("mark_model", "RIDGELINE", (-REC_R - 0.0001, 0.07, BORE_Z), 0.0042, "engraving", side="-X"))
body.append(g.text("mark_cal", ".308 WIN", (-REC_R - 0.0001, 0.07, BORE_Z - 0.0062), 0.0028, "engraving", side="-X"))
# Bolt release on the left rear, tang safety on the right behind the handle.
body.append(g.slab("bolt_release", soften([(-0.06, 0.012), (-0.047, 0.012), (-0.047, 0.017), (-0.06, 0.018)], 1), 0.0022, "nitride", 0.0005, x=-REC_R - 0.0008))
body.append(g.slab("safety", soften([(-0.082, 0.0), (-0.07, 0.0), (-0.069, 0.004), (-0.082, 0.005)], 1), 0.004, "nitride", 0.0008, x=0.013))

# ---------------------------------------------------------------------------
# Barrel: a heavy contour, fluted, threaded into a three-port muzzle brake.
# ---------------------------------------------------------------------------
body.append(g.lathe("barrel_shank", [(0.0, 0.0), (0.0158, 0.0), (0.0158, 0.02), (0.0148, 0.024), (0.0132, 0.09), (0.0, 0.09)], (0, REC_FRONT, BORE_Z), "blued", verts=48, segments=2))
barrel = g.cyl("barrel", 0.0124, MUZZLE - 0.042 - REC_FRONT - 0.088, (0, (REC_FRONT + 0.088 + MUZZLE - 0.042) / 2, BORE_Z), "blued", verts=48, bevel=0.0003)
flutes = []
for i in range(6):
    a = math.pi / 6 + i * math.pi / 3
    flutes.append(g.box(f"flute{i}", (0.0042, 0.36, 0.006), (math.cos(a) * 0.0145, 0.47, BORE_Z + math.sin(a) * 0.0145), "blued", 0, rot=(0, -a + math.pi / 2, 0)))
g.cut(barrel, flutes)
body.append(barrel)
brake = g.lathe("brake", [(0.0, 0.0), (0.0128, 0.0), (0.0134, 0.002), (0.0134, 0.04), (0.0124, 0.042), (0.0, 0.042)], (0, MUZZLE - 0.042, BORE_Z), "nitride", verts=40, segments=2)
bcuts = [g.cyl("brake_bore", 0.0048, 0.05, (0, MUZZLE - 0.02, BORE_Z), "nitride", verts=20, bevel=0)]
for i, y in enumerate((MUZZLE - 0.032, MUZZLE - 0.021, MUZZLE - 0.01)):
    bcuts.append(g.box(f"brake_port{i}", (0.04, 0.0055, 0.0145), (0, y, BORE_Z), "nitride", 0))
for i in range(4):
    bcuts.append(g.cyl(f"brake_top{i}", 0.0016, 0.012, (0, MUZZLE - 0.036 + i * 0.008, BORE_Z + 0.012), "nitride", axis="Z", verts=10, bevel=0))
g.cut(brake, bcuts)
body.append(brake)
body.append(g.text("mark_barrel", "308 WIN  1:10", (-0.0125, 0.28, BORE_Z), 0.0026, "engraving", side="-X"))

# ---------------------------------------------------------------------------
# Stock: an olive composite stock, vertical grip, flat forend, adjustable cheek riser.
# ---------------------------------------------------------------------------
stock_outline = soften([
    (0.44, 0.006, True), (0.44, -0.012), (0.432, -0.022), (0.3, -0.031), (0.15, -0.037), (0.11, -0.04, True),
    (-0.022, -0.04, True), (-0.026, -0.06), (-0.031, -0.09), (-0.033, -0.111), (-0.04, -0.12, True),
    (-0.079, -0.12, True), (-0.084, -0.108), (-0.081, -0.08), (-0.085, -0.06), (-0.1, -0.05),
    (-0.16, -0.054), (-0.25, -0.064), (-0.36, -0.08), (-0.43, -0.098, True),
    (-0.426, 0.032, True), (-0.36, 0.033), (-0.15, 0.03), (-0.11, 0.024), (-0.088, 0.016), (-0.07, 0.0115, True),
    (0.135, 0.0115, True), (0.15, 0.006),
], 2)


def stock_width(y, z):
    # A wide flat forend, a slim grip, the butt fuller than the wrist.
    fore = max(0.0, min(1.0, (y - 0.14) / 0.05))
    grip = max(0.0, min(1.0, (-0.045 - z) / 0.03)) * math.exp(-((y + 0.057) / 0.04) ** 2)
    wrist = math.exp(-((y + 0.1) / 0.05) ** 2)
    return 1.0 + 0.04 * fore - 0.2 * grip - 0.08 * wrist


stock = g.slab("stock", stock_outline, 0.05, "composite", bevel=0.0065, segments=4, angle=30, taper=stock_width)
scuts = [g.cyl("barrel_channel", 0.0152, 0.31, (0, 0.29, BORE_Z), "composite", verts=40, bevel=0)]
scuts.append(g.cyl("action_inlet", REC_R + 0.0004, REC_FRONT - REC_REAR + 0.004, (0, (REC_FRONT + REC_REAR) / 2, BORE_Z), "composite", verts=48, bevel=0))
scuts.append(g.slab("magwell", [(0.0345, 0.0), (0.1155, 0.0), (0.1155, -0.05), (0.0345, -0.05)], 0.0255, "composite", 0))
scuts.append(g.slab("riser_slot", [(-0.14, 0.022), (-0.335, 0.022), (-0.335, 0.04), (-0.14, 0.04)], 0.06, "composite", 0))
for side in (-1, 1):
    for i, y in enumerate((0.2, 0.26, 0.32)):
        scuts.append(g.slab(f"vent{side}{i}", soften([(y - 0.02, -0.004, True), (y + 0.02, -0.004, True), (y + 0.02, 0.003, True), (y - 0.02, 0.003, True)], 2), 0.006, "composite", 0, x=side * 0.026))
g.cut(stock, scuts)
body.append(stock)
grip_panel = soften([(-0.026, -0.052), (-0.031, -0.105), (-0.078, -0.105), (-0.078, -0.06)], 2)
body.append(g.slab("grip_stipple", grip_panel, 0.05 * 0.82 + 0.0012, "stipple", bevel=0.001, segments=2, taper=stock_width))
for side in (-1, 1):
    body.append(g.slab(f"fore_stipple{side}", soften([(0.2, -0.016), (0.34, -0.019), (0.34, -0.03), (0.2, -0.033)], 2), 0.0016, "stipple", 0.0006, x=side * 0.0262))
# Cheek riser on two posts, with its lock knob.
body.append(g.slab("cheek_riser", soften([(-0.145, 0.0335), (-0.33, 0.0335), (-0.33, 0.046), (-0.31, 0.05), (-0.165, 0.05), (-0.145, 0.046)], 2), 0.038, "composite", bevel=0.004, segments=3))
for y in (-0.18, -0.29):
    body.append(g.cyl(f"riser_post{y}", 0.0032, 0.016, (0, y, 0.03), "steel", axis="Z", verts=14, bevel=0.0003))
body.append(g.lathe("riser_knob", [(0.0, 0.0), (0.0065, 0.0), (0.0068, 0.002), (0.0068, 0.008), (0.006, 0.0095), (0.0, 0.0095)], (0.0245, -0.235, 0.026), "rubber", axis="X", verts=24, segments=2))
# Recoil pad and spacers.
body.append(g.slab("spacer", [(-0.426, 0.032), (-0.43, -0.098), (-0.436, -0.099), (-0.432, 0.033)], 0.05, "polymer", bevel=0.002))
body.append(g.slab("recoil_pad", soften([(-0.432, 0.033), (-0.436, -0.099), (-0.458, -0.103), (-0.4545, 0.035)], 1), 0.049, "rubber", bevel=0.003, segments=3))
# Sling studs and a bipod stud, flush cups on the butt.
for name, y, z in (("stud_front", 0.4, -0.029), ("stud_bipod", 0.36, -0.031)):
    body.append(g.cyl(name, 0.0037, 0.009, (0, y, z - 0.003), "steel", axis="Z", verts=16, bevel=0.0004))
for side in (-1, 1):
    body.append(g.cyl(f"flush_cup{side}", 0.0062, 0.002, (side * 0.0235, -0.37, -0.02), "anodised", axis="X", verts=24, bevel=0.0004))

# Bottom metal: trigger guard with the magazine well and release.
guard = g.slab("trigger_guard", soften([
    (-0.026, -0.039, True), (0.03, -0.039, True), (0.03, -0.046), (0.024, -0.062), (0.012, -0.07),
    (-0.008, -0.0705), (-0.02, -0.065), (-0.026, -0.052),
], 2), 0.017, "anodised", bevel=0.0018)
g.cut(guard, [g.slab("guard_hole", soften([
    (-0.016, -0.043, True), (0.021, -0.043, True), (0.02, -0.052), (0.013, -0.062), (-0.006, -0.0625), (-0.015, -0.056),
], 2), 0.04, "anodised", 0)])
body.append(guard)
well = g.slab("mag_well", soften([(0.031, -0.036), (0.119, -0.036), (0.119, -0.044), (0.031, -0.044)], 1), 0.03, "anodised", bevel=0.0012)
g.cut(well, [g.slab("well_hole", [(0.0345, -0.03), (0.1155, -0.03), (0.1155, -0.05), (0.0345, -0.05)], 0.0255, "anodised", 0)])
body.append(well)
body.append(g.slab("mag_release", soften([(0.03, -0.042), (0.036, -0.042), (0.037, -0.054), (0.031, -0.056)], 1), 0.012, "anodised", 0.001))
trigger = g.slab("trigger", soften([
    (0.004, -0.038, True), (0.011, -0.038, True), (0.0105, -0.045), (0.007, -0.053), (0.0015, -0.0585), (-0.0015, -0.0595),
    (-0.0025, -0.058), (0.0015, -0.052), (0.0045, -0.045),
], 2), 0.0065, "steel", bevel=0.0008)
body.append(trigger)

# ---------------------------------------------------------------------------
# Scope: 30 mm tube, 44 mm objective, turrets, power ring, rings on the rail.
# ---------------------------------------------------------------------------
eye = -0.111
scope = g.lathe("scope", [
    (0.0, 0.004), (0.0168, 0.004), (0.0168, 0.0), (0.0196, 0.0), (0.02, 0.003), (0.02, 0.028), (0.0186, 0.031),
    (0.0186, 0.035), (0.0192, 0.037), (0.0192, 0.052), (0.0172, 0.058), (0.0151, 0.07),
    (0.0151, 0.262), (0.0158, 0.268), (0.0222, 0.31), (0.0248, 0.316), (0.0248, 0.36), (0.0238, 0.364),
    (0.0212, 0.364), (0.0212, 0.359), (0.0, 0.359),
], (0, eye, SCOPE_Z), "anodised", verts=48, segments=2)
rib = [g.box(f"power_rib{i}", (0.0032, 0.013, 0.0012), (math.cos(i * math.pi / 9) * 0.0194, eye + 0.0445, SCOPE_Z + math.sin(i * math.pi / 9) * 0.0194), "anodised", 0, rot=(0, -i * math.pi / 9 + math.pi / 2, 0)) for i in range(18)]
g.cut(scope, rib)
body.append(scope)
body.append(g.box("throw_lever", (0.004, 0.006, 0.009), (0.0, eye + 0.0445, SCOPE_Z + 0.0235), "anodised", 0.001))
body.append(g.cyl("lens_rear", 0.0168, 0.0008, (0, eye + 0.0045, SCOPE_Z), "lens", verts=40, bevel=0))
body.append(g.cyl("lens_front", 0.0212, 0.0008, (0, eye + 0.3585, SCOPE_Z), "lens", verts=40, bevel=0))
# Saddle and turrets: elevation on top, windage on the right, parallax on the left.
body.append(g.lathe("saddle", [(0.0, 0.0), (0.0168, 0.0), (0.0172, 0.003), (0.0172, 0.035), (0.0168, 0.038), (0.0, 0.038)], (0, 0.037, SCOPE_Z), "anodised", verts=48, segments=2))


def turret(name, axis, loc, r, h):
    t = g.lathe(name, [(0.0, 0.0), (r - 0.002, 0.0), (r - 0.002, 0.005), (r, 0.0055), (r, h - 0.002), (r - 0.0015, h), (0.0, h)], loc, "anodised", axis=axis, verts=36, segments=2)
    cuts = []
    for i in range(20):
        a = 2 * math.pi * i / 20
        if axis == "Z":
            cuts.append(g.box(f"{name}_k{i}", (0.0014, 0.0014, h - 0.008), (loc[0] + math.cos(a) * r, loc[1] + math.sin(a) * r, loc[2] + 0.0055 + (h - 0.008) / 2 + 0.001), "anodised", 0, rot=(0, 0, a)))
        else:
            sx = 1 if loc[0] > 0 else -1
            cuts.append(g.box(f"{name}_k{i}", (h - 0.008, 0.0014, 0.0014), (loc[0] + sx * (0.0055 + (h - 0.008) / 2 + 0.001), loc[1] + math.cos(a) * r, loc[2] + math.sin(a) * r), "anodised", 0, rot=(a, 0, 0)))
    g.cut(t, cuts)
    return t


body.append(turret("elevation", "Z", (0, 0.056, SCOPE_Z + 0.0158), 0.0118, 0.019))
body.append(turret("windage", "X", (0.0158, 0.056, SCOPE_Z), 0.0108, 0.016))
# The parallax knob grows outward along -X: its profile runs from the outer face in.
body.append(g.lathe("parallax", [(0.0, 0.0), (0.012, 0.0), (0.0135, 0.0015), (0.0135, 0.0175), (0.0, 0.0175)], (-0.0158 - 0.0175, 0.056, SCOPE_Z), "anodised", axis="X", verts=36, segments=2))
body.append(g.box("elev_index", (0.0008, 0.004, 0.0006), (0, 0.056 - 0.0122, SCOPE_Z + 0.0158 + 0.017), "white_paint", 0.0))
body.append(g.text("elev_zero", "0", (0, 0.056 - 0.006, SCOPE_Z + 0.0158 + 0.0191), 0.0032, "white_paint", side="+Z"))
body.append(g.text("mark_scope", "RIDGELINE 4-16x44", (-0.0152, 0.17, SCOPE_Z), 0.0026, "white_paint", side="-X"))
# Rings: a clamp on the rail, the ring round the tube, cap screws on top.
for k, y in enumerate((0.0, 0.112)):
    body.append(g.box(f"ring_base{k}", (0.027, 0.014, 0.011), (0, y, RAIL_TOP + 0.0045), "anodised", 0.0012))
    body.append(g.box(f"ring_stem{k}", (0.016, 0.013, SCOPE_Z - 0.015 - RAIL_TOP - 0.008), (0, y, (SCOPE_Z - 0.015 + RAIL_TOP + 0.008) / 2), "anodised", 0.001))
    body.append(g.tube(f"ring{k}", 0.0186, 0.0151, 0.013, (0, y, SCOPE_Z), "anodised", verts=48))
    body.append(g.cyl(f"ring_bolt{k}", 0.0035, 0.0045, (0.0155, y, RAIL_TOP + 0.0045), "steel", axis="X", verts=6, bevel=0.0003))
    body.append(g.cyl(f"ring_nut{k}", 0.0038, 0.003, (-0.0148, y, RAIL_TOP + 0.0045), "anodised", axis="X", verts=6, bevel=0.0003))
    for sx in (-1, 1):
        body.append(g.cyl(f"ring_screw{k}{sx}", 0.0018, 0.004, (sx * 0.0128, y, SCOPE_Z + 0.0118), "steel", axis="Z", verts=12, bevel=0.0002, r2=0.0016))

# ---------------------------------------------------------------------------
# Bolt: body, shroud and a tactical knob on a swept handle (part "bolt").
# ---------------------------------------------------------------------------
bolt = [g.cyl("bolt_body", 0.0092, 0.137, (0, -0.0035, BORE_Z), "steel", verts=32, bevel=0.0004)]
for i in range(3):
    a = math.pi / 2 + i * 2 * math.pi / 3
    bolt.append(g.box(f"bolt_flute{i}", (0.0016, 0.09, 0.0016), (math.cos(a) * 0.0091, 0.005, BORE_Z + math.sin(a) * 0.0091), "nitride", 0.0002, rot=(0, -a + math.pi / 2, 0)))
bolt.append(g.lathe("bolt_shroud", [(0.0, 0.0), (0.0085, 0.0), (0.0118, 0.006), (0.0122, 0.026), (0.0105, 0.03), (0.0, 0.03)], (0, REC_REAR - 0.032, BORE_Z), "nitride", verts=32, segments=2))
bolt.append(g.cyl("cocking_pin", 0.0022, 0.006, (0, REC_REAR - 0.034, BORE_Z), "red_insert", verts=12, bevel=0.0002))
bolt.append(g.pipe("bolt_handle", [(0.004, -0.06, BORE_Z), (0.018, -0.061, BORE_Z - 0.0015), (0.032, -0.063, BORE_Z - 0.005), (0.042, -0.064, BORE_Z - 0.009)], 0.0034, "steel", verts=14))
knob = g.lathe("bolt_knob", [(0.0, 0.0), (0.0045, 0.0), (0.0085, 0.004), (0.0095, 0.009), (0.0095, 0.018), (0.0082, 0.022), (0.0, 0.0235)], (0.0405, -0.064, BORE_Z - 0.0095), "nitride", axis="X", verts=32, segments=2)
g.cut(knob, [g.box(f"knob_groove{i}", (0.03, 0.0016, 0.0016), (0.058, -0.064 + math.cos(i * math.pi / 6) * 0.0096, BORE_Z - 0.0095 + math.sin(i * math.pi / 6) * 0.0096), "nitride", 0, rot=(i * math.pi / 6, 0, 0)) for i in range(12)])
bolt.append(knob)
g.part("bolt", bolt, BOLT_PIVOT)

# ---------------------------------------------------------------------------
# Magazine: a steel box for five rounds, polymer base, a .308 round on top.
# ---------------------------------------------------------------------------
mag_body = g.slab("mag_body", soften([(0.0355, -0.004), (0.1145, -0.004), (0.1145, -0.058), (0.0355, -0.058)], 1), 0.0236, "phosphate", bevel=0.0016, segments=3)
g.cut(mag_body, [g.box(f"mag_rib{i}", (0.03, 0.06, 0.0012), (0, 0.075, -0.02 - i * 0.012), "phosphate", 0) for i in range(3)])
mag = [mag_body]
mag.append(g.slab("mag_base", soften([(0.033, -0.057), (0.117, -0.057), (0.118, -0.064, True), (0.032, -0.064, True)], 2), 0.027, "polymer", bevel=0.002, segments=3))
mag.append(g.lathe("round_case", [(0.0, 0.0), (0.0059, 0.0), (0.0059, 0.0012), (0.0052, 0.0018), (0.006, 0.0026), (0.006, 0.039), (0.0055, 0.043), (0.0044, 0.046), (0.0044, 0.051), (0.0, 0.051)],
                   (0, 0.038, -0.0005), "brass", verts=24))
mag.append(g.lathe("round_bullet", [(0.0039, 0.0), (0.0039, 0.006), (0.0032, 0.013), (0.0016, 0.018), (0.0, 0.019)], (0, 0.089, -0.0005), "copper", verts=24))
g.part("mag", mag, MAG_PIVOT)

result = g.finish(texture=2048, draft=globals().get("ARGS", {}).get("draft", False))
