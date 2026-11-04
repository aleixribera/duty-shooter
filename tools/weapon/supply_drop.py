"""The Supply Drop: a steel airdrop crate under its parachute, and the flare that marks it.

Run from the repository root:
    blender --background --factory-startup --python tools/weapon/supply_drop.py
or in the Blender session: bkit.run(r"tools/weapon/supply_drop.py").
It writes packages/fps-client/src/viewmodel/assets/supply-drop.glb and
tools/weapon/supply-drop.blend, with the arsenal's baked finishes (gunsmith.py)
drawn at WORLD_SCALE so the wear reads a metre across.

Metres, Blender +Z up (game +Y), the origin on the ground under the crate's
middle. Parts, as the client's SupplyDropView expects:
  body   the crate and its skids;
  lid    the lid, pivoting on its back (+Y) top edge, which swings open once the crate is;
  chute  the canopy and its lines, from the crate's top (its origin), which the
         client scales away as the crate lands;
  flare  the flare stuck in the ground beside the crate (its origin at the tip,
         where the client starts its smoke).
"""
import importlib
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import gunsmith  # noqa: E402
from mathutils import Matrix, Vector  # noqa: E402

importlib.reload(gunsmith)
gunsmith.WORLD_SCALE = 18.0
# A crate is knocked about less at its edges than a grenade: its paint wears in chips, not bands.
for key in ("olive_paint", "yellow_paint"):
    gunsmith.FINISHES[key] = dict(gunsmith.FINISHES[key], wear_amount=0.28)

g = gunsmith.Gun("supply-drop")

W, D = 1.2, 0.8  # the crate's footprint along X and Y
SKID = 0.07  # skid height under the body
BODY_H = 0.58  # the body, from the skids to the lid
LID_H = 0.12
TOP = SKID + BODY_H + LID_H
BV = 0.012  # bevel on the big panels

# ---------------------------------------------------------------------------
# The body: a painted steel box on two skids, ribbed, banded in yellow, with steel corners and handles.
# ---------------------------------------------------------------------------
g.box("shell", (W, D, BODY_H), (0, 0, SKID + BODY_H / 2), "olive_paint", bevel=BV, segments=2)
for sy in (-1, 1):
    g.box(f"skid{sy}", (W + 0.04, 0.09, SKID), (0, sy * (D / 2 - 0.1), SKID / 2), "phosphate", bevel=0.008, segments=1)
# Pressed ribs across the long faces.
for i, x in enumerate((-0.42, -0.14, 0.14, 0.42)):
    for sy in (-1, 1):
        g.box(f"rib{i}{sy}", (0.05, 0.02, BODY_H - 0.12), (x, sy * (D / 2 + 0.008), SKID + BODY_H / 2), "olive_paint", bevel=0.006, segments=1)
# Two yellow bands round the body, so it reads as a drop from far off.
for sx in (-1, 1):
    g.box(f"band{sx}", (0.1, D + 0.024, BODY_H + 0.012), (sx * 0.28, 0, SKID + BODY_H / 2), "yellow_paint", bevel=0.006, segments=1)
# Steel corner caps, top and bottom.
for sx in (-1, 1):
    for sy in (-1, 1):
        for z in (SKID + 0.05, SKID + BODY_H - 0.05):
            g.box(f"corner{sx}{sy}{z:.2f}", (0.1, 0.1, 0.1), (sx * (W / 2 - 0.04), sy * (D / 2 - 0.04), z), "steel", bevel=0.01, segments=1)
# Carry handles on the ends.
for sx in (-1, 1):
    x = sx * (W / 2 + 0.03)
    g.pipe(f"handle{sx}", [(sx * W / 2, -0.14, SKID + 0.42), (x, -0.13, SKID + 0.42), (x, 0.13, SKID + 0.42), (sx * W / 2, 0.14, SKID + 0.42)], 0.012, "steel", verts=8)
    g.box(f"plate{sx}", (0.012, 0.36, 0.08), (sx * (W / 2 + 0.004), 0, SKID + 0.42), "steel", bevel=0.003, segments=1)
# Stencilled lettering on the front (-Y) face, between the bands.
front = g.box("label", (0.4, 0.004, 0.16), (0, -D / 2 - 0.002, SKID + 0.34), "white_paint", bevel=0.0, segments=1)

