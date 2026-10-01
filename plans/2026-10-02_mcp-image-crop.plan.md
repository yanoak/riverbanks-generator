---
slug: 2026-10-02_mcp-image-crop
status: done
started: 2026-10-02
finished: 2026-10-02
issue:
---

# Crop and zoom a panel's image over MCP

## Context

The editor can now resize a panel's image in crop mode (corner handles, and a Size slider in
percent of filling the panel; see the [crop-resize plan](2026-10-02_crop-resize.plan.md)).
Agents can't do any of it. `set_panel_image` only places an image filled or fitted, and
`update_panel` has no image options. Yan asked for parity on 2026-10-02.

## Goal

`update_panel` takes an optional `image` option:

- `fit: 'fill' | 'fit'` resets the placement;
- `size` is a percentage of filling the panel, 25–400, the same scale as the slider;
- `focus: { x, y }` gives the point of the image, as fractions 0–1 of its width and height, to
  put at the panel's centre.

They are applied in that order. `get_comic` reports each panel image's `size` and `focus`, so an
agent can read the crop before changing it.

## Approach

- **Geometry:** two pure functions in `geometry/image.ts`, beside `fillPercent` and
  `setFillPercent`:
  - `imageFocus(img, box)` gives the fraction of the image under the panel's centre;
  - `focusImage(img, box, focus)` sets the offsets that put that point at the centre.
- **Rejected: raw `scale` and offsets in page units.** An agent can't reason about those without
  knowing the image's pixel size, whereas a percentage and a focus point carry meaning.
- **Refusals:** a panel without an image refuses `image`, and so do values out of range.

## Tasks

- [x] `imageFocus` and `focusImage`, `updatePanel` image option, MCP schema, `get_comic`;
      tests
- [x] `done`

## Test list (TDD)

- [x] `focusImage` puts the chosen point at the panel's centre, `imageFocus` reads it back, and
      a filled image's focus is (0.5, 0.5). Layer: unit, `src/lib/geometry/image.test.ts`
- [x] MCP `update_panel` behaviour. Layer: unit, `src/lib/server/mcp/server.test.ts`
  - `{ size: 150, focus: { x: 0.3, y: 0.2 } }` gives `get_comic` the matching size and focus;
  - `{ fit: 'fill' }` returns it to 100 and (0.5, 0.5);
  - a panel with no image is refused.

## Outcome

Done on 2026-10-02.

- **The option:** `update_panel` takes `image: { fit, size, focus }`, applied in that order. It
  answers with the resulting size and focus.
- **Reading the crop:** `get_comic` reports `image: { size, focus }` for every panel with an
  image.
- **Tests:** unit tests through the MCP client cover setting, resetting and the refusal.
- **Deployment:** it reaches agents once deployed and they reconnect.
