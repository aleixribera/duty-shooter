# Contact sheet of after/desktop and after/phone: each sight's centre (desktop crop 640x400) and the whole phone frame.
import os
from PIL import Image, ImageDraw
names = ['m4a1-none', 'm4a1-reflex', 'm4a1-prism', 'lmg-reflex', 'dmr-none', 'sniper-none']
W, H = 640, 400
sheet = Image.new('RGB', (W * 2, H * len(names)), 'black')
d = ImageDraw.Draw(sheet)
for i, n in enumerate(names):
    a = Image.open(f'after/desktop/{n}.jpg').crop((960 - 320, 540 - 200, 960 + 320, 540 + 200))
    b = Image.open(f'after/phone/{n}.jpg').resize((W, int(W * 390 / 844)))
    sheet.paste(a, (0, i * H)); sheet.paste(b, (W, i * H + (H - b.height) // 2))
    d.text((8, i * H + 8), n + ' (desktop, centre)', fill='yellow'); d.text((W + 8, i * H + 8), n + ' (phone 844x390)', fill='yellow')
sheet.save('sheet.jpg', quality=85)
