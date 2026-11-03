"""Builds Zero Island's foliage atlas (ticket 62) from CC0 scanned plants on Poly Haven.

    <game-textures venv>/python tools/textures/foliage.py [--sheet out.jpg]

Poly Haven's plant models (CC0, credited in SOURCES) ship photo-scanned
leaves, needles, fronds, twigs and grass blades as cut-outs with an alpha
map. This cuts each source into its pieces (one leaf, one sprig, one blade),
then lays the pieces out again as the cards the plant kit is built from
(tools/map/vegetation.py): a cluster of leaves on twigs, a drooping pine
spray, a frond, a fan of blades. Pieces further back in a cluster are drawn
darker, as the leaves in front shade them.

Writes apps/range/public/textures/foliage.webp: 2048 px, a 4 x 4 grid of
512 px cells (`CELLS`, the same order as `ATLAS` in vegetation.py), sRGB
colour, alpha the leaf's outline (the game alpha-tests it at 0.5). Colour is
bled out past every edge, so mipmaps don't fringe the leaves with black.
The last cell is opaque white: the kit's bark and stems sample it and keep
their material colour.
"""
import argparse
import io
import json
import math
import os
import random
import urllib.request
from collections import deque

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.join(HERE, "..", "..")
OUT = os.path.join(ROOT, "apps", "range", "public", "textures", "foliage.webp")
CACHE = os.path.join(os.path.expanduser("~"), ".cache", "duty-foliage")
CELL = 512
GRID = 4

# Poly Haven asset, its colour and alpha maps, and credit.
SOURCES = {
    "broad": ("island_tree_01", "leaves_diff", "leaves_alpha", "Rob Tuytel"),
    "small": ("shrub_04", "Diffuse", "Alpha", "Rob Tuytel"),
    "glossy": ("searsia_lucida", "Diffuse", "Alpha", "Rob Tuytel"),
    "pine": ("pine_tree_01", "twig_diff", "twig_alpha", "Rob Tuytel"),
    "fern": ("fern_02", "Diffuse", "Alpha", "Rob Tuytel"),
    "grass": ("grass_medium_02", "Diffuse", "Alpha", "Rob Tuytel"),
    "straw": ("grass_medium_02", "dry_diff", "Alpha", "Rob Tuytel"),
    "twig": ("wild_rooibos_bush", "Diffuse", "Alpha", "Rob Tuytel"),
}

# The cells, row by row. vegetation.py's `ATLAS` names them in this order.
CELLS = [
    "broad-a", "broad-b", "bush-a", "bush-b",
    "pine-a", "pine-b", "juniper", "dry-a",
    "dry-b", "fern-a", "fern-b", "grass",
    "straw", "tuft", "tuft-dry", "solid",
]


def get(url):
    return urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": "duty-shooter-foliage/1"})).read()


def fetch(asset, kind):
    os.makedirs(CACHE, exist_ok=True)
    path = os.path.join(CACHE, f"{asset}_{kind}.png")
    if not os.path.exists(path):
        files = json.loads(get(f"https://api.polyhaven.com/files/{asset}"))
        entry = files[kind]["1k"]
        fmt = "png" if "png" in entry else "jpg"
        with open(path, "wb") as f:
            f.write(get(entry[fmt]["url"]))
    return Image.open(path)


def pieces(key, min_area=0.0008, max_area=0.2):
    """A source cut into its pieces: (RGBA image, area share) for each blob of its alpha, biggest first."""
    asset, diff, alpha, _ = SOURCES[key]
    colour = fetch(asset, diff).convert("RGB")
    a = fetch(asset, alpha).convert("L").resize(colour.size)
    # Poly Haven's maps hold a few white slivers outside the leaves: no piece keeps them.
    rgb = np.asarray(colour)
    white = rgb.min(axis=2) > 185
    a = Image.fromarray(np.where(white, 0, np.asarray(a)).astype(np.uint8))
    rgba = colour.copy()
    rgba.putalpha(a)
    w, h = colour.size
    # Label blobs on a coarse mask: a breadth-first fill is quick enough at 256 px.
    n = 256
    mask = np.asarray(a.resize((n, n), Image.BILINEAR)) > 40
    label = np.zeros((n, n), np.int32)
    boxes = []
    for y in range(n):
        for x in range(n):
            if not mask[y, x] or label[y, x]:
                continue
            k = len(boxes) + 1
            label[y, x] = k
            q = deque([(y, x)])
            x0 = x1 = x
            y0 = y1 = y
            count = 0
            while q:
                cy, cx = q.popleft()
                count += 1
                x0, x1, y0, y1 = min(x0, cx), max(x1, cx), min(y0, cy), max(y1, cy)
                for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                    ny, nx = cy + dy, cx + dx
                    if 0 <= ny < n and 0 <= nx < n and mask[ny, nx] and not label[ny, nx]:
                        label[ny, nx] = k
                        q.append((ny, nx))
            boxes.append((count / (n * n), (x0, y0, x1, y1), k))
    out = []
    for share, (x0, y0, x1, y1), k in sorted(boxes, reverse=True):
        if not (min_area <= share <= max_area):
            continue
        sx, sy = w / n, h / n
        box = (max(0, int((x0 - 1) * sx)), max(0, int((y0 - 1) * sy)), min(w, int((x1 + 2) * sx)), min(h, int((y1 + 2) * sy)))
        piece = rgba.crop(box)
        # Keep only this blob: its neighbours' corners in the box are cut away.
        own = Image.fromarray(((label == k) * 255).astype(np.uint8)).resize((w, h), Image.NEAREST).crop(box)
        own = own.filter(ImageFilter.MaxFilter(9))
        pa = np.minimum(np.asarray(piece.getchannel("A")), np.asarray(own))
        piece.putalpha(Image.fromarray(pa))
        out.append((piece, share))
    return out




