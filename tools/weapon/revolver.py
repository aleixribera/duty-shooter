"""Marshal .357: a six-shot double-action revolver, blued steel and walnut, four-inch barrel.

Run from the repository root:
    blender --background --factory-startup --python tools/weapon/revolver.py
or in the Blender session: bkit.run(r"tools/weapon/revolver.py").
It writes packages/fps-client/src/viewmodel/assets/revolver.glb and tools/weapon/revolver.blend.

Gun space and the shared tools are described in gunsmith.py. The rig numbers in
packages/fps-client/src/viewmodel/kit.ts (`revolver`) come from the landmarks
below: the rear notch at (0, -0.0235, 0.054), the muzzle at y = 0.168, and the
moving parts. The `crane` hinges about a line parallel to the bore through
CRANE_PIVOT and carries the `cylinder` (origin on its own axis, which it turns
about a sixth of a turn a shot), the six `rounds` in it and the speedloader
(`loader`); those three share the origin at the centre of the cylinder's rear
face, so the client slides them along the axis. The `hammer` turns about its pin.
"""
import importlib
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import gunsmith  # noqa: E402

importlib.reload(gunsmith)
soften = gunsmith.soften

g = gunsmith.Gun("revolver")

BORE_Z = 0.034
CHAMBER_R = 0.0128  # the circle the six chambers sit on
CYL_R = 0.0195
CYL_Z = BORE_Z - CHAMBER_R
CYL_REAR, CYL_FRONT = 0.002, 0.043
MUZZLE = 0.168
STRAP_TOP = 0.047
SIGHT_Z = 0.0545
FRAME_W = 0.0165
CRANE_PIVOT = (-0.0045, CYL_FRONT + 0.004, -0.0025)
HAMMER_PIVOT = (0, -0.02, 0.012)
REAR_FACE = (0, CYL_REAR, CYL_Z)
CHAMBERS = [math.radians(90 + 60 * i) for i in range(6)]

# ---------------------------------------------------------------------------
# Frame: top strap, cylinder window, recoil shield and the grip tang, one forging.
# ---------------------------------------------------------------------------
frame_outline = soften([
    (-0.024, STRAP_TOP, True), (0.062, STRAP_TOP, True), (0.062, 0.010), (0.058, -0.002), (0.050, -0.0065),
    (0.004, -0.0065, True), (-0.001, -0.022), (-0.006, -0.045), (-0.011, -0.07), (-0.016, -0.094), (-0.019, -0.1, True),
    (-0.06, -0.1, True), (-0.0625, -0.09), (-0.059, -0.06), (-0.052, -0.03), (-0.043, -0.006),
    (-0.039, 0.008), (-0.034, 0.018), (-0.028, 0.032), (-0.026, 0.042),
], 2)
frame = g.slab("frame", frame_outline, FRAME_W, "blued", bevel=0.0013, segments=3)
fcuts = []
fcuts.append(g.box("window", (0.04, CYL_FRONT + 0.0006 - 0.0002, 2 * CYL_R + 0.001), (0, (CYL_FRONT + 0.0006 + 0.0002) / 2, CYL_Z), "blued", 0))
fcuts.append(g.box("hammer_slot", (0.0076, 0.061, 0.066), (0, -0.0395, 0.037), "blued", 0))
# The crane's seat in the front of the frame, open to the left.
fcuts.append(g.box("crane_seat", (0.0255, 0.0068, CYL_Z + 0.006 + 0.008), (-0.00725, CYL_FRONT + 0.004, (CYL_Z + 0.006 - 0.008) / 2), "blued", 0))
fcuts.append(g.box("trigger_slot", (0.0068, 0.027, 0.012), (0, 0.017, -0.006), "blued", 0))
# A sighting groove along the top strap.
fcuts.append(g.box("strap_groove", (0.0042, 0.05, 0.0016), (0, 0.03, STRAP_TOP), "blued", 0))
g.cut(frame, fcuts)
body = [frame]
body.append(g.lathe("recoil_shield", [(0.0, 0.0), (0.0168, 0.0), (0.0187, 0.0014), (0.0187, 0.0046), (0.0, 0.0046)], (0, -0.0042, CYL_Z), "blued", verts=48, segments=2, bevel=0.0004))
body.append(g.cyl("firing_pin_bush", 0.0026, 0.0006, (0, 0.0003, BORE_Z), "steel", verts=16, bevel=0))
# Side plate screws on the right, the cylinder latch on the left.
for i, (y, z) in enumerate(((0.032, -0.0025), (-0.03, 0.002), (0.052, 0.004))):
    screw = g.cyl(f"plate_screw{i}", 0.0019, 0.0008, (FRAME_W / 2 + 0.0002, y, z), "steel", axis="X", verts=16, bevel=0.0002)
    g.cut(screw, [g.box(f"screw_slot{i}", (0.002, 0.005, 0.0005), (FRAME_W / 2 + 0.0006, y, z), "steel", 0, rot=(0.6 + i, 0, 0))])
    body.append(screw)
