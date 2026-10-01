---
slug: 2026-10-02_crop-resize
status: done
started: 2026-10-02
finished: 2026-10-02
issue:
---

# Resize a panel's image in crop mode: corner handles and a size slider

## Context

**Crop mode** (`ImageOverlay.svelte`, entered with Crop…, Enter or a double-click) shows the
whole image ghosted around the panel. Dragging pans it. Zooming is possible, but hidden: the
scroll wheel, the + and − keys, and Fill and Fit. There is nothing visible to grab.

Yan asked on 2026-10-02 for resize controls that keep the aspect ratio fixed.

## Goal

- **Handles:** in crop mode, the image shows a handle at each corner. Dragging one resizes the
  image with its aspect ratio locked, while the opposite corner stays where it is.
- **Slider:** the Inspector's Image section has a **Size** slider showing the image's size as a
  percentage of "just fills the panel". 100% fills it, and generated images start at 108% (see
  the [overscan plan](2026-10-02_generation-overscan.plan.md)). The slider zooms about the
  panel's centre.
- **Undo:** each drag, and each slider movement, is one undo step.

## Approach

- **Corner drag:** `resizeFromCorner(start, natural, corner, pointer)`, a pure function in
  `geometry/image.ts`. It projects the pointer onto the image's diagonal from the fixed opposite
  corner, giving a factor, and applies `zoomImage(start, factor, oppositeCorner)`. The aspect
  ratio can't change, and the existing `MIN_SCALE` and `MAX_SCALE` limits apply.
- **Handles:** they are drawn in `ImageOverlay` at the ghost image's corners, at a constant
  on-screen size (divided by the view scale). They use the same soft hold as panning.
- **Slider:** the percentage is `scale / fillScale`, where `fillScale` comes from
  `fitImage(…,'fill')`, over a range of 25–400%. It goes through `editor.patch` with undo
  grouping, like the shape sliders.

## Tasks

- [x] `resizeFromCorner` and its tests
- [x] Corner handles in `ImageOverlay`, and the Inspector Size slider
- [x] Verify; `done`

## UI mockups (ASCII)

```
   ■─────────────────────────■   ← handles on the ghosted image's corners
   │  ░░░░ ghosted image ░░░░ │
   │  ░┌──── panel ─────┐░░░ │
   │  ░│   visible crop  │░░░ │
   │  ░└─────────────────┘░░░ │
   ■─────────────────────────■

 Inspector › Image
   [Fill] [Fit] [Crop…] [Remove]
   Size   ━━━━━●━━━━━━  108%
```

## Keyboard interaction

- **Size slider:** the arrow keys step it by 1%, and Home/End jump to 25% and 400%. Each step is
  one undo step.
- **Existing keys** in crop mode are unchanged: + and − zoom, the arrows pan, 0 fills, and Esc
  finishes.
- **Handles:** they are pointer-only. The keyboard path to the same result is the slider plus
  + and −.

## Test list (TDD)

- [x] `resizeFromCorner` behaviour. Layer: unit, `src/lib/geometry/image.test.ts`
  - dragging the bottom-right corner outwards grows the image and keeps the top-left where it
    is;
  - dragging the top-left inwards shrinks it and keeps the bottom-right;
  - the aspect ratio is unchanged;
  - an off-diagonal pointer still gives a sensible size, from the projection.
- [x] `fillPercent` and `setFillPercent` round-trip, and setting 100% equals Fill. Layer: unit,
      `image.test.ts`

## Verification

1. Open a panel with an image, then click Crop…. Four handles show at the ghost image's corners.
2. Drag the bottom-right handle outwards: the image grows from its top-left corner, with its
   proportions intact. ⌘Z undoes the whole drag.
3. The Inspector's Size slider reads 100% after Fill. Drag it to 150%: the image zooms about the
   panel's centre.

## Outcome

Done on 2026-10-02.

- **Handles:** crop mode shows four amber corner handles on the ghosted image. Dragging one
  resizes the image, aspect locked, about the opposite corner.
- **Slider:** the Inspector's Image section has a Size slider, 25–400% of filling the panel.
- **Checked in Chrome** with a pasted test image:
  - the upload read 100%, so no overscan, as intended;
  - dragging the bottom-right handle grew it to 154% from a fixed top-left corner, with its
    circle still round;
  - one ⌘Z returned it to 100%.
- **Not checked by hand:** the slider's arrow-key steps (it is a standard range input).
