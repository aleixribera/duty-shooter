# Contact sheet of look.mjs's frames (rows: guns; columns: irons, reflex, prism) for one size, with the screen's
# centre marked, and each optic's reticle measured: the centroid of its glowing red pixels against the centre (px).
#   python .scratch/next-level/sights/sheet.py <out dir> [desktop|phone]
import json
import sys

import numpy as np
from PIL import Image, ImageDraw

out = sys.argv[1]
size = sys.argv[2] if len(sys.argv) > 2 else "desktop"
GUNS = ["m4a1", "smg", "shotgun", "lmg", "burst"]
SIGHTS = ["irons", "reflex", "prism"]
TW = 480
offsets = {}
tiles = []
for gun in GUNS:
    row = []
    for sight in SIGHTS:
        im = Image.open(f"{out}/{size}-{gun}-{sight}.png").convert("RGB")
        w, h = im.size
        a = np.asarray(im).astype(int)
        r, g, b = a[..., 0], a[..., 1], a[..., 2]
        red = (r > 180) & (r - g > 90) & (r - b > 110)
        if sight != "irons" and red.any():
            ys, xs = np.nonzero(red)
            offsets[f"{gun}-{sight}"] = [round(float(xs.mean()) - w / 2, 1), round(float(ys.mean()) - h / 2, 1), int(red.sum())]
        th = round(TW * h / w)
        t = im.resize((TW, th))
        d = ImageDraw.Draw(t)
        cx, cy = TW / 2, th / 2
        d.line([(cx - 14, cy), (cx - 5, cy)], fill=(0, 255, 255))
        d.line([(cx + 5, cy), (cx + 14, cy)], fill=(0, 255, 255))
        d.line([(cx, cy - 14), (cx, cy - 5)], fill=(0, 255, 255))
        d.line([(cx, cy + 5), (cx, cy + 14)], fill=(0, 255, 255))
        d.text((6, 6), f"{gun} {sight}", fill=(255, 255, 255))
        row.append(t)
    tiles.append(row)
th = tiles[0][0].size[1]
sheet = Image.new("RGB", (TW * len(SIGHTS), th * len(GUNS)))
for i, row in enumerate(tiles):
    for j, t in enumerate(row):
        sheet.paste(t, (j * TW, i * th))
sheet.save(f"{out}/sheet-{size}.jpg", quality=85)
print(json.dumps(offsets))
