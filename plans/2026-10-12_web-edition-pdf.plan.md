---
slug: 2026-10-12_web-edition-pdf
status: done
started: 2026-10-12
finished: 2026-10-12
issue:
---

# Web edition: the whole series as one web-sized PDF

## Context

The series is six A1 comics. Many panels carry 4K print versions, so the editor's PDF button
(`window.print()` of every page) makes very large files, and it prints one comic at a time.
Yan upgraded the Supabase plan on 2026-10-12 and wants one web-friendly PDF, Prologue to
Epilogue, and confirmed the set and order:

1. Prologue and Act One (`81f32223`)
2. The Youngest Delegate (`5a2cdb4a`)
3. Act Three: Kinetic Adaptation Economy (`739cacfd`)
4. The Year It Snowed (`cfdcd0d6`)
5. Visa for a Hilsa (`d89a6f17`)
6. Epilogue: River of Seeds (`ccfbe106`)

KAN is left out. Yan made the empty target comic `e3368ea0-3470-4c52-9252-802268fc15b2`.

**Title boards added (2026-10-12, Yan):** the two posters open the book, and each act's divider
board from *Riverbanks: Title Boards* (`91f9a6f0`) sits before its act. The Prologue is page 1 of
*Prologue and Act One*, so Act One's divider goes after it; the Epilogue has none. That makes 46
pages. Two dividers still carry slide titles from before the acts were renamed. They are
relettered in the web edition only: Act Three's "YES / WE / K.A.N." becomes "KINETIC /
ADAPTATION / ECONOMY", and Act Four's "GROSS / DELICIOUSNESS / INDEX" becomes "THE YEAR / IT /
SNOWED". The title boards comic has no style, so `joinComics` lets a styleless comic join a
styled one.

**Credits board added (2026-10-12, Yan):** `RIVERBANKS CREDITS (A1).pdf`, copied from Downloads to
`content/boards/`, is the last page. It is one page with A1 proportions. The script renders it at
2000 px wide (sharper than the panels, for its small type) under an asset id taken from the
PDF's contents, so a changed PDF arrives as a new image. It is placed like the posters: a full-page image with no bands. That makes 47 pages.

**Re-runs (2026-10-12):** the second run failed with "new row violates row-level security
policy". Storage lets a comic's images be added, never replaced: there is no update policy on
comic folders. The script now lists the folder first and uploads only the missing images, so a
new `--quality` only reaches new images.

## Goal

Comic `e3368ea0` holds all 47 pages in that order, the credits last. Each page looks as it does in its own
comic, bands included, with every image replaced by a smaller copy. Its PDF export is a single
PDF of web size.

## Approach

- **`src/lib/export/web-edition.ts`** (tested):
  - `joinComics` concatenates the pages. Each page's bands are resolved against its source
    comic, with `{comic}`, `{page}` and `{pages}` filled in, and written out as page
    overrides, so "Act Two" and the page numbers read as before.
  - `imageNeeds` lists each image once, at the widest size it is drawn.
  - `targetWidth` sizes an image to 1.6 px per page unit (1600 px across a board) and never
    enlarges.
- **`scripts/web-edition.ts`** does the work:
  - It signs in with Yan's password and the publishable key, so RLS applies.
  - It opens each comic's Y.Doc and downloads the originals to
    `content/web-edition/original/`, which is gitignored.
  - It resizes them with ImageMagick into `web/`: JPEG at quality 80, or PNG where the image
    has transparency.
  - It uploads them into the target's folder under the **same asset ids**, then writes the
    pages with `mutateComic`. Panels size images by `naturalWidth × scale`, so a smaller bitmap
    under an unchanged `PanelImage` draws at the same place.
- **Rejected: the project's secret key.** Fetching it was blocked, and the user's own session
  is enough.
- **Rejected: rebuilding the comic over MCP**, tool call by tool call. That is hundreds of
  calls, and it would lose balloon fields the tools don't expose.

## Tasks

- [x] `joinComics`, `imageNeeds`, `targetWidth` with tests
- [x] `scripts/web-edition.ts` and `.sh` wrapper; dry run reaches sign-in
- [x] Yan runs it against `e3368ea0`, now titled *Compilation Lo Res* (code `CLR`): 39 pages and
      203 images, which shrank from 982 MB to 30 MB of JPEG
- [x] Check the pages against their sources: each chapter's first page (1, 6, 13, 19, 25, 34)
      and the last page (39). All images load, and the bands read as they do in the sources.
- [x] Page slices and `relineHtml` for the title boards, with tests
- [x] `imagePage` for the credits board, with a test
- [x] Yan re-runs with `--replace` (after the upload fixes); checked: 47 pages, the posters
      (1–2), the dividers in the source's colours and font, the retitles (17, 24) centred and
      inside the page, and the credits (47) edge to edge and legible
- [x] Export the PDF from the editor and note its size: 35.6 MB, 47 A1 pages

## Test list (TDD)

- Pages are kept in order, and the first source's style is carried over.
- Bands resolve per source comic, page overrides and hidden bands included.
- The source comics are not mutated.
- Comics in different styles are refused.
- Each image is listed once, at its widest drawn size, with its comic.
- Chosen pages keep their own comic's page numbers; a styleless comic joins a styled one; a
  missing page is refused.
- `relineHtml` swaps lines in paragraphs or across breaks, and refuses a line-count mismatch.
- `imagePage` makes a valid board, covered edge to edge by its image, with both bands off.
- Target width scales to the drawn size and never enlarges.

## Verification

- The target shows 39 pages. Spot-check each act's first and last page against its source:
  art, lettering, header and footer.
- No panel is missing its image.
- Export the PDF from the editor, then check its size and that it reads well on screen.

## Outcome

Done. *Compilation Lo Res* (`e3368ea0`) holds the 47-page web edition. Yan exported it from the
editor as `Compilation Lo Res — Riverbanks.pdf`: **35.6 MB**, 47 pages at A1 (594 × 841 mm).
A contact sheet of every page shows no blank panels, the dividers in place, both retitles, and
the credits last.

- **Images:** 205 images went from 982.7 MB of originals to 25.1 MB at 1.6 px per page unit,
  plus the 0.6 MB credits board. JPEG overhead and the vector lettering make up the rest of the
  PDF.
- **Poster order:** Yan swapped the posters in the editor afterwards, so the premiere poster
  opens the book. The script follows that order, so a re-run keeps it.
- **For next time:**
  - A smaller PDF needs new images, since a comic's images can't be replaced. Fill a fresh
    empty comic with a lower `--px-per-unit`, rather than re-running with `--replace`.
  - Any edit made in the compilation itself is lost on a re-run with `--replace`. Make
    lasting changes in the script (`SERIES`, `RETITLE`) or in the source comics.
