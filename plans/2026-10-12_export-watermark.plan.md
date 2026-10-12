---
slug: 2026-10-12_export-watermark
status: active
started: 2026-10-12
finished:
issue:
---

# Watermark on PNG and PDF exports

## Context

The editor exports in two ways (`src/lib/components/EditorApp.svelte`). **PNG** rasterises one
offscreen render of the current page (`.export-stage`, `src/lib/export/png.ts`). **PDF** is
`window.print()` of `.print-pages`, every page at sheet size. Both are drawn from the DOM, so
anything layered over the page in those two renders lands in the file, and the editing canvas
is untouched.

Yan wants exports, such as the web edition PDF (`2026-10-12_web-edition-pdf`), to be watermarkable
when they're shared, and chose (2026-10-12):

- **Text:** typed by the person exporting, remembered for next time.
- **Placement:** one large, semi-transparent line diagonally across the page.
- **Control:** a toggle beside PNG and PDF in the toolbar, applying to both until turned off.

## Goal

With the watermark on, every PNG and every page of the PDF carries the typed text corner to
corner, readable on both dark and light boards; with it off, exports are as before. The editor
canvas never shows it. The setting and text survive a reload in the same browser.

## Approach

- **`src/lib/export/watermark.ts`** (tested):
  - `watermarkLayout(width, height, text)` gives the angle along the page's diagonal and a font
    size that fits the text across about 80% of the diagonal, capped so a short word isn't taller
    than a fifth of the page.
  - `readWatermark(storage)` / `writeWatermark(storage, value)` keep `{ on, text }` in
    `localStorage`, behind try/catch; a missing or broken entry reads as off, with the text
    "PREVIEW".
- **`Watermark.svelte`**: an SVG laid over the page, one `<text>` at the page centre, rotated.
  It stays vector in the PDF. The fill is mid-grey at partial opacity with a thin lighter
  outline, so it reads on the black posters and the cream pages alike. The face is Rubik 800,
  the house lettering, which the editor already loads.
- **`EditorApp.svelte`**: the PNG stage and each print page wrap `PageView` and `Watermark` in
  a relative box when the watermark is on.
- **`Toolbar.svelte`**: a "Watermark" button after PDF opens a small popover holding an on/off
  checkbox and the text field. The button shows as pressed while the watermark is on.
- **Rejected:**
  - *Stamping the PDF afterwards.* The PDF comes from the browser's print dialog, so the app
    never holds the file.
  - *Storing it on the comic.* It's an export preference, not part of the comic, and
    collaborators shouldn't inherit it.
  - *`textLength` to fit the text.* It stretches the glyphs of short words.

## Tasks

- [x] `watermarkLayout`, `readWatermark`, `writeWatermark` with tests
- [x] `Watermark.svelte` over the PNG stage and print pages
- [x] Toolbar toggle and popover. Checked on the local dev server (`/local`): the popover opens
      with focus on the checkbox, Escape returns focus to the button, the setting survives a
      reload, the canvas shows no watermark, and the PNG and print render both carry it. The
      first colours (grey at 35%) vanished on black, so the fill went to 50% with a stronger
      light rim; it now reads on white and on #111.
- [ ] Once deployed, check a PNG and a PDF of *Compilation Lo Res* (dark poster, light page) with it on and off

## UI mockups (ASCII)

```
Toolbar, right end (off):        … │ ⬇ PNG │ 📄 PDF │ ◈ Watermark │ Share
Toolbar, right end (on):         … │ ⬇ PNG │ 📄 PDF │ [◈ Watermark] │ Share   (pressed style)

Popover under the button:
┌──────────────────────────────┐
│ [x] Watermark PNG and PDF    │
│ Text                         │
│ [PREVIEW — not for sale    ] │
└──────────────────────────────┘

Exported page:
┌──────────────┐
│           ╱  │
│        ╱W    │
│     ╱E       │
│  ╱I          │
│╱V            │
└──────────────┘
```

## Keyboard interaction

1. **Tab order:** … PNG, PDF, Watermark, then the people avatars and Share. With the popover
   open: the checkbox, then the text field.
2. **Shortcuts:** none new. ⌘E still exports the PNG, watermarked if it's on.
3. **Focus:** opening the popover focuses the checkbox. Escape, or clicking outside, closes it
   and returns focus to the Watermark button.

## Test list (TDD)

- [x] The angle follows the page diagonal: 45° on a square page, steeper on a tall one —
      unit — `src/lib/export/watermark.test.ts`
- [x] The font size fits the text across the diagonal, and a short word is capped at a fifth
      of the page height — unit — same file
- [x] An empty or blank text gives no layout (nothing drawn) — unit — same file
- [x] Settings round-trip through storage — unit — same file
- [x] Missing, malformed or throwing storage reads as off, "PREVIEW" — unit — same file

## Verification

1. Open *Compilation Lo Res*. Tab to Watermark and press Enter: the popover opens with focus on
   the checkbox. Press Space to turn it on, then Tab and type "PREVIEW".
2. The canvas shows no watermark.
3. Press ⌘E on page 1 (the dark poster): the PNG has the text diagonally across it, visible.
   Repeat on a light page.
4. Press PDF: the print preview shows the watermark on every page. The text stays vector
   (sharp when zoomed in the saved PDF).
5. Reload: the watermark is still on, with the same text. Turn it off and export: there's no
   watermark.

## Out of scope

- Images or logos as watermarks, and tiled or corner placements.
- Watermarking the My comics thumbnails, or images served to people the comic is shared with.

## Open questions

- [ ] None yet.

## Outcome

_Filled in when this goes to `done` or `abandoned`._
