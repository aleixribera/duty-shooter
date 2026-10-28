"""Harrow 12: a 12-gauge pump gun, blued steel receiver, walnut stock and forend, vent-rib barrel.

Run from the repository root:
    blender --background --factory-startup --python tools/weapon/shotgun.py
or in the Blender session: bkit.run(r"tools/weapon/shotgun.py").
It writes packages/fps-client/src/viewmodel/assets/shotgun.glb and tools/weapon/shotgun.blend.

Gun space and the shared tools are described in gunsmith.py. The rig numbers in
packages/fps-client/src/viewmodel/kit.ts (`shotgun`) come from the landmarks
below: the sight line's rear point at (0, -0.03, 0.049) level with the top of
the front bead, the muzzle at y = 0.67, the port at (0.0175, 0.065, 0.021), the
loading port at (0, 0.085, -0.028), the pump's pivot and travel (the bolt rides
with it), and the palms on the grip and under the forend.
"""
import importlib
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import gunsmith  # noqa: E402

importlib.reload(gunsmith)
soften = gunsmith.soften

g = gunsmith.Gun("shotgun")

BORE_Z = 0.022
TUBE_Z = -0.008
REC_REAR, REC_FRONT = -0.035, 0.17
REC_TOP, REC_BOTTOM = 0.04, -0.025
MUZZLE = 0.67
SIGHT_Z = 0.049
PUMP_REAR, PUMP_FRONT = 0.27, 0.44
TRAVEL = 0.09

# ---------------------------------------------------------------------------
# Receiver: a machined block, blued, with port, loading port and markings.
# ---------------------------------------------------------------------------
rec_section = [(-0.017, REC_BOTTOM), (0.017, REC_BOTTOM), (0.017, 0.034), (0.0125, REC_TOP), (-0.0125, REC_TOP), (-0.017, 0.034)]


def receiver_shape(v):
    # The back slopes down into the stock's tang, the front top rounds off at the barrel.
    if v.co.y < REC_REAR + 1e-4 and v.co.z > 0.02:
        v.co.y += (v.co.z - 0.02) * 0.6


receiver = g.sweep("receiver", rec_section, REC_REAR, REC_FRONT, "blued", bevel=0.0012, shape=receiver_shape)
rcuts = []
rcuts.append(g.slab("port_cut", soften([(0.032, 0.007), (0.099, 0.007), (0.099, 0.033), (0.032, 0.033)], 1), 0.016, "blued", 0, x=0.017))
rcuts.append(g.plan("loading_port", soften([(-0.0115, 0.04, True), (0.0115, 0.04, True), (0.0115, 0.128, True), (-0.0115, 0.128, True)], 2), 0.026, "blued", 0, z=REC_BOTTOM))
# The matted sighting groove along the top.
rcuts.append(g.box("top_groove", (0.008, REC_FRONT - REC_REAR, 0.0016), (0, (REC_REAR + REC_FRONT) / 2 + 0.01, REC_TOP), "blued", 0))
g.cut(receiver, rcuts)
body = [receiver]
# Shell carrier (lifter) seen up the loading port.
body.append(g.box("carrier", (0.02, 0.08, 0.002), (0, 0.085, REC_BOTTOM + 0.011), "steel", 0.0004))
# Engraved border panels on both sides, and the markings.
for side in (-1, 1):
    x = side * 0.0171
    for (y0, y1, z0, z1) in ((0.004, 0.16, -0.019, -0.0165), (0.004, 0.16, 0.0005, 0.003)) if side < 0 else ((0.104, 0.16, -0.019, -0.0165), (0.104, 0.16, 0.0005, 0.003)):
        body.append(g.box(f"panel_line{side}{y0}{z0}", (0.0004, y1 - y0, z1 - z0), (x, (y0 + y1) / 2, (z0 + z1) / 2), "engraving", 0.0))
body.append(g.text("mark_model", "HARROW 12", (-0.0171, 0.083, -0.0085), 0.0062, "engraving", side="-X"))
body.append(g.text("mark_gauge", "12 GA  3 IN", (-0.0171, 0.04, 0.0335), 0.0026, "engraving", side="-X"))
body.append(g.text("mark_serial", "HR 118204", (0.0171, 0.133, -0.0085), 0.0027, "engraving", side="+X"))
for name, y in (("pin_front", 0.035), ("pin_rear", -0.018)):
    body.append(g.cyl(name, 0.0021, 0.0348, (0, y, -0.018), "steel", axis="X", verts=16, bevel=0.0003))