def shaded(piece, k, warm=0.0):
    """A piece darkened by k (1 unchanged), a little warmer or cooler."""
    rgb = np.asarray(piece.convert("RGB")).astype(np.float32) * k
    rgb[..., 0] *= 1 + warm
    rgb[..., 2] *= 1 - warm
    out = Image.fromarray(np.clip(rgb, 0, 255).astype(np.uint8))
    out.putalpha(piece.getchannel("A"))
    return out


def place(cell, piece, x, y, length, angle, anchor=0.5):
    """Pastes a piece scaled so its long side is `length` px, turned `angle` degrees from pointing up, its foot at (x, y)."""
    w, h = piece.size
    tall = piece if h >= w else piece.rotate(90, expand=True)
    w, h = tall.size
    s = length / h
    p = tall.resize((max(1, int(w * s)), max(1, int(h * s))), Image.LANCZOS)
    # The foot (bottom middle) sits at the anchor; rotate about the image centre and shift so the foot lands on (x, y).
    r = p.rotate(angle, resample=Image.BICUBIC, expand=True)
    a = math.radians(angle)
    fx, fy = 0, p.size[1] * anchor
    # The foot relative to the centre, after rotation (PIL turns counter-clockwise).
    rx = fx * math.cos(a) + fy * math.sin(a)
    ry = -fx * math.sin(a) + fy * math.cos(a)
    cx, cy = x - rx, y - ry
    cell.alpha_composite(r, (int(cx - r.size[0] / 2), int(cy - r.size[1] / 2)))


def twig(draw, rng, x0, y0, x1, y1, width, colour):
    """A thin, slightly crooked twig."""
    pts = [(x0, y0)]
    for t in (0.33, 0.66):
        pts.append((x0 + (x1 - x0) * t + rng.uniform(-6, 6), y0 + (y1 - y0) * t + rng.uniform(-6, 6)))
    pts.append((x1, y1))
    for (a, b), wv in zip(zip(pts, pts[1:]), (width, width * 0.8, width * 0.6)):
        draw.line([a, b], fill=colour, width=max(1, int(wv)))


def leaf_cluster(rng, leaves, count, size, spread=0.42, twig_colour=(70, 58, 44, 255), lengths=(70, 110), droop=0.0):
    """A cluster of leaves on forking twigs, filling a rough disc: what a card in a crown or bush shows."""
    cell = Image.new("RGBA", (CELL, CELL), (0, 0, 0, 0))
    draw = ImageDraw.Draw(cell)
    cx, cy = CELL / 2, CELL / 2
    # Twigs from below the middle, out to where leaves hang.
    tips = []
    for i in range(5):
        a = math.tau * i / 5 + rng.uniform(-0.4, 0.4)
        r = CELL * spread * rng.uniform(0.45, 0.8)
        tx, ty = cx + math.cos(a) * r, cy + math.sin(a) * r * 0.9 + droop * r
        twig(draw, rng, cx + rng.uniform(-20, 20), cy + CELL * 0.12, tx, ty, 4, twig_colour)
        tips.append((tx, ty))
    spots = []
    for _ in range(count):
        a = rng.uniform(0, math.tau)
        r = CELL * spread * rng.random() ** 0.6
        spots.append((cx + math.cos(a) * r, cy + math.sin(a) * r * 0.9, a, rng.random()))
    # Back to front: the deep ones darker, as the front leaves shade them.
    spots.sort(key=lambda s: s[3])
    for x, y, a, depth in spots:
        piece = leaves[rng.randrange(len(leaves))]
        k = 0.55 + 0.5 * depth
        out = math.degrees(math.atan2(-(y - cy), x - cx)) - 90 + rng.uniform(-35, 35)
        place(cell, shaded(piece, k, rng.uniform(-0.06, 0.06)), x, y, rng.uniform(*lengths) * size, out, anchor=0.45)
    return cell


