"""Builds a Region's kit of Zero Island (ticket 17's pattern, see apps/range/src/map/zero-island-region.ts).

A Region's generator (tools/map/regions/<region>.py) makes a `RegionKit` from
its plan's JSON (written by its test from the plan), says how each part of
its pieces looks (`dress`), adds the unit models that dress the cover pass's
pieces (`unit`), and calls `build`:

- Each built piece is dressed box by box, in the box's own frame, inside it:
  what's seen is what stops a bullet (within 5 cm, as the test checks). Four
  boxes with one part tag, centre and size, turned by eighths, are one
  octagon (see `octagon` in zero-island-region.ts) and dressed as one.
- A unit model fills the box x and z -0.5 to 0.5, y 0 to 1; the map scales it
  to each piece's solid.
- Every model gets a cheaper `-lod` twin (the same parts, without bevels and
  small details), occlusion baked into its vertices, and one GLB holds all.

Materials are named `<finish>@<layer>`: the client reads the ground photo
layer after the `@` (see tools/textures/ground.py) from three sides and
divides the material's colour by its mean, and an emissive material glows.
"""
import json
import math
import random

import bmesh
import bpy
from mathutils import Matrix, Vector

import mapkit

EIGHTH = math.pi / 4


class RegionKit:
    def __init__(self, bkit, name, plan_path):
        self.bkit = bkit
        self.kit = mapkit.Kit(bkit, name)
        with open(plan_path, encoding="utf-8") as f:
            self.plan = json.load(f)
        self.dressers = {}
        self.units = {}

    # ------------------------------------------------------------ materials

    def mat(self, name, srgb, layer=None, roughness=0.85, metallic=0.0, glow=None):
        """A finish: its colour (sRGB), the photo layer it wears, and a glow (linear rgb, its strength in the length)."""
        m = mapkit.material(self.bkit, f"{name}@{layer}" if layer else name, srgb, roughness, metallic, emission=glow)
        if glow:
            m.node_tree.nodes["Principled BSDF"].inputs["Emission Strength"].default_value = 1.0
        return m

    # ------------------------------------------------------------ parts in a box's frame

    def box(self, lo, hi, mat, bevel=0.0):
        return self.kit.box(lo, hi, mat, bevel)

    def panels(self, s, mat, length=3.0, bevel=0.03, lod=False, y=None):
        """A wall or slab as precast panels along its longer side, their bevels the joints between them."""
        hx, hy, hz = s[0] / 2, s[1] / 2, s[2] / 2
        y0, y1 = y if y else (-hy, hy)
        along = 0 if s[0] >= s[2] else 2
        n = 1 if lod else max(1, round(s[along] / length))
        out = []
        for i in range(n):
            a = -s[along] / 2 + s[along] * i / n
            b = -s[along] / 2 + s[along] * (i + 1) / n
            lo, hi = ([a, y0, -hz], [b, y1, hz]) if along == 0 else ([-hx, y0, a], [hx, y1, b])
            out.append(self.box(lo, hi, mat, 0 if lod else min(bevel, s[1] / 4, min(s[0], s[2]) / 4)))
        return out

    def octagon(self, r, y0, y1, mat, bevel=0.0):
        """An octagonal slab of inradius r, faces looking along x, z and the diagonals."""
        R = r / math.cos(math.pi / 8)
        ring = [(R * math.cos(math.pi / 8 + k * EIGHTH), R * math.sin(math.pi / 8 + k * EIGHTH)) for k in range(8)]
        o = self.kit.plan(ring, y0, y1, mat, bevel)
        return o

    def faces(self, r, y0, y1, thick, mat, keep=lambda k, a, b, lo, hi: True, cuts=()):
        """Panels on an octagon's eight faces (inradius r, `thick` deep), each split across at `cuts` (fractions of its width, from -0.5 to 0.5) left open."""
        w = 2 * r * math.tan(math.pi / 8)
        out = []
        edges = [-0.5, *[c for pair in cuts for c in pair], 0.5]
        for k in range(8):
            for j in range(0, len(edges), 2):
                a, b = edges[j] * w, edges[j + 1] * w
                if b - a < 1e-3 or not keep(k, a, b, y0, y1):
                    continue
                o = self.box([r - thick, y0, a], [r, y1, b], mat)
                o.data.transform(Matrix.Rotation(k * EIGHTH, 4, "Z"))
                out.append(o)
        return out

    def broken(self, s, mat, rng, lod=False, rebar=None):
        """A span of wall broken off at its top: jagged down to 0.7 m below its box's top, rebar sticking up in the breaks."""
        hy = s[1] / 2
        along = 0 if s[0] >= s[2] else 2
        L, T = s[along], s[2 - along]
        n = 1 if lod else max(2, int(L / 0.35))
        top = [(-L / 2 + L * i / n, hy - (0 if lod else rng.uniform(0, min(0.7, s[1] * 0.25)))) for i in range(n + 1)]
        outline = [(-L / 2, -hy)] + top + [(L / 2, -hy)]
        # Built along x, then turned a quarter if the span runs along z.
        out = [self.kit.prism(outline, -T / 2, T / 2, mat)]
        if rebar and not lod:
            for x, y in top[1:-1]:
                if hy - y > 0.25 and rng.random() < 0.5:
                    p = [x, 0, rng.uniform(-T / 4, T / 4)]
                    out.append(self.kit.cylinder(0.014, y - 0.2, min(hy, y + rng.uniform(0.15, hy - y)), p, "y", rebar, 5, smooth=False))
        if along == 2:
            for o in out:
                o.data.transform(Matrix.Rotation(math.pi / 2, 4, "Z"))
        return out

    def rubble(self, s, mat, rng, lod=False):
        """A heap of broken slab in its box: chunks every way up, higher in the middle."""
        out = []
        hx, hy, hz = s[0] / 2, s[1] / 2, s[2] / 2
        n = 3 if lod else max(8, int(s[0] * s[2] * 1.6))
        # The box's foot is sunk 0.6 m: the ground is there.
        ground = -hy + 0.6
        for i in range(n):
            size = Vector((rng.uniform(0.5, 1.4), rng.uniform(0.2, 0.5), rng.uniform(0.4, 1.1))) * min(1.0, min(hx, hz))
            reach = size.length / 2
            if reach * 2 > min(s[0], s[2]) or reach * 2 > s[1]:
                size *= min(s[0], s[2], s[1]) / (2 * reach) * 0.95
                reach = size.length / 2
            cx = rng.uniform(-hx + reach, hx - reach)
            cz = rng.uniform(-hz + reach, hz - reach)
            mid = 1 - max(abs(cx) / hx, abs(cz) / hz)
            cy = min(hy - reach, max(-hy + reach, ground) + mid * (hy - reach - max(-hy + reach, ground)) * rng.uniform(0.4, 1.0))
            o = self.box([-size.x / 2, -size.y / 2, -size.z / 2], [size.x / 2, size.y / 2, size.z / 2], mat, 0 if lod else 0.03)
            o.data.transform(Matrix.Translation(self.kit.b((cx, cy, cz))) @ Matrix.Rotation(rng.uniform(0, 6.3), 4, "Z") @ Matrix.Rotation(rng.uniform(-0.5, 0.5), 4, "X"))
            out.append(o)
        return out

    def pipe(self, s, steel, saddle, lod=False):
        """A run of pipe along x on concrete saddles, filling its box: the pipe's top is the box's."""
        hx, hy, hz = s[0] / 2, s[1] / 2, s[2] / 2
        r = hz - 0.1
        cy = hy - r
        seg = 10 if lod else 24
        out = [self.kit.cylinder(r, -hx, hx, (0, cy, 0), "x", steel, seg)]
        if not lod:
            for x in (-hx + 0.15, -hx * 0.33, hx * 0.33, hx - 0.15):
                out.append(self.kit.cylinder(r + 0.04, x - 0.08, x + 0.08, (0, cy, 0), "x", steel, seg))
        for x in (-hx * 0.66, hx * 0.66):
            # A saddle: a block up to the pipe's middle, its top hollowed to the pipe.
            # (y, z) round the section: up one side, round under the pipe, down the other.
            profile = [(-hy, -hz), (-hy, hz), (cy, hz)] + [(cy - r * math.sin(k * math.pi / 8), r * math.cos(k * math.pi / 8)) for k in range(1, 8)] + [(cy, -hz)]
            o = self.kit.section(profile, x - 0.35, x + 0.35, saddle, 0 if lod else 0.02)
            out.append(o)
        return out

    def corrugated(self, s, mat, pitch=0.5, lod=False, along=0):
        """A sheet roof: a deck and ribs on it along `along`, all in its box."""
        hx, hy, hz = s[0] / 2, s[1] / 2, s[2] / 2
        out = [self.box([-hx, -hy, -hz], [hx, hy - (0 if lod else 0.06), hz], mat)]
        if lod:
            return out
        across = 2 - along
        n = int(s[across] / pitch)
        for i in range(n):
            c = -s[across] / 2 + (i + 0.5) * s[across] / n
            lo = [-hx, hy - 0.06, -hz]
            hi = [hx, hy, hz]
            lo[across], hi[across] = c - 0.05, c + 0.05
            out.append(self.box(lo, hi, mat))
        return out

    def windows(self, s, wall, glass, frame, y0, y1, bay=3.0, pier=0.7, lod=False):
        """A wall with a band of windows from y0 to y1: piers between bays, glass set back in each."""
        hy = s[1] / 2
        along = 0 if s[0] >= s[2] else 2
        L, T = s[along], s[2 - along]
        ext = lambda a, b, lo, hi, t0, t1, m: self.box(*([[a, lo, t0], [b, hi, t1]] if along == 0 else [[t0, lo, a], [t1, hi, b]]), m)  # noqa: E731
        if L < bay * 0.8:
            return self.panels(s, wall, lod=lod)
        out = self.panels(s, wall, lod=lod, y=(-hy, y0)) + self.panels(s, wall, lod=lod, y=(y1, hy))
        n = max(1, round(L / bay))
        for i in range(n):
            a = -L / 2 + L * i / n
            b = -L / 2 + L * (i + 1) / n
            out.append(ext(a, a + pier / 2, y0, y1, -T / 2, T / 2, wall))
            out.append(ext(b - pier / 2, b, y0, y1, -T / 2, T / 2, wall))
            out.append(ext(a + pier / 2, b - pier / 2, y0, y1, -0.04, 0.04, glass))
            if not lod:
                mid = (a + b) / 2
                out.append(ext(mid - 0.05, mid + 0.05, y0, y1, -0.09, 0.09, frame))
                out.append(ext(a + pier / 2, b - pier / 2, (y0 + y1) / 2 - 0.05, (y0 + y1) / 2 + 0.05, -0.09, 0.09, frame))
        return out

    # ------------------------------------------------------------ pieces

    def dress(self, part, fn):
        """How a part looks: fn(size, lod, rng) -> objects in the box's frame (or, for an octagon's part, fn(inradius, y0, y1, lod, rng))."""
        self.dressers[part] = fn

    def unit(self, name, fn):
        """A unit model of the kit: fn(lod, rng) -> objects inside x, z -0.5..0.5, y 0..1."""
        self.units[name] = fn

    def _boxes(self, boxes):
        """The piece's boxes, with each set of four making an octagon as one."""
        groups, single = {}, []
        for b in boxes:
            key = (b["part"], tuple(b["c"]), tuple(b["s"]))
            groups.setdefault(key, []).append(b)
        for key, bs in groups.items():
            yaws = sorted(round((b["yaw"] % math.pi) / EIGHTH) for b in bs)
            if len(bs) == 4 and yaws == [0, 1, 2, 3] and key[1][0] == 0 and key[1][2] == 0:
                yield "octagon", bs[0]
            else:
                for b in bs:
                    yield "box", b

    def piece(self, name, lod):
        rng = random.Random(f"{name}{lod}")
        parts = []
        for kind, b in self._boxes(self.plan["pieces"][name]):
            fn = self.dressers[b["part"]]
            c, s = b["c"], b["s"]
            if kind == "octagon":
                objs = fn(s[0] / 2, c[1] - s[1] / 2, c[1] + s[1] / 2, lod, rng)
                at = Matrix.Identity(4)
            else:
                objs = fn(s, lod, rng)
                at = Matrix.Translation(self.kit.b(c)) @ Matrix.Rotation(b["yaw"], 4, "Z")
            for o in objs:
                o.data.transform(at)
            parts += objs
        return self.kit.asset(f"{name}-lod" if lod else name, parts)

    def build(self, densify=1.6, ao=2.5):
        """Every piece and unit model with its `-lod`, occlusion baked: returns them."""
        built = []
        self.kit.densify = (lambda o, longest=densify, f=mapkit.Kit.densify: f(o, longest)) if densify else (lambda o, longest=0: None)
        pieces = []
        for name in self.plan["pieces"]:
            for lod in (False, True):
                pieces.append(self.piece(name, lod))
        units = []
        for name, fn in self.units.items():
            for lod in (False, True):
                rng = random.Random(f"{name}{lod}")
                # Unit models are stretched a hundredfold at most: no splitting their faces.
                keep = self.kit.densify
                self.kit.densify = lambda o, longest=0: None
                units.append(self.kit.asset(f"{name}-lod" if lod else name, fn(lod, rng)))
                self.kit.densify = keep
        for o in pieces + units:
            o.location = (0, 0, 0)
        self.kit.bake_ao(pieces, distance=ao, samples=16)
        self.kit.bake_ao(units, distance=0.12, samples=16)
        built = pieces + units
        return built

    def strays(self, built):
        """Per model, how far its worst vertex lies outside its boxes (m): pieces against the plan's, units against the unit box."""
        out = {}
        for o in built:
            name = o.name[:-4] if o.name.endswith("-lod") else o.name
            if name in self.plan["pieces"]:
                boxes = self.plan["pieces"][name]
                worst = 0.0
                for v in o.data.vertices:
                    p = v.co
                    g = (p.x, p.z, -p.y)
                    d = min(_box_distance(g, b) for b in boxes)
                    worst = max(worst, d)
                out[o.name] = round(worst, 4)
            else:
                worst = 0.0
                for v in o.data.vertices:
                    g = (v.co.x, v.co.z, -v.co.y)
                    worst = max(worst, abs(g[0]) - 0.5, abs(g[2]) - 0.5, -g[1], g[1] - 1)
                out[o.name] = round(max(worst, 0.0), 4)
        return out


def _box_distance(g, b):
    yaw = b["yaw"]
    dx, dy, dz = g[0] - b["c"][0], g[1] - b["c"][1], g[2] - b["c"][2]
    u = dx * math.cos(yaw) - dz * math.sin(yaw)
    w = dx * math.sin(yaw) + dz * math.cos(yaw)
    s = b["s"]
    return math.sqrt(max(abs(u) - s[0] / 2, 0) ** 2 + max(abs(dy) - s[1] / 2, 0) ** 2 + max(abs(w) - s[2] / 2, 0) ** 2)
