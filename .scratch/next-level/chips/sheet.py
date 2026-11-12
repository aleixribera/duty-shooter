# Contact sheet: every frame of a run (only 02 and 10 are kept here), 6 across, half size.   python sheet.py <dir> <out.jpg>
import sys, glob
from PIL import Image
files = sorted(glob.glob(sys.argv[1] + '/[0-9]*.jpg'))
ims = [Image.open(f).resize((480, 270)) for f in files]
cols = 6
sheet = Image.new('RGB', (480 * cols, 270 * ((len(ims) + cols - 1) // cols)))
for i, im in enumerate(ims):
    sheet.paste(im, ((i % cols) * 480, (i // cols) * 270))
sheet.save(sys.argv[2], quality=85)
