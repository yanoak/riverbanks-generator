---
slug: 2026-10-01_page-export
status: draft
started: 2026-10-01
finished:
issue:
---

# Page export: one server renderer for PNG, ZIP and MCP

## Context

On 2026-10-01, putting sample pages of three drafted comics into the RIVERBOOK doc exposed three
problems:

- **The PNG export hangs.** `exportPng` in `src/lib/components/EditorApp.svelte` calls `pageToPng`,
  which uses `html-to-image` (`src/lib/export/png.ts`). It sticks on "Rendering PNG…" after the
  first export or two in a session, with every page image loaded. No error is shown.
- **No multi-page export.** Exporting 12 pages meant 12 navigate-and-click rounds, and Chrome
  blocks a site's second and later automatic downloads until the user allows them.
- **No MCP export.** An agent can build a comic over MCP but can't get the rendered page back. The
  only way was driving Chrome and screen-capturing the editor.

Also raised: the toolbar's keyboard shortcuts only show in tooltips, and Full page, PDF and Share
have no shortcut.

## Goal

A page, or a whole comic, can be exported as a PNG or ZIP from the toolbar and over MCP. All three
come from one server-side renderer that draws exactly what the editor shows. Toolbar buttons show
their shortcut keys.

## Approach

**Render on the server with headless Chromium, from the same `PageView` the editor uses.**

- A new route `/render/[comicId]/[page]` renders `PageView` alone at 1 unit = 1 px, the way the
  offscreen export stage does now. It authenticates with a short-lived signed token, so Chromium
  needs no session cookie.
- `GET /api/comics/[id]/export?page=N&format=png|zip&scale=1|2`:
  - launches `playwright-core` with `@sparticuz/chromium`;
  - waits for fonts and images, then screenshots the page element;
  - for a ZIP, streams the files with `client-zip`.
- Vercel functions can be up to 5 GB now and default to 300 s, so Chromium fits.
- Rejected routes:
  - **Hand-written SVG and resvg.** Balloon text is HTML laid out by the browser, so we'd have to
    reimplement line breaking and it would drift from the editor.
  - **Keep `html-to-image` and debug the hang.** It's still client-only, so MCP couldn't use it.
- The toolbar's PNG button and ⌘E call the endpoint. A new "ZIP" button exports every page.
  `html-to-image` is removed once the endpoint ships.

**MCP**

- `export_page_image` (comicId, page, scale) returns the PNG as an image content block, so an agent
  can look at its own page. This replaces the screenshot loop in the comic-production process.
- `export_comic` returns a short-lived download URL for the ZIP.

**Shortcut labels**

- The shortcut key is shown on each toolbar button as a small grey suffix, e.g. "Speech S" and
  "PNG ⌘E".
- New shortcuts: F for Full page, ⌘P for PDF/print (overriding the browser's print, which already
  prints this way), ⇧⌘E for ZIP.

## Tasks

- [ ] `/render/[comicId]/[page]` route plus a signed render token (sign and verify, with tests)
- [ ] Export endpoint: PNG for one page, ZIP for all; Chromium on Vercel; e2e against local
- [ ] Toolbar: PNG and ⌘E via the endpoint; ZIP button and ⇧⌘E; remove `html-to-image`
- [ ] MCP `export_page_image` and `export_comic`
- [ ] Shortcut suffixes on toolbar buttons; F and ⌘P
- [ ] Update the comic-production memory and process: verify pages with `export_page_image`

## UI mockups (ASCII)

```
… Speech S  Thought T  Whisper W  Shout K  Caption C  SFX X │ ⤓ PNG ⌘E  ⤓ ZIP ⇧⌘E  PDF ⌘P  Share │ Saved
```

States:

- **Exporting:** the button shows a spinner, and the status says "Rendering 3 of 12…".
- **Error:** the status says "Export failed: …", as now.

## Keyboard interaction

1. **Tab order:** unchanged. ZIP sits after PNG.
2. **Shortcuts:**
   - ⌘E: PNG of this page.
   - ⇧⌘E: ZIP of all pages.
   - ⌘P: PDF.
   - F: Full page.
   - The existing S, T, W, K, C, X, M, ⇧M and P are unchanged and now visible on the buttons.
3. **Focus:** stays where it was. The status line is `role="status"`, so screen readers announce
   progress.

## Test list (TDD)

- [ ] render token: sign/verify round trip; rejects an expired, tampered or wrong-comic token —
      unit — `src/lib/server/export/token.test.ts`
- [ ] export filename slugs: page and zip names — unit — `src/lib/export/png.test.ts`
- [ ] endpoint refuses users without comic access (RLS) — integration —
      `src/routes/api/comics/[id]/export/export.test.ts`
- [ ] the rendered page matches the editor's offscreen render within a pixel tolerance — e2e —
      `e2e/export.spec.ts`
- [ ] ⇧⌘E downloads a ZIP with N files — e2e — `e2e/export.spec.ts`

## Verification

- Export *Visa for a Hilsa* as a ZIP from the toolbar and check:
  - there are 4 PNGs;
  - the lettering is in the right font;
  - the result matches the editor.
- Over MCP, call `export_page_image` for one page and confirm the image comes back inline.
- Export 12 pages in a row from three comics with no hang and no Chrome download prompt.
