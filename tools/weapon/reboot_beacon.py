"""The Reboot Beacon and the Reboot Card (ticket 70).

Run from the repository root:
    blender --background --factory-startup --python tools/weapon/reboot_beacon.py
It writes packages/fps-client/src/viewmodel/assets/reboot-beacon.glb and
tools/weapon/reboot-beacon.blend, with the arsenal's baked finishes (gunsmith.py)
drawn at WORLD_SCALE so the wear reads at a metre and a half across.

Metres, Blender +Z up (game +Y), the origin on the ground under the Beacon's
middle. Parts, as the client's RebootView expects:
  body   the Beacon: a steel base on four feet, a battery cabinet and a mast;
  head   the antenna at the mast's top, which turns while it reboots (its origin on the mast's axis);
  lamp   the light bands on the cabinet and the mast, which the client lights by the Beacon's state;
  card   the Reboot Card, set apart from the Beacon (its origin at its middle),
         which the client copies for every Card lying on the island.
"""
import importlib
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import gunsmith  # noqa: E402

importlib.reload(gunsmith)
gunsmith.WORLD_SCALE = 10.0
for key in ("olive_paint", "yellow_paint"):
    gunsmith.FINISHES[key] = dict(gunsmith.FINISHES[key], wear_amount=0.3)

g = gunsmith.Gun("reboot-beacon")

BASE_W, BASE_H = 1.4, 0.16
CAB_W, CAB_D, CAB_H = 0.7, 0.5, 0.9
MAST_R, MAST_TOP = 0.05, 2.5

# ---------------------------------------------------------------------------
# The base: a steel plate on four feet, its edge in yellow hazard paint.
# ---------------------------------------------------------------------------
g.box("plate", (BASE_W, BASE_W, BASE_H), (0, 0, BASE_H / 2 + 0.04), "phosphate", bevel=0.02, segments=2)
for sx in (-1, 1):
    for sy in (-1, 1):
        g.box(f"foot{sx}{sy}", (0.2, 0.2, 0.06), (sx * (BASE_W / 2 - 0.08), sy * (BASE_W / 2 - 0.08), 0.03), "rubber", bevel=0.01, segments=1)
        g.cyl(f"bolt{sx}{sy}", 0.025, 0.03, (sx * (BASE_W / 2 - 0.12), sy * (BASE_W / 2 - 0.12), BASE_H + 0.05), "steel", axis="Z", verts=8)
for s in (-1, 1):
    g.box(f"hazard_x{s}", (BASE_W + 0.01, 0.08, 0.05), (0, s * (BASE_W / 2 - 0.035), BASE_H + 0.03), "yellow_paint", bevel=0.008, segments=1)
    g.box(f"hazard_y{s}", (0.08, BASE_W + 0.01, 0.05), (s * (BASE_W / 2 - 0.035), 0, BASE_H + 0.03), "yellow_paint", bevel=0.008, segments=1)

# ---------------------------------------------------------------------------
# The cabinet: an olive battery box with a card slot and vents.
# ---------------------------------------------------------------------------
Z0 = BASE_H + 0.04
g.box("cabinet", (CAB_W, CAB_D, CAB_H), (0, 0, Z0 + CAB_H / 2), "olive_paint", bevel=0.02, segments=2)
g.box("cab_lid", (CAB_W + 0.06, CAB_D + 0.06, 0.06), (0, 0, Z0 + CAB_H + 0.03), "olive_paint", bevel=0.012, segments=2)
for i in range(5):
    g.box(f"vent{i}", (0.4, 0.012, 0.03), (0, CAB_D / 2 + 0.004, Z0 + 0.2 + i * 0.07), "phosphate", bevel=0.004, segments=1)
# The card reader on the front (-Y): a dark panel with a slot.
g.box("reader", (0.34, 0.03, 0.26), (0, -CAB_D / 2 - 0.012, Z0 + CAB_H - 0.3), "polymer", bevel=0.01, segments=2)
g.box("slot", (0.24, 0.02, 0.016), (0, -CAB_D / 2 - 0.028, Z0 + CAB_H - 0.24), "rubber", bevel=0.003, segments=1)
g.text("label", "REBOOT", (-CAB_W / 2 - 0.002, 0, Z0 + 0.2), 0.09, "white_paint", side="-X", depth=0.004)
# Handles on the sides.
for sx in (-1, 1):
    x = sx * (CAB_W / 2 + 0.04)
    g.pipe(f"handle{sx}", [(sx * CAB_W / 2, -0.12, Z0 + 0.6), (x, -0.11, Z0 + 0.6), (x, 0.11, Z0 + 0.6), (sx * CAB_W / 2, 0.12, Z0 + 0.6)], 0.014, "steel", verts=8)

