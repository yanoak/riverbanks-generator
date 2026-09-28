---
slug: 2026-09-28_comic-page-editor-v1
status: active
started: 2026-09-28
finished:
issue:
---

# Comic page editor v1

## Context

The repo is empty apart from the plan/diary scaffolding (`e1acc6c`). The brief is in
[work-diary/2026-09-28](../work-diary/2026-09-28.md): a comic page maker with three layers:

1. **Panels.** A grid, 3 rows × 4 columns by default, whose cells merge in any contiguous way.
   Panels can also break out of the grid, as on _Understanding Comics_ p.6 (merged grid) and p.58
   (a free panel floating over a borderless full-page panel).
2. **Images** per panel, mostly AI-generated.
3. **WYSIWYG text**: captions, speech and thought bubbles, SFX, each laid out like a small web page.

We assessed nadiio's `canvas-tool-template` branch (`f07f230`) as a base. Its Svelte Flow canvas is
a node-and-wire graph on an infinite board, which is the wrong primitive for a fixed page. It has
no resizing, rich text, image storage or export. Its reusable parts are the SvelteKit 2 / Svelte 5
stack, the command-pattern undo (`src/lib/stores/history.svelte.ts`, `commands/types.ts`) and the
debounced, version-aware autosave (`src/lib/stores/persistence.ts`). Decision: start a fresh
SvelteKit app and port those pieces. v1 is **local-first**: no accounts, and everything is saved in
the browser.

## Goal

`npm run dev` opens an editor where one can:

- create a comic with several pages
- merge a page's 3×4 grid into arbitrary contiguous panels (L-shapes included), split panels back,
  and add free break-out panels
- drop, paste or upload an image into any panel, then pan and zoom it inside the panel
- add captions, speech, thought, whisper and shout balloons and SFX, with draggable tails and text
  edited in place with bold, italic, size and alignment
- undo and redo every one of those actions
- reload the browser without losing anything
- export a page as PNG, and export the whole comic as PDF through print

## Approach

**Stack:** SvelteKit 2, Svelte 5 runes, TypeScript, Tailwind 4, Vitest.

- TipTap (`@tiptap/core` plus StarterKit, TextStyle and TextAlign), driven from a Svelte action
  rather than a wrapper library.
- `idb-keyval` for IndexedDB.
- `html-to-image` for PNG export.
- `adapter-auto`, so it deploys on Vercel later.
- No Supabase yet. The storage layer sits behind an interface so it can be swapped in.

**Coordinate system:** each page has a fixed logical size in page units. The default is
1000 × 1545, the 6.625" × 10.25" US comic trim. Everything is stored in page units, and the page
is rendered at any zoom with a CSS `transform: scale()`. This keeps the model independent of zoom
and makes export deterministic.

**Document model** (`src/lib/model/types.ts`, versioned with `docVersion` so it can be migrated,
as in the template):

```ts
Comic   { id, title, pages: Page[], docVersion }
Page    { id, width, height, grid: { rows, cols, gutter, margin }, panels: Panel[], balloons: Balloon[] }
Panel   = GridPanel | FreePanel
  GridPanel { id, kind: 'grid', cells: number[] }          // cell index = row*cols + col; contiguous
  FreePanel { id, kind: 'free', x, y, w, h, z }            // break-out; above grid panels
  common:   { border: 'solid'|'none', fill, image?: PanelImage }
PanelImage { assetId, offsetX, offsetY, scale }            // pan/zoom inside panel
Balloon { id, type: 'caption'|'speech'|'thought'|'whisper'|'shout'|'sfx',
          x, y, w, h, z, tail?: {x, y}, html: string, style: {font, fill, stroke} }
```

- Every grid cell always belongs to exactly one grid panel. "Merge" replaces several panels with
  one, and "split" breaks a panel back into single-cell panels. The invariant is: the panels'
  cells partition `0..rows*cols-1`, and each panel is 4-connected.