# ---------------------------------------------------------------------------
# The lid, hinged on the back edge.
# ---------------------------------------------------------------------------
lid = [g.box("lid_top", (W + 0.03, D + 0.03, LID_H), (0, 0, SKID + BODY_H + LID_H / 2), "olive_paint", bevel=BV, segments=2)]
for sx in (-1, 1):
    lid.append(g.box(f"lid_band{sx}", (0.1, D + 0.05, LID_H + 0.012), (sx * 0.28, 0, SKID + BODY_H + LID_H / 2), "yellow_paint", bevel=0.006, segments=1))
    lid.append(g.box(f"latch{sx}", (0.08, 0.03, 0.12), (sx * 0.5, -D / 2 - 0.02, SKID + BODY_H), "steel", bevel=0.005, segments=1))
lid.append(g.box("lid_rib", (W - 0.2, 0.06, 0.025), (0, 0, TOP + 0.012), "olive_paint", bevel=0.006, segments=1))
g.part("lid", lid, (0, D / 2 + 0.015, SKID + BODY_H))

# ---------------------------------------------------------------------------
# The parachute: a dome of nylon gores on eight lines to a harness ring over the lid.
# ---------------------------------------------------------------------------
RIM_R, RIM_Z, APEX_Z = 2.7, TOP + 5.1, TOP + 6.5
GORES = 12
profile = [(0.25, APEX_Z), (1.0, APEX_Z - 0.18), (1.75, APEX_Z - 0.55), (2.3, APEX_Z - 0.95), (RIM_R, RIM_Z)]
canopy = g.lathe("canopy", profile, (0, 0, 0), "nylon", axis="Z", verts=GORES * 2, closed=False)
solid = canopy.modifiers.new("thickness", "SOLIDIFY")
solid.thickness = 0.03
canopy.modifiers.move(len(canopy.modifiers) - 1, 0)
# The vent cap at the crown.
vent = g.lathe("vent", [(0.0, APEX_Z + 0.02), (0.28, APEX_Z - 0.01)], (0, 0, 0), "nylon", axis="Z", verts=12, closed=True)
chute = [canopy, vent]
# The skirt scallops: a gore seam band at each line.
RING_Z = TOP + 1.1
lines = 8
for k in range(lines):
    a = 2 * math.pi * k / lines + math.pi / lines
    rim = (RIM_R * 0.995 * math.cos(a), RIM_R * 0.995 * math.sin(a), RIM_Z - 0.02)
    chute.append(g.pipe(f"line{k}", [rim, (0.06 * math.cos(a), 0.06 * math.sin(a), RING_Z)], 0.008, "nylon", verts=5))
# Risers from the ring to the crate's corners.
chute.append(g.torus("ring", 0.07, 0.014, (0, 0, RING_Z), "steel", verts=16, ring=6))
for sx in (-1, 1):
    for sy in (-1, 1):
        chute.append(g.pipe(f"riser{sx}{sy}", [(0, 0, RING_Z), (sx * (W / 2 - 0.06), sy * (D / 2 - 0.06), TOP + 0.01)], 0.012, "nylon", verts=5))
g.part("chute", chute, (0, 0, TOP))

# ---------------------------------------------------------------------------
# The flare: a red tube stuck into the ground beside the crate, its tip burning.
# ---------------------------------------------------------------------------
FX, FY = W / 2 + 0.55, -0.25
LEAN = math.radians(12)
L = 0.34
tube = g.cyl("flare_tube", 0.028, L, (0, 0, L / 2), "red_paint", axis="Z", verts=12, bevel=0.002)
cap = g.cyl("flare_cap", 0.031, 0.04, (0, 0, L - 0.02), "phosphate", axis="Z", verts=12, bevel=0.002)
# Leaning away from the crate: the geometry turned about the foot, then set beside the crate.
turn = Matrix.Translation((FX, FY, -0.04)) @ Matrix.Rotation(LEAN, 4, "Y")
for o in (tube, cap):
    o.data.transform(turn)
tip = turn @ Vector((0, 0, L))
g.part("flare", [tube, cap], tuple(tip))

result = g.finish(texture=2048, draft=globals().get("ARGS", {}).get("draft", False))
