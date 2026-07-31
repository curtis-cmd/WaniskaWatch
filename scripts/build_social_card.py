#!/usr/bin/env python3
"""Build Waniskâ Watch social and deployment thumbnails from the exact logo asset."""

from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).parents[1]
WIDTH, HEIGHT = 1200, 630
CREAM = "#F4F1E8"
FOREST = "#173D36"
INK = "#122C28"
GOLD = "#B58332"
MUTED = "#596963"


def font(path: str, size: int, index: int = 0) -> ImageFont.FreeTypeFont:
    return ImageFont.truetype(path, size=size, index=index)


def build() -> Image.Image:
    card = Image.new("RGB", (WIDTH, HEIGHT), CREAM)
    draw = ImageDraw.Draw(card, "RGBA")
    draw.rectangle((0, 0, WIDTH, 15), fill=GOLD)
    draw.rectangle((0, HEIGHT - 18, WIDTH, HEIGHT), fill=FOREST)
    for inset in range(0, 200, 24):
        draw.ellipse(
            (865 - inset, 65 + inset // 2, 1285 + inset, 500 + inset),
            outline=(23, 61, 54, max(10, 34 - inset // 8)),
            width=2,
        )

    logo = Image.open(ROOT / "public" / "waniska-watch-logo.png").convert("RGBA")
    bounds = logo.getbbox()
    if not bounds:
        raise RuntimeError("Waniskâ Watch logo has no visible pixels")
    logo = logo.crop(bounds)
    logo.thumbnail((265, 350), Image.Resampling.LANCZOS)
    logo_x = 72 + (275 - logo.width) // 2
    logo_y = (HEIGHT - logo.height) // 2 - 6
    card.paste(logo, (logo_x, logo_y), logo)

    draw.line((405, 90, 405, 520), fill=GOLD, width=4)
    sans = font("/System/Library/Fonts/Avenir Next.ttc", 21, index=1)
    serif = font("/System/Library/Fonts/NewYork.ttf", 57)
    serif_small = font("/System/Library/Fonts/NewYork.ttf", 51)
    label = font("/System/Library/Fonts/Avenir Next.ttc", 18, index=1)

    draw.text((465, 116), "PUBLIC MINING INTELLIGENCE", font=label, fill=GOLD)
    draw.text((463, 180), "See the activity.", font=serif, fill=INK)
    draw.text((463, 252), "Know the territory.", font=serif_small, fill=FOREST)
    draw.line((465, 352, 1060, 352), fill=(181, 131, 50, 150), width=2)
    draw.text(
        (465, 386),
        "Verified public records, mapped with care",
        font=sans,
        fill=MUTED,
    )
    draw.text(
        (465, 430),
        "MANITOBA  •  SASKATCHEWAN  •  ONTARIO",
        font=label,
        fill=FOREST,
    )
    draw.text((465, 485), "A free community resource", font=label, fill=MUTED)
    return card


def main() -> None:
    card = build()
    card.save(ROOT / "public" / "og.png", optimize=True)
    card.save(ROOT / "public" / "screenshot.jpeg", quality=92, optimize=True)
    print("Wrote public/og.png and public/screenshot.jpeg")


if __name__ == "__main__":
    main()
