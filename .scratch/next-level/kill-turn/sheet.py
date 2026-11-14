"""Kill frames side by side: each row one kill (b at 250 ms, c at 500 ms), the centre of the screen.
usage: python sheet.py <capture dir> <out.jpg> [label]"""
import glob
import os
import sys

from PIL import Image, ImageDraw

src, out = sys.argv[1], sys.argv[2]
label = sys.argv[3] if len(sys.argv) > 3 else os.path.basename(src)
kills = sorted({f[: -len('b.jpg')] for f in glob.glob(os.path.join(src, '*kill-*b.jpg'))})
W, H = 480, 330
sheet = Image.new('RGB', (W * 3, H * len(kills) + 30), (16, 16, 16))
d = ImageDraw.Draw(sheet)
d.text((8, 8), f'{label}: kill / +250 ms / +500 ms (centre 480x330)', fill=(230, 230, 230))
for row, k in enumerate(kills):
    for col, suffix in enumerate(['.jpg', 'b.jpg', 'c.jpg']):
        path = k + suffix
        if not os.path.exists(path):
            continue
        im = Image.open(path)
        w, h = im.size
        crop = im.crop((w // 2 - W // 2, h // 2 - 130, w // 2 + W // 2, h // 2 + 200))
        sheet.paste(crop, (col * W, 30 + row * H))
        d.text((col * W + 6, 30 + row * H + 4), os.path.basename(path), fill=(255, 255, 0))
sheet.save(out, quality=85)
print(out, len(kills), 'kills')
