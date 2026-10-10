#!/usr/bin/env python3
"""Regenerate public/og-image.png, the 1200x630 link-preview image (Open Graph / Twitter).

Uses the board screenshot from the Instructor Guide (guide/images/06-board.png, made by
`npm run guide`) and the bundled Fredoka/Nunito fonts. Requires Pillow.
Run from the repository root: python3 scripts/make-og-image.py
"""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = Path(__file__).resolve().parent.parent
W, H = 1200, 630
BG, INK, MUTED, ACCENT = (238, 242, 246), (30, 41, 59), (71, 85, 105), (37, 99, 235)


def font(family, weight, size):
    path = ROOT / f"node_modules/@fontsource/{family}/files/{family}-latin-{weight}-normal.woff"
    try:
        return ImageFont.truetype(str(path), size)
    except OSError:
        return ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", size)


shot = Image.open(ROOT / "guide/images/06-board.png").convert("RGB")
# The board itself: a square region of the 2160x1350 screenshot.
board = shot.crop((205, 100, 1415, 1310)).resize((560, 560), Image.LANCZOS)

img = Image.new("RGB", (W, H), BG)
shadow = Image.new("RGBA", (600, 600), (0, 0, 0, 0))
ImageDraw.Draw(shadow).rounded_rectangle((20, 24, 580, 584), 28, fill=(15, 23, 42, 70))
shadow = shadow.filter(ImageFilter.GaussianBlur(12))
img.paste(shadow, (W - 600 - 15, 15), shadow)
mask = Image.new("L", board.size, 0)
ImageDraw.Draw(mask).rounded_rectangle((0, 0, *board.size), 24, fill=255)
img.paste(board, (W - 560 - 35, 35), mask)

d = ImageDraw.Draw(img)
x = 56
d.text((x, 110), "Learn", font=font("fredoka", 600, 76), fill=INK)
d.text((x, 196), "Around the", font=font("fredoka", 600, 76), fill=INK)
d.text((x, 282), "Board", font=font("fredoka", 600, 76), fill=ACCENT)
body = font("nunito", 600, 30)
for i, line in enumerate(["A board-game review session", "for any course. Free, in the", "browser, no accounts."]):
    d.text((x, 398 + i * 42), line, font=body, fill=MUTED)
d.text((x, 548), "hghezzi.github.io/Learn-Around-the-Board", font=font("nunito", 700, 22), fill=ACCENT)

out = ROOT / "public/og-image.png"
img.save(out, optimize=True)
print(f"wrote {out.relative_to(ROOT)} ({out.stat().st_size // 1024} kB)")