- Balloons sit on the **page**, not inside a panel, because they routinely cross panel borders
  (p.6's top bubbles break the frame). An optional `clipTo: panelId` covers the cases that should
  be clipped.
- Images are blobs in an IndexedDB asset store, keyed by `assetId`. The document holds only
  references.

**Panel geometry** (`src/lib/geometry/grid.ts`, pure functions):

- Cell rectangles come from the grid spec.
- A panel's outline is found by tracing the boundary of its cell set on the grid lattice and
  mapping lattice points to page coordinates. Edges between two cells of the same panel absorb
  the gutter, and outer edges sit on the real cell edges. A merged 1×2 panel runs from cell 0's
  left edge to cell 1's right edge.
- This yields one polygon per panel, used for both the SVG border and `clip-path`. An L-shape
  comes out as a 6-vertex polygon and a rectangle as 4. CSS Grid spans can't express L-shapes,
  so rendering is SVG polygons plus absolutely positioned DOM, not CSS Grid.

**Rendering:** one page component holds these layers, bottom to top:

1. grid panels: a clipped `<div>` holding an `<img>`, plus an SVG border
2. free panels
3. balloons, as absolutely positioned HTML; the SVG shape and tail behind, a TipTap-editable
   `<div>` in front
4. selection handles and overlays

Balloon shapes:

- speech: an ellipse with a tapered tail path
- thought: a scalloped outline with trailing circles
- caption: a rectangle
- shout: a spiky star
- whisper: a dashed ellipse
- sfx: no shape, a display font with stroke

**Mutations:** every edit goes through a Command executed by the ported `HistoryManager`. Drags
are captured as a single command at pointer-up, which fixes the template's gap where moves
couldn't be undone. Typing inside TipTap uses TipTap's own undo while editing; leaving edit mode
commits a single "edit text" command.

**Rejected:**

- **Svelte Flow**: see Context.
- **Konva, Fabric or another `<canvas>` library**: WYSIWYG rich text on a canvas means
  re-implementing text editing. Keeping balloons as real DOM gives contenteditable for free and
  fits the brief's "the whole panel is a web page layout".
- **CSS Grid `grid-area` for panels**: can't express L-shapes or break-outs.
- **Supabase in v1**: adds auth and a backend before the editor is proven.

## Tasks

- [x] Scaffold SvelteKit + TS + Tailwind 4 + Vitest; port `HistoryManager`, `Command` and `BatchCommand` from the template, with tests
- [x] Document model types, default comic factory (one page, 3×4 grid of single-cell panels), `docVersion` + migrate stub
- [x] Grid geometry: cell rects, contiguity check, lattice outline tracing → page-space polygon (TDD)
- [x] Panel commands: merge selected cells/panels, split panel, change grid rows/cols (reflows only if all panels are single cells), with invariant checks
- [x] Page renderer and editor shell: toolbar, page strip, zoom-to-fit, cell/panel selection, merge/split UI
- [x] Free panels: add, move, resize, z-order, border on/off; borderless full-page panel preset
- [x] Images: IndexedDB asset store; upload, drop and paste into a panel; fit/fill; pan (drag) and zoom (wheel) in image mode
- [x] Balloons: the six types as SVG shapes, add/move/resize, draggable tail, z-order, delete
- [ ] TipTap in-place text editing: bold, italic, font size, alignment, lettering fonts (Comic Neue, Bangers); commit to history on exit
- [ ] Local autosave to IndexedDB (port `createAutoSave`'s debounce and in-flight logic without Supabase), load on start, multi-page add/delete/reorder
- [ ] Export: page → PNG (html-to-image with embedded fonts and images); comic → PDF via print stylesheet
- [ ] AI image generation hook: server route + provider adapter, "Generate" in the panel inspector (blocked on the open question below)

## UI mockups (ASCII)

Default editor:

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ Riverbanks ▾ "Untitled comic"   ↶ ↷ │ Merge  Split │ +Panel │ +Balloon ▾ │ Export ▾ │
├────────┬─────────────────────────────────────────────────────┬───────────────┤
│ Pages  │                                                     │ Inspector     │
│ ┌────┐ │     ┌──────────────────────────────────────┐        │               │
│ │ 1  │◀│     │ ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐  │        │ Page          │
│ └────┘ │     │ │      │ │      │ │      │ │      │  │        │  Grid 3 × 4   │
│ ┌────┐ │     │ └──────┘ └──────┘ └──────┘ └──────┘  │        │  Gutter [16]  │
│ │ 2  │ │     │ ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐  │        │  Margin [40]  │
│ └────┘ │     │ │      │ │      │ │      │ │      │  │        │               │
│  + Add │     │ └──────┘ └──────┘ └──────┘ └──────┘  │        │               │
│        │     │ ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐  │        │               │
│        │     │ │      │ │      │ │      │ │      │  │        │               │
│        │     │ └──────┘ └──────┘ └──────┘ └──────┘  │        │               │
│        │     └──────────────────────────────────────┘        │               │
│        │                                   − 62% + Fit       │               │
└────────┴─────────────────────────────────────────────────────┴───────────────┘
```

After merging (p.6-style: a 2×2 block, an L-shape, singles):

```
┌──────────────────────────────────────┐
│ ┌───────────────┐ ┌──────┐ ┌──────┐  │
│ │               │ │      │ │ img  │  │
│ │   (panel A)   │ └──────┘ └──────┘  │
│ │   drop image  │ ┌───────────────┐  │    Inspector — Panel A
│ │   or ⌘V       │ │               │  │     Image: [Upload] [Generate]
│ └───────────────┘ │   (L-shape B) │  │     Fit: (•) fill ( ) fit
│ ┌──────┐ ┌──────┐ └──────┐        │  │     Border: [x] solid
│ │      │ │      │        │        │  │     [Split panel]
│ └──────┘ └──────┘        └────────┘  │
└──────────────────────────────────────┘
```

Balloon selected / editing:

```
        ┌─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─┐
        ╎  ╭──────────────────╮  ╎  ◀ resize handles (8)
        ╎ (  THE TRICK IS TO   ) ╎     Inspector — Balloon
        ╎ (  NEVER MISTAKE THE ) ╎      Type [speech ▾]
        ╎  ╰────────╮─────────╯  ╎      Font [Comic Neue ▾] Size [18]
        └─ ─ ─ ─ ─ ─│─ ─ ─ ─ ─ ─ ┘      B  I   ≡ ≡ ≡
                    ◉  ◀ tail handle     Clip to panel [none ▾]
```

Empty image slot: a dashed inset with "Drop image · ⌘V · Upload". Loading (AI generation): a
spinner overlay in the panel, with the inspector's Generate button disabled. Error: an inline red
message in the inspector with Retry, and the panel is left unchanged.

## Keyboard interaction

1. **Tab order:** toolbar buttons (left to right) → page strip thumbnails → page canvas (one
   focusable region) → inspector fields. Inside the canvas, Tab and Shift+Tab cycle through
   panels, then free panels, then balloons, in z-order.
2. **Shortcuts:**
   - ⌘Z / ⇧⌘Z: undo / redo
   - Delete / Backspace: delete the selected balloon or free panel. On a grid panel it removes
     the image instead.
   - M: merge the selection. ⇧M: split the selected panel. (Not ⌘M: Chrome on macOS
     minimises the window on ⌘M before the page sees it.)
   - Arrow keys: nudge the selection 1 unit; ⇧+Arrow nudges 10.
   - Enter: on a balloon, start editing text; on a panel, enter image pan/zoom mode.
   - Esc: leave editing mode (commits the text), then clear the selection.
   - In image mode: arrow keys pan, + / − zoom, 0 fits.
   - ⌘V with a panel selected pastes an image into it.
   - P: add a free panel. ] / [: bring the selected free panel to the front / send it to the back.
   - S / T / W / K / C / X: add a speech, thought, whisper, shout, caption or SFX balloon in the
     selected panel (or at the page centre).
   - ⌘E: export the current page as PNG.
   - ⌘0: zoom to fit. ⌘= / ⌘−: zoom the page.
   - PageUp / PageDown: previous / next page.
3. **Focus management:**
   - Adding a balloon selects it and focuses its text for editing.
   - Esc returns focus to the canvas region with the balloon still selected.
   - Deleting moves the selection and focus to the next element in tab order, or to the canvas.
   - After merge, the merged panel is selected. After split, the top-left cell is selected.
   - Selecting a page thumbnail focuses the canvas on that page.
   - Canvas regions carry `role="application"` and `aria-label`s so agent browsers can target
     them.

## Test list (TDD)

- [x] HistoryManager: execute/undo/redo order, redo cleared on new execute, 50-step cap — unit — `src/lib/history/history.test.ts`
- [x] BatchCommand undoes in reverse order — unit — `src/lib/history/history.test.ts`
- [x] Default comic: one page, 12 single-cell panels whose cells partition 0..11 — unit — `src/lib/model/factory.test.ts`
- [x] `cellRect` accounts for margin and gutter; the last column ends at `width - margin` — unit — `src/lib/geometry/grid.test.ts`
- [x] `isContiguous`: single cell ✓, 2×2 ✓, L ✓, diagonal-only pair ✗, empty ✗ — unit — `grid.test.ts`
- [x] `panelOutline`: 1 cell → exactly its cell rect; 1×2 → one rect spanning the gutter; L of 3 cells → 6 vertices in clockwise order; 2×2 → 4 vertices (no interior vertices) — unit — `grid.test.ts`
- [x] `panelOutline` for a U-shape (5 cells) → 8 vertices — unit — `grid.test.ts`
- [x] `hasHoles` / `canMerge`: a ring and a corner-pinched region are rejected with a reason; a U open to the edge is fine — unit — `grid.test.ts`
- [x] Merge: merging panels whose union is contiguous yields one panel; merge + undo restores the exact prior panels and ids; non-contiguous merge is rejected with a reason — unit — `src/lib/model/commands/panels.test.ts`
- [x] Merge keeps the image of the first selected panel that has one — unit — `panels.test.ts`
- [x] Split: an N-cell panel → N single panels; split + undo restores it — unit — `panels.test.ts`
- [x] Changing grid rows/cols is allowed only when all panels are single cells, and regenerates the partition — unit — `panels.test.ts`
- [x] Invariant checker flags overlapping and missing cells — unit — `src/lib/model/invariants.test.ts`
- [x] Move/resize balloon as a single command from start/end geometry; undo restores both — unit — `src/lib/model/commands/balloons.test.ts`
- [x] Speech tail path: the tail base lies on the ellipse boundary facing the tail point — unit — `src/lib/geometry/balloon.test.ts`
- [x] Image fit/fill: computed scale and offset centre the image and cover (fill) or contain (fit) the panel's bbox — unit — `src/lib/geometry/image.test.ts`
- [x] Serialize → migrate → deserialize round-trips; an unknown future `docVersion` throws — unit — `src/lib/model/serialize.test.ts`
- [ ] Autosave debounces, queues a follow-up when an edit lands during a save, and marks clean only if the version is unchanged — unit (fake timers) — `src/lib/persistence/autosave.test.ts`
- [ ] E2E: merge four cells with the keyboard, add a speech balloon, type text, reload, and both are still there — Playwright — `e2e/editor.e2e.ts`

## Verification

1. `npm run check && npm run test:unit -- --run && npm run test:e2e` all pass.
2. `npm run dev`, then open `/`. A single page with a 3×4 grid is shown and fitted to the viewport.
3. Keyboard only:
   - Tab to the canvas and Tab to cell 1. ⇧+Arrow extends the selection to cells 1, 2, 5, 6. M
     leaves one 2×2 panel.
   - Select cells 3, 7, 8 and press M. An L-shaped panel appears whose border follows the L,
     with no border line crossing its interior.
   - ⌘Z twice restores the original grid. ⇧⌘Z twice redoes both merges.
4. Select panel A, then ⌘V an image from the clipboard. It fills the panel, clipped to its
   outline. Enter image mode and use the arrow keys and + / −; the image pans and zooms inside the
   clip. Esc leaves image mode.
5. Press S. A speech balloon appears with the caret in it. Type "THE TRICK IS", select a word and
   press ⌘B; it goes bold. Esc. Drag the tail handle across into panel B, and the tail follows.
   ⌘Z undoes the tail move without touching the text.
6. Add a free panel and drag it across the grid boundary. It renders above the grid panels, as
   on p.58. Toggle the border off on the underlying full-page panel.
7. Reload the tab. Everything is back, image included.
8. ⌘E downloads a PNG that matches the on-screen page at 1000 × 1545 (or 2×), with fonts and
   images present. Export → PDF opens the print dialog with one page per sheet and no editor
   chrome.
9. Recreate p.6's layout (six panels, row 3 = 3-cell wide + single) in under two minutes, as a
   usability check.

## Out of scope

- Accounts, cloud sync, sharing, real-time collaboration (the template's Supabase path is
  deferred)
- Freehand drawing, vector art tools and non-rectangular free panels (diagonal gutters)
- Grids other than uniform rows × cols (per-row column counts, custom row heights). Merging
  covers most layouts; revisit if p.6-style unequal rows are insufficient.
- Character consistency or style pipelines for AI images beyond a prompt plus an optional
  reference image
- Mobile or touch editing (it should render on mobile, but editing is desktop-first)
- i18n, and Storybook

## Open questions

- [ ] **AI image provider.** Options: OpenAI `gpt-image-*`, Google Gemini image ("Nano Banana"),
      fal.ai / Replicate (Flux), or Higgsfield via its CLI. Which one, and where does the API key live
      (a `.env` read by a SvelteKit server route)? This blocks the last task only.
- [ ] Page size: is the US comic trim (6.625 × 10.25) right, or is A4 / square / webtoon-vertical
      needed?
- [ ] Lettering font: is Comic Neue enough for v1, or is there a licensed lettering font (e.g.
      Blambot) to embed?
- [x] Should a merge allow unions with holes, such as a ring around a centre panel? **v1: no.**
      `canMerge` rejects rings and corner-pinched regions (`hasHoles`, 4-connected complement
      flood), so every panel has exactly one boundary loop. The same visual effect is available
      from a free panel laid over a borderless panel.

## Outcome

_Filled in when this goes to `done` or `abandoned`._
