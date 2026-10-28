"""Build Crash's downed tandem-rotor helicopter in game-space metres.

Run via tools/map/build.py; the matching collision boxes are recorded below.
"""
import os
import sys
sys.path.insert(0, os.path.dirname(__file__))
import mapkit

OUT = os.path.join(os.path.dirname(__file__), "..", "..", "apps", "range", "public", "models", "crash.glb")
kit = mapkit.Kit(bkit, "crash")  # noqa: F821

def mat(name, color, roughness=0.8, metallic=0.0):
    return mapkit.material(bkit, name, ((color >> 16) & 255, (color >> 8) & 255, color & 255), roughness, metallic)  # noqa: F821

hull = mat("wreck.hull", 0x454b43, 0.85, 0.35)
dark = mat("wreck.dark", 0x252a27, 0.9, 0.3)
metal = mat("wreck.metal", 0x73746b, 0.7, 0.5)
glass = mat("wreck.glass", 0x202d30, 0.3, 0.1)

# A broken fuselage, nose at +x. Pieces are kept inside the collision boxes.
def helicopter():
    parts = [
        kit.section([(0.2, -1.05), (0.45, -1.4), (2.25, -1.4), (2.7, -0.95), (2.7, 0.95), (2.25, 1.4), (0.45, 1.4), (0.2, 1.05)], -3.5, 2.2, hull, 0.06),
        kit.prism([(2.2, 0.2), (4.25, 0.2), (4.1, 1.15), (3.2, 2.05), (2.2, 2.2)], -1.05, 1.05, hull, 0.04),
        kit.box((-3.35, 2.66, -0.7), (-2.5, 3.1, 0.7), dark, 0.04),
        kit.box((1.1, 2.66, -0.7), (1.9, 3.1, 0.7), dark, 0.04),
        # dark cockpit panes and framed side hatch
        kit.box((2.75, 1.25, -1.06), (3.4, 1.8, -1.045), glass),
        kit.box((2.75, 1.25, 1.045), (3.4, 1.8, 1.06), glass),
        kit.box((-1.4, 0.45, -1.405), (0.35, 1.95, -1.39), dark),
        kit.box((-1.4, 0.45, 1.39), (0.35, 1.95, 1.405), dark),
        kit.box((-1.28, 0.55, -1.41), (0.23, 1.83, -1.4), metal),
        kit.box((-1.28, 0.55, 1.4), (0.23, 1.83, 1.41), metal),
        # Crumpled, separated rear section and snapped rotor blades.
        kit.prism([(-5.5, 0.05), (-3.9, 0.05), (-3.9, 1.65), (-4.8, 1.5), (-5.5, 0.75)], -1.05, 1.05, hull, 0.03),
        kit.box((-5.4, 1.48, -0.15), (-4.95, 2.5, 0.15), dark),
        kit.box((-3.25, 3.08, -2.8), (-3.08, 3.15, 2.8), dark),
        kit.box((1.42, 3.08, -2.7), (1.6, 3.15, 2.7), dark),
    ]
    for x in (-2.7, 1.0):
        for z in (-1.15, 1.15):
            parts.append(kit.cylinder(0.32, z - 0.16, z + 0.16, (x, 0.32, 0), "z", dark, 16))
    return kit.asset("helicopter", parts, smooth_angle=50)

built = [helicopter()]
SOLIDS = [((-3.5, 0, -1.42), (2.2, 2.72, 1.42)), ((2.2, 0, -1.08), (4.25, 2.2, 1.08)), ((-5.5, 0, -1.05), (-3.9, 2.5, 1.05)), ((-3.5, 2.7, -2.8), (-2.5, 3.15, 2.8)), ((1.1, 2.7, -2.7), (1.9, 3.15, 2.7))]
kit.bake_ao(built, distance=0.8)
worst, where = kit.strays(built[0], SOLIDS)
result = {"assets": {"helicopter": {"tris": kit.tris(built[0]), "outside": worst, "at": where}}, "issues": ["helicopter"] if worst > mapkit.TOLERANCE else []}
if ARGS.get("export", False):  # noqa: F821
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    kit.export(built, OUT)
    result["glb"] = {"path": os.path.abspath(OUT), "bytes": os.path.getsize(OUT)}
