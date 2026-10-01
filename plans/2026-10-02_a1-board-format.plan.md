---
slug: 2026-10-02_a1-board-format
status: active
started: 2026-10-02
finished:
issue:
---

# The A1 board: a square comic between a header and a footer

## Context

The exhibition hangs every comic page as an **A1 portrait board**, laid out like Sam's
"RIVERBANKS Paneling" slides (presentation `15NZ60aWo9e7i9ZCYXLlMVJrA6JRxp-RArsLSs3IYd0c`).
On 2026-10-02 I read their geometry through the Slides API. Each slide is 1684 × 2384 pt
(594 × 841 mm, A1):

- a **header band** 350 pt tall, holding the act or page title in Rubik Microbe, e.g.
  "PROLOGUE / SIX DISASTERS, ONE DREAM";
- a **1684 × 1684 square of comic art**, edge to edge;
- a **footer band** 350 pt tall. It is empty on the art so far, and the slide master puts
  "RIVERBANKS" and "SEAPUNK STUDIOS" just below it.

Inside the square, Sam lets **captions and speech balloons straddle panel borders** and sit in
the gutters (slide 5, "What, my fellow planetizens…").

The app assumes one format today:

- **Page size:** every page is 1000 × 1545, a US comic trim (`PAGE_SIZE` in
  `src/lib/model/factory.ts`).
- **Grid:** 3 × 4 with a uniform margin (`DEFAULT_GRID`). `src/lib/geometry/grid.ts` lays cells
  out in the page minus `margin` on all four sides.
