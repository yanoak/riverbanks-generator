---
slug: 2026-10-02_generation-overscan
status: active
started: 2026-10-02
finished:
issue:
---

# Generated images overscan their panel, cropping stray drawn borders

## Context

Gemini Pro sometimes draws its own thin border just inside the image edge. It happened in the
2026-10-01 builds and in about half of the
[lettering-room test](2026-10-02_lettering-room.plan.md) drafts. Prompt wording only changes how
often. In the test drafts the stray border sat about 2–3% in from each edge.

Yan proposed on 2026-10-02 that generated images always be bigger than their frame.

## Goal

A generated image is placed slightly zoomed in, at 1.08 × the scale that just fills the panel,
and centred. Its outer ~3.7% on each side falls outside the panel, along with any stray border.

- **Covered:** new drafts and earlier takes, from the editor and over MCP.
- **Not covered:** uploads, SVG sketches and print versions. A print version keeps the framing
  it is given.
- **Re-cropping:** anyone can still pan or zoom an image in image mode.

## Approach

- **The zoom:** `fitImage(img, box, mode, overscan = 1)` multiplies the fill scale and keeps the
  image centred, with `GENERATED_OVERSCAN = 1.08` in `geometry/image.ts`.
- **Editor:** `Editor.placeStoredImage` is the editor's only path for generated images (drafts
  and Takes), and it overscans.
- **MCP:** `ops.setPanelImage` gains an `overscan` argument, which `generate_panel_image` passes.
  `set_panel_image` and `draw_panel_svg` don't.
- **Rejected: generating a larger image.** The aspect is chosen per model and the model's size is
  fixed, so asking for "bigger" just means zooming in afterwards anyway.
- **Rejected: detecting and cropping borders by analysing the pixels.** It is more work and more
  fragile. Overscan hides the problem without needing to know whether it happened.
- **Cost:** 3.7% of the composition is lost at each edge. The panel prompts keep the action
  away from the edges anyway.

## Tasks

- [ ] `fitImage` overscan, editor and MCP placement; tests
- [ ] Verify; `done`

## Test list (TDD)

- [ ] `fitImage(img, box, 'fill', 1.08)` scales by 1.08 × fill and stays centred, so equal
      amounts are cropped off each side. Layer: unit, `src/lib/geometry/image.test.ts`
- [ ] `Editor.placeStoredImage` overscans, and `setImage` (an upload) doesn't. Layer: unit,
      `src/lib/editor/editor.test.ts`
- [ ] MCP `generate_panel_image` places with overscan, and `set_panel_image` doesn't. Layer:
      unit, `src/lib/server/mcp/server.test.ts`

## Verification

Generate into a panel in the dev server, with the fake provider or a real one. The image fills
the panel, slightly zoomed. Image mode shows it reaching past every panel edge.

## Outcome

_Filled in when this goes to `done` or `abandoned`._
