"""Build Survival Town's models: the cul-de-sac's vehicles (a school bus, a
moving van, a pickup and a woody station wagon), all original designs.

Run in the Blender session (see the blender skill):
    bkit.reset(); bkit.run(r"tools/map/survival-town.py")
    bkit.run(r"tools/map/survival-town.py", export=True)   # also writes the GLB

Each asset is one object, named as the map places it (`bus`, `van`, ...),
with its origin on the ground under the vehicle's centre, its nose toward
game +x and game +z across (apps/range/src/map/survival-town.ts builds the
same vehicles in the same frame). The model draws the collision solids the
map ties it to, so it stays within 5 cm of them: each asset's solids are
written out below (`SOLIDS`), in the same numbers as the map's, and `result`
reports any vertex that strays.

Materials are named after the map's finishes; Workbench previews show these
colours, the game takes its own. Ambient occlusion is baked into the vertex
colours (see mapkit.bake_ao).
"""
import math
import os
import sys

import bmesh
from mathutils import Matrix, Vector

sys.path.insert(0, os.path.dirname(__file__))
import importlib  # noqa: E402

import mapkit  # noqa: E402

importlib.reload(mapkit)

EXPORT = ARGS.get("export", False)  # noqa: F821 (ARGS comes from bkit.run)
OUT = os.path.join(os.path.dirname(__file__), "..", "..", "apps", "range", "public", "models", "survival-town.glb")
kit = mapkit.Kit(bkit, "survival-town")  # noqa: F821


def M(name, rgb, roughness=0.6, metallic=0.0, emission=None):
    return mapkit.material(bkit, name, ((rgb >> 16) & 255, (rgb >> 8) & 255, rgb & 255), roughness, metallic, emission)  # noqa: F821


BUS_PAINT = M("bus.paint", 0xE3A92B, 0.45)
BUS_ROOF = M("bus.roof", 0xEEEAE0, 0.5)
TRIM = M("bus.trim", 0x26282B, 0.6)
GLASS = M("auto.glass", 0x1F2A31, 0.08)
TYRE = M("tyre", 0x1E1F21, 0.85)
CHROME = M("chrome", 0xC8CCD0, 0.2, 1.0)
LAMP = M("lamp", 0xF3EDD0, 0.2)
AMBER = M("amber.lamp", 0xE08A2A, 0.3)
TAIL = M("tail.lamp", 0xB3362C, 0.3)
UNDER = M("underbody", 0x232426, 0.8)
VAN_PAINT = M("van.paint", 0xE7E3D8, 0.45)
VAN_STRIPE = M("van.stripe", 0x2F8A87, 0.45)
ALLOY = M("trailer", 0x8E959B, 0.4, 0.8)
PICKUP = M("pickup.paint", 0x9A3A2F, 0.4)
TARP = M("tarp", 0x5E5B45, 0.9)
WAGON = M("wagon.paint", 0x88AABD, 0.4)
WOOD = M("wagon.wood", 0x9A6A3F, 0.6)
WOOD_FRAME = M("wagon.frame", 0xC9A36B, 0.6)
WHITEWALL = M("whitewall", 0xEDEAE2, 0.7)


# ------------------------------------------------------------------ shapes

def arched(x0, x1, y0, top, arches, steps=10):
    """A side profile (x, y): the bottom edge from x0 to x1 at y0, notched by wheel arches (cx, radius, centre height),
    then `top` (points from x1 back to x0)."""
    pts = [(x0, y0)]
    for cx, r, cy in sorted(arches):
        pts.append((cx - r, y0))
        for k in range(steps + 1):
            a = math.pi - math.pi * k / steps
            pts.append((cx + r * math.cos(a), max(cy + r * math.sin(a), y0)))
        pts.append((cx + r, y0))
    pts.append((x1, y0))
    return pts + list(top)


def rounded_section(y0, y1, half, radius, steps=6, tumble=0.0):
    """A cross-section (y, z) from y0 up to y1, `half` wide each side at y0 (less `tumble` at the top), its top corners rounded."""
    pts = [(y0, -half)]
    top_half = half - tumble
    for k in range(steps + 1):
        t = k / steps * math.pi / 2
        pts.append((y1 - radius + radius * math.sin(t), -top_half + radius - radius * math.cos(t)))
    for k in range(steps + 1):
        t = math.pi / 2 - k / steps * math.pi / 2
        pts.append((y1 - radius + radius * math.sin(t), top_half - radius + radius * math.cos(t)))
    pts.append((y0, half))
    return pts


def both(z, fn):
    """`fn(z)` and `fn(-z)`: a part on each side."""
    return [fn(z), fn(-z)]


def lamp(x0, x1, y, z, r, lens, bezel=CHROME):
    """A round lamp along x: a bezel and its lens, facing the direction from x0 to x1."""
    d = x1 - x0
    return [kit.cylinder(r * 1.2, x0, x1 - 0.25 * d, (0, y, z), "x", bezel, 16), kit.cylinder(r, x1 - 0.3 * d, x1, (0, y, z), "x", lens, 16)]


def wheels(at, r, width, z, tyre=TYRE, rim=CHROME, hub=CHROME, dual=False, whitewall=False):
    """Wheels at each x of `at`, either side at ±z (their outside face at ±(z + width/2))."""
    parts = []
    for x in at:
        for s in (-1, 1):
            parts += kit.wheel(x, r, s * z, r, width, tyre, rim, hub, outward=s)
            if dual:
                parts += kit.wheel(x, r, s * (z - width - 0.02), r, width, tyre, rim, None, outward=s)
            if whitewall:
                parts.append(kit.lathe([(s * (z + width / 2 + 0.004), r * 0.66), (s * (z + width / 2 + 0.004), r * 0.84)], (x, r, 0), WHITEWALL, 20, "z", caps=False))
    return parts


# -------------------------------------------------------------------- bus

BUS_HALF = 1.25
BUS_X = (-6.1, 4.3, 6.1)  # rear, front wall, nose