latch = g.slab("latch", soften([(-0.0205, 0.0125), (-0.006, 0.012), (-0.005, 0.0205), (-0.0195, 0.022)], 1), 0.0026, "blued", 0.0006, x=-FRAME_W / 2 - 0.0011)
g.cut(latch, [g.box(f"latch_groove{i}", (0.002, 0.0008, 0.012), (-FRAME_W / 2 - 0.0024, -0.0175 + i * 0.0022, 0.017), "blued", 0) for i in range(5)])
body.append(latch)
body.append(g.text("mark_serial", "MA 51207", (FRAME_W / 2 + 0.00005, 0.022, -0.0032), 0.0021, "engraving", side="+X"))

# ---------------------------------------------------------------------------
# Barrel: round, with a rib on top and a full lug that shrouds the ejector rod.
# ---------------------------------------------------------------------------
BARREL_R, LUG_R = 0.0092, 0.0078
section = []
for a in range(200, 341, 14):
    section.append((math.cos(math.radians(a)) * LUG_R, CYL_Z + math.sin(math.radians(a)) * LUG_R))
for a in range(-28, 57, 12):
    section.append((math.cos(math.radians(a)) * BARREL_R, BORE_Z + math.sin(math.radians(a)) * BARREL_R))
section += [(0.0037, BORE_Z + 0.0084), (0.0037, STRAP_TOP), (-0.0037, STRAP_TOP), (-0.0037, BORE_Z + 0.0084)]
for a in range(124, 209, 12):
    section.append((math.cos(math.radians(a)) * BARREL_R, BORE_Z + math.sin(math.radians(a)) * BARREL_R))


def barrel_nose(v):
    # The lug's front is cut back under the muzzle.
    if v.co.y > MUZZLE - 1e-4:
        v.co.y -= max(0.0, BORE_Z - 0.008 - v.co.z) * 0.55


barrel = g.sweep("barrel", section, 0.0615, MUZZLE, "blued", bevel=0.0007, shape=barrel_nose)
bcuts = [g.cyl("bore_cut", 0.0047, 0.014, (0, MUZZLE, BORE_Z), "blued", verts=28, bevel=0)]
# The ejector rod shows in a slot along the lug's left.
bcuts.append(g.box("rod_slot", (0.012, 0.047, 0.0078), (-0.006, 0.0615 + 0.0235, CYL_Z), "blued", 0))
for i in range(12):
    bcuts.append(g.box(f"rib_line{i}", (0.0052, 0.0011, 0.0008), (0, 0.07 + i * 0.0048, STRAP_TOP), "blued", 0))
