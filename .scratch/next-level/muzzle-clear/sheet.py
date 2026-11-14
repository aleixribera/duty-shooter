# Crops the middle of each frame (x 760-1160, y 380-700) into a grid: python sheet.py <dir> <prefix> <out.jpg>
import sys, glob, os
from PIL import Image
d, prefix, out = sys.argv[1:4]
files = sorted(glob.glob(os.path.join(d, prefix + '*.jpg')))
tiles = [Image.open(f).crop((760, 380, 1160, 700)) for f in files]
cols = 6
rows = (len(tiles) + cols - 1) // cols
sheet = Image.new('RGB', (cols * 400, rows * 320), 'black')
for i, t in enumerate(tiles):
    sheet.paste(t, ((i % cols) * 400, (i // cols) * 320))
sheet.save(out, quality=85)
print(len(tiles))