- **Balloons and free panels** already live on the page, not in panels (`types.ts`: "balloons
  cross borders"). Nothing clamps them to a panel or to the grid, so they can already escape the
  grid the way Sam's do. This plan keeps that and verifies it on the new format.
- **Hard-coded size:** the MCP descriptions say "1000 wide × 1545 tall" (`ops/describe.ts`, and
  `server.ts`'s rect schema). Print-to-PDF uses a fixed US-trim `@page` (`EditorApp.svelte`).

Yan decided on 2026-10-02:

- The three Riverbanks stories will be rebuilt with **one page per Edited Drafts scene**, on this
  format.
- *The Youngest Delegate* goes in **Act Two, "Taming Currents"**.
- The **dev work comes first**; the story changes wait.

The density reasoning, 7–9 panels on a 4 × 4 grid, is in that day's conversation and diary.

## Goal

A new comic is made of A1 boards by default:

- Each page is 1000 × 1416 (A1's ratio), with a 1000 × 1000 square for the grid, which defaults
  to 4 × 4.
- A 208-unit header and a 208-unit footer sit above and below the square.
- The header and footer show **comic-wide default text**, which any page can override and reset.
- They render the same way in the editor, thumbnails, PNG and PDF export.
- Balloons and free panels can be placed across panel borders and into the bands.
- Agents can do all of this over MCP.
- Existing comics keep their portrait pages untouched.

## Approach

**Page geometry.** Band heights go on the grid spec as optional `top` and `bottom` insets.
Absent means 0, so every stored comic reads unchanged. The cell layout (`cellSize`, `cellRect`,
`cellAt`, and the lattice tracer) adds them to the margin.

- **Why on the grid spec:** it is already a Y.Map patched field by field, every geometry caller
  already passes the grid, and a page's bands only exist to push the grid off its edges.
- **Rejected: a separate `Page.frame` rect.** It would have meant changing every
  `panelOutline(…, page)` call to take an area.
- **Rejected: a page-level `format` field.** It would duplicate width, height and grid, and drift
  from them.

The format is a factory preset instead. `PAGE_FORMATS.board` and `PAGE_FORMATS.comic` each carry
a size and a grid, and `createComic(title, format = 'board')` builds from one. A new page copies
the size and grid of the page it follows, as `addPage` already does for the grid. A page made
next to a portrait page stays portrait.

**Header and footer text.**

- `Comic.bands` holds the defaults: header `title` and `subtitle`; footer `left`, `center` and
  `right`.
- `Page.bands` holds partial overrides. An empty string means "blank on this page".
- `resolveBands(comic, pageIndex)` merges the two and fills `{comic}`, `{page}` and `{pages}`.
- If a comic has no defaults yet, the house defaults apply: header `{comic}`, footer
  `RIVERBANKS · {page} · SEAPUNK STUDIOS`.
- **Plain strings, not rich text.** They are titles, and Sam's are uniform.
- **Yjs storage:** they go in as whole JSON values, on the root for the defaults and on the page
  for the overrides. So two people editing different slots of one page's header at the same
  instant resolve last-writer-wins. That is acceptable for titles. Rejected: a Y.Map per band,
  which needs more plumbing for little gain.

**Lettering.**

- The header uses **Rubik Microbe**, as on Sam's slides. The title is large and the subtitle
  smaller.
- The footer uses **Rubik 600** in small capitals.
- These are fixed in this plan rather than added to the style's `Typography`, which belongs to
  `2026-10-02_style-typography`. If the bands need per-style fonts, that is a follow-up there.

**Editing.**

- Each band is a focusable hit target. Selecting it gives a new selection kind,
  `{ kind: 'band', band: 'header' | 'footer' }`.
- The Inspector then shows that band's fields for this page. Each input's placeholder shows the
  comic default.
- **"Use on every page"** makes this page's values the comic default and clears this page's
  override. Other pages' overrides stay; a page someone retitled on purpose keeps its title.
- **"Reset to default"** clears this page's override.

**Print.** The PDF `@page` size and the print scale come from the first page's size. A1 boards
print at 594 × 841 mm.

## Tasks

- [ ] Plan, and the diary entry
- [ ] Geometry: `top` and `bottom` grid insets in `grid.ts`, with tests
- [ ] Factory: `PAGE_FORMATS`, a board default for new comics, and pages that copy their
      neighbour's size; tests
- [ ] Model: `Comic.bands`, `Page.bands`, `resolveBands`, and Y.Doc round-trip and diff; tests
- [ ] Ops and MCP: `set_header_footer`, a `format` argument on `create_comic`, and a size-aware
      `get_comic` and schema text; tests
- [ ] Render: header and footer bands in `PageView`, wired to every caller, and the PDF `@page`
      from the page size
- [ ] Editor: band selection, Inspector fields, "Use on every page" and "Reset to default", and
      the keyboard path
- [ ] Verify in the browser (below); then status `done`

## UI mockups (ASCII)

Editor canvas, A1 board, header selected:

```
┌──────────────── page 1000 × 1416 ────────────────┐   ┌ Inspector ───────────────────┐
│┌ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┐│   │ Header · page 3              │
│      ACT TWO                    (Rubik Microbe)  │   │ Title    [ACT TWO          ] │
││     THE SUMMIT                                 ││   │ Subtitle [The Summit       ] │
│└ ─ ─ ─ ─ ─ ─ ─ ─ (selected) ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┘│   │   placeholder = comic default│
│┌──────┬──────┬──────┬──────┐  ← 4×4 grid in the  │   │ [Use on every page]          │
││      │      │      │      │    1000×1000 square │   │ [Reset to default]           │
│├──────┼─(CAPTION straddles)─┼──────┤              │   │ Tokens: {comic} {page}       │
││      │      │      │      │                     │   │         {pages}              │
│├──────┼──────┼──────┼──────┤                     │   └──────────────────────────────┘
││      │      │      │      │                     │
│├──────┼──────┼──────┼──────┤                     │
││      │      │   (SPEECH spills into footer)      │
│└──────┴──────┴──────┴──────┘                     │
│  RIVERBANKS           3             SEAPUNK STUDIOS│
└──────────────────────────────────────────────────┘
```

When nothing is selected, the Inspector's Page section adds a read-only line under the grid
fields: `Format  A1 board (594 × 841 mm)` or `Comic page`.

## Keyboard interaction

1. **Tab order on the canvas:** header band, then the grid panels in reading order (as now),
   then the free panels and balloons (as now), then the footer band. The bands only exist on
   pages with a non-zero `top` or `bottom`.
2. **Focusing a band** selects it, the way focusing a panel does. Enter does the same. **Escape**
   clears the selection, as for panels.
3. **Inspector:**
   - The band fields are ordinary text inputs. Each commits on `change`, so on Enter or blur, as
     one undo step.
   - "Use on every page" and "Reset to default" are buttons. Focus stays on them after they
     act, and the outcome is announced through the editor's status line
     (`editor.say`).
4. **Shortcuts:** ⌘Z and ⇧⌘Z undo and redo band edits like any other edit. No new keys.

## Test list (TDD)

- [ ] `cellRect` with `top` and `bottom` offsets the first row by `margin + top` and fits the
      rows between the bands. Layer: unit, `src/lib/geometry/grid.test.ts`
- [ ] `cellAt` returns null for points in the header or footer band. Layer: unit, `grid.test.ts`
- [ ] `panelOutline` for a full-grid panel spans exactly the square inside the bands. Layer:
      unit, `grid.test.ts`
- [ ] `createComic()` makes a 1000 × 1416 page with a 4 × 4 grid and `top = bottom = 208`.
      `createComic(t, 'comic')` keeps the old portrait page. Layer: unit, `factory.test.ts`
- [ ] `createPage(template)` copies the template's size and grid. Layer: unit,
      `factory.test.ts`
- [ ] `resolveBands` behaviour. Layer: unit, `src/lib/model/bands.test.ts`
  - with no defaults and no overrides, it gives the house defaults;
  - a page override wins per slot, and the other slots fall through;
  - `''` blanks a slot;
  - `{comic}`, `{page}` and `{pages}` are substituted.
- [ ] Y.Doc round-trips and diffs. Layer: unit, `src/lib/model/ydoc.test.ts`
  - `Comic.bands`, `Page.bands`, and grid `top`/`bottom` survive `comicToYDoc` →
    `projectComic`;
  - `applyComic` writes only the band keys that changed;
  - a comic without them projects unchanged.
- [ ] `addPage` after a board page makes a board page, and after a portrait page makes a
      portrait page. Layer: unit, `src/lib/ops/comic-ops.test.ts`
- [ ] The `setBands` op covers three cases: a page override, the comic default with `page`
      omitted, and `reset` clearing a page's override. Layer: unit, `comic-ops.test.ts`
- [ ] `describeComic` reports each page's size, its grid area, and the resolved band text.
      Layer: unit, `src/lib/ops/describe.test.ts`
- [ ] MCP: `create_comic` with `format`, and `set_header_footer`, both work end to end. Layer:
      unit, `src/lib/server/mcp/server.test.ts`
- [ ] The editor can select a band, "Use on every page" sets the default and clears this page's
      override, and "Reset to default" clears it. Layer: unit, `src/lib/editor/editor.test.ts`

## Verification

In the dev server (`npm run dev`), in Chrome:

1. On `/comics`, create a new comic.
   - It opens on a portrait page whose ratio is √2.
   - The header shows the comic title in Rubik Microbe, and the footer shows
     `RIVERBANKS · 1 · SEAPUNK STUDIOS`.
   - There is a 4 × 4 grid in the square between them.
2. Press Tab from the canvas toolbar. The header band takes focus with a visible outline, and
   the Inspector shows "Header · page 1".
   - Type "ACT TWO" in Title and "The Summit" in Subtitle, pressing Enter after each. The canvas
     updates.
   - Press ⌘Z. The subtitle reverts.
3. Choose "Use on every page", then add a page. The new page's header reads "ACT TWO / The
   Summit".
   - On page 2, select the header, set Subtitle to "The Invitation", then choose "Reset to
     default". It returns to "The Summit".
4. Add a caption and drag it across the border between two panels, then drag a speech balloon
   half into the footer.
   - Both draw above the panels and the band, and both stay selectable.
5. Export the page as a PNG. The bands and the escaping balloons are in the image.
   - Print to PDF. The preview is A1 (594 × 841 mm), one board per sheet.
6. Open an existing comic, such as *Visa for a Hilsa*. Its pages are still 1000 × 1545 with no
   bands, and adding a page there makes another portrait page.
7. Over MCP, `get_comic` on the new comic reports the page size, the grid area and the band text.
   `set_header_footer` with no page changes the default, and the open editor updates live.

## Out of scope

- **Converting existing comics** to the board format. Their pages would need re-gridding, and
  their balloons moving. The stories will be rebuilt on new comics instead.
- **Per-style fonts for the bands.** See Approach.
- **Rich text, images or logos in the bands**, and band heights editable in the UI. They stay
  editable through `set_grid`'s `top`/`bottom` over MCP.
- **Print-resolution PNG presets** for A1. The export keeps `pixelRatio = 2`. Print-quality
  panel images come from `make_print_version`.
- **The story rewrites** (the paneling of *The Youngest Delegate* and the others). They are
  pinned for later.

## Open questions

- [ ] **House footer:** is `RIVERBANKS · {page} · SEAPUNK STUDIOS` right? It mirrors the slide
      master. Changing it is one constant.

## Outcome

_Filled in when this goes to `done` or `abandoned`._
