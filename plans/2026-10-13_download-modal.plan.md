---
slug: 2026-10-13_download-modal
status: active
started: 2026-10-13
finished:
issue:
---

# Download modal: format, paper size and watermark in one place

## Context

Export is a toolbar dropdown (`2026-10-12_toolbar-menus`) holding "PNG — this page", "PDF —
every page", and the watermark checkbox and text (`2026-10-12_export-watermark`). The PDF is the
browser's print dialog over `.print-pages`. Its sheet is fixed by the first page's shape, A1 for
boards and US comic trim for comic pages (`EditorApp.svelte`, `sheet`).

In the Yan <> Sam call (2026-10-12, Granola), Sam asked for a **B5** print of the compilation
for 4–5 proof copies. He also asked for a **more elegant watermark**: something discreet that
still reads as official, because watermarked copies will be what most people see for the next
6–12 months. Yan (2026-10-13): "Have different download options with a modal when we click
download, we can move the watermark option into the modal too."

## Goal

Clicking Export opens a modal dialog. It offers PDF of every page or PNG of this page. For the
PDF, a paper size: Original (A1 boards / comic trim), B5, A4 or A5. Each page is scaled to fit
the sheet and centred. It also holds the watermark: on/off, text, and a style, with the new
discreet **Edge** style as the default and the old **Diagonal** one kept. Download then does
the export. The choices persist per browser.

## Approach

- **`src/lib/export/paper.ts`** (pure): the paper list, `sheetFor(paper, firstPageFormat)`
  giving the CSS size and its width in CSS px, and `fitPage(sheet, page)` giving the scale and
  offsets that fit a page inside a sheet, centred. B5 is ISO B5, 176 × 250 mm. A board
  (1000 × 1416) on it leaves under a millimetre top and bottom; a comic page (1000 × 1545)
  leaves thin side margins.
- **Watermark style:** `WatermarkSetting` gains `style: 'edge' | 'diagonal'`. A saved setting
  without a style reads as `edge`. Edge is one small line of widely tracked capitals, centred,
  running down the page's right margin, like a printer's slug. It stays out of the art and the
  footer band, and is still on every page. `watermarkLayout` takes the style.
- **`ExportDialog.svelte`**: a native modal `<dialog>`, like `ShareDialog`: focus is trapped,
  Esc closes it, and focus returns to the Export button. A form with radios for the format, a
  select for the paper (disabled for PNG), and the watermark fieldset. Submit downloads.
- **Toolbar:** the Export dropdown becomes a plain button that opens the dialog. It is still
  tinted while the watermark is on. ⌘E still exports a PNG of this page directly.
- **PDF flow:** the chosen paper drives `sheet`, the `@page` rule and the `.print-pages` layout.
  Download closes the dialog, waits a tick for the layout, then calls `window.print()`.
- **Rejected: keeping the dropdown and adding a paper submenu.** The menu already holds a text
  field. A fourth group of controls is a form, and a modal suits a form.
- **Rejected: generating the PDF ourselves (jsPDF and the like).** The print path keeps
  lettering and SVG maps as vectors, which `2026-10-12_web-edition-pdf` depends on.

## Tasks

- [x] `paper.ts` and the watermark style, with unit tests (30 pass)
- [x] `ExportDialog.svelte`, wired into the Toolbar and EditorApp; print layout fits and
      centres each page on the chosen sheet. Checked in Chrome on the dev server (`/local`):
      Export opens the modal focused on PDF; ↓ picks PNG and greys out paper; B5 + Download
      writes `@page { size: 176mm 250mm }`, fits the page and centres it, calls print,
      persists, and refocuses Export. Headless Chrome PDFs come out at 498.96 × 708.96 pt
      (B5). Edge and Diagonal watermarks checked by eye. Download no longer waits on the
      dialog's close event: Chrome holds that event back in a hidden tab, and that blocked the
      first build's download. e2e updated in `e2e/export.e2e.ts` but not run: the e2e config
      needs the local Supabase stack, which is still blocked by a port clash.
- [x] Deploy and check on the live site. Yan deployed (dpl_D6stQW3hQAYamAjPCaN2nGC7QW6H). On
      riverbanks-generator.vercel.app, with `window.print` stubbed: Export opens the modal focused
      on PDF, lists the four papers, and B5 + Download writes `@page { size: 176mm 250mm }`, sizes
      all 51 sheets 176 × 250 mm, calls print once, persists B5 and refocuses Export.
