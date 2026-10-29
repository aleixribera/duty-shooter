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
soot = mat("wreck.soot", 0x45463f, 0.98, 0.1)
rubble_stone = mat("rubble.stone", 0xa79a82, 0.95)
rubble_dark = mat("rubble.dark", 0x726b5d, 0.95)
car_body = mat("car.body", 0x70483b, 0.9, 0.2)
car_dark = mat("car.dark", 0x282927, 0.95)
car_glass = mat("car.glass", 0x333c3c, 0.5)
pole_wood = mat("pole.wood", 0x6c5b46, 0.9)
pole_metal = mat("pole.metal", 0x454741, 0.8, 0.3)
pole_insulator = mat("pole.insulator", 0x82908a, 0.3)
roof_tank = mat("roof.tank", 0x98958a, 0.85, 0.2)
roof_metal = mat("roof.metal", 0x605c50, 0.8, 0.35)
fence_metal = mat("fence.metal", 0x777970, 0.85, 0.45)
palm_trunk = mat("palm.trunk", 0x796348, 0.95)
palm_frond = mat("palm.frond", 0x657950, 0.95)
palm_dark = mat("palm.frondDark", 0x455b3e, 0.95)

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
            lip = (0.14 * math.sin(i * 4.7)) if x == -4.7 else 0
            # Irregular inward folds keep the inner and outer skins parallel,
            # while breaking up the otherwise perfectly cylindrical tail.
            dent = (0.18 if i in (2, 3, 9, 13) else 0.06 if i in (1, 4, 8, 10, 12, 14) else 0)
            dent *= 1.0 if x == -4.7 else 0.45
            y = max(0.08, 1.1 + (1.02 - inset - dent) * math.sin(a))
            z = (1.03 - inset - dent) * math.cos(a)
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
        # The cargo compartment is a hollow shell, with the side doors torn
        # open. Separate floor, roof and side panels leave a walkable cabin.
        kit.section([(0.04,-0.85),(0.12,-1.12),(0.25,-1.3),(0.25,1.3),(0.12,1.12),(0.04,0.85)],-3.5,2.2,hull),
        kit.section([(2.27,-1.2),(2.36,-1.15),(2.62,-0.7),(2.62,0.7),(2.36,1.15),(2.27,1.2),(2.27,1.05),(2.32,1.0),(2.43,0.65),(2.43,-0.65),(2.32,-1.0),(2.27,-1.05)],-3.5,2.2,hull),
        kit.prism([(2.2, 0.2), (4.25, 0.2), (4.1, 1.15), (3.2, 2.05), (2.2, 2.2)], -1.05, 1.05, hull, 0.04),
        
        # The forward transmission housing rises prominently above the
        # fuselage in the original wreck, behind the cockpit.
        kit.prism([(0.4,2.55),(2.0,2.55),(1.76,3.50),(1.65,4.16),
                   (0.70,4.16),(0.52,3.50)], -0.60, 0.60, hull, 0.025),
        # dark cockpit panes and framed side hatch
        kit.box((2.75, 1.25, -1.06), (3.4, 1.8, -1.045), glass),
        kit.box((2.75, 1.25, 1.045), (3.4, 1.8, 1.06), glass),
        # Crumpled, separated rear section and snapped rotor blades.
        rear_shell(),
        kit.prism([(-6.2, 1.9), (-5.95, 2.95), (-5.15, 2.95), (-5.05, 1.9)], -0.5, 0.5, hull, 0.025),
        kit.cylinder(0.26, 3.0, 3.13, (-5.55, 0, 0), "y", metal, 16),
        kit.cylinder(0.26, 4.16, 4.32, (1.25, 0, 0), "y", metal, 16),
        # The surviving blades droop toward their snapped tips rather than
        # forming the flat, intact rotor of an undamaged helicopter.
        kit._slab([(-5.87,2.58,-2.8),(-5.64,2.61,-2.65),(-5.52,3.07,0),(-5.80,3.07,0)],(0,0.06,0),dark,0,1,False),
        kit._slab([(-5.72,3.07,0),(-5.48,3.07,0),(-5.32,2.68,2.45),(-5.55,2.62,2.8)],(0,0.06,0),dark,0,1,False),
    ]
    # The broken forward rotor bends down in stages, ending near the street.
    # Each span is subdivided to keep its collision close to the angled mesh.
    for side in (-1, 1):
        for (z0,y0),(z1,y1) in zip(FRONT_ROTOR, FRONT_ROTOR[1:]):
            for i in range(4):
                a, b = i/4, (i+1)/4
                za, zb = side*(z0+(z1-z0)*a), side*(z0+(z1-z0)*b)
                ya, yb = y0+(y1-y0)*a, y0+(y1-y0)*b
                parts.append(kit._slab([(1.07,ya,za),(1.43,ya,za),
                                        (1.43,yb,zb),(1.07,yb,zb)],(0,0.08,0),metal,0,1,False))
    for side in (-1,1):
        z0,z1 = sorted((side*1.12,side*1.36))
        # Uneven torn edges around the doorway remain inside the matching
        # side-panel collision, leaving the opening clear for a player.
        rear = [(-3.5,0.25),(-1.4,0.25),(-1.68,0.38),(-1.50,0.62),(-1.80,0.90),
                (-1.48,1.03),(-1.61,1.29),(-1.41,1.39),(-1.74,1.74),(-1.44,1.92),
                (-1.55,2.14),(-1.4,2.27),(-3.5,2.27)]
        front = [(0.35,0.25),(2.2,0.25),(2.2,2.27),(0.35,2.27),(0.63,2.14),
                 (0.42,1.97),(0.56,1.73),(0.38,1.53),(0.70,1.39),(0.44,1.04),
                 (0.59,0.88),(0.37,0.65),(0.55,0.43)]
        parts.extend([kit.prism(rear,z0,z1,hull),kit.prism(front,z0,z1,hull)])
    # The sloped windscreen, divided into left and right panes.
    for pane_index, (z0, z1) in enumerate([(-0.9, -0.06), (0.06, 0.9)]):
        parts.append(kit._slab([(3.25, 2.08, z0), (3.25, 2.08, z1), (3.85, 1.48, z1), (3.85, 1.48, z0)], (0.0, 0.025, 0.0), glass, 0, 1, False))
        # Pale fragments and narrow cracks on the windscreen, laid on its
        # sloped plane. The nose remains solid cover behind the glazing.
        def pane(points, material):
            return kit._slab([(3.25 + 0.6*u, 2.112 - 0.6*u, z0 + (z1-z0)*v) for u,v in points], (0,0.004,0), material, 0, 1, False)
        def crack(a, b):
            du, dv = b[0]-a[0], b[1]-a[1]
            length = math.hypot(du, dv)
            ou, ov = -dv * 0.007 / length, du * 0.007 / length
            return pane([(a[0]+ou,a[1]+ov),(b[0]+ou,b[1]+ov),
                         (b[0]-ou,b[1]-ov),(a[0]-ou,a[1]-ov)], metal)
        impacts = [((0.38,0.36), [(0.12,0.18),(0.18,0.60),(0.42,0.82),(0.68,0.65),(0.70,0.19)]),
                   ((0.64,0.63), [(0.24,0.48),(0.46,0.90),(0.82,0.88),(0.90,0.47),(0.53,0.18)])]
        centre, ends = impacts[pane_index]
        for end in ends:
            mid = ((centre[0]+end[0])*0.5 + 0.035, (centre[1]+end[1])*0.5 - 0.025)
            parts.extend([crack(centre, mid), crack(mid, end)])
        parts.append(pane([(0.12,0.12),(0.24,0.10),(0.29,0.19),(0.16,0.24)], metal))
        parts.append(pane([(0.71,0.69),(0.80,0.64),(0.88,0.78),(0.79,0.86)], soot))
    # Portholes, fractured cockpit glazing, panel seams and dark impact marks.
    for side in (-1, 1):
        lo, hi = sorted((side * 1.36, side * 1.375))
        for x in (-2.65, 0.9):
            parts.append(kit.cylinder(0.26, lo, hi, (x, 1.75, 0), "z", metal, 20))
            parts.append(kit.cylinder(0.19, lo - 0.006, hi + 0.006, (x, 1.75, 0), "z", glass, 20))
        for x0,x1 in [(-3.35,-1.4),(0.35,2.05)]:
            parts.append(kit.box((x0, 0.72, lo), (x1, 0.76, hi), dark))
        for x, y, radius in [(-3.0, 1.2, 0.075), (-2.0, 1.32, 0.055), (0.65, 1.27, 0.06), (1.65, 1.5, 0.08)]:
            parts.append(kit.cylinder(radius, lo, hi, (x, y, 0), "z", dark, 10))
        # Soot and crumpled metal cluster around the torn edges, with small
        # unpainted scars farther back on the skin.
        parts.append(kit.prism([(-2.5,0.36),(-1.58,0.32),(-1.7,0.72),(-2.05,0.86),(-2.31,0.65)],lo,hi,soot))
        parts.append(kit.prism([(0.43,0.35),(1.55,0.31),(1.42,0.64),(0.92,0.87),(0.54,0.73)],lo,hi,soot))
        parts.append(kit.prism([(-1.80,0.90),(-1.74,0.83),(-1.48,1.03),(-1.57,1.09)],lo,hi,metal))
        parts.append(kit.prism([(0.44,1.04),(0.53,1.07),(0.70,1.39),(0.61,1.42)],lo,hi,metal))
        parts.append(kit.box((-1.4, 2.27, lo), (0.35, 2.35, hi), dark))
        parts.append(kit.box((-1.4, 0.18, lo), (0.35, 0.25, hi), dark))
        z0, z1 = sorted((side * 1.04, side * 1.055))
        parts.append(kit.prism([(2.38, 1.28), (2.38, 1.93), (3.0, 1.96), (3.39, 1.65), (3.47, 1.28)], z0, z1, glass))
        parts.append(kit.box((2.78, 1.28, z0), (2.83, 1.96, z1), metal))
        z0, z1 = sorted((side * 1.05, side * 1.065))
        parts.append(kit.prism([(-6.2, 0.5), (-5.6, 0.4), (-5.35, 0.75), (-5.55, 1.0), (-5.9, 0.92), (-6.2, 1.15)], z0, z1, dark))
    return kit.asset("helicopter", parts, smooth_angle=50)

