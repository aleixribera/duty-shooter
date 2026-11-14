"""The rail optics (ticket 19): the Reflex and the Prism 2x, each its own GLB.

Run from the repository root:
    blender --background --factory-startup --python tools/weapon/optics.py
It writes packages/fps-client/src/viewmodel/assets/reflex.glb and prism.glb, and
tools/weapon/reflex.blend and prism.blend.

Gun space and the shared tools are described in gunsmith.py. Each optic is
modelled with its origin on the rail's top face, under the middle of its clamp,
so the client puts that origin on a gun's rail (`optic` in
packages/fps-client/src/viewmodel/optics.ts, whose numbers come from the
landmarks below): the sight axis stands AXIS_Z above the rail, and the eye looks
down it from behind the rear rim at REAR (Blender y; gun z is -y).

- Reflex: an open window on a low riser. A thin glass pane (finish `lens`, which
  the client draws as clear tinted glass) with the red dot just behind it, on the
  axis (finish `red_insert`, which the client makes glow).
- Prism 2x: a compact prism block with an eyepiece and an objective bell, open
  along its axis like the Vantage's optic, a ring and a centre dot inside.
"""
import importlib
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bmesh  # noqa: E402
import gunsmith  # noqa: E402

importlib.reload(gunsmith)
soften = gunsmith.soften
DRAFT = globals().get("ARGS", {}).get("draft", False)

# Landmarks the client reads (keep in step with optics.ts).
REFLEX_AXIS_Z = 0.032
REFLEX_REAR = -0.006
PRISM_AXIS_Z = 0.032
PRISM_REAR = -0.0345


def clamp(g, length, knobs):
    """A rail clamp: a base plate on the rail's top, jaws down its sides, cross-bolts on the right."""
    g.box("clamp_plate", (0.026, length, 0.005), (0, 0, 0.0025), "anodised", 0.0009)
    for side in (-1, 1):
        g.box(f"clamp_jaw{side}", (0.0032, length - 0.004, 0.0095), (side * 0.0122, 0, -0.0015), "anodised", 0.0007)
    for i, y in enumerate(knobs):
        knob = g.lathe(f"clamp_bolt{i}", [(0.0, 0.0), (0.0042, 0.0), (0.0048, 0.001), (0.0048, 0.0052), (0.0, 0.0052)],
                       (0.0138, y, -0.0005), "steel", axis="X", verts=6)
        g.cut(knob, [g.box(f"clamp_slot{i}", (0.004, 0.0008, 0.0064), (0.0188, y, -0.0005), "steel", 0)])


def chevron(g, name, y, z, length, width):
    """Two bars meeting in a point at (0, y, z), each `length` long, raked 35 degrees down to the sides.

    They cross a bar's width past the point, so the point itself is lit: the aim is the chevron's tip.
    """
    phi = math.radians(35)
    half = length / 2 - width
    return [g.box(f"{name}{side}", (length, 0.0003, width), (side * math.cos(phi) * half, y, z - math.sin(phi) * half),
                  "red_insert", 0, rot=(0, side * phi, 0)) for side in (-1, 1)]