# Barrel collar where the barrel enters the receiver.
body.append(g.lathe("collar", [(0.0, 0.0), (0.0155, 0.0), (0.0155, 0.014), (0.0138, 0.02), (0.0, 0.02)], (0, REC_FRONT - 0.002, BORE_Z), "blued", verts=40, segments=2))

# ---------------------------------------------------------------------------
# Trigger group: a black trigger plate, guard, trigger, crossbolt safety, slide release.
# ---------------------------------------------------------------------------
guard = g.slab("trigger_guard", soften([
    (-0.03, REC_BOTTOM + 0.001, True), (0.048, REC_BOTTOM + 0.001, True), (0.048, -0.031), (0.042, -0.047), (0.03, -0.056),
    (-0.006, -0.057), (-0.022, -0.05), (-0.03, -0.038),
], 2), 0.0165, "nitride", bevel=0.0018)
g.cut(guard, [g.slab("guard_hole", soften([
    (-0.019, -0.03, True), (0.04, -0.03, True), (0.039, -0.04), (0.031, -0.0495), (-0.004, -0.05), (-0.016, -0.044), (-0.02, -0.036),
], 2), 0.04, "nitride", 0)])
body.append(guard)
trigger = g.slab("trigger", soften([
    (0.004, -0.027, True), (0.012, -0.027, True), (0.0115, -0.034), (0.008, -0.043), (0.002, -0.0485), (-0.001, -0.0495),
    (-0.002, -0.048), (0.002, -0.042), (0.0045, -0.034),
], 2), 0.0072, "steel", bevel=0.0009)
body.append(trigger)
for i in range(4):
    body.append(g.box(f"trigger_rib{i}", (0.0074, 0.0008, 0.001), (0, 0.0042 - i * 0.0012, -0.035 - i * 0.003), "steel", 0.0001, rot=(math.radians(-35), 0, 0)))
body.append(g.cyl("safety", 0.0034, 0.023, (0.001, -0.022, -0.029), "steel", axis="X", verts=18, bevel=0.0004))
body.append(g.cyl("safety_ring", 0.0035, 0.0012, (-0.0105, -0.022, -0.029), "red_insert", axis="X", verts=18, bevel=0))
body.append(g.slab("slide_release", soften([(0.04, -0.03), (0.06, -0.0285), (0.064, -0.0325), (0.06, -0.036), (0.042, -0.035)], 1), 0.0018, "nitride", 0.0004, x=-0.0091))

# ---------------------------------------------------------------------------
# Barrel: vent rib with a mid bead and a brass front bead, magazine tube under it.
# ---------------------------------------------------------------------------
body.append(g.tube("barrel", 0.0113, 0.0093, MUZZLE - REC_FRONT - 0.016, (0, (MUZZLE + REC_FRONT + 0.016) / 2, BORE_Z), "blued", verts=40))
body.append(g.lathe("muzzle_crown", [(0.0093, 0.0), (0.0116, 0.0), (0.0116, 0.008), (0.0108, 0.0095), (0.0093, 0.0095)], (0, MUZZLE - 0.0095, BORE_Z), "blued", verts=40, closed=False))
rib_y0, rib_y1 = REC_FRONT + 0.02, MUZZLE - 0.004
n_posts = 12
for i in range(n_posts):
    y = rib_y0 + 0.006 + (rib_y1 - rib_y0 - 0.012) * i / (n_posts - 1)
    body.append(g.box(f"rib_post{i}", (0.0055, 0.008, 0.0072), (0, y, BORE_Z + 0.0113 + 0.0028), "blued", 0.0005))