def rubble():
    """Angular chunks of masonry scattered in a low pile."""
    rng = random.Random(420)
    parts = []
    for i in range(22):
        x, z = rng.uniform(-0.9, 0.9), rng.uniform(-0.62, 0.62)
        w, d, h = rng.uniform(0.10, 0.22), rng.uniform(0.09, 0.20), rng.uniform(0.08, 0.25)
        bm = bmesh.new()
        bmesh.ops.create_icosphere(bm, subdivisions=1, radius=1.0)
        for v in bm.verts:
            jag = rng.uniform(0.75, 1.0)
            v.co.x = x + v.co.x * w * jag
            v.co.y = -z + v.co.y * d * jag
            v.co.z = h / 2 + v.co.z * h / 2 * jag
        parts.append(kit.obj('fragment', bm, rubble_stone if i % 4 else rubble_dark))
    return kit.asset('rubble', parts, smooth_angle=25)


def roof_debris():
    """Broken concrete slabs and exposed reinforcing bars from a collapsed roof."""
    parts = [
        kit.plan([(-1.08,-0.68),(-0.32,-0.73),(-0.02,-0.28),(-0.24,0.22),(-0.91,0.13)],0.02,0.16,rubble_stone),
        kit.plan([(0.15,-0.60),(0.95,-0.54),(1.09,0.01),(0.55,0.22),(0.07,-0.05)],0.01,0.13,rubble_stone),
        kit.plan([(-0.74,0.29),(-0.14,0.21),(0.18,0.56),(-0.06,0.79),(-0.65,0.70)],0.01,0.12,rubble_dark),
        kit.box((-1.12,0.08,-0.10),(1.12,0.10,-0.075),roof_metal),
        kit.box((-0.55,0.13,-0.81),(-0.52,0.15,0.82),roof_metal),
    ]
    return kit.asset('roof-debris',parts,smooth_angle=25)


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