def bus():
    """A school bus: skirted body over the wheels, a band of sash windows, a rounded roof, and a conventional hood up front."""
    w = BUS_HALF
    xr, xf, xn = BUS_X
    sk = 1.15
    arches = [(-3.6, 0.62, 0.5), (3.45, 0.6, 0.5)]
    parts = [
        # The skirt, notched for the wheels, and the body above it with its rounded roof.
        kit.prism(arched(xr + 0.01, xf - 0.01, 0.42, [(xf - 0.01, sk), (xr + 0.01, sk)], arches), -w + 0.01, w - 0.01, BUS_PAINT, 0.03),
        kit.section(rounded_section(sk - 0.02, 3.08, w - 0.01, 0.4, 7), xr + 0.01, xf - 0.01, BUS_PAINT, 0.05, 3),
        # The white roof and two hatches.
        kit.box((xr + 0.2, 3.07, -w + 0.42), (xf - 0.2, 3.1, w - 0.42), BUS_ROOF, 0.01),
        kit.box((-3.2, 3.09, -0.45), (-2.4, 3.14, 0.45), BUS_ROOF, 0.015),
        kit.box((0.6, 3.09, -0.45), (1.4, 3.14, 0.45), BUS_ROOF, 0.015),
        # Under the body: chassis, axles, fuel tank and the tubs in the wheel arches.
        kit.box((xr + 0.6, 0.28, -0.85), (xn - 0.3, 0.44, 0.85), UNDER),
        kit.cylinder(0.22, -1.6, -0.2, (0, 0.55, -0.6), "x", UNDER, 14),
    ]
    for cx, r, cy in arches:
        parts.append(kit.box((cx - r, 0.4, -w + 0.46), (cx + r, cy + r + 0.02, w - 0.46), UNDER))
        parts.append(kit.cylinder(0.07, -w + 0.3, w - 0.3, (cx, 0.5, 0), "z", UNDER, 10))
    # Black rub rails down both sides, the lowest over the skirt's seam (stopping short of the door on the curb side).
    for y in (sk - 0.03, 1.62, 2.72):
        parts.append(kit.box((xr + 0.06, y, w - 0.015), (xf - 0.06, y + 0.07, w + 0.018), TRIM, 0.008))
        parts.append(kit.box((xr + 0.06, y, -w - 0.018), (2.08 if y < 2.6 else xf - 0.06, y + 0.07, -w + 0.015), TRIM, 0.008))
    # Sash windows: a black frame, two panes split by the sash rail.
    def window(a0, a1, s):
        z = s * w
        zz = lambda p: (min(z, z + s * p), max(z, z + s * p))  # noqa: E731
        lo, hi = zz(0.014)
        glo, ghi = zz(0.02)
        return [
            kit.box((a0 - 0.05, 1.7, lo if s > 0 else lo), (a1 + 0.05, 2.6, hi), TRIM, 0.006),
            kit.box((a0, 1.76, glo), (a1, 2.54, ghi), GLASS),
            kit.box((a0 - 0.02, 2.13, *[min(z, z + s * 0.03)]), (a1 + 0.02, 2.19, max(z, z + s * 0.03)), TRIM),
        ]
    for i in range(7):
        a = -5.5 + i * 1.0
        for s in (-1, 1):
            parts += window(a, a + 0.8, s)
    parts += window(1.5, 2.3, 1) + window(2.5, 3.3, 1) + window(3.45, 4.15, 1) + window(1.5, 1.98, -1) + window(3.2, 4.15, -1)
    # The folding door on the curb side.
    z = -w
    parts.append(kit.box((2.1, 0.45, z - 0.016), (3.1, 2.62, z + 0.01), TRIM, 0.006))
    for a0, a1 in ((2.16, 2.58), (2.62, 3.04)):
        parts.append(kit.box((a0, 1.05, z - 0.024), (a1, 2.56, z - 0.01), GLASS))
        parts.append(kit.box((a0, 0.5, z - 0.024), (a1, 0.98, z - 0.01), TRIM))
    # The windscreen, split down the middle, and the marker lamps over it.
    parts.append(kit.box((xf - 0.02, 1.7, -w + 0.12), (xf + 0.015, 2.62, w - 0.12), TRIM, 0.006))
    for s in (-1, 1):
        parts.append(kit.box((xf, 1.76, min(s * 0.04, s * (w - 0.18))), (xf + 0.025, 2.56, max(s * 0.04, s * (w - 0.18))), GLASS))
        for c in (0.35, 0.8):
            parts.append(kit.box((xf - 0.01, 2.8, s * c - 0.09), (xf + 0.03, 2.94, s * c + 0.09), AMBER if c > 0.5 else TAIL, 0.01))
    # The rear: the emergency door with its windows, tail and marker lamps, bumper.
    parts.append(kit.box((xr - 0.016, 0.62, -0.62), (xr + 0.01, 2.68, 0.62), TRIM, 0.006))
    parts.append(kit.box((xr - 0.02, 0.66, -0.58), (xr + 0.01, 2.64, 0.58), BUS_PAINT, 0.004))
    for s in (-1, 1):
        parts.append(kit.box((xr - 0.026, 1.8, min(s * 0.05, s * 0.54)), (xr, 2.55, max(s * 0.05, s * 0.54)), GLASS))
        parts += lamp(xr + 0.02, xr - 0.03, 0.9, s * 0.95, 0.11, TAIL)
        parts += lamp(xr + 0.02, xr - 0.03, 1.2, s * 0.95, 0.09, AMBER)
        parts.append(kit.box((xr - 0.03, 2.8, s * 0.8 - 0.08), (xr + 0.01, 2.94, s * 0.8 + 0.08), TAIL, 0.01))
    parts.append(kit.box((xr - 0.045, 0.3, -w + 0.04), (xr + 0.15, 0.56, w - 0.04), TRIM, 0.02))
    # The hood between its fenders, the grille, headlamps and bumper.
    hood = [(xf - 0.02, 0.55), (xn - 0.1, 0.55), (xn - 0.03, 0.68), (xn - 0.03, 1.12), (xn - 0.16, 1.36), (xn - 0.5, 1.44), (xf - 0.02, 1.46)]
    parts.append(kit.prism(hood, -0.78, 0.78, BUS_PAINT, 0.06, 3))
    fender = arched(xf - 0.02, xn - 0.06, 0.48, [(xn - 0.06, 0.7), (xn - 0.3, 1.08), (xn - 0.9, 1.26), (xf - 0.02, 1.3)], [])
    for s in (-1, 1):
        parts.append(kit.prism(fender, min(s * 0.76, s * 1.09), max(s * 0.76, s * 1.09), BUS_PAINT, 0.08, 3))
        parts += lamp(xn - 0.5, xn - 0.12, 0.95, s * 0.9, 0.12, LAMP)
    parts.append(kit.box((xn - 0.05, 0.64, -0.58), (xn + 0.01, 1.16, 0.58), CHROME, 0.01))
    for k in range(7):
        y = 0.7 + k * 0.065
        parts.append(kit.box((xn - 0.03, y, -0.52), (xn + 0.025, y + 0.035, 0.52), TRIM))
    parts.append(kit.box((xn - 0.16, 0.3, -1.08), (xn + 0.045, 0.56, 1.08), TRIM, 0.02))
    parts += wheels([-3.6], 0.5, 0.2, w - 0.12, rim=TRIM, hub=CHROME, dual=True)
    parts += wheels([3.45], 0.5, 0.24, w - 0.17, rim=TRIM, hub=CHROME)
    return kit.asset("bus", parts)


# -------------------------------------------------------------------- van

def van():
    """A moving van: a ribbed aluminium-framed box with a roll-up door, behind a cab and a short hood."""
    w = 1.25
    parts = [
        # The box: panels between corner posts and rails, ribs, the stripe.
        kit.box((-4.17, 1.02, -w + 0.02), (1.77, 3.36, w - 0.02), VAN_PAINT, 0.02),
        kit.box((-4.19, 3.3, -w), (1.79, 3.4, w), ALLOY, 0.01),
        kit.box((-4.19, 0.96, -w), (1.79, 1.08, w), ALLOY, 0.01),
        kit.box((-4.15, 0.82, -w + 0.06), (1.75, 0.98, w - 0.06), UNDER),
        kit.box((-4.1, 0.42, -0.55), (1.7, 0.82, 0.55), UNDER),
    ]
    for x in (-4.2, 1.8):
        for s in (-1, 1):
            parts.append(kit.box((x - 0.04 if x > 0 else x, 0.96, min(s * w, s * (w - 0.08))), (x if x > 0 else x + 0.04, 3.4, max(s * w, s * (w - 0.08))), ALLOY))
    for s in (-1, 1):
        z = s * w
        for k in range(1, 12):
            x = -4.2 + k * 0.5
            parts.append(kit.box((x - 0.025, 1.08, min(z - s * 0.03, z + s * 0.012)), (x + 0.025, 3.3, max(z - s * 0.03, z + s * 0.012)), VAN_PAINT))
        parts.append(kit.box((-4.12, 1.9, min(z, z + s * 0.018)), (1.72, 2.3, max(z, z + s * 0.018)), VAN_STRIPE))
    # The roll-up door: slats, a latch bar, the frame.
    x = -4.2
    for k in range(18):
        y = 1.1 + k * 0.12
        parts.append(kit.box((x - 0.012, y, -1.1), (x + 0.02, y + 0.105, 1.1), VAN_PAINT))
    parts.append(kit.box((x - 0.03, 1.25, -0.2), (x + 0.01, 1.3, 0.2), CHROME))
    parts.append(kit.box((x - 0.035, 0.45, -1.15), (x + 0.15, 0.6, 1.15), TRIM, 0.01))
    for s in (-1, 1):
        parts += lamp(x + 0.05, x - 0.03, 0.75, s * 1.0, 0.08, TAIL)
        parts.append(kit.box((-3.62, 0.22, min(s * 0.82, s * 1.2)), (-3.6, 0.85, max(s * 0.82, s * 1.2)), TRIM))
    # The cab: a lower body arched over the front wheels, the upper body with its sloped screen, roof in white.
    cw = 1.13
    lower = kit.prism(arched(1.82, 3.58, 0.45, [(3.58, 1.36), (1.82, 1.36)], [(2.7, 0.53, 0.45)]), -cw, cw, VAN_STRIPE, 0.05, 3)
    upper = kit.prism([(1.82, 1.34), (3.58, 1.34), (3.46, 2.12), (3.3, 2.27), (1.82, 2.27)], -cw, cw, VAN_STRIPE, 0.07, 3)
    parts += [lower, upper, kit.box((1.88, 2.24, -cw + 0.12), (3.2, 2.3, cw - 0.12), VAN_PAINT, 0.02)]
    parts.append(kit.box((2.2, 0.4, -0.95), (3.2, 0.5, 0.95), UNDER))
    for s in (-1, 1):
        z = s * cw
        zz = lambda p, q=0.0: (min(z + s * q, z + s * p), max(z + s * q, z + s * p))  # noqa: E731
        parts.append(kit.prism([(2.02, 1.42), (3.38, 1.42), (3.3, 1.95), (3.15, 2.06), (2.02, 2.06)], *zz(0.018), TRIM, 0.005))
        parts.append(kit.prism([(2.06, 1.46), (3.32, 1.46), (3.25, 1.93), (3.12, 2.02), (2.06, 2.02)], *zz(0.025), GLASS))
        parts.append(kit.box((1.98, 0.5, z - 0.008 if s > 0 else z - 0.016), (2.0, 2.05, z + 0.016 if s > 0 else z + 0.008), TRIM))
        parts.append(kit.box((2.15, 1.25, min(z, z + s * 0.03)), (2.35, 1.3, max(z, z + s * 0.03)), CHROME))
        parts.append(kit.box((1.95, 0.3, min(s * 0.8, s * 1.12)), (2.5, 0.4, max(s * 0.8, s * 1.12)), ALLOY, 0.01))
    parts.append(kit.prism([(3.58, 1.42), (3.6, 1.42), (3.49, 2.1), (3.47, 2.1)], -1.0, 1.0, TRIM))
    parts.append(kit.prism([(3.6, 1.45), (3.615, 1.45), (3.505, 2.07), (3.49, 2.07)], -0.96, 0.96, GLASS))
    parts.append(kit.prism([(3.6, 1.45), (3.625, 1.45), (3.515, 2.07), (3.5, 2.07)], -0.02, 0.02, TRIM))
    # The hood, fenders, grille, lamps, bumper and fuel tank.
    parts.append(kit.prism([(3.55, 0.55), (4.32, 0.55), (4.38, 0.7), (4.37, 1.12), (4.24, 1.27), (3.55, 1.3)], -0.62, 0.62, VAN_STRIPE, 0.05, 3))
    for s in (-1, 1):
        parts.append(kit.prism([(3.55, 0.5), (4.3, 0.5), (4.36, 0.65), (4.25, 0.98), (3.55, 1.12)], min(s * 0.6, s * 0.98), max(s * 0.6, s * 0.98), VAN_STRIPE, 0.07, 3))
        parts += lamp(4.1, 4.33, 0.86, s * 0.8, 0.1, LAMP)
        parts.append(kit.cylinder(0.22, 0.5, 1.5, (0, 0.62, s * 0.98), "x", ALLOY, 16, 0.02))
    parts.append(kit.box((4.35, 0.62, -0.5), (4.41, 1.12, 0.5), CHROME, 0.01))
    for k in range(6):
        y = 0.68 + k * 0.07
        parts.append(kit.box((4.38, y, -0.45), (4.425, y + 0.035, 0.45), TRIM))
    parts.append(kit.box((4.22, 0.3, -1.0), (4.44, 0.52, 1.0), CHROME, 0.02))
    parts += wheels([-3.1, -1.9], 0.45, 0.2, w - 0.12, rim=ALLOY, hub=CHROME, dual=True)
    parts += wheels([2.7], 0.45, 0.24, cw - 0.13, rim=ALLOY, hub=CHROME)
    return kit.asset("van", parts)