g.cut(barrel, bcuts)
body.append(barrel)
body.append(g.lathe("bore", [(0.0047, 0.0), (0.0047, 0.006), (0.0, 0.0062)], (0, MUZZLE - 0.008, BORE_Z), "nitride", verts=24))
body.append(g.lathe("crown", [(0.0047, 0.0), (0.0062, 0.0), (0.0066, -0.0006), (0.0047, -0.0006)], (0, MUZZLE + 0.0003, BORE_Z), "steel", verts=28, closed=False))
body.append(g.text("mark_model", "MARSHAL .357", (-BARREL_R - 0.00005, 0.118, BORE_Z), 0.0036, "engraving", side="-X"))
body.append(g.text("mark_cal", ".357 MAGNUM", (BARREL_R + 0.00005, 0.118, BORE_Z), 0.003, "engraving", side="+X"))

# Sights: a red ramp on the rib, an adjustable square notch at the back of the strap.
body.append(g.slab("front_sight", soften([(0.134, STRAP_TOP - 0.0005, True), (0.164, STRAP_TOP - 0.0005, True), (0.163, STRAP_TOP + 0.003), (0.158, SIGHT_Z, True), (0.154, SIGHT_Z, True)], 1), 0.0032, "blued", 0.0004))
body.append(g.box("front_insert", (0.0024, 0.0075, 0.0007), (0, 0.1495, SIGHT_Z - 0.0019), "red_insert", 0.0, rot=(math.atan2(SIGHT_Z - STRAP_TOP, 0.02), 0, 0)))
rear = g.slab("rear_sight", soften([(-0.0245, STRAP_TOP - 0.0004, True), (-0.003, STRAP_TOP - 0.0004, True), (-0.0055, STRAP_TOP + 0.003), (-0.019, SIGHT_Z, True), (-0.0245, SIGHT_Z, True)], 1), 0.0136, "nitride", 0.0005)
g.cut(rear, [g.box("notch", (0.0032, 0.02, 0.0048), (0, -0.0235, SIGHT_Z), "nitride", 0)])
body.append(rear)
body.append(g.cyl("elev_screw", 0.0017, 0.0005, (0, -0.011, STRAP_TOP + 0.0036), "steel", axis="Z", verts=14, bevel=0))
body.append(g.cyl("windage_screw", 0.0018, 0.0006, (0.0069, -0.0215, STRAP_TOP + 0.0035), "steel", axis="X", verts=14, bevel=0))

# ---------------------------------------------------------------------------
# Trigger guard and trigger.
# ---------------------------------------------------------------------------
guard = g.slab("guard", soften([
    (-0.002, -0.006), (0.048, -0.006), (0.0525, -0.011), (0.052, -0.027), (0.046, -0.037), (0.034, -0.041),
    (0.012, -0.0405), (0.003, -0.036), (-0.002, -0.027),
], 2), 0.0115, "blued", bevel=0.0018, segments=3)
g.cut(guard, [g.slab("guard_hole", soften([
    (0.004, -0.0088, True), (0.046, -0.0088, True), (0.0485, -0.013), (0.048, -0.026), (0.043, -0.0335), (0.033, -0.0372),
    (0.013, -0.0368), (0.0065, -0.033), (0.003, -0.026),
], 2), 0.03, "blued", 0)])
body.append(guard)
body.append(g.slab("trigger", soften([
    (0.014, -0.004, True), (0.021, -0.004, True), (0.0205, -0.012), (0.0175, -0.021), (0.0135, -0.028), (0.011, -0.0295),
    (0.0098, -0.028), (0.0125, -0.021), (0.0145, -0.013),
], 2), 0.0064, "steel", bevel=0.0009))

# ---------------------------------------------------------------------------
# Grips: two walnut panels with a palm swell, cut checkering, a medallion and a screw.
# ---------------------------------------------------------------------------
GRIP_W = 0.031


def grip_width(y, z):
    swell = math.exp(-((z + 0.064) / 0.036) ** 2)
    return 0.76 + 0.24 * swell