def utility_pole():
    """Weathered wooden pole with a crossarm and two ceramic insulators."""
    parts = [
        kit.cylinder(0.12, 0, 6.4, (0,0,0), 'y', pole_wood, 12, r2=0.095),
        kit.box((-1.0,5.98,-0.07),(1.0,6.12,0.07),pole_wood,0.01),
        kit.cylinder(0.15,0,0.3,(0,0,0),'y',pole_metal,12),
    ]
    for x in (-0.7,0.7):
        parts.append(kit.cylinder(0.07,6.12,6.28,(x,0,0),'y',pole_insulator,12))
        parts.append(kit.cylinder(0.095,6.20,6.25,(x,0,0),'y',pole_insulator,12))
    return kit.asset('utility-pole',parts,smooth_angle=45)

def water_tank():
    """A cylindrical rooftop water tank with raised bands and a low lid."""
    parts = [
        kit.cylinder(0.74, 0.12, 1.5, (0,0,0), 'y', roof_tank, 24),
        kit.cylinder(0.78, 0.10, 0.18, (0,0,0), 'y', roof_metal, 24),
        kit.cylinder(0.78, 1.40, 1.48, (0,0,0), 'y', roof_metal, 24),
        kit.cylinder(0.65, 1.50, 1.57, (0,0,0), 'y', roof_tank, 24),
    ]
    for x in (-0.48, 0.48):
        parts.append(kit.box((x-0.09,0,-0.52),(x+0.09,0.13,0.52),roof_metal))
    return kit.asset('water-tank', parts, smooth_angle=45)


