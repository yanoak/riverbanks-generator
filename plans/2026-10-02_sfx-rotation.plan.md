---
slug: 2026-10-02_sfx-rotation
status: active
started: 2026-10-02
finished:
issue:
---

# Rotatable SFX lettering

## Context

SFX balloons have no outline. Their lettering is tilted by a fixed `rotate(-6deg)` in
`BalloonView.svelte`. Yan asked on 2026-10-02 for SFX text to be rotatable.

## Goal

An SFX balloon's lettering can be turned to any angle from −180° to 180°. It can be set in the
Inspector, with a slider and a number, and over MCP (`rotation` on `add_balloon` and
`update_balloon`). Existing SFX keep their −6°.

## Approach

- **The field:** `Balloon.rotation`, in degrees. It applies to SFX only; absent means −6°, which
  is today's tilt.
- **What turns:** only the text, about the box centre, as now. The balloon's box, its handles
  and its hit area stay axis-aligned. A long SFX at a steep angle may reach past its box; it is
  allowed to, as SFX already overflow (`white-space: nowrap`).
- **Rejected:** rotating the whole Transformer box. It would need rotated resize handles and
  rotated hit-testing, which is a lot of work for a lettering effect.
- **Undo:** the slider groups a drag into one undo step, the same as the shape sliders.

## Tasks

- [ ] `rotation` field, render, Inspector, MCP; tests
- [ ] Verify; `done`

## UI mockups (ASCII)

```
│ Type        [sfx ▾]                 │
│ ─ Shape ─────────────────────────── │
│ Rotation    ━━━━●━━━━━   [ -6 ]°    │   −180 … 180, sfx only
```

## Keyboard interaction

- **Slider:** arrow keys step it by 1°, and PageUp/PageDown by 10°.
- **Number field:** commits on Enter or on blur.
- **Undo:** each commit is one undo step.

## Test list (TDD)

- [ ] `sfxRotation(b)` gives −6 when the balloon has no rotation, and otherwise clamps it to
      −180…180. Layer: unit, `src/lib/model/balloons.test.ts`
- [ ] MCP `update_balloon` with `rotation` sets it on an SFX, `null` resets it, and setting it on
      a speech balloon is refused. `get_comic` reports it. Layer: unit,
      `src/lib/server/mcp/server.test.ts`

## Verification

1. Add an SFX balloon, then drag Rotation to 30° and to −45°. The lettering turns, and ⌘Z
   undoes the drag in one step.
2. Change an old SFX's other settings. It keeps its −6° tilt.

## Outcome

_Filled in when this goes to `done` or `abandoned`._