# ----------------------------------------------------------------- pickup

def pickup():
    """A step-side pickup: pontoon front fenders, a rounded cab, and a narrow bed under a canvas cover between its rear fenders."""
    parts = []
    # Front: the hood between the fenders, which arch over the wheels and carry the headlamps.
    parts.append(kit.prism([(1.25, 0.6), (2.6, 0.6), (2.69, 0.74), (2.67, 0.96), (2.45, 1.1), (1.3, 1.14)], -0.6, 0.6, PICKUP, 0.06, 3))
    fender = arched(1.25, 2.7, 0.4, [(2.7, 0.62), (2.55, 0.86), (2.2, 0.99), (1.6, 1.02), (1.25, 0.98)], [(2.0, 0.47, 0.4)])
    rear = arched(-2.62, -1.18, 0.42, [(-1.18, 0.62), (-1.4, 0.9), (-1.9, 0.98), (-2.4, 0.9), (-2.62, 0.64)], [(-1.9, 0.44, 0.4)])
    for s in (-1, 1):
        parts.append(kit.prism(fender, min(s * 0.58, s * 0.93), max(s * 0.58, s * 0.93), PICKUP, 0.05, 3))
        parts.append(kit.prism(rear, min(s * 0.62, s * 0.97), max(s * 0.62, s * 0.97), PICKUP, 0.05, 3))
        parts += lamp(2.4, 2.66, 0.84, s * 0.76, 0.1, LAMP)
        parts += lamp(-2.62, -2.7, 0.85, s * 0.66, 0.06, TAIL)
        # Running board from fender to fender.
        parts.append(kit.box((-1.15, 0.38, min(s * 0.62, s * 0.97)), (1.3, 0.44, max(s * 0.62, s * 0.97)), TRIM, 0.01))
    parts.append(kit.box((2.62, 0.64, -0.46), (2.7, 0.95, 0.46), CHROME, 0.01))
    for k in range(4):
        y = 0.68 + k * 0.065
        parts.append(kit.box((2.66, y, -0.42), (2.73, y + 0.03, 0.42), TRIM))
    for x0, x1 in ((2.56, 2.74), (-2.74, -2.58)):
        parts.append(kit.box((x0, 0.3, -0.94), (x1, 0.46, 0.94), CHROME, 0.03, 3))
    # The cab: lower body, the rounded glasshouse above, its windows and the rear screen.
    cw = 0.94
    parts.append(kit.box((-0.38, 0.44, -cw), (1.28, 1.15, cw), PICKUP, 0.04, 3))
    cab = [(-0.38, 1.12), (1.28, 1.12), (1.06, 1.72), (0.92, 1.78), (-0.28, 1.78), (-0.38, 1.7)]
    parts.append(kit.prism(cab, -0.88, 0.88, PICKUP, 0.09, 3))
    for s in (-1, 1):
        z = s * 0.88
        parts.append(kit.prism([(-0.22, 1.2), (1.0, 1.2), (0.82, 1.66), (-0.22, 1.66)], min(z, z + s * 0.015), max(z, z + s * 0.015), GLASS))
        parts.append(kit.box((0.4, 0.5, min(s * cw, s * (cw + 0.01))), (0.42, 1.68, max(s * cw, s * (cw + 0.01))), TRIM))
        parts.append(kit.box((0.25, 1.02, min(s * cw, s * (cw + 0.03))), (0.38, 1.06, max(s * cw, s * (cw + 0.03))), CHROME))
    parts.append(kit.prism([(1.27, 1.2), (1.295, 1.2), (1.085, 1.7), (1.06, 1.7)], -0.78, 0.78, GLASS))
    parts.append(kit.prism([(1.27, 1.2), (1.3, 1.2), (1.09, 1.7), (1.06, 1.7)], -0.02, 0.02, PICKUP))
    parts.append(kit.box((-0.405, 1.26, -0.5), (-0.37, 1.6, 0.5), GLASS))
    # The bed: sides and front, a tailgate, and a canvas cover laced down over it.
    bw = 0.62
    parts.append(kit.box((-2.66, 0.48, -bw), (-0.44, 0.96, bw), PICKUP, 0.03))
    parts.append(kit.box((-2.7, 0.5, -bw + 0.02), (-2.64, 0.95, bw - 0.02), PICKUP, 0.015))
    parts.append(kit.box((-2.6, 0.95, -bw + 0.02), (-0.5, 1.0, bw - 0.02), TARP, 0.025, 3))
    for k in range(5):
        x = -2.45 + k * 0.45
        parts.append(kit.box((x - 0.02, 0.97, -bw - 0.005), (x + 0.02, 1.01, bw + 0.005), TRIM))
    parts.append(kit.box((-2.6, 0.32, -0.45), (2.45, 0.44, 0.45), UNDER))
    parts.append(kit.cylinder(0.03, -2.72, -1.0, (0, 0.3, 0.35), "x", CHROME, 8))
    parts += wheels([-1.9, 2.0], 0.4, 0.22, 0.74, rim=PICKUP, hub=CHROME, whitewall=True)
    return kit.asset("pickup", parts)


# ------------------------------------------------------------------ wagon

def wagon():
    """A woody station wagon: painted fenders and nose, framed wood panels along its sides, and a long glasshouse."""
    w = 0.93
    parts = []
    body = arched(-2.38, 2.38, 0.34, [(2.38, 0.5), (2.4, 0.74), (2.3, 0.88), (2.1, 0.94), (-2.36, 0.95), (-2.4, 0.86), (-2.4, 0.5)], [(-1.5, 0.42, 0.34), (1.5, 0.42, 0.34)])
    parts.append(kit.prism(body, -w, w, WAGON, 0.08, 3))
    parts.append(kit.box((-2.2, 0.2, -0.6), (2.2, 0.36, 0.6), UNDER))
    for cx in (-1.5, 1.5):
        parts.append(kit.box((cx - 0.42, 0.33, -w + 0.25), (cx + 0.42, 0.78, w - 0.25), UNDER))
    # The wood: framed panels from the front doors back, and the tailgate.
    for s in (-1, 1):
        z = s * w
        zz = lambda p, q=0.0: (min(z + s * q, z + s * p), max(z + s * q, z + s * p))  # noqa: E731
        parts.append(kit.box((-2.3, 0.5, *[zz(0.012)[0]]), (0.95, 0.9, zz(0.012)[1]), WOOD_FRAME, 0.008))
        for a0, a1 in ((-2.2, -1.95), (-1.05, -0.3), (-0.2, 0.85)):
            parts.append(kit.box((a0, 0.56, zz(0.02)[0]), (a1, 0.84, zz(0.02)[1]), WOOD, 0.006))
        parts.append(kit.box((-0.25, 0.86, zz(0.03)[0]), (-0.12, 0.89, zz(0.03)[1]), CHROME))
        parts.append(kit.box((0.75, 0.86, zz(0.03)[0]), (0.88, 0.89, zz(0.03)[1]), CHROME))
        parts += lamp(2.16, 2.39, 0.72, s * 0.66, 0.085, LAMP)
        parts += lamp(-2.3, -2.42, 0.7, s * 0.7, 0.06, TAIL)
    parts.append(kit.box((-2.43, 0.45, -0.6), (-2.37, 0.92, 0.6), WOOD_FRAME, 0.01))
    parts.append(kit.box((-2.445, 0.52, -0.52), (-2.4, 0.86, 0.52), WOOD, 0.006))
    # The glasshouse: glass all round, pillars in light wood, a painted roof.
    gw = 0.85
    glass = [(-2.33, 0.93), (1.0, 0.93), (0.74, 1.37), (-2.3, 1.38)]
    parts.append(kit.prism(glass, -gw, gw, GLASS))
    parts.append(kit.prism([(-2.38, 1.35), (0.78, 1.35), (0.64, 1.44), (-2.3, 1.45), (-2.38, 1.42)], -gw - 0.02, gw + 0.02, WAGON, 0.05, 3))
    for x in (-2.33, -1.55, -0.7, 0.05):
        parts.append(kit.box((x - 0.05, 0.93, -gw - 0.012), (x + 0.05, 1.37, gw + 0.012), WOOD_FRAME, 0.008))
    for s in (-1, 1):
        parts.append(kit.prism([(0.94, 0.93), (1.02, 0.93), (0.78, 1.37), (0.7, 1.37)], min(s * (gw - 0.08), s * (gw + 0.012)), max(s * (gw - 0.08), s * (gw + 0.012)), WAGON))
        parts.append(kit.box((-2.3, 0.92, min(s * gw, s * (gw + 0.02))), (1.0, 0.95, max(s * gw, s * (gw + 0.02))), CHROME))
    # Nose: grille, bumpers wrapping the corners.
    parts.append(kit.box((2.36, 0.48, -0.5), (2.42, 0.74, 0.5), CHROME, 0.012))
    for k in range(4):
        parts.append(kit.box((2.39, 0.51 + k * 0.06, -0.46), (2.435, 0.535 + k * 0.06, 0.46), TRIM))
    parts.append(kit.box((2.28, 0.27, -0.92), (2.445, 0.43, 0.92), CHROME, 0.04, 3))
    parts.append(kit.box((-2.445, 0.27, -0.92), (-2.3, 0.43, 0.92), CHROME, 0.04, 3))
    parts += wheels([-1.5, 1.5], 0.36, 0.2, 0.8, rim=WAGON, hub=CHROME, whitewall=True)
    return kit.asset("wagon", parts)