def spray(rng, sprigs, count, length, width, colour_k=1.0):
    """A pine branch's tip seen from above: a drooping stem from the cell's foot with sprigs of needles off both sides."""
    cell = Image.new("RGBA", (CELL, CELL), (0, 0, 0, 0))
    draw = ImageDraw.Draw(cell)
    base = (CELL / 2, CELL * 0.97)
    tip = (CELL / 2 + rng.uniform(-20, 20), CELL * 0.06)
    twig(draw, rng, *base, *tip, 7, (78, 60, 44, 255))
    order = sorted(range(count), key=lambda _: rng.random())
    for i in order:
        t = 0.08 + 0.9 * i / count
        x = base[0] + (tip[0] - base[0]) * t
        y = base[1] + (tip[1] - base[1]) * t
        side = -1 if i % 2 else 1
        s = sprigs[rng.randrange(len(sprigs))]
        reach = length * (1.05 - 0.55 * t) * rng.uniform(0.85, 1.1)
        place(cell, shaded(s, colour_k * rng.uniform(0.7, 1.05)), x, y, reach, side * rng.uniform(35, 65) + rng.uniform(-8, 8), anchor=0.5)
    # The tip itself.
    place(cell, shaded(sprigs[0], colour_k), tip[0], tip[1] + length * 0.35, length * 0.7, 0, anchor=0.5)
    return cell


def frond(rng, fronds, index):
    """One fern frond, standing in the middle 40% of the cell."""
    cell = Image.new("RGBA", (CELL, CELL), (0, 0, 0, 0))
    f = fronds[index % len(fronds)]
    place(cell, f, CELL / 2, CELL * 0.99, CELL * 0.98, 0, anchor=0.5)
    return cell


def blades(rng, pieces_, count, top=0.98, k=1.0):
    """A fan of grass blades from the cell's foot."""
    cell = Image.new("RGBA", (CELL, CELL), (0, 0, 0, 0))
    for i in range(count):
        x = CELL * (0.12 + 0.76 * rng.random())
        b = pieces_[rng.randrange(len(pieces_))]
        lean = (x - CELL / 2) / (CELL / 2) * 14 + rng.uniform(-8, 8)
        place(cell, shaded(b, k * rng.uniform(0.7, 1.08)), x, CELL * 1.0, CELL * top * rng.uniform(0.55, 1.0), -lean, anchor=0.5)
    return cell


def bleed(img):
    """Colour pushed out past every edge, so mipmaps and filtering don't drag in black."""
    a = np.asarray(img.getchannel("A")).astype(np.float32) / 255
    rgb = np.asarray(img.convert("RGB")).astype(np.float32)
    acc = rgb * a[..., None]
    wsum = a.copy()
    out_rgb = rgb.copy()
    known = a > 0.5
    cur_rgb, cur_w = acc, wsum
    # Blur weighted colour at growing radii and fill what's still unknown.
    for radius in (2, 4, 8, 16, 32, 64):
        im = Image.fromarray(np.clip(cur_rgb / max(cur_rgb.max(), 1) * 255, 0, 255).astype(np.uint8))
        scale = max(cur_rgb.max(), 1) / 255
        blurred = np.asarray(im.filter(ImageFilter.GaussianBlur(radius))).astype(np.float32) * scale
        wim = Image.fromarray(np.clip(cur_w * 255, 0, 255).astype(np.uint8))
        bw = np.asarray(wim.filter(ImageFilter.GaussianBlur(radius))).astype(np.float32) / 255
        fill = (~known) & (bw > 0.002)
        out_rgb[fill] = blurred[fill] / bw[fill][..., None]
        known = known | fill
    mean = (acc.sum((0, 1)) / max(wsum.sum(), 1))
    out_rgb[~known] = mean
    out = Image.fromarray(np.clip(out_rgb, 0, 255).astype(np.uint8))
    out.putalpha(img.getchannel("A"))
    return out


