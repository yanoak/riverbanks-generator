---
slug: 2026-10-02_generation-overscan
status: done
started: 2026-10-02
finished: 2026-10-02
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

- [x] `fitImage` overscan, editor and MCP placement; tests
- [x] Verify; `done`

## Test list (TDD)

- [x] `fitImage(img, box, 'fill', 1.08)` scales by 1.08 × fill and stays centred, so equal
      amounts are cropped off each side. Layer: unit, `src/lib/geometry/image.test.ts`
- [x] `Editor.placeStoredImage` overscans. Layer: unit, `src/lib/editor/editor.test.ts`. (No
      separate test that an upload doesn't: `setImage` is untouched and calls `fitImage` without
      overscan.)
- [x] MCP `generate_panel_image` places with overscan. Layer: unit,
      `src/lib/server/mcp/server.test.ts`. (`set_panel_image` passes no overscan; it is not
      tested separately.)

## Verification

Generate into a panel in the dev server, with the fake provider or a real one. The image fills
the panel, slightly zoomed. Image mode shows it reaching past every panel edge.

## Outcome

Done on 2026-10-02.

- **Placement:** generated images, drafts and Takes alike, are placed at 1.08 × the fill scale,
  centred, from both the editor and MCP's `generate_panel_image`. Uploads, SVG sketches and print
  versions are unchanged.
- **How it was checked:** against the scratch-comic test drafts rather than a fresh live
  generation. Their stray borders sat about 2–2.5% in from the edge, and 1.08 crops about 3.7% off
  each side.
- **Existing images:** panels already placed keep their framing.
- **Deployment:** like the lettering-room default, this reaches production when it is deployed.
