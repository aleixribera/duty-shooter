"""The frag: an M67-style fragmentation grenade with an M213-style fuze.

Run from the repository root:
    blender --background --factory-startup --python tools/weapon/frag.py
or in the Blender session: bkit.run(r"tools/weapon/frag.py").
It writes packages/fps-client/src/viewmodel/assets/frag.glb and tools/weapon/frag.blend.

The origin is the body's centre and Blender +Z is up (game +Y): the viewmodel
puts that centre in the support palm and the world view spins it about it.
The lever runs down the +Y side (away from the player in the hand) and the pull
ring hangs off the +X side, toward the right hand. The lever is the `spoon`
part and the pin with its ring the `ring` part, both pivoting on the pin.
"""
import importlib
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import gunsmith  # noqa: E402

importlib.reload(gunsmith)

g = gunsmith.Gun("frag")

R = 0.0318  # the body: a 64 mm steel sphere
NECK_R, NECK_Z = 0.0105, 0.030
PIN = (0.012, 0.0495)  # (y, z) of the safety pin, along X through the fuze's lugs
LEVER_Y = 0.0158  # the lever's inside face where it runs down past the fuze


def sphere_profile(radius, a0, a1, steps):
    """[(r, z), ...] on a sphere from latitude `a0` to `a1` (degrees)."""
    out = []
    for i in range(steps + 1):
        a = math.radians(a0 + (a1 - a0) * i / steps)
        out.append((radius * math.cos(a), radius * math.sin(a)))
    return out


# ---------------------------------------------------------------------------
# Body: the painted sphere, its weld seam, the yellow filler band and the neck.
# ---------------------------------------------------------------------------
neck_lat = math.degrees(math.acos(NECK_R / R))
g.lathe("body_shell", [(0.0, -R)] + sphere_profile(R, -86, neck_lat, 30) + [(NECK_R, 0.0335)], (0, 0, 0), "olive_paint", axis="Z", verts=40)
g.torus("weld_seam", R - 0.0001, 0.0004, (0, 0, 0), "olive_paint", verts=48, ring=6)
g.lathe("filler_band", sphere_profile(R + 0.00018, 47, 53, 3), (0, 0, 0), "yellow_paint", axis="Z", verts=40)

# ---------------------------------------------------------------------------
# Fuze: threaded into the neck, a flange, the body with the striker lugs, a domed cap.
# ---------------------------------------------------------------------------
g.lathe("fuze", [(0.0, 0.031), (0.0106, 0.031), (0.0106, 0.0345), (0.0128, 0.0345), (0.0128, 0.0376), (0.0094, 0.0386),
                 (0.0092, 0.051), (0.0083, 0.0527), (0.0078, 0.0553), (0.006, 0.0571), (0.0, 0.0575)],
        (0, 0, 0), "phosphate", axis="Z", verts=32, bevel=0.0003)
for i in range(3):
    g.torus(f"fuze_thread{i}", 0.0106, 0.0004, (0, 0, 0.0315 + i * 0.0011), "phosphate", verts=32, ring=4)
for sx in (-1, 1):
    g.box(f"fuze_lug{sx}", (0.003, 0.0066, 0.009), (sx * 0.0075, 0.0124, PIN[1]), "phosphate", bevel=0.0005)
# The safety clip: a wire round the fuze and over the lever.
clip = [(0.0108 * math.cos(a), 0.0045 + 0.0142 * math.sin(a), 0.0415) for a in (2 * math.pi * k / 24 for k in range(25))]
g.pipe("safety_clip", clip, 0.0007, "steel", verts=6)

# ---------------------------------------------------------------------------
# The lever ("spoon"): over the cap, down past the fuze, then along the body.
# ---------------------------------------------------------------------------
LEVER_R = R + 0.0017
lat_top = math.degrees(math.acos(LEVER_Y / LEVER_R))
path = [(-0.0045, 0.0578), (0.006, 0.0578), (0.0112, 0.0573), (0.0146, 0.0556), (LEVER_Y, 0.052), (LEVER_Y, 0.034)]
path += [(r, z) for r, z in sphere_profile(LEVER_R, lat_top - 2, -34, 10)]
path += [(LEVER_R * math.cos(math.radians(-41)) + 0.0025, LEVER_R * math.sin(math.radians(-41)) + 0.0006)]
THICK = 0.0011


def offset_outline(points, thickness, centre=(0.0, 0.03)):
    """A closed outline: `points` plus a copy offset `thickness` outward (away from `centre`)."""
    outer = []
    for i, (y, z) in enumerate(points):
        a = points[max(i - 1, 0)]
        b = points[min(i + 1, len(points) - 1)]
        ty, tz = b[0] - a[0], b[1] - a[1]
        n = math.hypot(ty, tz)
        ny, nz = -tz / n, ty / n
        if ny * (y - centre[0]) + nz * (z - centre[1]) < 0:
            ny, nz = -ny, -nz
        outer.append((y + ny * thickness, z + nz * thickness))
    return list(points) + list(reversed(outer))


def lever_taper(y, z):
    # 13.5 mm wide over the fuze, narrowing to 11 mm at the tail.
    return 1.0 - 0.19 * min(max((0.034 - z) / 0.055, 0.0), 1.0)


spoon = [g.slab("lever", offset_outline(path, THICK), 0.0135, "phosphate", bevel=0.0003, segments=1, angle=40, taper=lever_taper)]
# Its ears wrap the fuze lugs, outside them, round the pin.
for sx in (-1, 1):
    spoon.append(g.slab(f"lever_ear{sx}", gunsmith.soften([(0.0095, 0.0555), (LEVER_Y + 0.0005, 0.0555), (LEVER_Y + 0.0005, 0.0445), (0.0095, 0.0445)], 2),
                        0.001, "phosphate", bevel=0.0002, x=sx * 0.0097, segments=1))
g.part("spoon", spoon, (0, PIN[0], PIN[1]))

# ---------------------------------------------------------------------------
# The safety pin through the lugs, its split legs bent back, and the pull ring.
# ---------------------------------------------------------------------------
ring = [g.pipe("pin", [(-0.0118, PIN[0], PIN[1]), (0.0165, PIN[0], PIN[1])], 0.0008, "steel", verts=8)]
for dz in (-1, 1):
    ring.append(g.pipe(f"pin_leg{dz}", [(-0.0118, PIN[0], PIN[1] + dz * 0.0004), (-0.0142, PIN[0] - 0.0015, PIN[1] + dz * 0.0032),
                                        (-0.0152, PIN[0] - 0.0035, PIN[1] + dz * 0.0042)], 0.00055, "steel", verts=6))
ring.append(g.torus("pull_ring", 0.0108, 0.0011, (0.0262, PIN[0] - 0.0016, PIN[1] - 0.0018), "steel", rot=(math.pi / 2, 0, 0.32), verts=32, ring=8))
g.part("ring", ring, (0, PIN[0], PIN[1]))

result = g.finish(texture=1024, draft=globals().get("ARGS", {}).get("draft", False))