# ---------------------------------------------------------------------------
# The mast, with stays to the base.
# ---------------------------------------------------------------------------
TOP_CAB = Z0 + CAB_H + 0.06
g.cyl("mast", MAST_R, MAST_TOP - TOP_CAB, (0, 0, (MAST_TOP + TOP_CAB) / 2), "steel", axis="Z", verts=16, bevel=0.002)
g.cyl("collar", MAST_R + 0.03, 0.08, (0, 0, TOP_CAB + 0.04), "phosphate", axis="Z", verts=16, bevel=0.004)
for k in range(3):
    a = 2 * math.pi * k / 3 + 0.5
    g.pipe(f"stay{k}", [(0, 0, MAST_TOP - 0.55), (math.cos(a) * (BASE_W / 2 - 0.12), math.sin(a) * (BASE_W / 2 - 0.12), BASE_H + 0.06)], 0.008, "steel", verts=6)

# ---------------------------------------------------------------------------
# The light bands: round the cabinet's top and up the mast. The client lights them.
# ---------------------------------------------------------------------------
lamp = [g.box("band_front", (CAB_W + 0.012, CAB_D + 0.012, 0.05), (0, 0, Z0 + CAB_H - 0.08), "white_paint", bevel=0.006, segments=1)]
for i, z in enumerate((TOP_CAB + 0.35, TOP_CAB + 0.75)):
    lamp.append(g.cyl(f"mast_band{i}", MAST_R + 0.018, 0.1, (0, 0, z), "white_paint", axis="Z", verts=16, bevel=0.004))
g.part("lamp", lamp, (0, 0, 0))

# ---------------------------------------------------------------------------
# The head: a ring antenna with a beacon dome on top.
# ---------------------------------------------------------------------------
head = [
    g.torus("ring", 0.26, 0.022, (0, 0, MAST_TOP + 0.02), "steel", verts=24, ring=8),
    g.cyl("hub", 0.07, 0.12, (0, 0, MAST_TOP), "phosphate", axis="Z", verts=16, bevel=0.004),
]
for k in range(4):
    a = 2 * math.pi * k / 4
    head.append(g.pipe(f"spoke{k}", [(0, 0, MAST_TOP + 0.02), (0.25 * math.cos(a), 0.25 * math.sin(a), MAST_TOP + 0.02)], 0.01, "steel", verts=6))
    head.append(g.box(f"fin{k}", (0.03, 0.12, 0.22), (0.26 * math.cos(a), 0.26 * math.sin(a), MAST_TOP + 0.13), "olive_paint", rot=(0, 0, a), bevel=0.006, segments=1))
head.append(g.lathe("dome", [(0.0, MAST_TOP + 0.2), (0.06, MAST_TOP + 0.18), (0.08, MAST_TOP + 0.08)], (0, 0, 0), "white_paint", axis="Z", verts=16, closed=True))
g.part("head", head, (0, 0, MAST_TOP))

# ---------------------------------------------------------------------------
# The Reboot Card, apart from the Beacon: a hard plastic card with a chip and a stripe.
# ---------------------------------------------------------------------------
CX = 2.0
card = [
    g.box("card_body", (0.2, 0.012, 0.13), (CX, 0, 1.0), "polymer", bevel=0.004, segments=2),
    g.box("card_stripe", (0.205, 0.014, 0.03), (CX, 0, 1.03), "white_paint", bevel=0.002, segments=1),
    g.box("card_chip", (0.04, 0.016, 0.032), (CX - 0.055, 0, 0.985), "brass", bevel=0.002, segments=1),
]
g.part("card", card, (CX, 0, 1.0))

result = g.finish(texture=2048, draft=globals().get("ARGS", {}).get("draft", False))
