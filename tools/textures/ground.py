"""Builds Zero Island's ground layers (ticket 29) from CC0 photo sets on Poly Haven.

    <game-textures venv>/python tools/textures/ground.py

Each layer is one real surface, photographed and processed by Poly Haven
(CC0, credited in LAYERS), so it tiles already. This takes the 1k colour,
OpenGL normal and displacement of each, scales them to `SIZE` with the edges
wrapped (so the tile still tiles), and stacks them into two strips, one layer
under the next:

- apps/range/public/textures/ground-color.webp: sRGB albedo.
- apps/range/public/textures/ground-relief.webp: normal x, normal y, height.

It also writes packages/fps-client/src/surfaces/ground-layers-data.ts: the layers' order,
how many metres a tile covers, and each layer's mean colour (linear), which the
ground's shader divides out so a cell's palette colour sets its tint and the
photo only adds its detail.
"""
import io
import json
import os
import urllib.request

import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.join(HERE, "..", "..")
OUT = os.path.join(ROOT, "apps", "range", "public", "textures")
DATA = os.path.join(ROOT, "packages", "fps-client", "src", "surfaces", "ground-layers-data.ts")
CACHE = os.path.join(os.path.expanduser("~"), ".cache", "duty-ground")
SIZE = 512

# name, Poly Haven asset, metres a tile covers, credit. The order is the ground's: `GROUND_LAYERS`.
LAYERS = [
    ("meadow", "leafy_grass", 2.0, "Charlotte Baglioni"),
    ("beach", "coast_sand_01", 5.0, "Rob Tuytel"),
    ("dust", "gravelly_sand", 2.5, "Dario Barresi"),
    ("rock", "dry_riverbed_rock", 3.0, "Amal Kumar"),
    ("snow", "snow_02", 3.0, "Rob Tuytel"),
    ("ice", "snow_03", 2.5, "Rob Tuytel"),
    ("jungle", "brown_mud_leaves_01", 1.6, "Rob Tuytel"),
    ("ash", "burned_ground_01", 1.6, "Rob Tuytel"),
    ("asphalt", "asphalt_01", 2.1, "Dario Barresi, Charlotte Baglioni"),
    ("dock", "rough_concrete", 2.0, "Dimitrios Savva"),
    ("ballast", "river_small_rocks", 2.9, "Rob Tuytel, Rico Cilliers"),
    ("bed", "dry_river_pebbles", 2.0, "Amal Kumar"),
    ("cliff", "cliff_side", 9.0, "James Ray Cock, Jenelle van Heerden, Dario Barresi"),
    # Built surfaces (ticket 17): the Regions' kits wear these triplanar, and the crater's pads are slab.
    ("slab", "concrete_floor_damaged_01", 4.0, "Rob Tuytel"),
    ("wall", "concrete_wall_006", 2.5, "Dario Barresi, Charlotte Baglioni"),
    ("steel", "rusty_metal_02", 1.5, "Rob Tuytel"),
]


def get(url):
    return urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": "duty-shooter-ground/1"})).read()


def fetch(asset, kind):
    os.makedirs(CACHE, exist_ok=True)
    path = os.path.join(CACHE, f"{asset}_{kind}.bin")
    if not os.path.exists(path):
        files = json.loads(get(f"https://api.polyhaven.com/files/{asset}"))
        fmt = "png" if kind == "Displacement" else "jpg"
        url = files[kind]["1k"][fmt]["url"]
        with open(path, "wb") as f:
            f.write(get(url))
    return Image.open(path)


def wrapped(image, mode):
    """Scaled to SIZE with its edges wrapped round, so the result still tiles."""
    image = image.convert(mode)
    w, h = image.size
    big = Image.new(mode, (w * 3, h * 3))
    for i in range(3):
        for j in range(3):
            big.paste(image, (i * w, j * h))
    big = big.resize((SIZE * 3, SIZE * 3), Image.LANCZOS)
    return big.crop((SIZE, SIZE, SIZE * 2, SIZE * 2))


def linear(srgb):
    s = srgb / 255.0
    return np.where(s <= 0.04045, s / 12.92, ((s + 0.055) / 1.055) ** 2.4)


def main():
    colors, reliefs, layers = [], [], []
    for name, asset, metres, credit in LAYERS:
        color = np.asarray(wrapped(fetch(asset, "Diffuse"), "RGB"), dtype=np.float64)
        normal = np.asarray(wrapped(fetch(asset, "nor_gl"), "RGB"), dtype=np.float64)
        height = np.asarray(wrapped(fetch(asset, "Displacement").convert("I").point(lambda v: v), "I"), dtype=np.float64)
        lo, hi = np.percentile(height, 1), np.percentile(height, 99)
        height = np.clip((height - lo) / max(hi - lo, 1e-6), 0, 1) * 255
        relief = np.stack([normal[..., 0], normal[..., 1], height], axis=-1)
        colors.append(color.astype(np.uint8))
        reliefs.append(relief.astype(np.uint8))
        mean = linear(color).reshape(-1, 3).mean(axis=0)
        layers.append({"name": name, "asset": asset, "metres": metres, "credit": credit, "mean": [round(float(c), 4) for c in mean]})
        print(f"{name:8} {asset:22} {metres} m, mean {layers[-1]['mean']}")
    os.makedirs(OUT, exist_ok=True)
    Image.fromarray(np.concatenate(colors, axis=0), "RGB").save(os.path.join(OUT, "ground-color.webp"), quality=82, method=6)
    Image.fromarray(np.concatenate(reliefs, axis=0), "RGB").save(os.path.join(OUT, "ground-relief.webp"), quality=88, method=6)
    rows = "\n".join(
        f"  {{ name: '{l['name']}', metres: {l['metres']}, mean: [{', '.join(str(c) for c in l['mean'])}] }}, // Poly Haven {l['asset']}, CC0, {l['credit']}"
        for l in layers
    )
    with open(DATA, "w", newline="\n") as f:
        f.write(
            "// Written by tools/textures/ground.py: don't edit by hand.\n\n"
            "/** One layer of the ground's photo strips: what it is, the metres one tile covers, and its mean colour (linear). */\n"
            "export interface GroundLayer {\n  readonly name: string;\n  readonly metres: number;\n  readonly mean: readonly [number, number, number];\n}\n\n"
            f"/** Pixels a side of one layer. */\nexport const GROUND_LAYER_SIZE = {SIZE};\n\n"
            f"export const GROUND_LAYERS: readonly GroundLayer[] = [\n{rows}\n];\n"
        )
    print("sizes", os.path.getsize(os.path.join(OUT, "ground-color.webp")), os.path.getsize(os.path.join(OUT, "ground-relief.webp")))


if __name__ == "__main__":
    main()
