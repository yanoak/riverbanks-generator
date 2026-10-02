---
slug: 2026-10-02_band-toggles
status: active
started: 2026-10-02
finished:
issue:
---

# Turn a page's header and footer on and off

## Context

A1 boards have a header and a footer band on every page (see
[the board plan](2026-10-02_a1-board-format.plan.md) and
[A1 board v2](2026-10-02_board-dimensions-5x4.plan.md)). A page can already blank each slot
with `''`, but blanking a whole band takes one edit per slot, and the slots' text is lost.

Yan asked on 2026-10-02 for a checkbox per page in the Inspector to turn the header and footer
on or off. Yan chose that **a band that is off leaves its strip blank**. The grid, panel shapes
and image crops don't change, so it can be toggled freely.

## Goal

The Inspector's Page section has a **Header** and a **Footer** checkbox on pages that have bands.
Unticking one hides that band's text (and the footer's QR) on this page only, in the editor,
thumbnails, PNG and PDF. Ticking it again brings back the same text. Agents can do the same
over MCP.

## Approach

- **Storage:** the page's band overrides gain `hidden?: Band[]`. They are already a whole JSON
  value on the page's Y.Map, so the Y.Doc round trip and diff need no changes.
  - **Why there:** "Reset" on the whole page (MCP `reset: true`) clears it with the rest, and a
    page with no overrides stays `bands`-free.
  - **Rejected: blanking every slot.** Ticking the band back on couldn't restore the text.
  - **Rejected: setting `top` or `bottom` to 0.** That is the other option Yan turned down: the
    grid would grow and every image would re-crop.
- **Helpers in `bands.ts`:**
  - `bandShown(page, band)`: the page has room for the band, and it isn't hidden.
  - `setBandShown(page, band, shown)`.
- **Rendering:** `PageView` draws a band, and its focus target, only when `bandShown`. A hidden
  band can't be selected, so its text can't be edited while it is off; tick it back on first.
- **Editor:** `setBandShown(band, shown)`, one undo step, announced through `editor.say`.
- **MCP:** `set_header_footer` takes `show: { header?, footer? }` with a page. `get_comic`'s
  `overrides` already reports `hidden`.

## Tasks

- [x] Plan
- [x] Model helpers and tests; editor method and test; MCP `show` and test
- [x] `PageView` and Inspector checkboxes
- [x] ⌘Z with a checkbox focused. The shortcut handler counted every `<input>` as typing, so it
      ignored ⌘Z there (found while verifying). A focused checkbox now passes ⌘-shortcuts
      through and keeps plain keys
- [ ] Verify (below), then `done`. Done in the dev server on 2026-10-02:
  - Steps 1 and 4 passed: the thumbnail matches, the other page is untouched, ⌘Z works, and the
    same text comes back.
  - Space on the checkbox toggles it.
  - Not yet run: step 3 (PNG export) and the Tab-skip check in step 2.

## UI mockups (ASCII)

Inspector, nothing selected, on a board page:

```
PAGE 3
Rows        [ 4]
Columns     [ 4]
Gutter      [10]
Margin      [ 0]
Format      A1 board (594 × 841 mm)
Header      [x]
Footer      [ ]      ← unticked: the footer strip is blank on this page
```

On a portrait comic page, which has no bands, the two rows don't appear.

## Keyboard interaction

- Both checkboxes are ordinary `<input type="checkbox">`, after Format in tab order. Space
  toggles one, which is one undo step (⌘Z / ⇧⌘Z). Focus stays on the checkbox.
- With a band off, Tab on the canvas skips it, since there is nothing to select.

## Test list (TDD)

- [x] `bandShown` is false without room for the band, false when it is hidden, and true
      otherwise. Layer: unit, `bands.test.ts`
- [x] `setBandShown` hides and shows one band, keeps the page's text overrides, and leaves no
      `bands` behind once everything is back to the default. Layer: unit, `bands.test.ts`
- [x] The editor's `setBandShown` is one undo step. Layer: unit, `editor.test.ts`
- [x] MCP `set_header_footer` with `show` hides a band on one page, and needs a page. Layer:
      unit, `comic-ops.test.ts`

## Verification

In the dev server (`/local`), in Chrome:

1. On a board page with nothing selected, untick Footer. The footer strip goes blank on this
   page only, and the thumbnail matches. Press ⌘Z: it comes back.
2. Untick Header. Tab from the toolbar goes straight to the first panel.
3. Export a PNG of the page. Its header is blank.
4. Tick Header again. The same title and subtitle return.

## Out of scope

- Giving a hidden band's space to the comic (the rejected option above).
- A comic-wide "hide on every page" switch. Untick it page by page, or over MCP.

## Outcome

_Filled in when this goes to `done` or `abandoned`._