# ------------------------------------------------------- furniture and yards

SOFA = M("sofa", 0xD48F8A, 0.9)
LINEN = M("linen", 0xF2EFE6, 0.9)
CABINET = M("cabinet", 0xF0E9D8, 0.5)
COUNTER = M("counter", 0x7FC6C0, 0.3)
TABLE = M("table", 0x9B6A42, 0.6)
BEDSPREAD = M("bedspread", 0x86A9CF, 0.9)
AC = M("ac.unit", 0xC4C9CC, 0.45, 0.5)
SIDING = M("north.siding", 0x9DCDB3, 0.7)
WHITE = M("trim", 0xF3EFE4, 0.55)
ROOF = M("roof.flat", 0x5D5853, 0.9)
SHUTTER = M("north.shutter", 0x3D6B58, 0.6)
HULL = M("boat.hull", 0xF1EFE8, 0.35)
STRIPE = M("boat.stripe", 0x2B6F9E, 0.35)
BOAT_DECK = M("boat.deck", 0xB08355, 0.6)
SKIN = M("mannequin", 0xE6D2B8, 0.5)
OUTFITS = [("outfit.blue", 0x5F86A8, "outfit.charcoal", 0x3C4048), ("outfit.red", 0xC65D4F, "outfit.khaki", 0x8A7658), ("outfit.green", 0x6E9A72, "outfit.charcoal", 0x3C4048), ("outfit.mustard", 0xD9B04E, "outfit.khaki", 0x8A7658)]


def span(a, b):
    """(lo, hi) of two numbers, for parts given by a face and how far they stand off it."""
    return (min(a, b), max(a, b))


def sofa():
    """A three-seat sofa, its back toward -z: plinth, seat cushions, back cushions and rolled arms, on short legs."""
    parts = [kit.box((-1.42, 0.1, -0.45), (1.42, 0.42, 0.45), SOFA, 0.04, 3)]
    for k in range(3):
        x = -0.88 + k * 0.88
        parts.append(kit.box((x - 0.43, 0.42, -0.2), (x + 0.43, 0.56, 0.47), SOFA, 0.06, 3))
        parts.append(kit.box((x - 0.43, 0.45, -0.46), (x + 0.43, 0.84, -0.24), SOFA, 0.07, 3))
    for s in (-1, 1):
        lo, hi = span(s * 1.28, s * 1.49)
        parts.append(kit.box((lo, 0.1, -0.48), (hi, 0.66, 0.49), SOFA, 0.08, 3))
        for z in (-0.38, 0.38):
            parts.append(kit.cylinder(0.03, 0.0, 0.1, (s * 1.38, 0, z), "y", TABLE, 8, r2=0.022))
    parts.append(kit.box((-1.46, 0.48, -0.5), (1.46, 0.86, -0.4), SOFA, 0.04, 3))
    return kit.asset("sofa", parts)


def counter():
    """A run of kitchen base cabinets along z, their doors toward -x: toe kick, doors and drawers, a tiled top and a sink."""
    hz = 2.5
    parts = [
        kit.box((-0.38, 0.0, -hz), (0.45, 0.1, hz), UNDER),
        kit.box((-0.42, 0.1, -hz), (0.45, 0.86, hz), CABINET, 0.005),
        kit.box((-0.47, 0.86, -hz), (0.45, 0.9, hz), COUNTER, 0.008),
        kit.box((-0.36, 0.84, -0.9), (0.3, 0.905, -0.1), CHROME, 0.01),
        kit.box((-0.32, 0.62, -0.86), (0.26, 0.906, -0.14), UNDER),
        kit.cylinder(0.02, 0.86, 0.9, (0.38, 0, -0.5), "y", CHROME, 8),
    ]
    n = 7
    pitch = (2 * hz - 0.08) / n
    for k in range(n):
        z0 = -hz + 0.04 + k * pitch
        z1 = z0 + pitch - 0.03
        zc = (z0 + z1) / 2
        parts.append(kit.box((-0.44, 0.14, z0), (-0.42, 0.62, z1), CABINET, 0.006))
        parts.append(kit.box((-0.44, 0.66, z0), (-0.42, 0.82, z1), CABINET, 0.006))
        parts.append(kit.box((-0.46, 0.72, zc - 0.07), (-0.44, 0.74, zc + 0.07), CHROME))
        parts.append(kit.box((-0.46, 0.5, z1 - 0.06), (-0.44, 0.58, z1 - 0.04), CHROME))
    return kit.asset("counter", parts)


def island():
    """A kitchen island: cabinets both sides under a tiled top that overhangs a little."""
    hx, hz = 1.25, 0.6
    parts = [
        kit.box((-hx + 0.06, 0.0, -hz + 0.06), (hx - 0.06, 0.1, hz - 0.06), UNDER),
        kit.box((-hx + 0.03, 0.1, -hz + 0.03), (hx - 0.03, 0.86, hz - 0.03), CABINET, 0.005),
        kit.box((-hx, 0.86, -hz), (hx, 0.9, hz), COUNTER, 0.01),
    ]
    for s in (-1, 1):
        z = s * (hz - 0.03)
        for k in range(4):
            x0 = -hx + 0.08 + k * 0.6
            parts.append(kit.box((x0, 0.14, span(z, z + s * 0.02)[0]), (x0 + 0.56, 0.82, span(z, z + s * 0.02)[1]), CABINET, 0.006))
            parts.append(kit.box((x0 + 0.24, 0.72, span(z, z + s * 0.04)[0]), (x0 + 0.32, 0.74, span(z, z + s * 0.04)[1]), CHROME))
    return kit.asset("island", parts)


def den_table():
    """A dining table under a cloth that hangs part way down its sides."""
    hx, hz, top = 1.0, 0.75, 0.75
    parts = [
        kit.box((-hx + 0.02, top - 0.04, -hz + 0.02), (hx - 0.02, top, hz - 0.02), TABLE, 0.01),
        kit.box((-hx + 0.05, top - 0.35, -hz + 0.05), (hx - 0.05, top + 0.004, hz - 0.05), LINEN, 0.04, 3),
    ]
    for x in (-hx + 0.12, hx - 0.12):
        for z in (-hz + 0.12, hz - 0.12):
            parts.append(kit.cylinder(0.035, 0.0, top - 0.3, (x, 0, z), "y", TABLE, 10, r2=0.045))
    return kit.asset("den-table", parts)


def workbench():
    """A garage workbench along z, its front toward +x: a thick top, legs, a shelf of boxes, a vise and some planks."""
    hx, hz, top = 0.35, 2.0, 0.9
    parts = [kit.box((-hx, top - 0.07, -hz), (hx, top, hz), TABLE, 0.008), kit.box((-hx + 0.04, 0.12, -hz + 0.05), (hx - 0.04, 0.15, hz - 0.05), TABLE)]
    for x in (-hx + 0.06, hx - 0.06):
        for z in (-hz + 0.06, -0.02, hz - 0.06):
            parts.append(kit.box((x - 0.04, 0, z - 0.04), (x + 0.04, top - 0.07, z + 0.04), TABLE, 0.005))
    for z, w, h, mat in ((-1.5, 0.5, 0.35, AC), (-0.6, 0.45, 0.3, SHUTTER), (0.6, 0.6, 0.4, TARP), (1.4, 0.4, 0.3, AC)):
        parts.append(kit.box((-hx + 0.06, 0.15, z - w / 2), (hx - 0.1, 0.15 + h, z + w / 2), mat, 0.01))
    parts.append(kit.box((0.2, top, 1.2), (0.36, top + 0.04, 1.36), UNDER, 0.005))
    parts.append(kit.cylinder(0.012, 0.3, 0.38, (0, top + 0.02, 1.28), "x", CHROME, 8))
    for k, z in enumerate((-1.7, -1.62)):
        parts.append(kit.box((-0.3 + k * 0.05, top, z - 0.04), (0.05 + k * 0.05, top + 0.025, z + 1.1), WOOD_FRAME))
    return kit.asset("workbench", parts)


def bed(name, hx, hz):
    """A bed, its head toward +x: frame on legs, mattress, a bedspread draped over it, pillows and a low headboard."""
    parts = [kit.box((-hx + 0.03, 0.08, -hz + 0.03), (hx - 0.05, 0.28, hz - 0.03), TABLE, 0.015)]
    for x in (-hx + 0.08, hx - 0.12):
        for z in (-hz + 0.08, hz - 0.08):
            parts.append(kit.box((x - 0.04, 0.0, z - 0.04), (x + 0.04, 0.1, z + 0.04), TABLE))
    parts.append(kit.box((-hx + 0.06, 0.28, -hz + 0.07), (hx - 0.1, 0.48, hz - 0.07), LINEN, 0.05, 3))
    parts.append(kit.box((-hx + 0.04, 0.2, -hz + 0.04), (hx - 0.5, 0.52, hz - 0.04), BEDSPREAD, 0.06, 3))
    parts.append(kit.box((-hx + 0.02, 0.48, -hz + 0.02), (hx - 0.48, 0.55, hz - 0.02), BEDSPREAD, 0.03, 3))
    # Two pillows side by side across the head.
    pw = (2 * hz - 0.3) / 2
    for z0 in (-hz + 0.12, -hz + 0.18 + pw):
        parts.append(kit.box((hx - 0.45, 0.48, z0), (hx - 0.12, 0.58, z0 + pw - 0.06), LINEN, 0.05, 3))
    parts.append(kit.box((hx - 0.08, 0.0, -hz), (hx, 0.64, hz), TABLE, 0.02))
    return kit.asset(name, parts)


