---
slug: 2026-10-02_title-boards
status: active
started: 2026-10-02
finished:
issue:
---

# Title boards: page colours, title lettering, and the seven boards as a comic

## Context

Sam's title boards live in Google Slides ("RIVERBANKS Paneling"). Yan exported them as
`~/Downloads/RIVERBANKS Paneling - Google Slides.pdf`: seven A1 boards.

- **Two posters** with a darkened whirlpool behind white and yellow lettering:
  - "If we had run the rivers the way you ran your banks, your species wouldn't even exist";
  - "Seapunk Studios presents the BKKCAW 2026 premiere of River Banks…".
- **Five act dividers**, each on a flat colour, with "ACT ONE" to "ACT FIVE" at the top, a big
  centred title in Rubik Microbe, and the new footer.

The Slides export misaligns the lettering. Each colour run is a separate text box, so lines and
words drift.

Yan asked on 2026-10-02 to make them in Riverbanks as a new comic. Three things are missing:

- Pages are always white.
- There is no plain display lettering: an sfx has an outline and a tilt.
- Lettering can't mix two colours.

The whirlpool in the PDF is only 848 × 1264 px, about 35 dpi at A1. Yan didn't have a larger
copy, so it is upscaled with the existing print-version path.

## Goal

A comic, *Riverbanks: Title Boards*, holds the seven boards and matches the PDF, without its
misalignment.

- **Every page:** an A1 board.
- **Act dividers:** a background colour per page. The header shows "ACT n", and the title is
  centred lettering. The footer is in black on the light yellow and white on the dark colours.
- **Posters:** the whirlpool fills the page behind the lettering, the bands are switched off,
  and the yellow words are an accent colour within one block of lettering.

## Approach

- **Page background:** an optional `Page.background` (CSS colour), drawn edge to edge under the
  panels and bands.
  - It is a plain key on the page's Y.Map, which `diffPage` already patches.
  - `bandInk(page)` picks the band text colour: near-black on a light background, white on a
    dark one, by relative luminance.
  - **Editing:** a colour input in the Inspector's Page section. Over MCP, `set_page` with
    `background`.
  - **Rejected: a full-page free panel with a fill.** Free panels draw above the bands, so it
    would hide them.
- **Title lettering:** a new balloon type, `title`. It has no shape, outline, tilt or tail. Its
  letters are the balloon's `fill` colour, and lines wrap.
  - **Default lettering:** Rubik Microbe, in capitals. The style typography gains a `title`
    entry, and stored styles without one fall back to it.
  - **Accent:** words marked `==like this==` over MCP become `<mark>`, via TipTap's Highlight
    extension in the shared schema, and are drawn in the balloon's `stroke` colour. A title has
    no outline, so `stroke` is free, and it saves adding a field.
  - **Rejected: one balloon per colour run.** That is exactly what misaligns in Slides.
- **Posters' background:** a full-page free panel holding the whirlpool, beneath the lettering,
  with both bands off.
  - **The image:** extracted from the PDF with `pdfimages` and uploaded.
  - **Print quality:** a print version made with `make_print_version`.

## Tasks

- [ ] Plan
- [ ] Page background: model, Y.Doc, ink, PageView, Inspector, editor, MCP `set_page`; tests
- [ ] Title lettering: type, typography, shape, render, accent (Highlight and `==`), Inspector,
      MCP; tests
- [ ] Build the comic over MCP and check each board against the PDF
- [ ] Verify (below), then `done`

## UI mockups (ASCII)

Inspector, nothing selected:

```
PAGE 4
…
Format      A1 board (594 × 841 mm)
Background  [■ #6b7866] [×]     ← colour input; × returns the page to white
Header      [x]
Footer      [x]
```

Inspector, a title selected: the type menu gains **Title**. Below it are **Colour** (fill) and
**Accent** (stroke) colour inputs, and the usual font size.

## Keyboard interaction

- The background colour input and its clear button follow Format in tab order. A change is one
  undo step.
- Title lettering is edited in place, like any balloon. ⌘⇧H marks the selection as accent
  (the Highlight extension's default).
- No new canvas shortcuts. Titles are added from the type menu or over MCP.

## Test list (TDD)

- [ ] `bandInk` is dark on white and the yellow, and white on the five dark colours. Layer:
      unit, `src/lib/model/page.test.ts`
- [ ] `Page.background` survives `comicToYDoc` → `projectComic`, and `applyComic` writes and
      clears it. Layer: unit, `ydoc.test.ts`
- [ ] The `setPage` op sets and clears a background and rejects a non-colour. Layer: unit,
      `comic-ops.test.ts`
- [ ] `markdownToHtml` turns `==x==` into `<mark>x</mark>`, and `htmlToPlain` turns it back.
      Layer: unit, `src/lib/ops/text.test.ts`
- [ ] `<mark>` survives the shared schema (`htmlToFragment` → `fragmentToHtml`). Layer: unit,
      `src/lib/model/text.test.ts`
- [ ] `createBalloon(page, 'title')` has no tail, white fill and Microbe lettering. Layer: unit,
      `balloons.test.ts`
- [ ] A title has no shape paths. Layer: unit, `geometry/balloon.test.ts`
- [ ] Stored typography without `title` resolves to the default. Layer: unit, `typography.test.ts`

## Verification

1. The new comic in the editor, side by side with the PDF: each of the seven boards matches,
   with lines centred and accent words in yellow.
2. The act dividers' footers are black on Act One and white on the others.
3. Export a PNG of one act divider and one poster. The background and lettering are in them.
4. In the Inspector, change a page's background and undo it. Retype a title's accent word in
   place and check it keeps its colour.

## Out of scope

- Background images as a page property. A full-page free panel does it.
- Gradients or textures on page backgrounds.
- Accent styles other than colour.

## Outcome

_Filled in when this goes to `done` or `abandoned`._
