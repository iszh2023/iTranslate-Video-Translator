#!/usr/bin/env python3
from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw


def _generate_placeholder(size: int) -> Image.Image:
    # Darker background + smaller centered mark (no diagonal line).
    img = Image.new("RGBA", (size, size), (4, 10, 36, 255))
    d = ImageDraw.Draw(img)

    # Smaller frame.
    pad = int(size * 0.22)
    thick = max(2, int(size * 0.12))

    outer0 = pad
    outer1 = size - pad
    inner0 = outer0 + thick
    inner1 = outer1 - thick

    base = (0, 140, 255, 255)
    hi = (90, 200, 255, 255)
    shadow = (0, 95, 210, 255)

    d.rectangle([outer0, outer0, outer1, outer1], fill=base)
    d.rectangle([inner0, inner0, inner1, inner1], fill=(4, 10, 36, 255))

    # Subtle highlight on top edge.
    d.polygon(
        [
            (outer0, outer0),
            (outer1, outer0),
            (outer1 - thick, outer0 + thick),
            (outer0 + thick, outer0 + thick),
        ],
        fill=hi,
    )

    # Subtle shadow on right edge.
    d.polygon(
        [
            (outer1, outer0),
            (outer1, outer1),
            (outer1 - thick, outer1 - thick),
            (outer1 - thick, outer0 + thick),
        ],
        fill=shadow,
    )

    return img


def main() -> None:
    here = Path(__file__).resolve().parent
    src = here / "icon_source.png"

    for size, name in [(16, "icon16.png"), (48, "icon48.png"), (128, "icon128.png")]:
        out = here / name
        if src.exists():
            img = Image.open(src).convert("RGBA").resize((size, size), Image.Resampling.LANCZOS)
        else:
            img = _generate_placeholder(size)
        img.save(out)
        print("wrote", out)

    if not src.exists():
        print(f"Tip: for your exact logo, save it as {src} and re-run this script.")


if __name__ == "__main__":
    main()
