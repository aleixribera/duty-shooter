"""The tacticals (ticket 20): a smoke canister and a flash, built on the frag's fuze and lever.

Imported by smoke.py and flash.py; each runs from the repository root:
    blender --background --factory-startup --python tools/weapon/smoke.py
    blender --background --factory-startup --python tools/weapon/flash.py
and writes packages/fps-client/src/viewmodel/assets/<name>.glb and tools/weapon/<name>.blend.

The layout follows frag.py so the viewmodel holds and throws them the same way:
the origin is the body's centre, Blender +Z is up (game +Y), the lever runs down
the +Y side and the pull ring hangs off +X. The lever is the `spoon` part and
the pin with its ring the `ring` part, both pivoting on the pin.
"""
import importlib
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import gunsmith  # noqa: E402

importlib.reload(gunsmith)

THICK = 0.0011


def offset_outline(points, thickness, centre):
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


def fuze_and_lever(g, top, radius):
    """The frag's fuze screwed into a canister lid at height `top`, its lever running straight down the side at `radius`."""
    dz = top - 0.031
    pin = (0.012, 0.0495 + dz)
    g.lathe("fuze", [(0.0, 0.031), (0.0106, 0.031), (0.0106, 0.0345), (0.0128, 0.0345), (0.0128, 0.0376), (0.0094, 0.0386),
                     (0.0092, 0.051), (0.0083, 0.0527), (0.0078, 0.0553), (0.006, 0.0571), (0.0, 0.0575)],
            (0, 0, dz), "phosphate", axis="Z", verts=32, bevel=0.0003)
    for sx in (-1, 1):
        g.box(f"fuze_lug{sx}", (0.003, 0.0066, 0.009), (sx * 0.0075, 0.0124, pin[1]), "phosphate", bevel=0.0005)
    clip = [(0.0108 * math.cos(a), 0.0045 + 0.0142 * math.sin(a), 0.0415 + dz) for a in (2 * math.pi * k / 24 for k in range(25))]
    g.pipe("safety_clip", clip, 0.0007, "steel", verts=6)

    lever_y = radius + 0.0017
    # Over the cap, out to the canister's edge, then down its side two-thirds of the way.
    path = [(-0.0045, 0.0578 + dz), (0.006, 0.0578 + dz), (0.0112, 0.0573 + dz), (0.0146, 0.0556 + dz), (0.0158, 0.052 + dz),
            (0.0158, 0.036 + dz), (lever_y - 0.003, top + 0.002), (lever_y, top - 0.004), (lever_y, top - radius * 2.4),
            (lever_y + 0.0022, top - radius * 2.4 - 0.004)]
    spoon = [g.slab("lever", offset_outline(path, THICK, (0.0, top - radius)), 0.0135, "phosphate", bevel=0.0003, segments=1, angle=40)]
    for sx in (-1, 1):
        spoon.append(g.slab(f"lever_ear{sx}", gunsmith.soften([(0.0095, pin[1] + 0.006), (0.0163, pin[1] + 0.006), (0.0163, pin[1] - 0.005), (0.0095, pin[1] - 0.005)], 2),
                            0.001, "phosphate", bevel=0.0002, x=sx * 0.0097, segments=1))
    g.part("spoon", spoon, (0, pin[0], pin[1]))

    ring = [g.pipe("pin", [(-0.0118, pin[0], pin[1]), (0.0165, pin[0], pin[1])], 0.0008, "steel", verts=8)]
    for d in (-1, 1):
        ring.append(g.pipe(f"pin_leg{d}", [(-0.0118, pin[0], pin[1] + d * 0.0004), (-0.0142, pin[0] - 0.0015, pin[1] + d * 0.0032),
                                           (-0.0152, pin[0] - 0.0035, pin[1] + d * 0.0042)], 0.00055, "steel", verts=6))
    ring.append(g.torus("pull_ring", 0.0108, 0.0011, (0.0262, pin[0] - 0.0016, pin[1] - 0.0018), "steel", rot=(math.pi / 2, 0, 0.32), verts=32, ring=8))
    g.part("ring", ring, (0, pin[0], pin[1]))


def smoke(g):
    """An M18-style smoke: a squat painted can, a pale band and lettering, four vents round the lid, a crimped foot."""
    r, h = 0.029, 0.104
    top, foot = h / 2, -h / 2
    g.lathe("can", [(0.0, foot), (r - 0.002, foot), (r, foot + 0.002), (r, top - 0.002), (r - 0.002, top), (0.0105, top), (0.0105, top + 0.001), (0.0, top + 0.001)],
            (0, 0, 0), "olive_paint", axis="Z", verts=44, bevel=0.0004)
    for i, z in enumerate((foot + 0.004, top - 0.004)):
        g.torus(f"crimp{i}", r + 0.0002, 0.0009, (0, 0, z), "olive_paint", verts=48, ring=6)
    # The band: a thin sleeve standing just proud of the paint.
    g.lathe("band", [(r - 0.0004, 0.004), (r + 0.0003, 0.004), (r + 0.0003, 0.022), (r - 0.0004, 0.022)], (0, 0, 0), "white_paint", axis="Z", verts=44)
    # Four vents in the lid, round the fuze.
    for k in range(4):
        a = math.pi / 4 + k * math.pi / 2
        g.lathe(f"vent{k}", [(0.0, top + 0.0002), (0.0032, top + 0.0002), (0.0032, top + 0.0006), (0.0, top + 0.0006)],
                (0.019 * math.cos(a), 0.019 * math.sin(a), 0), "rubber", axis="Z", verts=16)
    fuze_and_lever(g, top + 0.001, r)


def flash(g):
    """An M84-style flash: a steel tube punched with rows of ports, darker end caps, a yellow band at the foot."""
    r, h = 0.0225, 0.11
    top, foot = h / 2, -h / 2
    g.lathe("tube", [(0.0, foot + 0.008), (r, foot + 0.008), (r, top - 0.008), (0.0, top - 0.008)], (0, 0, 0), "steel", axis="Z", verts=40)
    for i, (z0, z1) in enumerate(((foot, foot + 0.009), (top - 0.009, top))):
        g.lathe(f"cap{i}", [(0.0, z0), (r + 0.0012 - 0.001, z0), (r + 0.0012, z0 + 0.001), (r + 0.0012, z1 - 0.001), (r + 0.0012 - 0.001, z1), (0.0, z1)],
                (0, 0, 0), "anodised", axis="Z", verts=40, bevel=0.0003)
    g.lathe("band", [(r + 0.0013, foot + 0.002), (r + 0.0016, foot + 0.002), (r + 0.0016, foot + 0.007), (r + 0.0013, foot + 0.007)], (0, 0, 0), "yellow_paint", axis="Z", verts=40)
    # The ports: three rows of eight, staggered, each a dark slot set into the tube.
    for row in range(3):
        z = -0.026 + row * 0.024
        for k in range(8):
            a = (k + (0.5 if row % 2 else 0.0)) * math.pi / 4
            g.box(f"port{row}_{k}", (0.0016, 0.0062, 0.011), ((r - 0.0004) * math.cos(a), (r - 0.0004) * math.sin(a), z), "rubber",
                  bevel=0.0004, rot=(0, 0, a))
    fuze_and_lever(g, top, r + 0.0012)


def build(name, body, draft=False):
    g = gunsmith.Gun(name)
    body(g)
    return g.finish(texture=1024, draft=draft)
