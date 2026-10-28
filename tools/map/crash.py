"""Build Crash's downed tandem-rotor helicopter in game-space metres.

Run via tools/map/build.py; the matching collision boxes are recorded below.
"""
import os
import sys
import math
import random
import bmesh
sys.path.insert(0, os.path.dirname(__file__))
import mapkit

OUT = os.path.join(os.path.dirname(__file__), "..", "..", "apps", "range", "public", "models", "crash.glb")
kit = mapkit.Kit(bkit, "crash")  # noqa: F821

def mat(name, color, roughness=0.8, metallic=0.0):
    return mapkit.material(bkit, name, ((color >> 16) & 255, (color >> 8) & 255, color & 255), roughness, metallic)  # noqa: F821

hull = mat("wreck.hull", 0x777a70, 0.85, 0.35)
dark = mat("wreck.dark", 0x30332f, 0.9, 0.3)
metal = mat("wreck.metal", 0x999a90, 0.7, 0.5)
glass = mat("wreck.glass", 0x202d30, 0.3, 0.1)
rubble_stone = mat("rubble.stone", 0xa79a82, 0.95)
rubble_dark = mat("rubble.dark", 0x726b5d, 0.95)
car_body = mat("car.body", 0x70483b, 0.9, 0.2)
car_dark = mat("car.dark", 0x282927, 0.95)
car_glass = mat("car.glass", 0x333c3c, 0.5)

def rear_shell():
    """Open, buckled tail section: two faceted skins joined at both torn ends."""
    bm = bmesh.new()
    rings = []
    count = 16
    for x, inset in [(-6.4, 0), (-4.7, 0), (-6.4, 0.15), (-4.7, 0.15)]:
        ring = []
        for i in range(count):
            a = 2 * math.pi * i / count
            # Jagged lip at the break and a flattened bottom against the rubble.
            lip = (0.12 * math.sin(i * 4.7)) if x == -4.7 else 0
            y = max(0.08, 1.1 + (1.02 - inset) * math.sin(a))
            z = (1.03 - inset) * math.cos(a)
            ring.append(bm.verts.new(kit.b((x + lip, y, z))))
        rings.append(ring)
    for i in range(count):
        j = (i + 1) % count
        for quad in [(rings[0][i],rings[0][j],rings[1][j],rings[1][i]),
                     (rings[2][j],rings[2][i],rings[3][i],rings[3][j]),
                     (rings[0][j],rings[0][i],rings[2][i],rings[2][j]),
                     (rings[1][i],rings[1][j],rings[3][j],rings[3][i])]:
            bm.faces.new(quad)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return kit.obj("torn tail", bm, hull)

# A broken fuselage, nose at +x. Pieces are kept inside the collision boxes.
def helicopter():
    parts = [
        kit.section([(0.04, -0.85), (0.12, -1.12), (0.52, -1.36), (1.95, -1.36), (2.36, -1.15), (2.62, -0.7), (2.62, 0.7), (2.36, 1.15), (1.95, 1.36), (0.52, 1.36), (0.12, 1.12), (0.04, 0.85)], -3.5, 2.2, hull, 0.06),
        kit.prism([(2.2, 0.2), (4.25, 0.2), (4.1, 1.15), (3.2, 2.05), (2.2, 2.2)], -1.05, 1.05, hull, 0.04),
        
        kit.box((1.1, 2.66, -0.7), (1.9, 3.1, 0.7), dark, 0.04),
        # dark cockpit panes and framed side hatch
        kit.box((2.75, 1.25, -1.06), (3.4, 1.8, -1.045), glass),
        kit.box((2.75, 1.25, 1.045), (3.4, 1.8, 1.06), glass),
        kit.box((-1.4, 0.45, -1.405), (0.35, 1.95, -1.39), dark),
        kit.box((-1.4, 0.45, 1.39), (0.35, 1.95, 1.405), dark),
        kit.box((-1.28, 0.55, -1.41), (0.23, 1.83, -1.4), dark),
        kit.box((-1.28, 0.55, 1.4), (0.23, 1.83, 1.41), dark),
        # Crumpled, separated rear section and snapped rotor blades.
        rear_shell(),
        kit.prism([(-6.2, 1.9), (-5.95, 2.95), (-5.15, 2.95), (-5.05, 1.9)], -0.5, 0.5, hull, 0.025),
        kit.cylinder(0.26, 3.0, 3.13, (-5.55, 0, 0), "y", metal, 16),
        kit.cylinder(0.26, 3.0, 3.13, (1.5, 0, 0), "y", metal, 16),
        kit.plan([(-5.87, -2.8), (-5.64, -2.65), (-5.52, 0), (-5.80, 0)], 3.07, 3.13, dark),
        kit.plan([(-5.72, 0), (-5.48, 0), (-5.32, 2.45), (-5.55, 2.8)], 3.07, 3.13, dark),
        kit.plan([(1.20, -2.7), (1.43, -2.5), (1.63, 0), (1.36, 0)], 3.07, 3.13, dark),
        kit.plan([(1.39, 0), (1.65, 0), (1.83, 2.45), (1.65, 2.7)], 3.07, 3.13, dark),
    ]
    # The sloped windscreen, divided into left and right panes.
    for z0, z1 in [(-0.9, -0.06), (0.06, 0.9)]:
        parts.append(kit._slab([(3.25, 2.08, z0), (3.25, 2.08, z1), (3.85, 1.48, z1), (3.85, 1.48, z0)], (0.0, 0.025, 0.0), glass, 0, 1, False))
    # Portholes, fractured cockpit glazing, panel seams and dark impact marks.
    for side in (-1, 1):
        lo, hi = sorted((side * 1.36, side * 1.375))
        for x in (-2.65, 0.9):
            parts.append(kit.cylinder(0.26, lo, hi, (x, 1.75, 0), "z", metal, 20))
            parts.append(kit.cylinder(0.19, lo - 0.006, hi + 0.006, (x, 1.75, 0), "z", glass, 20))
        parts.append(kit.box((-3.35, 0.72, lo), (2.05, 0.76, hi), dark))
        for x, y, radius in [(-3.0, 1.2, 0.075), (-2.0, 1.32, 0.055), (0.65, 1.27, 0.06), (1.65, 1.5, 0.08)]:
            parts.append(kit.cylinder(radius, lo, hi, (x, y, 0), "z", dark, 10))
        for a, c in [(-1.38, -1.3), (0.14, 0.22)]:
            parts.append(kit.box((a, 0.55, lo), (c, 1.94, hi), metal))
        parts.append(kit.box((-1.38, 1.86, lo), (0.22, 1.94, hi), metal))
        parts.append(kit.box((-1.38, 0.55, lo), (0.22, 0.63, hi), metal))
        z0, z1 = sorted((side * 1.04, side * 1.055))
        parts.append(kit.prism([(2.38, 1.28), (2.38, 1.93), (3.0, 1.96), (3.39, 1.65), (3.47, 1.28)], z0, z1, glass))
        parts.append(kit.box((2.78, 1.28, z0), (2.83, 1.96, z1), metal))
        z0, z1 = sorted((side * 1.05, side * 1.065))
        parts.append(kit.prism([(-6.2, 0.5), (-5.6, 0.4), (-5.35, 0.75), (-5.55, 1.0), (-5.9, 0.92), (-6.2, 1.15)], z0, z1, dark))
    return kit.asset("helicopter", parts, smooth_angle=50)

