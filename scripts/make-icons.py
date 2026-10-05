#!/usr/bin/env python3
"""Generate the install icons (a white die face on a blue tile) in public/icons/.

Run once after changing the design: python3 scripts/make-icons.py (needs Pillow).
"""
from pathlib import Path

from PIL import Image, ImageDraw

OUT = Path(__file__).resolve().parent.parent / "public" / "icons"
OUT.mkdir(parents=True, exist_ok=True)
BLUE, WHITE = (37, 99, 235, 255), (255, 255, 255, 255)
PIPS = [(0.31, 0.31), (0.5, 0.5), (0.69, 0.69), (0.69, 0.31), (0.31, 0.69)]
SUPERSAMPLE = 4  # draw large, then shrink, for smooth edges


def draw(size, maskable=False):
    big = size * SUPERSAMPLE
    img = Image.new("RGBA", (big, big), BLUE if maskable else (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    if not maskable:
        inset = round(big * 0.06)
        d.rounded_rectangle([inset, inset, big - inset, big - inset], radius=round(big * 0.2), fill=BLUE)
    scale = 0.62 if maskable else 1.0  # keep the pips inside the maskable safe zone
    r = big * 0.075 * scale
    for fx, fy in PIPS:
        cx, cy = big / 2 + (fx - 0.5) * big * scale, big / 2 + (fy - 0.5) * big * scale
        d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=WHITE)
    return img.resize((size, size), Image.LANCZOS)


draw(192).save(OUT / "icon-192.png")
draw(512).save(OUT / "icon-512.png")
draw(512, maskable=True).save(OUT / "maskable-512.png")
print("Wrote icons to", OUT)