def bored_block(g, name, hx, zb, zt, r, y0, y1, z, mat, bevel):
    """A block x in [-hx, hx], z in [z + zb, z + zt], from y0 to y1, with a round bore of radius `r` along Y at height z.

    Built ring to ring rather than cut: a boolean leaves the end faces as n-gons round the hole, and triangulating
    them can close the bore.
    """
    corners = [math.atan2(zt, hx), math.atan2(zt, -hx), math.atan2(zb, -hx) % (2 * math.pi), math.atan2(zb, hx) % (2 * math.pi)]
    angles = sorted({round(2 * math.pi * k / 64, 9) for k in range(64)} | {round(a % (2 * math.pi), 9) for a in corners})

    def edge(a):
        c, s = math.cos(a), math.sin(a)
        t = min(v for v in ((hx / c) if c > 1e-9 else None, (-hx / c) if c < -1e-9 else None,
                            (zt / s) if s > 1e-9 else None, (zb / s) if s < -1e-9 else None) if v is not None)
        return c * t, s * t

    bm = bmesh.new()
    rings = []
    for y in (y0, y1):
        outer = [bm.verts.new((edge(a)[0], y, z + edge(a)[1])) for a in angles]
        inner = [bm.verts.new((r * math.cos(a), y, z + r * math.sin(a))) for a in angles]
        rings.append((outer, inner))
    n = len(angles)
    (fo, fi), (bo, bi) = rings
    for k in range(n):
        j = (k + 1) % n
        bm.faces.new((fo[k], fo[j], fi[j], fi[k]))
        bm.faces.new((bo[j], bo[k], bi[k], bi[j]))
        bm.faces.new((fo[j], fo[k], bo[k], bo[j]))
        bm.faces.new((fi[k], fi[j], bi[j], bi[k]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return g._obj(name, bm, mat, bevel, 3, 25)


def turret(g, name, axis, loc, r, h):
    """A knurled adjustment cap, grown along +Z or out to the side along X."""
    grow = -1 if axis == "X" and loc[0] < 0 else 1
    profile = [(0.0, 0.0), (r, 0.0), (r, h - 0.0012), (r - 0.001, h), (0.0, h)] if grow > 0 else \
        [(0.0, 0.0), (r - 0.001, 0.0), (r, 0.0012), (r, h), (0.0, h)]
    t = g.lathe(name, profile, loc if grow > 0 else (loc[0] - h, loc[1], loc[2]), "anodised", axis=axis, verts=24)
    cuts = []
    for i in range(12):
        a = 2 * math.pi * i / 12
        if axis == "Z":
            cuts.append(g.box(f"{name}_k{i}", (0.001, 0.001, h), (loc[0] + math.cos(a) * r, loc[1] + math.sin(a) * r, loc[2] + h / 2 + 0.0015), "anodised", 0, rot=(0, 0, a)))
        else:
            cuts.append(g.box(f"{name}_k{i}", (h, 0.001, 0.001), (loc[0] + grow * (h / 2 + 0.0015), loc[1] + math.cos(a) * r, loc[2] + math.sin(a) * r), "anodised", 0, rot=(a, 0, 0)))
    g.cut(t, cuts)
    return t


# ---------------------------------------------------------------------------
# Reflex: a riser, a housing, and a hooded window with the dot behind its glass.
# ---------------------------------------------------------------------------
g = gunsmith.Gun("reflex")
A = REFLEX_AXIS_Z
clamp(g, 0.034, (0.0,))
# Riser and housing stop at the window's rear rim: anything behind it sits close to the eye and fills the view.
g.box("riser", (0.022, 0.026, 0.009), (0, 0.007, 0.0095), "anodised", 0.0012)
g.box("housing", (0.027, 0.02, 0.008), (0, 0.004, 0.0175), "anodised", 0.0016)
# The hood: a rounded frame, cut through to its window, the front edge raked back at the top.
hood_out = soften([(-0.0138, 0.0205, True), (0.0138, 0.0205, True), (0.0138, 0.036), (0.011, 0.0445), (-0.011, 0.0445), (-0.0138, 0.036)], 2)
hood_in = soften([(-0.0108, 0.0232), (0.0108, 0.0232), (0.0108, 0.0352), (0.0085, 0.0412), (-0.0085, 0.0412), (-0.0108, 0.0352)], 2)


def rake(v):
    if v.co.y > 0:
        v.co.y -= max(0.0, v.co.z - 0.03) * 0.25


hood = g.sweep("hood", hood_out, REFLEX_REAR, 0.011, "anodised", bevel=0.0007, shape=rake)
g.cut(hood, [g.sweep("window", hood_in, REFLEX_REAR - 0.01, 0.02, "anodised", bevel=0)])
# The glass, set in the hood's front; the dot sits just behind it on the axis.
glass = soften([(-0.0112, 0.0228), (0.0112, 0.0228), (0.0112, 0.0356), (0.0088, 0.0416), (-0.0088, 0.0416), (-0.0112, 0.0356)], 2)
g.sweep("glass", glass, 0.0066, 0.0074, "lens", bevel=0)
# Three reticles, one shown at a time (the player's pick, PLAN item 7): a dot, a ring round a small dot, a chevron.
DOT_Y = 0.0062
g.part("reticle_dot", [g.cyl("dot", 0.00038, 0.0003, (0, DOT_Y, A), "red_insert", axis="Y", verts=12, bevel=0)], (0, DOT_Y, A))
g.part("reticle_ring", [g.torus("ring", 0.0011, 0.0001, (0, DOT_Y, A), "red_insert", rot=(math.pi / 2, 0, 0), verts=32, ring=6),
                        g.cyl("ring_dot", 0.00022, 0.0003, (0, DOT_Y, A), "red_insert", axis="Y", verts=10, bevel=0)], (0, DOT_Y, A))
g.part("reticle_chevron", chevron(g, "chevron", DOT_Y, A, 0.0011, 0.00014), (0, DOT_Y, A))
# The emitter under the window, the brightness buttons on the left, the battery cap on the right.
g.box("emitter", (0.0062, 0.0036, 0.0026), (0, -0.003, 0.0228), "anodised", 0.0006)
for i, y in enumerate((-0.0005, 0.0075)):
    g.cyl(f"button{i}", 0.0021, 0.0016, (-0.0141, y, 0.0175), "rubber", axis="X", verts=16, bevel=0.0003)
g.cyl("battery_cap", 0.0034, 0.0014, (0.0142, 0.004, 0.0175), "anodised", axis="X", verts=24, bevel=0.0003)
reflex = g.finish(texture=1024, draft=DRAFT)

# ---------------------------------------------------------------------------
# Prism 2x: a prism block, eyepiece behind and objective bell in front, open along the axis.
# ---------------------------------------------------------------------------
g = gunsmith.Gun("prism")
A = PRISM_AXIS_Z
# A wide bore in a short block: the view through it is the widest the eye relief allows.
BORE = 0.0135
clamp(g, 0.04, (-0.01, 0.01))
bored_block(g, "block", 0.017, 0.005 - A, 0.049 - A, BORE, -0.02, 0.02, A, "anodised", 0.0024)
# Eyepiece: a short tube, then the rubber cup the eye sits behind.
g.tube("eyepiece", 0.0165, BORE, 0.012, (0, -0.026, A), "anodised", verts=40, bevel=0.0005)
g.tube("eyecup", 0.0172, BORE + 0.0006, 0.0055, (0, PRISM_REAR + 0.00275, A), "rubber", verts=40, bevel=0.001)
# Objective: a bell flaring out to the front, its section a closed loop so the bore stays open.
bell = g.lathe("objective", [(BORE, 0.0), (0.0175, 0.0), (0.019, 0.008), (0.019, 0.016), (0.0175, 0.017), (BORE + 0.002, 0.017), (BORE + 0.002, 0.004), (BORE, 0.004), (BORE, 0.0)],
               (0, 0.019, A), "anodised", axis="Y", verts=40, bevel=0.0004, closed=False)
turret(g, "elevation", "Z", (0, 0.002, 0.0485), 0.0068, 0.0062)
turret(g, "windage", "X", (0.017, 0.002, A), 0.0064, 0.0062)
turret(g, "illumination", "X", (-0.017, 0.002, A), 0.0074, 0.008)
g.text("mark", "2x", (-0.0171, -0.011, 0.018), 0.0046, "white_paint", side="-X")
R = 0.0002
# Three reticles, one shown at a time (the player's pick, PLAN item 7): this ring, a heavier dot, a chevron on its post.
g.part("reticle_ring", [g.torus("ring", 0.003, R, (0, 0.0, A), "red_insert", rot=(math.pi / 2, 0, 0), verts=40, ring=6),
                        g.cyl("centre", 0.00036, 0.0005, (0, 0.0, A), "red_insert", axis="Y", verts=12, bevel=0),
                        g.box("post", (2 * R, 2 * R, BORE - 0.003 - R), (0, 0.0, A - 0.003 - R - (BORE - 0.003 - R) / 2), "red_insert", 0)], (0, 0, A))
g.part("reticle_dot", [g.cyl("big_dot", 0.0006, 0.0005, (0, 0.0, A), "red_insert", axis="Y", verts=16, bevel=0),
                       g.box("dot_post", (2 * R, 2 * R, BORE - 0.0016 - R), (0, 0.0, A - 0.0016 - R - (BORE - 0.0016 - R) / 2), "red_insert", 0)], (0, 0, A))
g.part("reticle_chevron", chevron(g, "chevron", 0.0, A, 0.0028, 0.0004)
       + [g.box("chevron_post", (2 * R, 2 * R, BORE - 0.0004), (0, 0.0, A - 0.0004 - (BORE - 0.0004) / 2), "red_insert", 0)], (0, 0, A))
prism = g.finish(texture=1024, draft=DRAFT)

result = {"reflex": reflex, "prism": prism}
print("OPTICS", result)
