---
slug: 2026-10-02_board-dimensions-5x4
status: active
started: 2026-10-02
finished:
issue:
---

# A1 board v2: a 5:4 comic, edge to edge, between thin bands

## Context

[The A1 board plan](2026-10-02_a1-board-format.plan.md) copied Sam's slides: a 1000 × 1000 square
of comic between a 208-unit header and footer, with a 12-unit margin all round. The
[footer QR plan](2026-10-02_footer-qr.plan.md) put a 150-unit QR in that footer.

On 2026-10-02 Yan added `riverbanks/moodboard/Red annotated comic page dimensions.png`, which
gives the target print dimensions:

- the sheet is still **A1, 594 × 841 mm**;
- the **header** is 49.25 mm, holding "ACT TWO" in Rubik Microbe with "TAMING CURRENTS" as a
  smaller subtitle **on the same line**;
- the **comic** is 594 × 742.5 mm, so **height : width = 5 : 4**, with **no side margins**;
- the **footer** is 49.25 mm: the comic title on the left, `3 / 7` in the centre, and
  `RIVERBANKS · SEAPUNK STUDIOS` on the right, followed by a small QR with `RIVERBANKS.LOL`
  **beside** it.

In page units (1000 = 594 mm), that is 83 + 1250 + 83 = 1416.

## Goal

New board comics have a 1000 × 1250 comic area that runs edge to edge, between 83-unit header
and footer bands. The bands are lettered to fit, as on the annotated sheet. Thumbnails, PNG and
PDF export match the editor, and MCP describes the new geometry.

## Approach

- **Format preset.** `PAGE_FORMATS.board.grid` becomes `{ rows: 4, cols: 4, gutter: 10,
  margin: 0, top: 83, bottom: 83 }`. Margin 0 also puts the panels flush against the bands, as
  on the sheet. The grid's single `margin` cannot express "side margins only", and it doesn't
  need to.
- **`formatOf` matches on page size only.** The two formats differ in size, and boards made
  before this change (208-unit bands) are still A1 boards for print and the Inspector label.
  Otherwise the 7-page *Youngest Delegate* would print on US comic trim.
- **House footer** follows the sheet: left `{comic}`, centre `{page} / {pages}`, right
  `RIVERBANKS · SEAPUNK STUDIOS`, QR `riverbanks.lol`. Comics with stored defaults keep them.
- **Lettering at 83 units.**
  - The header puts the title and subtitle on one baseline. The title is Microbe at about
    50 units; the subtitle is Rubik 700 at about 26 units.
  - The footer is Rubik 600 at about 15 units.
  - The QR is 60 units square (about 36 mm), with its label to its right rather than under it.
    The QR, its label and the right-hand text sit in the right grid cell and don't wrap, so
    the centre slot stays centred.
    That scans from about 0.35 m. Accepted: the sheet asks for a small QR.
- **Bands scale with their height**, so boards stored with the old 208-unit bands still render
  sensibly. Font sizes and the QR are set relative to the band height in `PageView`.
- **Existing board comics are not migrated here.** Their grid panels would reflow on their own,
  but balloons and free panels are absolute, and panel images would be re-cropped from square
  cells to 5:4 ones. Migrating *The Youngest Delegate* is a separate decision for Yan.

## Tasks

- [x] Plan
- [x] Preset, `formatOf`, house footer, MCP and describe text; tests
- [x] `PageView` band lettering and QR at the new height
- [x] Convert *The Youngest Delegate* (Yan's call, 2026-10-02). No images were regenerated.
      Snapshot of the old layout: `content/snapshots/2026-10-02_youngest-delegate_pre-5x4.json`
  - Grid: margin 0, 83-unit bands on every page.
  - Images: each re-fitted at 108% with the same focus.
  - Balloons: kept in place relative to their panel.
  - Tails: follow the art, scaled by how much each image grew.
  - Every page checked by eye. One fix: panel 6.2 panned (focus x 0.44) so the fisher speaking
    is back in view.
  - Sam inserted a blank page 2 during the run, so the old pages 2–7 are now 3–8.
- [x] New house footer, from Yan's 2026-10-02 mock-up: **RIVERBANKS**, `riverbanks.lol` and
      **SEAPUNK STUDIOS**, in Rubik Pixels. The outer names are large (0.3 × the band) and the
      address is small (0.14 ×).
  - Dropped: the page number, the story title and the QR. The QR slot still exists, but it is
    empty by default.
  - Sizes are capped, so older 208-unit footers don't overflow.
  - *The Youngest Delegate*'s and *The Year It Snowed*'s footer defaults were set to match over
    MCP.
  - Checked in the dev server against the mock-up.
- [x] Deploy, so production letters the bands at their new height. Until then, production shows
      the old 208-unit lettering crammed into 83 units.
- [ ] Verify (below), then `done`. Step 1 passed on 2026-10-02 in `/local`, which matched the
      sheet. Steps 2–3 (PNG, PDF) are still to do. Step 4 couldn't be done in the browser,
      because the dev database doesn't hold that comic. By the CSS, its 208-unit bands hit the
      `min()` caps, so the old sizes stand

## Test list (TDD)

- [x] `createComic(t, 'board')` gives a 1000 × 1416 page with a 4 × 4 grid, margin 0, and
      `top = bottom = 83`. Layer: unit, `factory.test.ts`
- [x] The full grid spans x 0–1000 and y 83–1333. Layer: unit, `grid.test.ts`
- [x] `formatOf` still calls an old 208-band 1000 × 1416 page a board. Layer: unit,
      `factory.test.ts`
- [x] The house footer resolves to `{title}`, `1 / 3` and `RIVERBANKS · SEAPUNK STUDIOS`.
      Layer: unit, `bands.test.ts`
- [x] New balloons on a board still start inside the grid area. Layer: unit, `balloons.test.ts`

## Verification

In the dev server, in Chrome:

1. Create a new comic. The header is a thin strip with the title and subtitle on one line. The
   4 × 4 grid runs to the left and right edges, flush under the header and over the footer. The
   footer reads title · `1 / 1` · `RIVERBANKS · SEAPUNK STUDIOS`, then the QR and
   `RIVERBANKS.LOL`.
2. Set the header to "ACT TWO" / "Taming Currents". Compare a PNG export side by side with the
   annotated sheet.
3. Print to PDF. The sheet is A1 and the proportions match the sheet's.
4. Open *The Youngest Delegate* (the 7-page board). It still renders with its old 208-unit bands,
   with lettering that fits, and still prints on A1.

## Out of scope

- Migrating existing board comics to the new geometry (see Approach).
- Separate side and top margins on the grid.

## Outcome

_Filled in when this goes to `done` or `abandoned`._
