"""Title cards for the trailer, set in the game's own type (DESIGN.md): Bahnschrift Bold Condensed,
uppercase, bone on black, held to the left edge, and the match clock beside it as a small tabular
readout. 1920x804 (the 2.39:1 picture).

    python cards.py <out dir>
"""
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

W, H = 1920, 804
BONE = (243, 241, 234)
DIM = (180, 186, 197)  # --ds-text-2
FONT = "C:/Windows/Fonts/bahnschrift.ttf"
GUTTER = 168  # the picture's left margin for type


def font(size, style="Bold Condensed"):
    f = ImageFont.truetype(FONT, size)
    f.set_variation_by_name(style)
    return f


def tracked(draw, xy, text, f, fill, tracking=0.02):
    """Draws text with letter spacing (em fraction); returns the width drawn."""
    x, y = xy
    for ch in text:
        draw.text((x, y), ch, font=f, fill=fill)
        x += draw.textlength(ch, font=f) + tracking * f.size
    return x - xy[0]


def card(lines, clock=None, size=128, leading=0.92):
    im = Image.new("RGB", (W, H), (0, 0, 0))
    d = ImageDraw.Draw(im)
    f = font(size)
    block = size * leading * len(lines)
    y = (H - block) / 2 - size * 0.12
    for line in lines:
        tracked(d, (GUTTER, y), line, f, BONE)
        y += size * leading
    if clock:
        small = font(int(size * 0.62), "SemiBold Condensed")
        w = d.textlength(clock, font=small)
        last_top = y - size * leading
        d.text((W - GUTTER - w, last_top + size * 0.86 - small.size * 0.86), clock, font=small, fill=DIM)
    return im


def title():
    im = Image.new("RGB", (W, H), (0, 0, 0))
    d = ImageDraw.Draw(im)
    f = font(210)
    text = "DUTY SHOOTER"
    widths = sum(d.textlength(ch, font=f) + 0.02 * f.size for ch in text)
    x = (W - widths) / 2
    tracked(d, (x, H / 2 - 210 * 0.62), text, f, BONE)
    return im


def endline():
    im = title()
    d = ImageDraw.Draw(im)
    small = font(38, "Regular")
    text = "Free in your browser"
    w = d.textlength(text, font=small)
    d.text(((W - w) / 2, H / 2 + 120), text, font=small, fill=DIM)
    return im


if __name__ == "__main__":
    out = Path(sys.argv[1] if len(sys.argv) > 1 else ".")
    out.mkdir(parents=True, exist_ok=True)
    card(["EVERY MATCH", "IS A WEAPONS TEST"], "T-10:00", size=160).save(out / "card1.png")
    card(["HOLD THE GROUND", "UNTIL THERE IS NONE"], "T-01:00", size=160).save(out / "card2.png")
    title().save(out / "title.png")
    endline().save(out / "end.png")
    print("cards in", out.resolve())