rib = g.box("rib", (0.0082, rib_y1 - rib_y0, 0.0022), (0, (rib_y0 + rib_y1) / 2, BORE_Z + 0.0113 + 0.0072), "blued", 0.0005)
g.cut(rib, [g.box(f"rib_line{i}", (0.0006, rib_y1 - rib_y0 + 0.01, 0.001), ((i - 2) * 0.0016, (rib_y0 + rib_y1) / 2, BORE_Z + 0.0113 + 0.0084), "blued", 0) for i in range(5)])
body.append(rib)
rib_top = BORE_Z + 0.0113 + 0.0083
body.append(g.lathe("front_bead", [(0.0, 0.0), (0.0018, 0.0), (0.0018, 0.0012), (0.0026, 0.0018), (0.0026, 0.0035), (0.0018, 0.0042), (0.0, 0.0045)], (0, MUZZLE - 0.012, rib_top - 0.0005), "brass", axis="Z", verts=20, segments=2))
body.append(g.lathe("mid_bead", [(0.0, 0.0), (0.0013, 0.0), (0.0013, 0.0016), (0.0, 0.0022)], (0, 0.42, rib_top - 0.0003), "steel", axis="Z", verts=14))
# Magazine tube, its knurled cap and the barrel hanger that clamps the two.
body.append(g.cyl("mag_tube", 0.0104, 0.6 - REC_FRONT, (0, (0.6 + REC_FRONT) / 2, TUBE_Z), "blued", verts=36, bevel=0.0002))
cap = g.lathe("tube_cap", [(0.0, 0.0), (0.0122, 0.0), (0.0124, 0.002), (0.0124, 0.019), (0.0115, 0.0235), (0.006, 0.025), (0.0, 0.025)], (0, 0.6, TUBE_Z), "blued", verts=36, segments=2)
g.cut(cap, [g.box(f"knurl{i}", (0.003, 0.012, 0.003), (math.cos(i * math.pi / 12) * 0.0126, 0.609, TUBE_Z + math.sin(i * math.pi / 12) * 0.0126), "blued", 0, rot=(0, -i * math.pi / 12, 0)) for i in range(24)])
body.append(cap)
body.append(g.slab("hanger", soften([(0.581, BORE_Z + 0.0128), (0.593, BORE_Z + 0.0128), (0.593, TUBE_Z - 0.0118), (0.581, TUBE_Z - 0.0118)], 1), 0.0245, "blued", bevel=0.0025, segments=3))
body.append(g.cyl("hanger_screw", 0.0024, 0.0275, (0, 0.587, 0.007), "steel", axis="X", verts=14, bevel=0.0003))
body.append(g.torus("swivel_front", 0.0075, 0.0013, (0, 0.615, TUBE_Z - 0.021), "steel", rot=(0, math.pi / 2, 0), verts=24, ring=8))
body.append(g.box("swivel_front_stud", (0.004, 0.006, 0.008), (0, 0.615, TUBE_Z - 0.0135), "steel", 0.0006))

# ---------------------------------------------------------------------------
# Stock: walnut with a rounded semi-pistol grip, checkering and a vented recoil pad.
# ---------------------------------------------------------------------------
stock_outline = soften([
    (REC_REAR + 0.004, 0.024, True), (REC_REAR + 0.004, REC_BOTTOM + 0.002, True), (-0.031, -0.03),
    (-0.042, -0.045), (-0.056, -0.07), (-0.066, -0.088), (-0.07, -0.098, True), (-0.104, -0.094, True),
    (-0.112, -0.078), (-0.122, -0.06), (-0.14, -0.05), (-0.19, -0.056), (-0.27, -0.083), (-0.37, -0.13, True),
    (-0.366, 0.0, True), (-0.3, 0.002), (-0.2, 0.006), (-0.125, 0.011), (-0.09, 0.016), (-0.06, 0.024), (-0.045, 0.029),
], 2)


def stock_width(y, z):
    # Narrow through the wrist and grip, fuller toward the butt.
    wrist = math.exp(-((y + 0.085) / 0.05) ** 2)
    butt = max(0.0, min(1.0, (-0.15 - y) / 0.15))
    grip = max(0.0, min(1.0, (-0.04 - z) / 0.04)) * math.exp(-((y + 0.07) / 0.04) ** 2)
    return 1.0 - 0.1 * wrist + 0.1 * butt - 0.05 * grip