def dresser():
    """A chest of drawers, its back toward -z: three rows of two drawers with pulls, on a plinth."""
    hx, hz, top = 0.75, 0.5, 1.2
    parts = [
        kit.box((-hx + 0.03, 0.0, -hz), (hx - 0.03, 0.08, hz - 0.05), TABLE),
        kit.box((-hx + 0.02, 0.08, -hz), (hx - 0.02, top - 0.03, hz - 0.04), TABLE, 0.006),
        kit.box((-hx, top - 0.03, -hz), (hx, top, hz), TABLE, 0.01),
    ]
    for row in range(3):
        y0 = 0.12 + row * 0.35
        for x0, x1 in ((-hx + 0.06, -0.02), (0.02, hx - 0.06)):
            xm = (x0 + x1) / 2
            parts.append(kit.box((x0, y0, hz - 0.045), (x1, y0 + 0.31, hz - 0.02), TABLE, 0.008))
            parts.append(kit.box((xm - 0.07, y0 + 0.15, hz - 0.02), (xm + 0.07, y0 + 0.17, hz + 0.01), CHROME))
    return kit.asset("dresser", parts)


def ac_unit():
    """A condenser: a louvred cabinet between corner posts, a fan grille on top."""
    h, top = 0.5, 1.2
    parts = [kit.box((-h + 0.02, 0.05, -h + 0.02), (h - 0.02, top - 0.06, h - 0.02), UNDER), kit.box((-h + 0.05, 0.0, -h + 0.05), (h - 0.05, 0.06, h - 0.05), UNDER)]
    for x in (-h, h - 0.06):
        for z in (-h, h - 0.06):
            parts.append(kit.box((x, 0.05, z), (x + 0.06, top - 0.04, z + 0.06), AC, 0.008))
    for k in range(16):
        y = 0.12 + k * 0.062
        for s in (-1, 1):
            lo, hi = span(s * (h - 0.03), s * h)
            parts.append(kit.box((-h + 0.06, y, lo), (h - 0.06, y + 0.03, hi), AC))
            parts.append(kit.box((lo, y, -h + 0.06), (hi, y + 0.03, h - 0.06), AC))
    parts.append(kit.box((-h, top - 0.06, -h), (h, top - 0.02, h), AC, 0.01))
    parts.append(kit.cylinder(0.38, top - 0.03, top, (0, 0, 0), "y", UNDER, 24))
    for k in range(5):
        r = 0.08 + k * 0.07
        parts.append(kit.lathe([(top - 0.02, r - 0.008), (top + 0.004, r - 0.008), (top + 0.004, r + 0.008), (top - 0.02, r + 0.008)], (0, 0, 0), AC, 24, "y", caps=False))
    parts.append(kit.box((-0.02, top - 0.02, -0.38), (0.02, top + 0.01, 0.38), AC))
    parts.append(kit.cylinder(0.06, top - 0.06, top + 0.02, (0, 0, 0), "y", AC, 12))
    return kit.asset("ac-unit", parts)


def shed():
    """A garden shed: board-and-batten walls, a low gable roof (ridge along x) under its flat collision top, double doors toward +z, a window."""
    hx, hz, wall, top = 2.0, 1.25, 1.98, 2.4
    parts = [kit.box((-hx + 0.05, 0.0, -hz + 0.05), (hx - 0.05, wall, hz - 0.05), SIDING, 0.01)]
    for s in (-1, 1):
        z = s * (hz - 0.05)
        for k in range(17):
            x = -hx + 0.1 + k * 0.237
            parts.append(kit.box((x - 0.02, 0.02, span(z, z + s * 0.025)[0]), (x + 0.02, wall, span(z, z + s * 0.025)[1]), SIDING))
        x = s * (hx - 0.05)
        for k in range(10):
            zz = -hz + 0.12 + k * 0.223
            parts.append(kit.box((span(x, x + s * 0.025)[0], 0.02, zz - 0.02), (span(x, x + s * 0.025)[1], wall, zz + 0.02), SIDING))
        # The gable over the end wall.
        lo, hi = span(x, x - s * 0.1)
        parts.append(kit.section([(wall, -hz + 0.05), (wall, hz - 0.05), (top - 0.1, 0.0)], lo, hi, SIDING))
        for zc in (-hz + 0.05, hz - 0.05):
            parts.append(kit.box((span(x, x + s * 0.04)[0], 0.0, zc - 0.05), (span(x, x + s * 0.04)[1], wall, zc + 0.05), WHITE))
    # The roof: two slopes from the eaves to the ridge, fascia boards, and the ridge cap.
    for s in (-1, 1):
        parts.append(kit.section([(wall - 0.05, s * (hz + 0.035)), (wall + 0.02, s * (hz + 0.035)), (top - 0.03, 0.0), (top - 0.1, 0.0)], -hx - 0.03, hx + 0.03, ROOF))
        lo, hi = span(s * (hz + 0.015), s * (hz + 0.035))
        parts.append(kit.box((-hx - 0.03, wall - 0.12, lo), (hx + 0.03, wall, hi), WHITE))
    parts.append(kit.box((-hx - 0.03, top - 0.06, -0.08), (hx + 0.03, top, 0.08), ROOF, 0.02))
    # Double doors toward +z in a trim frame, with handles; a window on the -x end.
    z = hz - 0.05
    parts.append(kit.box((-0.75, 0.0, z), (0.75, 1.85, z + 0.035), WHITE, 0.008))
    for x0, x1 in ((-0.68, -0.02), (0.02, 0.68)):
        parts.append(kit.box((x0, 0.04, z + 0.02), (x1, 1.78, z + 0.045), SHUTTER, 0.006))
        parts.append(kit.box((x0 + 0.05, 0.85, z + 0.035), (x1 - 0.05, 0.95, z + 0.05), SHUTTER))
    for x in (-0.08, 0.08):
        parts.append(kit.box((x - 0.012, 0.9, z + 0.04), (x + 0.012, 1.1, z + 0.05), CHROME))
    x = -hx + 0.05
    parts.append(kit.box((x - 0.035, 0.95, -0.45), (x, 1.6, 0.45), WHITE, 0.008))
    parts.append(kit.box((x - 0.045, 1.0, -0.39), (x - 0.02, 1.55, 0.39), GLASS))
    parts.append(kit.box((x - 0.05, 1.26, -0.4), (x - 0.025, 1.29, 0.4), WHITE))
    return kit.asset("shed", parts)


def picnic_table():
    """A picnic table with its benches, along x: plank top, A-frame legs, a bench either side."""
    parts = []
    for k in range(4):
        z = -0.3 + k * 0.15 + 0.005
        parts.append(kit.box((-0.98, 0.7, z), (0.98, 0.75, z + 0.14), TABLE, 0.008))
    for s in (-1, 1):
        for k in range(2):
            z = s * (0.33 + k * 0.085) - 0.04
            parts.append(kit.box((-0.95, 0.42, z), (0.95, 0.46, z + 0.08), TABLE, 0.006))
    for x in (-0.7, 0.7):
        for s in (-1, 1):
            parts.append(kit.section([(0.0, s * 0.46), (0.0, s * 0.38), (0.7, s * 0.03), (0.7, s * 0.11)], x - 0.04, x + 0.04, TABLE))
        parts.append(kit.box((x - 0.04, 0.38, -0.49), (x + 0.04, 0.42, 0.49), TABLE))
        parts.append(kit.box((x - 0.04, 0.62, -0.3), (x + 0.04, 0.7, 0.3), TABLE))
    return kit.asset("picnic-table", parts)


def hull():
    """A runabout's V hull, lofted from cross-sections, bow toward +x."""
    bm = bmesh.new()
    rings = []
    n = 14
    for i in range(n + 1):
        t = i / n
        x = -2.38 + t * 4.76
        bow = max(0.0, (t - 0.55) / 0.45)
        half = 0.93 * math.sqrt(max(1 - bow ** 1.6, 0.0)) + 0.005
        keel = 0.56 + 0.32 * bow ** 1.5
        chine = keel + 0.22 * (1 - bow) + 0.05
        sheer = 1.42 + 0.12 * bow ** 2
        section = [(x, keel, 0.0), (x, chine, half * 0.92), (x, sheer, half), (x, sheer, -half), (x, chine, -half * 0.92)]
        rings.append([bm.verts.new(kit.b(p)) for p in section])
    for a, c in zip(rings, rings[1:]):
        for k in range(5):
            bm.faces.new((a[k], a[(k + 1) % 5], c[(k + 1) % 5], c[k]))
    bm.faces.new(rings[0])
    bm.faces.new(list(reversed(rings[-1])))
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-4)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return kit.obj("hull", bm, HULL)