def build():
    rng = random.Random(62)
    broad = [p for p, _ in pieces("broad")][:8]
    small = [p for p, _ in pieces("small")][:12]
    glossy = [p for p, _ in pieces("glossy")][:8]
    pine = [p for p, _ in pieces("pine", max_area=0.08)]
    fern = [p for p, _ in pieces("fern")][:6]
    grass = [p for p, _ in pieces("grass", min_area=0.0003)]
    straw = [p for p, _ in pieces("straw", min_area=0.0003)]
    # Bare twigs: branchy pieces, which fill little of their box (the map's stalks and bark fill most of theirs).
    twigs = [p for p, _ in pieces("twig", min_area=0.002, max_area=0.08) if (np.asarray(p.getchannel("A")) > 127).mean() < 0.2 and max(p.size) > 200]
    # Pine sprigs: the pieces taller than wide with needle texture (the twig map also holds cones and bark, which are big and square).
    sprigs = [p for p in pine if max(p.size) / max(1, min(p.size)) > 1.4][:4]
    cells = {
        "broad-a": leaf_cluster(rng, broad, 150, 0.8, lengths=(70, 105)),
        "broad-b": leaf_cluster(rng, broad + glossy, 160, 0.75, lengths=(65, 100), droop=0.1),
        "bush-a": leaf_cluster(rng, small + glossy, 230, 0.7, spread=0.44, lengths=(55, 85)),
        "bush-b": leaf_cluster(rng, glossy + small, 210, 0.7, spread=0.44, lengths=(55, 85), droop=0.1),
        "pine-a": spray(rng, sprigs, 30, CELL * 0.5, 1),
        "pine-b": spray(rng, sprigs, 34, CELL * 0.45, 1, 0.9),
        "juniper": spray(rng, sprigs, 44, CELL * 0.36, 1, 0.8),
        "dry-a": dry_cluster(rng, twigs, small),
        "dry-b": dry_cluster(rng, twigs, small + glossy),
        "fern-a": frond(rng, fern, 0),
        "fern-b": frond(rng, fern, 1),
        "grass": blades(rng, grass, 30),
        "straw": blades(rng, straw, 30),
        "tuft": blades(rng, grass, 18, top=0.9),
        "tuft-dry": blades(rng, straw, 16, top=0.9),
        "solid": Image.new("RGBA", (CELL, CELL), (255, 255, 255, 255)),
    }
    atlas = Image.new("RGBA", (CELL * GRID, CELL * GRID), (0, 0, 0, 0))
    for i, name in enumerate(CELLS):
        c = bleed(cells[name])
        # A clear frame inside each cell, so mipmaps never bleed one card into the next.
        frame = np.asarray(c).copy()
        frame[:6, :, 3] = frame[-6:, :, 3] = frame[:, :6, 3] = frame[:, -6:, 3] = 0
        if name == "solid":
            frame[..., 3] = 255
        atlas.paste(Image.fromarray(frame), ((i % GRID) * CELL, (i // GRID) * CELL))
    return atlas


def dry_cluster(rng, twigs, leaves):
    """Dry scrub: a tangle of bare twigs with a few dry leaves left on them."""
    cell = Image.new("RGBA", (CELL, CELL), (0, 0, 0, 0))
    for _ in range(9):
        t = twigs[rng.randrange(len(twigs))]
        place(cell, shaded(t, rng.uniform(0.75, 1.05)), CELL * rng.uniform(0.35, 0.65), CELL * rng.uniform(0.75, 0.98), CELL * rng.uniform(0.55, 0.85), rng.uniform(-50, 50))
    for _ in range(80):
        a = rng.uniform(0, math.tau)
        r = CELL * 0.38 * math.sqrt(rng.random())
        x, y = CELL / 2 + math.cos(a) * r, CELL / 2 + math.sin(a) * r * 0.85
        place(cell, shaded(leaves[rng.randrange(len(leaves))], rng.uniform(0.6, 1.0), 0.12), x, y, rng.uniform(40, 70), rng.uniform(0, 360), anchor=0.45)
    return cell


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--sheet", help="also write the atlas over grey, to look at")
    args = ap.parse_args()
    atlas = build()
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    atlas.save(OUT, "WEBP", quality=88, method=6, exact=True)
    print(json.dumps({"path": os.path.abspath(OUT), "bytes": os.path.getsize(OUT), "cells": CELLS}))
    if args.sheet:
        bg = Image.new("RGBA", atlas.size, (96, 96, 108, 255))
        bg.alpha_composite(atlas)
        d = ImageDraw.Draw(bg)
        for i, name in enumerate(CELLS):
            d.text(((i % GRID) * CELL + 10, (i // GRID) * CELL + 10), name, fill=(255, 255, 0, 255))
        bg.convert("RGB").resize((1024, 1024), Image.LANCZOS).save(args.sheet, quality=88)


if __name__ == "__main__":
    main()
