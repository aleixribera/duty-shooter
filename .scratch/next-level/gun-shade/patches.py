# Mean sRGB brightness of fixed patches on the gun in the shade.mjs shots (same spot, same pose): receiver top, receiver side, handguard, and the whole gun's dark pixels.
import sys
from PIL import Image
P = {'rail': (1185, 760, 1235, 800), 'side': (1150, 830, 1220, 880), 'guard': (1110, 700, 1150, 740), 'mag': (1330, 960, 1440, 1040)}
for f in sys.argv[1:]:
    im = Image.open(f).convert('L')
    out = {k: round(sum(im.crop(b).getdata()) / ((b[2] - b[0]) * (b[3] - b[1])), 1) for k, b in P.items()}
    print(f, out)