- [ ] B5 PDF of the compilation for Sam: Yan saves it from Chrome's print dialog

## UI mockups (ASCII)

```
Toolbar:  … │ T Text ▾ │                     ⬇ Export   Share     (tinted while watermark on)

Export → modal:
┌ Download “Compilation Lo Res” ─────────────── ✕ ┐
│ Format                                           │
│   (•) PDF — every page (47)                      │
│   ( ) PNG — this page (12)                       │
│                                                  │
│ Paper size   [ B5 · 176 × 250 mm          ▾ ]    │   (disabled for PNG)
│                                                  │
│ Watermark                                        │
│   [x] Add a watermark                            │
│   Text   [ PREVIEW                          ]    │   (disabled while off)
│   Style  (•) Edge — small, down the margin       │
│          ( ) Diagonal — across the page          │
│                                                  │
│                          [ Cancel ] [ Download ] │
└──────────────────────────────────────────────────┘

Edge watermark on a page:              Diagonal (unchanged):
┌──────────────────────┐               ┌──────────────────────┐
│ header               │               │               ⟋      │
│                     P│               │          ⟋PREVIEW    │
│        art          R│               │     ⟋                │
│                     E│               │                      │
│ footer               │               │ footer               │
└──────────────────────┘               └──────────────────────┘
```

## Keyboard interaction

1. **Tab order in the dialog:** ✕, the format radios (one tab stop, arrows move), paper,
   watermark checkbox, text, style radios (one tab stop), Cancel, Download.
2. **Shortcuts:** Enter in any field submits (Download). Esc closes without exporting. ⌘E still
   exports this page as PNG without opening the dialog.
3. **Focus:** opening the dialog focuses the checked format radio. Closing it, by Cancel, Esc,
   ✕ or Download, returns focus to the Export button. For PDF, the print dialog opens after
   the close.

## Test list (TDD)

- [x] `sheetFor('original', 'board')` is A1 (594 × 841 mm); for a comic page it is 6.625 × 10.25 in — unit — `src/lib/export/paper.test.ts`
- [x] `sheetFor('b5', …)` is 176 × 250 mm whatever the page format; A4 and A5 likewise — unit — `paper.test.ts`
- [x] `fitPage` fits a board in B5 by width and centres it vertically; a comic page fits by height and centres horizontally — unit — `paper.test.ts`
- [x] Export prefs: unknown or missing paper or format read as the defaults (PDF, original) — unit — `paper.test.ts`
- [x] Edge layout: rotated 90°, near the right edge, centred vertically, font no larger than a small fraction of the width, and shrinks for long text — unit — `src/lib/export/watermark.test.ts`
- [x] A saved setting without a style reads as `edge`; a bad style reads as `edge` — unit — `watermark.test.ts`
- [ ] Export → modal → PNG → Download downloads the page — e2e — `e2e/export.e2e.ts`
- [ ] The watermark checkbox in the modal puts a watermark on every print page, and it's still on after a reload — e2e — `e2e/export.e2e.ts`
- [ ] Choosing B5 writes `@page { size: 176mm 250mm }` — e2e — `e2e/export.e2e.ts`

## Verification

1. Open a comic and click Export (or Tab to it and press Enter). The modal opens with focus on
   the format radio.
2. ↓ moves to PNG and the paper select greys out. ↑ goes back to PDF.
3. Choose B5, tick Add a watermark, type DRAFT, keep Edge, and press Enter. The modal closes
   and Chrome's print dialog shows B5 pages, each fitted and centred, with DRAFT running small
   down the right margin.
4. Reopen the modal: B5, the watermark and DRAFT are still chosen. Esc closes it and focus is
   back on Export, which is tinted.
5. Choose Diagonal: the print preview shows the old diagonal watermark.
6. ⌘E on the canvas downloads a PNG of this page without opening the modal.

## Out of scope

- The riverbanks.lol reader site and its watermark: another thread.
- PNG resolution options.

## Open questions

- [ ] None.

## Outcome

_Filled in when this goes to `done` or `abandoned`._