def boat():
    """A runabout on its trailer, bow toward +x: the hull with a stripe, a deck with a windscreen, seats and an outboard;
    the trailer's frame, bunks, fenders, wheels and winch post."""
    parts = [hull()]
    for s in (-1, 1):
        lo, hi = span(s * 0.9, s * 0.955)
        parts.append(kit.box((-2.36, 1.28, lo), (1.4, 1.36, hi), STRIPE))
    parts.append(kit.box((-2.3, 1.38, -0.84), (1.2, 1.44, 0.84), BOAT_DECK, 0.01))
    parts.append(kit.prism([(0.35, 1.44), (0.42, 1.44), (0.2, 1.6), (0.15, 1.6)], -0.75, 0.75, GLASS))
    parts.append(kit.box((-1.2, 1.44, -0.7), (-0.4, 1.58, 0.7), STRIPE, 0.04, 3))
    parts.append(kit.box((-2.4, 0.9, -0.16), (-2.16, 1.6, 0.16), UNDER, 0.04, 3))
    parts.append(kit.box((-2.38, 0.55, -0.06), (-2.25, 0.9, 0.06), UNDER))
    for s in (-1, 1):
        parts.append(kit.box((-2.4, 0.3, s * 0.55 - 0.05), (2.3, 0.4, s * 0.55 + 0.05), ALLOY))
        parts.append(kit.box((-2.2, 0.4, s * 0.32 - 0.05), (1.4, 0.5, s * 0.32 + 0.05), TABLE))
        lo, hi = span(s * 0.76, s * 0.98)
        parts.append(kit.box((-0.75, 0.62, lo), (0.15, 0.66, hi), ALLOY, 0.01))
    for x in (-2.0, -0.3, 1.2):
        parts.append(kit.box((x - 0.04, 0.3, -0.6), (x + 0.04, 0.38, 0.6), ALLOY))
    parts.append(kit.box((1.4, 0.3, -0.05), (2.48, 0.4, 0.05), ALLOY))
    parts.append(kit.box((2.1, 0.4, -0.04), (2.18, 0.95, 0.04), ALLOY))
    parts.append(kit.cylinder(0.05, -0.08, 0.08, (2.14, 0.88, 0), "z", UNDER, 10))
    parts += wheels([-0.3], 0.3, 0.18, 0.86, rim=ALLOY, hub=CHROME)
    return kit.asset("boat", parts)


def mannequin(outfit):
    """A shop-window mannequin (its head is the map's own prop): legs and shoes, a torso in a shirt, arms down by its sides along x."""
    shirt_name, shirt_rgb, trousers_name, trousers_rgb = OUTFITS[outfit]
    shirt = M(shirt_name, shirt_rgb, 0.85)
    trousers = M(trousers_name, trousers_rgb, 0.85)
    parts = []
    for s in (-1, 1):
        x = s * 0.085
        parts.append(kit.lathe([(0.06, 0.0), (0.06, 0.06), (0.2, 0.058), (0.45, 0.068), (0.55, 0.075), (0.86, 0.085)], (x, 0, 0), trousers, 10, "y"))
        parts.append(kit.box((x - 0.05, 0.0, -0.1), (x + 0.05, 0.08, 0.1), UNDER, 0.025, 2))
    # Torso: hips to shoulders, flattened front to back.
    torso = kit.lathe([(0.84, 0.0), (0.84, 0.16), (0.98, 0.15), (1.12, 0.135), (1.26, 0.155), (1.36, 0.17), (1.4, 0.12), (1.42, 0.0)], (0, 0, 0), shirt, 16, "y")
    for v in torso.data.vertices:
        v.co.y *= 0.72
    parts.append(torso)
    parts.append(kit.cylinder(0.045, 1.38, 1.47, (0, 0, 0), "y", SKIN, 10))
    for s in (-1, 1):
        x = s * 0.195
        parts.append(kit.lathe([(1.36, 0.0), (1.36, 0.045), (1.12, 0.042), (1.1, 0.0)], (x, 0, 0), shirt, 10, "y"))
        parts.append(kit.lathe([(1.12, 0.0), (1.12, 0.036), (0.94, 0.03), (0.9, 0.033), (0.865, 0.0)], (x, 0, 0), SKIN, 10, "y"))
    return kit.asset(f"mannequin-{outfit}", parts, smooth_angle=80)


# ---------------------------------------------------- the test site round town

TANK = M("tank", 0xB7BCBF, 0.45, 0.6)
SITE_RED = M("site.red", 0xB04A33, 0.6)
SITE_STEEL = M("site.steel", 0x7B8085, 0.5, 0.6)
SITE_PAINT = M("site.paint", 0xD8D2C4, 0.6)
BUNKER = M("bunker", 0xB9B2A4, 0.95)
POLE = M("pole", 0x6B5038, 0.85)
ROCK = M("rock", 0x86745F, 0.95)
SCRUB = M("scrub", 0x8C8A55, 0.95)
INSULATOR = M("insulator", 0x6E8C7A, 0.15)


def lattice(size, thick, top, brace):
    """Four tubular legs `size` apart (centre to centre) from the ground to `top`, tied by round braces every `brace` m,
    each within the square leg and brace boxes the map collides as (see `legs` in survival-town.ts)."""
    h, r = size / 2, thick / 2 - 0.01
    parts = []
    for x in (-h, h):
        for z in (-h, h):
            parts.append(kit.cylinder(r, 0.0, top, (x, 0, z), "y", SITE_STEEL, 12, r2=r * 0.8))
            parts.append(kit.box((x - thick / 2, 0.0, z - thick / 2), (x + thick / 2, 0.3, z + thick / 2), BUNKER, 0.02))
    y = brace
    while y < top - 0.5:
        for s in (-1, 1):
            parts.append(kit.cylinder(0.055, -h + thick / 2, h - thick / 2, (0, y + 0.06, s * h), "x", SITE_STEEL, 8))
            parts.append(kit.cylinder(0.055, -h + thick / 2, h - thick / 2, (s * h, y + 0.06, 0), "z", SITE_STEEL, 8))
        y += brace
    return parts


def water_tower():
    """The town's water tower: a lattice of four legs, and over them a round tank with a catwalk and railing round its
    foot, a conical red roof and a finial, all within the square tank box."""
    parts = lattice(4.4, 0.35, 14, 4.5)
    base, wall, roof = 14.0, 18.1, 19.0
    parts.append(kit.lathe([(base, 0.0), (base, 2.2), (base + 0.35, 2.92), (wall, 2.92), (wall, 0.0)], (0, 0, 0), TANK, 40, "y"))
    for y in (15.4, 16.7):
        parts.append(kit.lathe([(y, 2.92), (y, 2.95), (y + 0.06, 2.95), (y + 0.06, 2.92)], (0, 0, 0), SITE_STEEL, 40, "y", caps=False))
    parts.append(kit.lathe([(wall - 0.05, 0.0), (wall - 0.05, 2.98), (wall + 0.05, 2.98), (roof - 0.1, 0.3), (roof - 0.1, 0.0)], (0, 0, 0), SITE_RED, 40, "y"))
    parts.append(kit.cylinder(0.08, roof - 0.12, roof + 0.03, (0, 0, 0), "y", SITE_STEEL, 10))
    # The catwalk round the tank's foot, and its railing.
    parts.append(kit.lathe([(base + 0.3, 2.9), (base + 0.3, 2.99), (base + 0.36, 2.99), (base + 0.36, 2.9)], (0, 0, 0), SITE_STEEL, 40, "y", caps=False))
    for y in (base + 0.85, base + 1.3):
        parts.append(kit.lathe([(y, 2.955), (y, 2.985), (y + 0.035, 2.985), (y + 0.035, 2.955)], (0, 0, 0), SITE_STEEL, 40, "y", caps=False))
    for k in range(24):
        a = 2 * math.pi * k / 24
        parts.append(kit.cylinder(0.018, base + 0.36, base + 1.33, (2.97 * math.cos(a), 0, 2.97 * math.sin(a)), "y", SITE_STEEL, 6))
    return kit.asset("water-tower", parts)


def instrument_tower():
    """An instrument tower: lattice legs to a gridded platform, a railing round it, and a cabin with windows all round and
    a mast on its roof."""
    parts = lattice(3.0, 0.3, 18, 4.5)
    p, c = 2.2, 1.8
    parts.append(kit.box((-p, 18.0, -p), (p, 18.3, p), SITE_STEEL, 0.02))
    for k in range(-5, 6):
        parts.append(kit.box((k * 0.4 - 0.015, 18.28, -p + 0.05), (k * 0.4 + 0.015, 18.31, p - 0.05), SITE_PAINT))
    parts.append(kit.box((-c + 0.05, 18.3, -c + 0.05), (c - 0.05, 20.7, c - 0.05), SITE_PAINT, 0.02))
    parts.append(kit.box((-c, 20.7, -c), (c, 20.9, c), SITE_RED, 0.03))
    for s in (-1, 1):
        for axis in ("x", "z"):
            def at(a, y0, y1, d0, d1, mat=GLASS):
                lo, hi = span(s * d0, s * d1)
                return kit.box((a[0], y0, lo), (a[1], y1, hi), mat) if axis == "x" else kit.box((lo, y0, a[0]), (hi, y1, a[1]), mat)
            parts.append(at((-1.4, 1.4), 19.2, 20.4, c - 0.05, c - 0.02, SITE_STEEL))
            parts.append(at((-1.32, 1.32), 19.26, 20.34, c - 0.04, c - 0.01))
            parts.append(at((-0.02, 0.02), 19.2, 20.4, c - 0.05, c, SITE_STEEL))
            # The railing on the platform's edge: posts, a top rail and a mid rail.
            parts.append(at((-p + 0.02, p - 0.02), 19.22, 19.27, p - 0.05, p - 0.01, SITE_STEEL))
            parts.append(at((-p + 0.02, p - 0.02), 18.75, 18.79, p - 0.05, p - 0.01, SITE_STEEL))
            for k in range(5):
                a = -p + 0.05 + k * (2 * p - 0.1) / 4
                parts.append(at((a - 0.02, a + 0.02), 18.3, 19.27, p - 0.05, p - 0.01, SITE_STEEL))
    parts.append(kit.cylinder(0.05, 20.9, 23.0, (0.9, 0, 0.9), "y", SITE_STEEL, 8))
    return kit.asset("instrument-tower", parts)


