#!/usr/bin/env python3
"""Lay a slide's vector text over a high-res background, scaled to the background's page.

    giant-board.py BACKGROUND.pdf TEXT.pdf PAGE OUT.pdf

BACKGROUND.pdf is the upscaled picture as a one-page PDF at the final print size (e.g. made with
`magick bg.png -units PixelsPerInch -density 150 -compress zip bg.pdf`). TEXT.pdf is the slide
deck exported from Slides with the background images deleted and page backgrounds not rendered,
so only the type and shapes remain. PAGE is the 1-based page of TEXT.pdf to use. Needs pypdf.
Plan: 2026-10-05_giant-boards-2xa0.
"""

import sys

from pypdf import PdfReader, PdfWriter, Transformation


def main(background: str, text: str, page: int, out: str) -> None:
    bg = PdfReader(background).pages[0]
    fg = PdfReader(text).pages[page - 1]
    bw, bh = float(bg.mediabox.width), float(bg.mediabox.height)
    fw, fh = float(fg.mediabox.width), float(fg.mediabox.height)
    sx, sy = bw / fw, bh / fh
    if abs(sx - sy) / sx > 0.01:
        sys.exit(f'Aspect mismatch: background {bw:.0f}×{bh:.0f}, text {fw:.0f}×{fh:.0f}')
    bg.merge_transformed_page(fg, Transformation().scale(sx, sy))
    writer = PdfWriter()
    writer.add_page(bg)
    writer.compress_identical_objects()
    with open(out, 'wb') as f:
        writer.write(f)
    print(f'{out}: {bw / 72 * 25.4:.0f} × {bh / 72 * 25.4:.0f} mm, text scaled ×{sx:.3f}')


if __name__ == '__main__':
    if len(sys.argv) != 5:
        sys.exit(__doc__)
    main(sys.argv[1], sys.argv[2], int(sys.argv[3]), sys.argv[4])
