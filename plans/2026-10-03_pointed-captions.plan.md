---
slug: 2026-10-03_pointed-captions
status: active
started: 2026-10-03
finished:
issue:
---

# Pointed, tilted captions (pennant captions)

## Context

PAO:4:2 ("The Great Pluriversalization" / "Security, Stakes, Services") should letter its two
captions on arrow-shaped pennants that tilt with the ring of arrows, as in Sam's inspiration
image. Captions today are axis-aligned boxes (or rounded, via `roundness`); `rotation` exists but
only for sfx, and turns just the lettering.

Rejected: generating the lettering into the image. The text is Sam's final slide copy and must stay
editable; image models misspell long text; the house style forbids lettering in the art; vector
lettering prints sharper at A1.

## Goal

A caption can have a pointed end (`point: 'left' | 'right'`) and a tilt (`rotation`, degrees),
set from the inspector and from the MCP (`add_balloon`, `update_balloon`, shown by `get_comic`).
The two PAO:4:2 captions use them.

## Approach

- **Model:** `Balloon.point?: 'left' | 'right'` (captions only). `Balloon.rotation` now also applies
  to captions; absent is 0° for a caption, −6° for an sfx as before.
- **Geometry:** `pointedPath(w, h, side)` — a box whose `side` end is a chevron, apex at mid-height,
  inside the balloon's rect (depth `min(h/2, w/3)`), so the box stays the hit area. A pointed
  caption ignores roundness. `textPadding` gives per-side text insets so lettering stays out of
  the point; `textInset` (vertical, used by auto-fit) is unchanged.
- **Rendering:** sfx keeps rotating only its lettering. A caption rotates as a whole — outline
  and text — around its centre, inside the anchor clip. Selection handles stay axis-aligned (the
  unrotated box); acceptable for a first version.
- Rejected: a general `rotation` for every balloon type. Speech tails and connectors would then
  need rotated geometry; nobody has asked for it.
- Rejected: a separate `arrow` balloon type. It is a caption in every other way (fill, lettering,
  anchoring, MCP), so a shape option fits the existing `roundness/points/depth` pattern.

## Tasks

- [x] Geometry + model: `point`, `pointedPath`, `textPadding`, caption rotation (tests first)
- [x] Ops/MCP/describe: accept `point` and caption `rotation`; describe them (tests first)
- [x] Rendering + inspector controls
- [ ] Apply to the two PAO:4:2 captions and check the board

## UI mockups (ASCII)

Inspector, caption selected (Shape section):

```
 Shape
 Roundness  box [====o-----] oval      (disabled while pointed)
 Point      [ none ▾ ]                 none | left | right
 Rotation   [----o----]  [ -8 ]°
```

On the page:

```
   ______________________
  /                      \        ________________________
 <  THE GREAT PLURI...    |      |  SECURITY, STAKES...    >
  \______________________/       |________________________/
   point: left, rotation −8°        point: right, rotation −10°
```

## Keyboard interaction

1. Tab order: the new Point select and the Rotation range + number inputs follow Roundness in the
   inspector's Shape section, in that order, all native controls.
2. Shortcuts: none new. Arrow keys move the range; typing a number sets rotation exactly.
3. Focus: unchanged; editing a control keeps focus in the inspector.

## Test list (TDD)

- [x] `pointedPath` stays inside the w×h box and has its apex at mid-height on the chosen side — unit — `src/lib/geometry/balloon.test.ts`
- [x] `balloonShape('caption', …, { point })` draws the pointed path and ignores roundness — unit — `balloon.test.ts`
- [x] `textPadding` pads the pointed side by the chevron depth, the others as `textInset` — unit — `balloon.test.ts`
- [x] `balloonRotation`: caption default 0, sfx default −6, clamped — unit — `src/lib/model/balloons.test.ts`
- [x] `applyShape` sets/clears `point` on captions, refuses it on other types; accepts rotation on captions, still refuses speech — unit — `src/lib/ops/comic-ops.test.ts`
- [x] MCP: `add_balloon`/`update_balloon` take `point` and caption `rotation`; `get_comic` reports them — integration — `src/lib/server/mcp/server.test.ts`

## Verification

- Open PAO page 4. Select "THE GREAT PLURIVERSALIZATION": the inspector shows Point and Rotation.
  Set Point to left with the keyboard (Tab to the select, arrow keys), type −8 in Rotation: the
  caption becomes a tilted pennant pointing left, lettering inside it, upright relative to the box.
- Both PAO:4:2 captions read as pennants along the ring, lettering fully inside, not clipped.
- An sfx still tilts its lettering only; a speech balloon offers no Rotation.
- PNG/PDF export of page 4 shows the same shapes.

## Out of scope

- Rotating speech, thought, shout and whisper balloons; rotated selection handles.
- Curved (arc) pennants.

## Open questions

- [ ] The e2e test (`e2e/editor.e2e.ts`, "a caption becomes a tilted pennant") is written but has
      not run: it needs the local Supabase stack, and Docker was down. The same steps were checked
      by hand in `/local` on the dev server.

## Outcome