grips = g.slab("grips", soften([
    (-0.004, -0.0085, True), (-0.0045, -0.024), (-0.0075, -0.046), (-0.0125, -0.07), (-0.0155, -0.09), (-0.0165, -0.102), (-0.022, -0.1065),
    (-0.058, -0.1065), (-0.0655, -0.102), (-0.0655, -0.088), (-0.0585, -0.06), (-0.0505, -0.03), (-0.042, -0.008), (-0.037, 0.003, True), (-0.02, 0.002),
], 2), GRIP_W, "walnut", bevel=0.0055, segments=4, angle=30, taper=grip_width)
body.append(grips)
body.append(g.slab("checkering", soften([(-0.013, -0.034), (-0.0205, -0.09), (-0.056, -0.09), (-0.051, -0.05), (-0.041, -0.026)], 3), GRIP_W + 0.0008, "checkered", bevel=0.0007, segments=2, taper=grip_width))
body.append(g.cyl("medallion", 0.0046, GRIP_W * grip_width(0, -0.014) + 0.0005, (0, -0.029, -0.014), "brass", axis="X", verts=28, bevel=0.0004))
body.append(g.cyl("grip_screw", 0.0024, GRIP_W * grip_width(0, -0.06) + 0.0016, (0, -0.036, -0.06), "steel", axis="X", verts=18, bevel=0.0003))
body.append(g.box("lanyard_plate", (0.012, 0.03, 0.0012), (0, -0.04, -0.1068), "blued", 0.0004))

# ---------------------------------------------------------------------------
# Hammer (part "hammer"): a checkered spur over the tang, its nose under the rear sight.
# ---------------------------------------------------------------------------
hammer = g.slab("hammer_body", soften([
    (-0.014, 0.006, True), (-0.0115, 0.034), (-0.0125, 0.0405), (-0.02, 0.0415), (-0.03, 0.0432), (-0.041, 0.0468),
    (-0.0432, 0.0438), (-0.032, 0.0372), (-0.0245, 0.03), (-0.026, 0.006, True),
], 2), 0.0068, "steel", bevel=0.0007)
g.cut(hammer, [g.box(f"spur_cut{i}", (0.02, 0.0009, 0.0012), (0, -0.0335 - i * 0.0018, 0.0448 + i * 0.0006), "steel", 0, rot=(math.radians(18), 0, 0)) for i in range(5)])
g.part("hammer", [hammer], HAMMER_PIVOT)

# ---------------------------------------------------------------------------
# Cylinder (part "cylinder"): fluted, six chambers, the extractor star and its rod.
# ---------------------------------------------------------------------------
length = CYL_FRONT - CYL_REAR
cyl = g.lathe("cylinder_body", [(0.0, 0.0), (CYL_R - 0.0008, 0.0), (CYL_R, 0.0008), (CYL_R, length - 0.003), (CYL_R - 0.0026, length), (0.0, length)], REAR_FACE, "blued", verts=60, segments=2)
ccuts = []
for i, a in enumerate(CHAMBERS):
    cx, cz = math.cos(a) * CHAMBER_R, CYL_Z + math.sin(a) * CHAMBER_R
    ccuts.append(g.cyl(f"chamber{i}", 0.00505, length + 0.01, (cx, (CYL_REAR + CYL_FRONT) / 2, cz), "blued", verts=24, bevel=0))
    f = a + math.radians(30)
    ccuts.append(g.lathe(f"flute{i}", [(0.0, 0.0), (0.0045, 0.002), (0.0066, 0.006), (0.0066, 0.04)], (math.cos(f) * (CYL_R + 0.0034), CYL_REAR + 0.013, CYL_Z + math.sin(f) * (CYL_R + 0.0034)), "blued", verts=20))
    ccuts.append(g.box(f"stop{i}", (0.0032, 0.0052, 0.0022), (math.cos(f) * CYL_R, CYL_REAR + 0.0058, CYL_Z + math.sin(f) * CYL_R), "blued", 0, rot=(0, -f + math.pi / 2, 0)))
