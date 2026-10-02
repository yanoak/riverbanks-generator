---
slug: 2026-10-02_youngest-delegate-a1
status: done
started: 2026-10-02
finished: 2026-10-02
issue:
---

# *The Youngest Delegate* on A1 boards

*Written after the fact, on the same day. The work ran as a conversation with Yan, scene by
scene, and this records it so the commits have a plan to point at.*

## Context

- The four-page *Youngest Delegate* comic (`902742e1…`) was an art-style test on the old 3 × 4
  portrait page.
- The [A1 board format](2026-10-02_a1-board-format.plan.md) shipped that morning: a 4 × 4 grid in a
  square, between a header and a footer.
- Yan decided that each Edited Drafts scene becomes one A1 board, and that the story sits in
  **Act Two, "Taming Currents"**.
- Sam's slides ([canon](../content/canon/riverbanks-canon.md)) fix the look of the Sunda Summit's
  flotel.

## Goal

A seven-board comic of *The Youngest Delegate*:

- one board per scene;
- consistent characters, sets and lettering, checked by eye;
- its script in the *Script: The Youngest Delegate* tab, matching the built comic.

## Approach

- **Outline first.** Seven pages and 38 panels, without dialogue, discussed with Yan before any
  generation. Dialogue was added once Yan approved the layout.
  - **Pages kept sparse on purpose:** page 3, which teaches PREMISE, PROSPER, PESA and KAN in
    captions, and page 7, the Accord splash.
  - **Page 5 is split:** the General's story on top, the Financier's below.
  - **The Accord is signed outdoors,** on the riverbank.
- **Recurring sets are cast "places".**
  - *The flotel* was drawn from Sam's slide 6. The live Slides image URL was passed as a reference;
    base64 was too large.
  - *The throne room of Mua* is used on pages 1, 4 and 6. Its first sheet had garbled text and was
    redrawn.
- **Lettering:**
  - Sizes come from character widths. Captions are Rubik italic capitals, at about 0.7em per
    character.
  - Balloons cross panel borders, and once go into the header band, where a small panel's faces
    fill the frame.
- **Considered and rejected:** keeping the four-page test and extending it. Its 3 × 4 portrait
  pages don't fit the exhibition's A1 boards, and it predates the cast sheets.

## Tasks

- [x] Outline the 7 boards in the 4 × 4 grid (the script tab's v2)
- [x] Add dialogue and captions (v2)
- [x] Add the flotel and the throne room of Mua to the house style's cast
- [x] Build pages 1–7, then generate, letter and check each one in Chrome
- [x] Redraw what the checks and Yan's review caught:
  - 2.4 had no room for the line; 5.2's soldier was in red; 6.4 and 6.6 had off-model princes;
  - 5.5's physical button became a touch-screen button;
  - 4.4 and 4.5 became closer shots, matching Yan's manual zoom;
  - 4.3's heads now sit below the caption.
- [x] Character consistency, pinned in the cast descriptions with new sheets:
  - Hamzah is clean-shaven, with his shirt tucked in and belted;
  - the Sultan always has his beard;
  - all of the General's panels were checked at full resolution.
- [x] Name the princes: Tengku Hamzah (the General) and Tengku Faris (the Financier)
- [x] Sync the script tab with the built comic, including Yan's lettering edits, and fix typos

## Verification

Passed on 2026-10-02:

- [x] Every page was screenshotted in the editor: no text overflow, no balloon over a face, every tail on its
  speaker. This was re-checked after each redraw, including Yan's live lettering edits.
- [x] The General's panels (1.2, 1.4, 4.3, 4.4, 5.3, 6.1, 6.4, 6.6 and 7.1) were downloaded at full
  resolution: clean-shaven, black hair, shirt tucked in.
- [x] The flotel matches Sam's slide 6: an arch between two towers, cottages, domed pavilions,
  water pools and turbines.
- [x] The doc tab's v2 section was checked against the local draft before each overwrite, so no
  one's edits were lost.

## Out of scope

- *The Year It Snowed* and *Visa for a Hilsa* rebuilds
  ([Sam's feedback plan](2026-10-02_sam-feedback-snow-hilsa.plan.md)).
- Deleting the four-page test comic.

## Open questions

- [ ] Yan changed 2.6's caption from "She never caught the woman's name" to "The teenage
  princess made many lifelong friendships that day." Edited Drafts says Ismahan never catches
  Dew's name, and Act Four's shrine scene relies on her recognising Dew without one. The caption
  doesn't contradict that, but the beat is no longer on the page.

## Outcome

Built and checked in one day: comic `5a2cdb4a-c822-4fb3-bb5e-5f7d2656a420` (code `YD`).

- **Gemini prepaid credits** ran out once, before page 7, and Yan topped them up.
- **Process lessons,** now in the comic-production memory:
  - pin every recurring look in the cast description;
  - make recurring sets cast places;
  - change only images while Yan edits lettering live.