def rubble():
    """Scattered broken masonry in a low, walkable pile, origin at its centre."""
    rng = random.Random(420)
    parts = []
    for i in range(16):
        x = rng.uniform(-0.94, 0.94)
        z = rng.uniform(-0.66, 0.66)
        w = rng.uniform(0.15, 0.25)
        d = rng.uniform(0.12, 0.22)
        h = rng.uniform(0.07, 0.25)
        shape = [(x-w,z-d*0.7),(x-w*0.65,z+d),(x+w*0.75,z+d*0.8),(x+w,z-d*0.65),(x+w*0.2,z-d)]
        parts.append(kit.plan(shape, 0.0, h, rubble_stone if i % 4 else rubble_dark, 0.01))
    return kit.asset('rubble', parts, smooth_angle=35)


def burned_car():
    """A damaged abandoned sedan: body, roof, scorched glazing and tyres."""
    parts = [
        kit.prism([(-2.4,0.22),(-2.4,0.83),(-1.9,1.03),(1.65,1.03),(2.35,0.76),(2.4,0.26)], -0.92, 0.92, car_body, 0.04),
        kit.prism([(-1.22,1.0),(-0.78,1.75),(0.78,1.75),(1.28,1.0)], -0.79, 0.79, car_body, 0.035),
    ]
    for side in (-1,1):
        z0,z1 = sorted((side*0.79, side*0.805))
        parts.append(kit.prism([(-1.03,1.08),(-0.7,1.62),(-0.08,1.62),(-0.08,1.08)],z0,z1,car_glass))
        parts.append(kit.prism([(0.06,1.08),(0.06,1.62),(0.68,1.62),(1.05,1.08)],z0,z1,car_glass))
        for x in (-1.55,1.5):
            lo,hi = sorted((side*0.82,side*1.0))
            parts.append(kit.cylinder(0.32,lo,hi,(x,0.32,0),'z',car_dark,16))
        z0,z1 = sorted((side*0.92,side*0.935))
        parts.append(kit.box((-2.1,0.55,z0),(2.0,0.59,z1),car_dark))
    return kit.asset('burned-car', parts, smooth_angle=45)

built = [helicopter(), rubble(), burned_car()]
SOLIDS = {
    'helicopter': [((-3.5, 0, -1.42), (2.2, 2.72, 1.42)), ((2.2, 0, -1.08), (4.25, 2.2, 1.08)), ((-6.55, 0, -1.05), (-4.55, 2.5, 1.05)), ((-6.2, 2.5, -2.8), (-5.05, 3.15, 2.8)), ((1.1, 2.7, -2.7), (1.9, 3.15, 2.7))],
    'rubble': [((-1.2, 0, -0.9), (1.2, 0.3, 0.9))],
    'burned-car': [((-2.4, 0, -1.0), (2.4, 1.08, 1.0)), ((-1.3, 1.08, -0.82), (1.3, 1.8, 0.82))],
}
kit.bake_ao(built, distance=0.8)
report = {}
for obj in built:
    worst, where = kit.strays(obj, SOLIDS[obj.name])
    report[obj.name] = {'tris': kit.tris(obj), 'outside': worst, 'at': where}
result = {'assets': report, 'issues': [name for name, data in report.items() if data['outside'] > mapkit.TOLERANCE]}
if ARGS.get("export", False):  # noqa: F821
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    kit.export(built, OUT)
    result["glb"] = {"path": os.path.abspath(OUT), "bytes": os.path.getsize(OUT)}