g.cut(cyl, ccuts)
cyl_parts = [cyl]
star = g.lathe("star", [(0.0, 0.0), (0.0068, 0.0), (0.0068, 0.0009), (0.0, 0.0009)], (0, CYL_REAR - 0.0007, CYL_Z), "steel", verts=6)
cyl_parts.append(star)
cyl_parts.append(g.cyl("ejector_rod", 0.0028, 0.04, (0, CYL_FRONT + 0.019, CYL_Z), "steel", verts=18, bevel=0.0003))
tip = g.lathe("rod_tip", [(0.0, 0.0), (0.0034, 0.0), (0.0038, 0.0006), (0.0038, 0.0066), (0.0032, 0.0074), (0.0, 0.0074)], (0, CYL_FRONT + 0.0375, CYL_Z), "steel", verts=24)
g.cut(tip, [g.box(f"tip_knurl{i}", (0.0007, 0.005, 0.0007), (math.cos(i * math.pi / 6) * 0.0039, CYL_FRONT + 0.0412, CYL_Z + math.sin(i * math.pi / 6) * 0.0039), "steel", 0, rot=(0, -i * math.pi / 6, 0)) for i in range(12)])
cyl_parts.append(tip)
g.part("cylinder", cyl_parts, ((0, (CYL_REAR + CYL_FRONT) / 2, CYL_Z)))

# The six rounds (part "rounds"): they leave over the star and come back in off the loader.
rounds = []
for i, a in enumerate(CHAMBERS):
    cx, cz = math.cos(a) * CHAMBER_R, CYL_Z + math.sin(a) * CHAMBER_R
    rounds.append(g.lathe(f"case{i}", [(0.0, 0.0), (0.0056, 0.0), (0.0056, 0.0011), (0.0049, 0.0013), (0.0049, 0.0326), (0.0, 0.0326)], (cx, CYL_REAR - 0.0012, cz), "brass", verts=20))
    rounds.append(g.cyl(f"primer{i}", 0.0021, 0.0003, (cx, CYL_REAR - 0.00128, cz), "steel", verts=12, bevel=0))
    rounds.append(g.lathe(f"bullet{i}", [(0.0046, 0.0), (0.0046, 0.002), (0.0036, 0.006), (0.0022, 0.0078), (0.0, 0.008)], (cx, CYL_REAR + 0.0314, cz), "copper", verts=20))
g.part("rounds", rounds, REAR_FACE)

# The speedloader (part "loader"): a body that holds six rims and a knurled release knob.
loader = [g.lathe("loader_body", [(0.0, 0.0), (0.0148, 0.0), (0.0166, 0.0016), (0.0166, 0.0098), (0.0156, 0.0108), (0.0, 0.0108)], (0, CYL_REAR - 0.0122, CYL_Z), "polymer", verts=40, segments=2, bevel=0.0004)]
knob = g.lathe("loader_knob", [(0.0, 0.0), (0.007, 0.0), (0.0082, 0.0012), (0.0082, 0.0135), (0.0, 0.0135)], (0, CYL_REAR - 0.0257, CYL_Z), "anodised", verts=28, segments=2)
g.cut(knob, [g.box(f"knob_knurl{i}", (0.0012, 0.011, 0.0012), (math.cos(i * math.pi / 8) * 0.0084, CYL_REAR - 0.0185, CYL_Z + math.sin(i * math.pi / 8) * 0.0084), "anodised", 0, rot=(0, -i * math.pi / 8, 0)) for i in range(16)])
loader.append(knob)
g.part("loader", loader, REAR_FACE)

# The crane (part "crane"): the yoke the cylinder rides out of the frame on.
crane = [g.sweep("crane_arm", [(-0.0086, -0.0066), (0.0014, -0.0066), (0.0048, CYL_Z + 0.0046), (-0.0048, CYL_Z + 0.0046), (-0.0082, 0.004)], CYL_FRONT + 0.001, CYL_FRONT + 0.007, "blued", bevel=0.0008)]
crane.append(g.cyl("crane_pin", 0.0021, 0.016, (CRANE_PIVOT[0], CYL_FRONT + 0.011, CRANE_PIVOT[2]), "steel", verts=14, bevel=0.0003))
g.part("crane", crane, CRANE_PIVOT)

result = g.finish(texture=2048, draft=globals().get("ARGS", {}).get("draft", False))