def satellite_dish():
    """A shallow parabolic dish mounted on a short rooftop pedestal."""
    bm = bmesh.new()
    rings = []
    segments = 24
    for radius in (0.05, 0.18, 0.36, 0.54):
        ring = []
        for i in range(segments):
            a = 2 * math.pi * i / segments
            ring.append(bm.verts.new(kit.b((0.20*(radius/0.54)**2, 1.22+radius*math.sin(a), radius*math.cos(a)))))
        rings.append(ring)
    for inner, outer in zip(rings, rings[1:]):
        for i in range(segments):
            j = (i+1) % segments
            bm.faces.new((inner[i], inner[j], outer[j], outer[i]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    parts = [kit.obj('dish', bm, roof_tank),
             kit.cylinder(0.07,0.08,1.25,(0,0,0),'y',roof_metal,12),
             kit.box((-0.32,0,-0.32),(0.32,0.08,0.32),roof_metal),
             kit.box((0.03,1.19,-0.025),(0.48,1.25,0.025),roof_metal),
             kit.cylinder(0.06,0.43,0.50,(0,1.22,0),'x',roof_metal,12)]
    return kit.asset('satellite-dish', parts, smooth_angle=35)

def rooftop_fence():
    """A two-metre steel frame filled with open diamond wire mesh."""
    parts = [kit.box((0,0,-0.05),(0.07,1.5,0.05),fence_metal),
             kit.box((1.93,0,-0.05),(2,1.5,0.05),fence_metal),
             kit.box((0,1.43,-0.05),(2,1.5,0.05),fence_metal),
             kit.box((0,0,-0.05),(2,0.07,0.05),fence_metal)]
    bm = bmesh.new()
    # Clip each diagonal strand at the rectangular frame. Separate thin prisms
    # stay visible from both sides while the spaces between them remain open.
    for slope in (-1, 1):
        for n in range(-10, 18):
            c = n * 0.2
            if slope == 1:
                lo, hi = max(0, -c), min(2, 1.5-c)
            else:
                lo, hi = max(0, c-1.5), min(2, c)
            if hi - lo < 0.02:
                continue
            ya, yb = slope*lo+c, slope*hi+c
            outline = [(lo,max(0,ya-0.006)),(hi,max(0,yb-0.006)),
                       (hi,min(1.5,yb+0.006)),(lo,min(1.5,ya+0.006))]
            vs = [[bm.verts.new(kit.b((x,y,z))) for x,y in outline] for z in (-0.008,0.008)]
            bm.faces.new(tuple(reversed(vs[0])))
            bm.faces.new(tuple(vs[1]))
            for i in range(4):
                j = (i+1) % 4
                bm.faces.new((vs[0][i],vs[0][j],vs[1][j],vs[1][i]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    parts.append(kit.obj('wire mesh',bm,fence_metal))
    return kit.asset('rooftop-fence',parts,smooth_angle=30)

def palm():
    """A ridged date-palm trunk and a separate, non-colliding crown."""
    profile = [(0,0.34)]
    for i in range(1,19):
        y = i * 0.34
        radius = 0.33 - y * 0.014
        profile.extend([(y-0.04,radius),(y,radius+0.025)])
    profile.append((6.5,0.23))
    trunk = kit.asset('palm-trunk',[kit.lathe(profile,(0,0,0),palm_trunk,16)],smooth_angle=45)
    parts = []
    for material, parity in [(palm_frond,0),(palm_dark,1)]:
        bm = bmesh.new()
        for frond in range(11):
            if frond % 2 != parity:
                continue
            angle = 2*math.pi*frond/11
            rx,rz = math.cos(angle),math.sin(angle)
            tx,tz = -rz,rx
            def point(rad, side, y):
                return (rad*rx+side*tx,y,rad*rz+side*tz)
            def strip(points):
                # Thin closed prisms keep the leaves visible from either side.
                rings = [[bm.verts.new(kit.b((x,y+dy,z))) for x,y,z in points] for dy in (0,0.025)]
                bm.faces.new(tuple(reversed(rings[0])))
                bm.faces.new(tuple(rings[1]))
                for k in range(len(points)):
                    j=(k+1)%len(points)
                    bm.faces.new((rings[0][k],rings[0][j],rings[1][j],rings[1][k]))
            def height(rad):
                u=rad/3.0
                return 6.55+0.9*u-1.55*u*u
            # The central rib and paired narrow, pointed leaflets arch and droop.
            for i in range(8):
                a,b=i*3/8,(i+1)*3/8
                strip([point(a,-0.035,height(a)),point(b,-0.025,height(b)),point(b,0.025,height(b)),point(a,0.035,height(a))])
            for i in range(1,9):
                rad=0.25+i*0.27
                width=0.8*(1-rad/3.15)+0.12
                for side in (-1,1):
                    tip=point(min(3,rad+0.48),side*width,height(rad)-0.27)
                    strip([point(rad-0.10,0,height(rad-0.10)),point(rad+0.13,0,height(rad+0.13)),tip])
        bmesh.ops.recalc_face_normals(bm,faces=bm.faces)
        parts.append(kit.obj('fronds',bm,material))
    return trunk,kit.asset('palm-crown',parts,smooth_angle=25)

trunk, crown = palm()
FRONT_ROTOR = [(0,4.20),(1.4,4.08),(2.8,3.50),(4.0,2.45),(5.0,0.32)]
front_rotor_solids = []
for side in (-1, 1):
    for (z0,y0),(z1,y1) in zip(FRONT_ROTOR, FRONT_ROTOR[1:]):
        for i in range(4):
            a, b = i/4, (i+1)/4
            za, zb = side*(z0+(z1-z0)*a), side*(z0+(z1-z0)*b)
            ya, yb = y0+(y1-y0)*a, y0+(y1-y0)*b
            front_rotor_solids.append(((1.07,min(ya,yb),min(za,zb)),(1.43,max(ya,yb)+0.08,max(za,zb))))

built = [helicopter(), rubble(), roof_debris(), burned_car(), utility_pole(), water_tank(), satellite_dish(), rooftop_fence(), trunk, crown]
SOLIDS = {
    'helicopter': [((-3.5,0,-1.42),(2.2,0.25,1.42)), ((-3.5,2.27,-1.42),(2.2,2.72,1.42))] + [((x0,0.25,z0),(x1,2.27,z1)) for x0,x1 in [(-3.5,-1.3),(0.25,2.2)] for z0,z1 in [(-1.42,-1.1),(1.1,1.42)]] + [((2.2, 0, -1.08), (4.25, 2.2, 1.08)), ((-6.55, 0, -1.05), (-4.55, 2.5, 1.05)), ((-6.2, 2.5, -2.8), (-5.05, 3.15, 2.8)), ((0.4,2.55,-0.6),(2.0,3.5,0.6)), ((0.52,3.5,-0.6),(1.76,4.16,0.6)), ((0.99,4.16,-0.26),(1.51,4.32,0.26))] + front_rotor_solids,
    'rubble': [((-1.2, 0, -0.9), (1.2, 0.3, 0.9))],
    'roof-debris': [((-1.2,0,-0.9),(1.2,0.2,0.9))],
    'burned-car': [((-2.4, 0, -1.0), (2.4, 1.08, 1.0)), ((-1.3, 1.08, -0.82), (1.3, 1.8, 0.82))],
    'utility-pole': [((-0.15,0,-0.15),(0.15,6.4,0.15)), ((-1,5.98,-0.07),(1,6.12,0.07))] + [((x-0.095,6.12,-0.095),(x+0.095,6.28,0.095)) for x in (-0.7,0.7)],
    'water-tank': [((-0.8,0,-0.8),(0.8,1.6,0.8))],
    'satellite-dish': [((-0.32,0,-0.54),(0.50,1.76,0.54))],
    'rooftop-fence': [((0,0,-0.05),(2,1.5,0.05))],
    'palm-trunk': [((-0.36,0,-0.36),(0.36,6.6,0.36))],
}
kit.bake_ao(built, distance=0.8)
report = {}
for obj in built:
    if obj.name == 'palm-crown':
        report[obj.name] = {'tris': kit.tris(obj), 'visualOnly': True}
    else:
        worst, where = kit.strays(obj, SOLIDS[obj.name])
        report[obj.name] = {'tris': kit.tris(obj), 'outside': worst, 'at': where}
result = {'assets': report, 'issues': [name for name, data in report.items() if data.get('outside',0) > mapkit.TOLERANCE]}
if ARGS.get("export", False):  # noqa: F821
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    kit.export(built, OUT)
    result["glb"] = {"path": os.path.abspath(OUT), "bytes": os.path.getsize(OUT)}
