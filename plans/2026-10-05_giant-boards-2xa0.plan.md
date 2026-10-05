---
slug: 2026-10-05_giant-boards-2xa0
status: done
started: 2026-10-05
finished: 2026-10-05
issue:
---

# Giant boards: Pluriverse and Cover at 2×A0

## Context

Two posters go to print at 2×A0 (1189 × 1682 mm): "The Pluriverse in Microcosm" and the
RIVERBANKS cover. The flattened PDFs in `content/boards/` are 1765 × 2500 px rasters, about 38
dpi at that size. The originals are slides 9 and 1 of the "RIVERBANKS Paneling" deck
(`15NZ60aWo9e7i9ZCYXLlMVJrA6JRxp-RArsLSs3IYd0c`), A1 pages whose text is all live text boxes
over one background image each:

- Pluriverse: 2048 × 1650 PNG, cropped 21.7% off each side, so 1158 × 1650 visible (~25 dpi).
- Cover: 848 × 1264, cropped 2.2% each side and 4.6% top and bottom, so ~812 × 1148 (~19 dpi).

## Goal

One print PDF per poster at 1189 × 1682 mm, with the text as vector type and the background
picture at about 150 dpi (≈ 7022 × 9933 px), visually matching the deck.

## Approach

- **Text stays vector:** export a copy of each slide with the background image removed, as PDF
  from Slides.
- **Background:** crop the source to its visible region, then upscale about 6× with Topaz
  (Higgsfield `topaz_image`) to 7022 × 9933. Rejected: a Nano Banana 4K redraw first, since
  redraws drift (dropped detail, recolouring; see the Epilogue print versions), and Topaz upscales
  without reinventing the picture.
- **Rejected:** putting the hi-res image back into Slides and exporting. Slides limits and
  recompresses large images, and 7022 × 9933 is about 70 MP.
- **Composite:** a script lays the text PDF over the image on a 1189 × 1682 mm page.

## Tasks

- [x] Crop both backgrounds to their visible region
- [x] Topaz upscale both to 7022 × 9933; compare with the source
- [x] Text-only PDFs from a copy of the deck
- [x] Rebuild the GIANT cover as a slide (no slide had its layout): header from slide 2's fonts,
      slide 1's main lines in italic, matched to the flattened PDF within ~2 pt per line
- [x] Composite to `content/boards/print/*_2xA0.pdf`; check against the flattened PDFs

## Verification

- Open each print PDF: page size 1189 × 1682 mm, image ~150 dpi (`pdfimages -list`).
- Side by side with the flattened PDF: the same layout, no shifted or missing text, no colour shift.
- Zoom to 100% on body text and on art detail: text sharp, art without upscale artefacts.

## Out of scope

- Bleed and CMYK conversion, unless the printer asks.

## Open questions

- [x] The cover's source: no slide has its layout (slide 2 is a different poster), so it was
      recreated.
- [ ] The printer's specs (dpi, bleed, colour space)

## Outcome

Both posters are in `content/boards/print/` (not committed: 13 MB and 30 MB):
`Pluriverse_2xA0.pdf` and `RIVERBANKS-Cover_2xA0.pdf`, at 1189 × 1682 mm, with vector text over
7022 × 9933 px art (150 dpi). Each was checked side by side with its flattened PDF and at 100%.

- Topaz (`topaz_image`, Low Resolution V2, 5 credits each) upscaled ~6× with no drift; mean
  colour unchanged to three decimals. That beats a 4K redraw for anything already final.
- The text comes from a working copy of the deck, "RIVERBANKS GIANT boards: print text layers
  (2xA0)" in Drive: slides stripped of their pictures, with page backgrounds set to not render
  (otherwise the export is an opaque white page). The rebuilt cover slide lives only there.
- **Slides' PDF export adds a gap at every colour change inside a faux-bold Rubik Microbe line**
  ("RIVER BANKS"). Microbe has only a regular weight; the solid look is Slides' synthetic bold,
  and the regular weight shows the font's bubble pattern instead. The fix was one text box per
  coloured fragment, positioned by measuring the export against Slides' own thumbnail.
- No bleed yet; the printer's specs are still open.
