# The gun at the hip in look.mjs's frames (1920x1080): mean sRGB brightness of fixed patches on it (the boxes of
# ../gun-shade/patches.py), and the share of the gun's box that is crushed to black (every channel under 6 of 255).
import sys
from PIL import Image
P = {'rail': (1185, 760, 1235, 800), 'side': (1150, 830, 1220, 880), 'guard': (1110, 700, 1150, 740), 'mag': (1330, 960, 1440, 1040)}
GUN = (1050, 640, 1450, 1080)
for f in sys.argv[1:]:
    rgb = Image.open(f).convert('RGB')
    im = rgb.convert('L')
    out = {k: round(sum(im.crop(b).getdata()) / ((b[2] - b[0]) * (b[3] - b[1])), 1) for k, b in P.items()}
    px = list(rgb.crop(GUN).getdata())
    out['black%'] = round(100 * sum(1 for p in px if max(p) < 6) / len(px), 1)
    print(f, out)