stock = g.slab("stock", stock_outline, 0.04, "walnut", bevel=0.009, segments=5, angle=30, taper=stock_width)
body.append(stock)
grip_panel = soften([(-0.036, -0.034), (-0.052, -0.064), (-0.063, -0.085), (-0.098, -0.084), (-0.106, -0.068), (-0.116, -0.04), (-0.1, -0.012), (-0.06, -0.006)], 2)
body.append(g.slab("grip_checkering", grip_panel, 0.04 + 0.0012, "checkered", bevel=0.001, segments=2, taper=stock_width))
body.append(g.slab("grip_cap", soften([(-0.068, -0.0955), (-0.1045, -0.0915), (-0.104, -0.0965), (-0.069, -0.1005)], 1), 0.03, "polymer", bevel=0.0018))
# Recoil pad with a spacer line, and the rear sling stud.
pad_outline = [(-0.366, 0.0005), (-0.37, -0.1305), (-0.394, -0.1335), (-0.3905, 0.0025)]
body.append(g.slab("spacer", [(-0.366, 0.0005), (-0.37, -0.1305), (-0.3735, -0.131), (-0.3695, 0.001)], 0.0425, "white_paint", bevel=0.0006))
pad = g.slab("recoil_pad", soften(pad_outline, 1), 0.0425, "rubber", bevel=0.004, segments=4)
g.cut(pad, [g.slab(f"pad_vent{i}", soften([(-0.392, -0.03 - i * 0.028, True), (-0.378, -0.03 - i * 0.028, True), (-0.378, -0.018 - i * 0.028, True), (-0.392, -0.018 - i * 0.028, True)], 2), 0.05, "rubber", 0) for i in range(3)])
body.append(pad)
body.append(g.cyl("rear_stud", 0.0036, 0.008, (0, -0.31, -0.104), "steel", axis="Z", verts=16, bevel=0.0004))

# ---------------------------------------------------------------------------
# Pump: the ribbed walnut forend on twin action bars, with the bolt it drives.
# ---------------------------------------------------------------------------
fore_section = [(-0.0225, -0.004), (-0.021, -0.019), (-0.013, -0.0265), (0.013, -0.0265), (0.021, -0.019), (0.0225, -0.004),
                (0.0195, 0.0075), (0.0125, 0.0095), (-0.0125, 0.0095), (-0.0195, 0.0075)]


def forend_shape(v):
    # The ends round in toward the tube.
    t = min(1.0, (v.co.y - PUMP_REAR) / 0.012, (PUMP_FRONT - v.co.y) / 0.012)
    s = 0.86 + 0.14 * max(0.0, t)
    v.co.x *= s
    v.co.z = TUBE_Z + (v.co.z - TUBE_Z) * s


forend = g.sweep("forend", fore_section, PUMP_REAR, PUMP_FRONT, "walnut", bevel=0.0035, segments=3, shape=forend_shape)
grooves = []
for i in range(9):
    y = PUMP_REAR + 0.03 + i * 0.0135
    grooves.append(g.slab(f"groove{i}", soften([(y - 0.0022, -0.03), (y + 0.0022, -0.03), (y + 0.0022, 0.003), (y - 0.0022, 0.003)], 1), 0.06, "walnut", 0))
g.cut(forend, grooves)
pump = [forend]
for side in (-1, 1):
    pump.append(g.box(f"action_bar{side}", (0.0022, PUMP_REAR + 0.02 - 0.11, 0.0052), (side * 0.0118, (PUMP_REAR + 0.02 + 0.11) / 2, -0.003), "steel", 0.0004))
pump.append(g.lathe("forend_nut", [(0.0, 0.0), (0.0118, 0.0), (0.0118, 0.006), (0.0105, 0.008), (0.0, 0.008)], (0, PUMP_FRONT - 0.002, TUBE_Z), "blued", verts=32, segments=2))
pump.append(g.lathe("forend_ferrule", [(0.0, 0.0), (0.0132, 0.0), (0.0132, 0.008), (0.0, 0.008)], (0, PUMP_REAR - 0.006, TUBE_Z), "blued", verts=32, segments=2))
# Short enough that the whole stroke stays inside the receiver.
bolt = g.box("bolt", (0.0105, 0.042, 0.024), (0.0095, 0.077, 0.02), "steel", 0.0012)
g.cut(bolt, [g.box(f"bolt_groove{i}", (0.004, 0.05, 0.0014), (0.0148, 0.077, 0.012 + i * 0.004), "steel", 0) for i in range(3)])
pump.append(bolt)
pump.append(g.slab("extractor", soften([(0.083, 0.026), (0.099, 0.026), (0.099, 0.0305), (0.083, 0.0305)], 1), 0.0016, "blued", 0.0003, x=0.0152))
g.part("pump", pump, (0, (PUMP_REAR + PUMP_FRONT) / 2, TUBE_Z))

result = g.finish(texture=2048, draft=globals().get("ARGS", {}).get("draft", False))
