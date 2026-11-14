"""The attachments seen on a gun (PLAN item 7, Customizing): muzzle devices, foregrips and the speed magazine's pull tab.

Run from the repository root:
    blender --background --factory-startup --python tools/weapon/fittings.py
It writes one GLB per fitting to packages/fps-client/src/viewmodel/assets/ (suppressor, compensator, grip-vertical,
grip-angled, mag-tab) and its .blend here. The client (packages/fps-client/src/viewmodel/fittings.ts) puts each on a
gun at its origin:

- A muzzle device's origin is the gun's muzzle on the bore axis; the device runs forward along +Y (game -Z) and its
  rear sleeve reaches SLEEVE back over the barrel's own crown or flash hider. Its front is LENGTH ahead.
- A grip's origin is the middle of its clamp's top face, which sits on the handguard's underside; it hangs down -Z.
- The pull tab's origin is the middle of its top, which sits on the magazine's floor plate.
"""
import importlib
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import gunsmith  # noqa: E402

importlib.reload(gunsmith)
soften = gunsmith.soften
DRAFT = globals().get("ARGS", {}).get("draft", False)

# Landmarks the client reads (keep in step with fittings.ts).
SUPPRESSOR_SLEEVE = 0.03
SUPPRESSOR_LENGTH = 0.13
COMPENSATOR_SLEEVE = 0.016
COMPENSATOR_LENGTH = 0.042
BORE = 0.0045

out = {}

# ---------------------------------------------------------------------------
# Suppressor: a can with a stepped rear collar, wrench flats and a front cap.
# ---------------------------------------------------------------------------
g = gunsmith.Gun("suppressor")
S0, S1 = -SUPPRESSOR_SLEEVE, SUPPRESSOR_LENGTH
R = 0.0185
g.lathe("can", [(BORE, S1), (R - 0.0012, S1), (R, S1 - 0.0016), (R, S0 + 0.034), (R - 0.0006, S0 + 0.032), (R - 0.0006, S0 + 0.012),
                (R - 0.0026, S0), (0.0118, S0), (0.0118, 0.0), (BORE, 0.0), (BORE, S1)],
        (0, 0, 0), "phosphate", axis="Y", verts=40, closed=False)
# Grip rings knurled into the body near the rear, and a steel front cap face.
for i in range(5):
    y = S0 + 0.038 + i * 0.0045
    g.torus(f"rib{i}", R, 0.0007, (0, y, 0), "phosphate", rot=(math.pi / 2, 0, 0), verts=40, ring=6)
g.tube("cap", 0.0128, BORE + 0.0006, 0.0018, (0, S1 + 0.0004, 0), "steel", verts=32)
for side in (-1, 1):
    g.box(f"flat{side}", (0.003, 0.012, 0.012), (side * (R - 0.0018), S0 + 0.006, 0), "phosphate", 0.0004)
out["suppressor"] = g.finish(texture=512, draft=DRAFT)

# ---------------------------------------------------------------------------
# Compensator: a short block with ports cut in its top and sides, open at the front.
# ---------------------------------------------------------------------------
g = gunsmith.Gun("compensator")
C0, C1 = -COMPENSATOR_SLEEVE, COMPENSATOR_LENGTH
RC = 0.0122
body = g.lathe("comp", [(BORE, C1), (RC - 0.001, C1), (RC, C1 - 0.0012), (RC, C0 + 0.003), (RC - 0.0016, C0), (0.0098, C0),
                        (0.0098, 0.0), (BORE, 0.0), (BORE, C1)],
               (0, 0, 0), "nitride", axis="Y", verts=24, closed=False)
ports = []
for i, y in enumerate((0.008, 0.018, 0.028)):
    ports.append(g.box(f"port_top{i}", (0.009, 0.0045, 0.03), (0, y, 0.012), "nitride", 0))
    for side in (-1, 1):
        ports.append(g.box(f"port_side{i}{side}", (0.03, 0.0045, 0.0062), (side * 0.012, y + 0.002, 0.0), "nitride", 0))
g.cut(body, ports)
out["compensator"] = g.finish(texture=512, draft=DRAFT)


def clamp(g, length):
    """A rail clamp: a plate on the rail's underside and two jaws up its sides, a cross bolt on the right."""
    g.box("clamp_plate", (0.024, length, 0.006), (0, 0, -0.003), "anodised", 0.0008)
    for side in (-1, 1):
        g.box(f"clamp_jaw{side}", (0.003, length - 0.004, 0.009), (side * 0.0118, 0, 0.0015), "anodised", 0.0006)
    g.cyl("clamp_bolt", 0.0036, 0.004, (0.0142, 0, -0.002), "steel", axis="X", verts=6, bevel=0.0003)


# ---------------------------------------------------------------------------
# Vertical grip: a tapered post with finger grooves and a flared foot.
# ---------------------------------------------------------------------------
g = gunsmith.Gun("grip-vertical")
clamp(g, 0.036)
H = 0.082
profile = [(0.0, -0.005)]
for i in range(9):
    z = -0.006 - i * 0.0085
    groove = 0.0012 if 1 <= i <= 6 and i % 2 == 0 else 0.0
    profile.append((0.0128 - i * 0.00022 - groove, z))
profile += [(0.0136, -H + 0.003), (0.0128, -H), (0.0, -H)]
g.lathe("post", [(r, z) for r, z in profile], (0, 0, 0), "polymer", axis="Z", verts=32)
g.cyl("foot_cap", 0.0105, 0.0016, (0, 0, -H - 0.0006), "stipple", axis="Z", verts=32, bevel=0.0004)
out["grip-vertical"] = g.finish(texture=512, draft=DRAFT)

# ---------------------------------------------------------------------------
# Angled grip: a raked wedge under the handguard that the palm's heel rests behind.
# ---------------------------------------------------------------------------
g = gunsmith.Gun("grip-angled")
clamp(g, 0.05)
wedge = soften([(-0.026, -0.005, True), (0.03, -0.005, True), (0.028, -0.011), (-0.006, -0.036), (-0.016, -0.036), (-0.026, -0.016)], 2)
g.slab("wedge", wedge, 0.02, "polymer", bevel=0.0015, taper=lambda y, z: 1.0 - max(0.0, -z - 0.012) * 6.0)
g.slab("stipple_face", [(y, z) for y, z in soften([(-0.025, -0.008), (-0.008, -0.031), (-0.016, -0.033), (-0.0255, -0.017)], 1)],
       0.021, "stipple", bevel=0.0004, taper=lambda y, z: 1.0 - max(0.0, -z - 0.012) * 6.0)
out["grip-angled"] = g.finish(texture=512, draft=DRAFT)

# ---------------------------------------------------------------------------
# Speed magazine's pull tab: a rubber loop under the floor plate.
# ---------------------------------------------------------------------------
g = gunsmith.Gun("mag-tab")
g.box("tab_base", (0.016, 0.034, 0.004), (0, 0, -0.002), "rubber", 0.0008)
loop = g.slab("tab_loop", soften([(-0.014, -0.003, True), (0.014, -0.003, True), (0.012, -0.02), (-0.012, -0.02)], 2), 0.008, "rubber", bevel=0.0012)
g.cut(loop, [g.slab("tab_hole", soften([(-0.0085, -0.007), (0.0085, -0.007), (0.007, -0.0155), (-0.007, -0.0155)], 2), 0.02, "rubber", bevel=0)])
out["mag-tab"] = g.finish(texture=512, draft=DRAFT)

print("FITTINGS", out)