def bunker(name, hx, h, hz):
    """A low concrete bunker: battered walls under a thick roof slab with chamfered edges, an observation slit along each
    long side, a steel blast door at the -x end."""
    parts = [kit.box((-hx + 0.08, 0.0, -hz + 0.08), (hx - 0.08, h - 0.4, hz - 0.08), BUNKER, 0.04)]
    parts.append(kit.box((-hx, h - 0.45, -hz), (hx, h, hz), BUNKER, 0.12, 2))
    parts.append(kit.prism([(-hx, 0.0), (hx, 0.0), (hx - 0.08, 0.6), (-hx + 0.08, 0.6)], -hz, hz, BUNKER))
    for s in (-1, 1):
        lo, hi = span(s * (hz - 0.08), s * (hz - 0.2))
        parts.append(kit.box((-hx * 0.6, h - 1.0, lo), (hx * 0.6, h - 0.75, hi), UNDER))
        lo, hi = span(s * (hz - 0.1), s * (hz - 0.07))
        for k in range(5):
            x = -hx * 0.6 + k * hx * 0.3
            parts.append(kit.box((x - 0.05, h - 1.02, lo), (x + 0.05, h - 0.73, hi), BUNKER))
    x = -hx + 0.08
    parts.append(kit.box((x - 0.04, 0.0, -0.8), (x + 0.02, 2.1, 0.8), BUNKER, 0.02))
    parts.append(kit.box((x - 0.07, 0.05, -0.65), (x - 0.02, 2.0, 0.65), SITE_STEEL, 0.01))
    for y in (0.5, 1.5):
        parts.append(kit.box((x - 0.08, y, -0.62), (x - 0.06, y + 0.12, -0.4), SITE_STEEL))
    parts.append(kit.cylinder(0.12, h, h + 0.04, (hx * 0.5, 0, 0), "y", SITE_STEEL, 12))
    return kit.asset(name, parts)


def hangar(name, hx, h, hz):
    """A corrugated metal shed: ribbed walls, a shallow gable roof under its flat collision top, a big sliding door on
    the +z side and a man door on the -x end."""
    eave = h - 0.6
    parts = [kit.box((-hx + 0.06, 0.0, -hz + 0.06), (hx - 0.06, eave, hz - 0.06), SITE_PAINT)]
    for s in (-1, 1):
        z = s * (hz - 0.06)
        n = int(2 * hx / 0.3)
        for k in range(n + 1):
            x = -hx + 0.06 + k * (2 * hx - 0.12) / n
            lo, hi = span(z, z + s * 0.04)
            parts.append(kit.box((x - 0.05, 0.0, lo), (x + 0.05, eave, hi), SITE_PAINT))
        x = s * (hx - 0.06)
        n = int(2 * hz / 0.3)
        for k in range(n + 1):
            zz = -hz + 0.06 + k * (2 * hz - 0.12) / n
            lo, hi = span(x, x + s * 0.04)
            parts.append(kit.box((lo, 0.0, zz - 0.05), (hi, eave, zz + 0.05), SITE_PAINT))
        lo, hi = span(x, x - s * 0.1)
        parts.append(kit.section([(eave, -hz + 0.06), (eave, hz - 0.06), (h - 0.08, 0.0)], lo, hi, SITE_PAINT))
        parts.append(kit.section([(eave - 0.05, s * (hz + 0.03)), (eave + 0.05, s * (hz + 0.03)), (h, 0.0), (h - 0.1, 0.0)], -hx - 0.03, hx + 0.03, ROOF))
    # The sliding door and its track.
    z = hz - 0.02
    parts.append(kit.box((-hx * 0.45, 0.0, z), (hx * 0.45, eave - 0.5, z + 0.04), SITE_STEEL, 0.01))
    for k in range(1, 6):
        y = k * (eave - 0.5) / 6
        parts.append(kit.box((-hx * 0.45, y - 0.03, z + 0.03), (hx * 0.45, y + 0.03, z + 0.05), SITE_STEEL))
    parts.append(kit.box((-hx * 0.5, eave - 0.5, z), (hx * 0.5, eave - 0.4, z + 0.05), UNDER))
    x = -hx + 0.02
    parts.append(kit.box((x - 0.04, 0.0, -0.5), (x, 2.1, 0.5), SITE_RED, 0.01))
    return kit.asset(name, parts)


# Where the insulators stand along the crossarm (each its own small solid on the map).
INSULATORS = (-1.0, 0.3, 1.0)


def power_pole():
    """A wooden power pole with its crossarm, braces and three insulators on top of the arm (their own small solids)."""
    parts = [kit.cylinder(0.14, 0.0, 9.0, (0, 0, 0), "y", POLE, 12, r2=0.11)]
    parts.append(kit.box((-0.07, 8.2, -1.2), (0.07, 8.35, 1.2), POLE, 0.01))
    for zz in INSULATORS:
        parts.append(kit.lathe([(8.35, 0.04), (8.4, 0.045), (8.42, 0.065), (8.46, 0.045), (8.48, 0.065), (8.52, 0.045), (8.54, 0.06), (8.58, 0.03), (8.6, 0.0)], (0, 0, zz), INSULATOR, 10, "y"))
    return kit.asset("power-pole", parts, smooth_angle=50)


def guard_hut():
    """The checkpoint's guard hut: a sheet-metal box with windows toward the road and the town, a door, and a roof slab
    with a drip edge."""
    hx, hz, h = 1.2, 1.1, 2.6
    parts = [kit.box((-hx + 0.03, 0.0, -hz + 0.03), (hx - 0.03, h, hz - 0.03), SITE_PAINT, 0.02)]
    parts.append(kit.box((-hx, 0.0, -hz), (hx, 0.25, hz), BUNKER, 0.01))
    parts.append(kit.box((-hx - 0.2, h, -hz - 0.2), (hx + 0.2, h + 0.15, hz + 0.2), SITE_STEEL, 0.02))
    # Windows: toward the road (+z) and toward the town (-x); the door on +x.
    z = hz - 0.03
    parts.append(kit.box((-0.2 - 1.0 + 0.6, 1.1, z), (0.6 - 0.2 + 0.0, 2.05, z + 0.03), SITE_STEEL, 0.005))
    parts.append(kit.box((-0.55, 1.15, z + 0.01), (0.35, 2.0, z + 0.035), GLASS))
    x = -hx + 0.03
    parts.append(kit.box((x - 0.03, 1.1, -0.65), (x, 2.05, 0.55), SITE_STEEL, 0.005))
    parts.append(kit.box((x - 0.035, 1.15, -0.6), (x - 0.01, 2.0, 0.5), GLASS))
    x = hx - 0.03
    parts.append(kit.box((x, 0.25, -0.45), (x + 0.03, 2.25, 0.45), SITE_STEEL, 0.008))
    parts.append(kit.box((x + 0.02, 1.0, 0.3), (x + 0.045, 1.06, 0.38), CHROME))
    return kit.asset("guard-hut", parts)


def rock(name, seed, w, h, d, stone):
    """A boulder filling a w x h x d box, faceted and lumpy, and a smaller stone beside it (its own box, `stone` the
    boulder's size), laid out like the map's."""
    import random
    from mathutils import noise

    rnd = random.Random(seed)

    def lump(cx, cy, cz, sx, sy, sz, yaw, sub=2, flat=0.0):
        bm = bmesh.new()
        bmesh.ops.create_icosphere(bm, subdivisions=3, radius=1.0)
        off = Vector((rnd.uniform(0, 50), rnd.uniform(0, 50), rnd.uniform(0, 50)))
        for v in bm.verts:
            n = v.co.normalized()
            f = 1 + 0.22 * noise.noise(n * 1.6 + off) + 0.08 * noise.noise(n * 4.0 + off)
            p = n * f
            # Squared off a little, like weathered granite, and flat on the ground.
            p = Vector((math.copysign(min(abs(p.x), 0.92), p.x), math.copysign(min(abs(p.y), 0.92), p.y), max(min(p.z, 0.9), -1.0)))
            v.co = p
        bmesh.ops.scale(bm, vec=(sx / 2 / 0.92, sz / 2 / 0.92, sy), verts=bm.verts)
        for v in bm.verts:
            v.co.z = max(v.co.z, -0.02 * sy)
        bmesh.ops.rotate(bm, verts=bm.verts, cent=(0, 0, 0), matrix=Matrix.Rotation(yaw, 3, "Z"))
        bmesh.ops.translate(bm, vec=kit.b((cx, cy, cz)), verts=bm.verts)
        return kit.obj("rock", bm, ROCK)

    parts = [lump(0, 0, 0, w, h, d, 0.0), lump(0.55 * w, 0, 0, w * stone, h * stone, w * stone * 0.7, 0.6)]
    o = kit.asset(name, parts, smooth_angle=35)
    return o


