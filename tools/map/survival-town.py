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


# Each asset's collision solids (game space, relative to its origin), as the map builds them.
SOLIDS = {
    "bus": [((-6.1, 0, -1.25), (4.3, 3.1, 1.25)), ((4.3, 0, -1.1), (6.1, 1.45, 1.1))],
    "van": [((-4.2, 0, -1.25), (1.8, 3.4, 1.25)), ((1.8, 0, -1.15), (3.6, 2.3, 1.15)), ((3.6, 0, -1.0), (4.4, 1.3, 1.0))],
    "pickup": [((-2.7, 0, -1.0), (-0.4, 1.0, 1.0)), ((-0.4, 0, -1.0), (1.3, 1.8, 1.0)), ((1.3, 0, -0.95), (2.7, 1.15, 0.95))],
    "wagon": [((-2.4, 0, -0.95), (2.4, 0.95, 0.95)), ((-2.4, 0.95, -0.9), (1.05, 1.45, 0.9))],
}

built = [bus(), van(), pickup(), wagon()]
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
