---
slug: 2026-10-02_prologue-act-one-boards
status: done
started: 2026-10-02
finished: 2026-10-02
issue:
---

# Prologue and Act One on A1 boards, from Sam's slides

## Context

- Sam's "RIVERBANKS Paneling" deck (`15NZ60aWo9e7i9ZCYXLlMVJrA6JRxp-RArsLSs3IYd0c`) drafts the
  Prologue (slide 3) and Act One (slides 5–8). Per the [canon](../content/canon/riverbanks-canon.md),
  **the text is final; the graphics may change.**
- Sam's drafts mix art styles (painterly, infographic, generic AI). The exhibition's other comics
  (*The Youngest Delegate*, *The Year It Snowed*) are now ligne-claire A1 boards in the
  "Riverbanks house style" with a cast, built by [the playbook](../docs/comic-playbook.md).
- Yan, 2026-10-02: redo slides 3, 5, 6, 7 and 8 with the generator.

## Goal

One comic, *Prologue and Act One*, of five A1 boards — one per slide — in the house style. Every
word of Sam's slide text is lettered verbatim, every page is checked by eye, and recurring faces
and sets come from the style's cast.

## Approach

- **Keep Sam's paneling, redraw the art.** The slides are already paneled; the boards follow their
  layout and reading order so Sam recognises them. Text goes in balloons and captions, never in the
  images (so the maps and the flotel's district labels become lettered labels).
- **A 6-column grid where Sam uses thirds** (boards 1, 2 and 4). The default 4 × 4 grid cannot
  make three equal panels a row; 4 rows × 6 columns can (2 cells a third, 3 a half).
- **Headers:** board 1 is "PROLOGUE / SIX DISASTERS, ONE DREAM"; board 2 "ACT ONE / LIFE, THE
  PLURIVERSE, AND EVERYTHING"; boards 3–5 carry the slide titles over "ACT ONE: LIFE, THE
  PLURIVERSE, AND EVERYTHING".
- **New cast:** *the banker* (woman, unnamed, mid-sixties, grizzled: grey hair) and *the Summit
  speaker* (the elder who opens the Summit on slide 5). The flotel already exists.
- **Through-line:** young Ismahan (18) and Dew are both at the 2028 Summit in canon, so they appear
  among the delegates on boards 2 and 3, setting up *The Youngest Delegate* and *The Year It
  Snowed*.
- **Slide 8 is a river that converges** — four tributaries (the Four Teal Truths) merge into three
  (institutions), two (systems) and one (purpose), top to bottom, as Sam drew it. One full-board
  image; the text sits in tinted boxes on the branches.
- **Slide 8's PROSPER box repeats PESA's text** on the slide (a known placeholder, canon open
  question 2). The board uses PROSPER's proper name and slide 7's description instead.
- **Considered and rejected:** generating each slide as a single image with text (the model garbles
  text, and the house style forbids it); a 4 × 4 grid with uneven 1-1-2 rows (breaks Sam's equal
  thirds).

### Boards (6-column grid: cells r·6+c; 4 × 4 grid: r·4+c)

```
B1 PROLOGUE (6 cols)          B2 ACT ONE (6 cols)          B3 SUNDA SUMMIT (4×4)
+------+------+------+        +--------------------+       +---------+---------+
|HURRI-|EARTH-|WIND- |        | 1 hall, from behind|       |1 Sunda  |2 drowned|
|CANE  |QUAKE |STORM |        +--------------------+       |  map    | river   |
+------+------+------+        | 2 speaker + cosmos |       +---------+---------+
|MONSO-|TYPH- |WILD- |        +------+------+------+       | 3 flotel aerial,  |
|ON    |OON   |FIRES |        |3cells|4 net-|5 arc |       |   labelled        |
+------+------+------+        |      |works |      |       |                   |
| 7 the banker's dream |      +------+------+------+       +-------------------+
|   (rows 2–3)         |      | 6 the declaration  |       | 4 the delegates   |
+----------------------+      +--------------------+       +-------------------+

B4 COVENANT (6 cols)          B5 PLURIVERSE 101 (4×4, one panel)
+--------------------+        +--------------------+
| 1 ratification     |        |  I  II   III  IV   |  four truths on four tributaries
+--------------------+        |   PESA   PREMISE   |
| 2 the Great        |        |      PROSPER       |  three institutions
|   Pluriversalization|       |  TRUST      KAN    |  two systems
|   (rows 1–2)       |        |  ONE PURPOSE …     |  one purpose, the single river
+------+------+------+        |                    |
|PREMI-|PROSP-|PESA  |        |                    |
|SE    |ER    |      |        +--------------------+
+------+------+------+
```

## Tasks

- [x] Add *the banker* and *the Summit speaker* to the house style's cast; check and star sheets
- [x] Create the comic, five boards, grids, merges and headers
- [x] Board 1: generate, letter, check
- [x] Board 2: generate, letter, check
- [x] Board 3: generate, letter, check
- [x] Board 4: generate, letter, check
- [x] Board 5: generate, letter, check
- [x] Canon file: production state, the PROSPER substitution; diary entry

## Verification

- [x] Every board screenshotted in the editor (`/comics/<id>?page=N`): no text overflow, no balloon
  over a face, every tail on its speaker, no text drawn into the art.
- [x] Every line of slide 3 and 5–8 text appears on the boards, verbatim: lettered from the
  `gws slides presentations get` dump and checked element by element, slide by slide. Two slips
  fixed (see Outcome).
- [x] The banker and the speaker look the same in each panel they're in; the flotel matches its
  cast sheet.

## Out of scope

- Slides 1, 2 and 4 (epigraph, title card, Act One title card).
- Correcting Sam's wording (e.g. "COMMUNITY REPRESENTATIVE") — flagged to Yan, not changed.

## Open questions

- [ ] Should the banker get a name or a recurring role later (Epilogue)?

## Outcome

Built 2026-10-02 as `PAO` (`81f32223-022c-4e29-b0d9-b288632326c8`): 5 boards, 23 panels.

- **Kept:** Sam's paneling and reading order on every board, and his text, lettered rather than
  drawn. Sam's flotel labels became small lettered captions.
- **Changed from the plan:**
  - Headers: a long title and subtitle wrap and clip in the 83-unit band. Board 3 got a 125-unit
    band, which fits "THE SUNDA SUMMIT / OVER THE MOUTH OF THE DROWNED RIVER". A taller band
    enlarges the type, though, so boards 4–5 kept the normal band with the subtitle "ACT ONE".
  - Board 4's footer is off, so the three institution boxes can hang below their panels, as
    in Sam's slide.
  - Board 5: the river converges 4 → 2 → 1 rather than 4 → 3 → 2 → 1; the boxes carry the tiers.
- **Text fixes, flagged to Yan:** on board 5, "improvingecosystem" became "improving ecosystem",
  and "opting-intos the Pluriversal Covenant" gained an "of". Left as Sam wrote them: "COMMUNITY
  REPRESENTATIVE" (slide 6) and the trailing comma in PESA's box (slide 7).
- **Redraws:** the dream panel (timed out, no image) and the board 5 map (too plain). The hurricane
  panel's drawn border was zoomed off.