def scrub(name, seed, w, h):
    """A desert shrub: a low clump of small leafy lumps under a smaller one turned across it, within the map's two boxes."""
    import random
    from mathutils import noise

    rnd = random.Random(seed)
    parts = []
    for k in range(9):
        a = rnd.uniform(0, 2 * math.pi)
        r = rnd.uniform(0, 0.25)
        cx, cz = r * w * math.cos(a), r * w * 0.8 * math.sin(a)
        size = rnd.uniform(0.22, 0.36) * w
        top = h * (1.35 if k < 3 else rnd.uniform(0.7, 1.0))
        bm = bmesh.new()
        bmesh.ops.create_icosphere(bm, subdivisions=1, radius=1.0)
        off = Vector((rnd.uniform(0, 50), 0, 0))
        for v in bm.verts:
            v.co = v.co * (1 + 0.35 * noise.noise(v.co * 2.5 + off))
        bmesh.ops.scale(bm, vec=(size, size * 0.8, top / 2), verts=bm.verts)
        bmesh.ops.translate(bm, vec=kit.b((cx, top / 2, cz)), verts=bm.verts)
        parts.append(kit.obj("leaf", bm, SCRUB))
    o = kit.asset(name, parts, smooth_angle=70)
    # Clamped into the clump's boxes: the low tuft (w x h x 0.8w) and the taller middle (0.6w x 1.45h x 0.55w).
    for v in o.data.vertices:
        x, z, y = v.co.x, -v.co.y, v.co.z
        y = max(y, 0.0)
        # The taller middle box is turned a quarter of a half turn from the tuft's (game yaw: +x toward (cos, -sin)).
        q = math.pi / 4
        tall = abs(x * math.cos(q) - z * math.sin(q)) <= 0.3 * w and abs(x * math.sin(q) + z * math.cos(q)) <= 0.275 * w
        y = min(y, 1.45 * h if tall else h)
        x = max(min(x, w / 2), -w / 2)
        z = max(min(z, 0.4 * w), -0.4 * w)
        v.co = Vector((x, -z, y))
    return o


# Rocks and scrub come in a few fixed sizes (the map scatters them): name -> (w, h, d, stone (offset, scale, yaw)), (w, h).
# A rock's stone sits 0.55 of the boulder's width along it, turned 0.6 rad, `scale` the boulder's size (w x h x 0.7w).
ROCKS = {"rock-0": (2.4, 1.1, 1.7, 0.6), "rock-1": (1.6, 0.7, 1.2, 0.75), "rock-2": (2.0, 0.9, 1.5, 0.5), "rock-3": (1.3, 0.55, 0.9, 0.8)}
SCRUBS = {"scrub-0": (1.2, 0.55), "scrub-1": (0.9, 0.4), "scrub-2": (1.1, 0.48)}


def rock_solids(w, h, d, s):
    """A rock's two boxes, as the map lays them out: the boulder, and the stone (by its turned box's bounds, which the
    map's own test checks exactly)."""
    ox, yaw = 0.55 * w, 0.6
    sw, sh, sd = w * s, h * s, w * s * 0.7
    c, n = math.cos(yaw), math.sin(yaw)
    ex = abs(sw / 2 * c) + abs(sd / 2 * n)
    ez = abs(sw / 2 * n) + abs(sd / 2 * c)
    return [((-w / 2, 0, -d / 2), (w / 2, h, d / 2)), ((ox - ex, 0, -ez), (ox + ex, sh, ez))]


# Each asset's collision solids (game space, relative to its origin), as the map builds them.
SOLIDS = {
    "bus": [((-6.1, 0, -1.25), (4.3, 3.1, 1.25)), ((4.3, 0, -1.1), (6.1, 1.45, 1.1))],
    "van": [((-4.2, 0, -1.25), (1.8, 3.4, 1.25)), ((1.8, 0, -1.15), (3.6, 2.3, 1.15)), ((3.6, 0, -1.0), (4.4, 1.3, 1.0))],
    "pickup": [((-2.7, 0, -1.0), (-0.4, 1.0, 1.0)), ((-0.4, 0, -1.0), (1.3, 1.8, 1.0)), ((1.3, 0, -0.95), (2.7, 1.15, 0.95))],
    "wagon": [((-2.4, 0, -0.95), (2.4, 0.95, 0.95)), ((-2.4, 0.95, -0.9), (1.05, 1.45, 0.9))],
    "sofa": [((-1.5, 0, -0.5), (1.5, 0.85, 0.5))],
    "counter": [((-0.45, 0, -2.5), (0.45, 0.9, 2.5))],
    "island": [((-1.25, 0, -0.6), (1.25, 0.9, 0.6))],
    "den-table": [((-1.0, 0, -0.75), (1.0, 0.75, 0.75))],
    "workbench": [((-0.35, 0, -2.0), (0.35, 0.9, 2.0))],
    "bed": [((-0.95, 0, -1.0), (0.95, 0.6, 1.0))],
    "bed-large": [((-1.2, 0, -1.25), (1.2, 0.6, 1.25))],
    "dresser": [((-0.75, 0, -0.5), (0.75, 1.2, 0.5))],
    "ac-unit": [((-0.5, 0, -0.5), (0.5, 1.2, 0.5))],
    "shed": [((-2.0, 0, -1.25), (2.0, 2.4, 1.25))],
    "picnic-table": [((-1.0, 0, -0.5), (1.0, 0.75, 0.5))],
    "boat": [((-2.5, 0, -1.0), (2.5, 0.5, 1.0)), ((-2.4, 0.5, -0.95), (2.4, 1.6, 0.95))],
    **{f"mannequin-{i}": [((-0.17, 0, -0.11), (0.17, 0.86, 0.11)), ((-0.23, 0.86, -0.13), (0.23, 1.42, 0.13))] for i in range(4)},
    "water-tower": [((-3, 14, -3), (3, 19, 3))] + [((x - 0.175, 0, z - 0.175), (x + 0.175, 14, z + 0.175)) for x in (-2.2, 2.2) for z in (-2.2, 2.2)] + [b for y in (4.5, 9.0) for b in (((-2.2, y, -2.26), (2.2, y + 0.12, -2.14)), ((-2.2, y, 2.14), (2.2, y + 0.12, 2.26)), ((-2.26, y, -2.2), (-2.14, y + 0.12, 2.2)), ((2.14, y, -2.2), (2.26, y + 0.12, 2.2)))],
    "instrument-tower": [((-2.2, 18, -2.2), (2.2, 18.3, 2.2)), ((-1.8, 18.3, -1.8), (1.8, 20.9, 1.8)), ((0.84, 20.9, 0.84), (0.96, 23.0, 0.96))]
    + [((x - 0.15, 0, z - 0.15), (x + 0.15, 18, z + 0.15)) for x in (-1.5, 1.5) for z in (-1.5, 1.5)]
    + [b for y in (4.5, 9.0, 13.5) for b in (((-1.5, y, -1.56), (1.5, y + 0.12, -1.44)), ((-1.5, y, 1.44), (1.5, y + 0.12, 1.56)), ((-1.56, y, -1.5), (-1.44, y + 0.12, 1.5)), ((1.44, y, -1.5), (1.56, y + 0.12, 1.5)))]
    + [((-2.2, 18.3, -2.2), (2.2, 19.3, -2.14)), ((-2.2, 18.3, 2.14), (2.2, 19.3, 2.2)), ((-2.2, 18.3, -2.2), (-2.14, 19.3, 2.2)), ((2.14, 18.3, -2.2), (2.2, 19.3, 2.2))],
    "bunker-a": [((-5, 0, -3.5), (5, 3, 3.5))],
    "bunker-b": [((-4, 0, -3), (4, 2.5, 3))],
    "hangar-a": [((-6, 0, -4), (6, 5, 4))],
    "hangar-b": [((-5, 0, -5), (5, 4, 5))],
    "power-pole": [((-0.15, 0, -0.15), (0.15, 9, 0.15)), ((-0.08, 8.2, -1.2), (0.08, 8.35, 1.2))] + [((-0.07, 8.35, z - 0.07), (0.07, 8.6, z + 0.07)) for z in INSULATORS],
    "guard-hut": [((-1.2, 0, -1.1), (1.2, 2.6, 1.1)), ((-1.4, 2.6, -1.3), (1.4, 2.75, 1.3))],
    **{name: rock_solids(*spec) for name, spec in ROCKS.items()},
    **{name: [((-w / 2, 0, -0.4 * w), (w / 2, h, 0.4 * w)), ((-0.41 * w, 0, -0.41 * w), (0.41 * w, 1.45 * h, 0.41 * w))] for name, (w, h) in SCRUBS.items()},
}

built = [bus(), van(), pickup(), wagon()]
built += [sofa(), counter(), island(), den_table(), workbench(), bed("bed", 0.95, 1.0), bed("bed-large", 1.2, 1.25), dresser(), ac_unit()]
built += [shed(), picnic_table(), boat()] + [mannequin(i) for i in range(len(OUTFITS))]
built += [water_tower(), instrument_tower(), bunker("bunker-a", 5, 3, 3.5), bunker("bunker-b", 4, 2.5, 3), hangar("hangar-a", 6, 5, 4), hangar("hangar-b", 5, 4, 5), power_pole(), guard_hut()]
built += [rock(name, i, *spec) for i, (name, spec) in enumerate(ROCKS.items())] + [scrub(name, i, *spec) for i, (name, spec) in enumerate(SCRUBS.items())]
kit.bake_ao(built, distance=0.8)
report = {}
for o in built:
    worst, where = kit.strays(o, SOLIDS[o.name])
    report[o.name] = {"tris": kit.tris(o), "outside": worst, **({"at": where} if worst > mapkit.TOLERANCE else {})}
result = {"assets": report, "issues": [n for n, r in report.items() if r["outside"] > mapkit.TOLERANCE]}
if EXPORT:
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    kit.export(built, OUT)
    result["glb"] = {"path": os.path.abspath(OUT), "bytes": os.path.getsize(OUT)}
