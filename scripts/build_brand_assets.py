#!/usr/bin/env python3
"""Create display-ready Waniskâ Watch assets without altering visible logo pixels."""

from pathlib import Path

from PIL import Image


ROOT = Path(__file__).parents[1]


def trim(source: str, destination: str) -> None:
    image = Image.open(ROOT / "public" / source).convert("RGBA")
    bounds = image.getbbox()
    if not bounds:
        raise RuntimeError(f"{source} has no visible pixels")
    image.crop(bounds).save(ROOT / "public" / destination, optimize=True)


def main() -> None:
    trim("waniska-watch-logo.png", "waniska-watch-header.png")
    trim("waniska-watch-logo-white.png", "waniska-watch-footer.png")
    print("Wrote trimmed black header and white footer logo assets")


if __name__ == "__main__":
    main()
