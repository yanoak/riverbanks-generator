---
slug: 2026-10-07_act-three-boards
status: draft
started: 2026-10-07
finished:
issue:
---

# Act Three boards: Kinetic Adaptation Economy

## Context

The Act Three script is written and approved (plan `2026-10-07_act-three-script`): six A1 boards,
38 panels counting the insets, in `content/drafts/2026-10-07_act-three_v1.md` and RIVERBOOK ›
Edited Drafts › *Script: Kinetic Adaptation Economy* (`t.w8nhl8g6gcj`). Nothing is built yet.
The build follows `docs/comic-playbook.md` and the comic-production-process memory: house style
`b5f76d95…`, cast sheets checked and starred before any panel, every page looked at and fixed.

Existing cast that Act Three reuses: *the banker* (Daria), *the Summit speaker* (Nusa, in her
seventies), *Ismahan at 18*, *Sultan Nuh*, *the General* (Hamzah), *the Financier* (Faris),
*the flotel*. Act Three is the first story set in 2040 and the first outside Muara, the Ping and
the Meghna, so most of its people and places are new.

## Goal

A Riverbanks comic *Act Three: Kinetic Adaptation Economy* with six A1 boards that match the
approved script panel for panel, lettered and checked by eye, with consistent characters across
pages and against Act Two, ready for Yan's review.

## Approach

**Comic and bands.** `create_comic` in A1 board format, `set_comic_style` to the house style,
header "ACT THREE" / "KINETIC ADAPTATION ECONOMY" with each page's title below, as the middle acts
do. Merge cells per page from the script's grids; insets are free panels (`add_free_panel`), which
the editor already supports (move, resize, z-order).

**Cast first.** New sheets, each pinned in capitals where details drift:

| Member | Kind | Pinned details |
|---|---|---|
| Ismahan at 30 | character | between the 20 and 42 sheets: single braid, all black; cream tunic, ochre selendang; KAN lanyard and ⨁ badge on page 4 on |
| Nusa at 86 | character | same face and teal stole as *the Summit speaker*, frail, slower, leaning on an arm or a stick, eyes sharp |
| Hamzah at 44 | character | *the General*'s face; CLEAN-SHAVEN; black crew cut GREYING; green shirt ALWAYS tucked into the brown leather belt; no medals; a river-teal Riverkeeper's armband |
| the NMLA colonel | character | grey moustache, beret, olive fatigues |
| the MHDF commander | character | younger, reading glasses pushed up, mismatched camouflage |
| the kayaker | character | wiry woman, sun-faded shirt, paddle |
| the mechanic | character | athletic Punjabi woman, early 40s, modelled on Smita; grease to the elbows |
| the builder | character | older man, stub of pencil |
| the bar cat | character | CALICO, never grey or striped, so she is never mistaken for Taro |
| Daria's Manila office | place | high Makati office, rain on the glass, desk lamp, printouts; matches the Prologue dream panel PAO:1:7 |
| the Manila café | place | small café, parol lanterns, plate of bicho-bicho in rings and twists |
| KAN Academy | place | light timber hall at the KAE base, Wiang Kum Kam, Chiang Mai, beside temple ruins; the dashboard wall |
| the Myitsone confluence | place | the Mali and N'Mai meeting; the Myitsone Dam across the confluence; forested banks |
| the teahouse | place | neutral riverside village teahouse, low table |
| the Riverkeepers Bar | place | bamboo bar on stilts over the confluence, lights, bicycles racked three deep, kayaks beneath, FREQUENT FIXERS chalkboard |

Faris at 38 reuses *the Financier* ("around forty"). Daria reuses *the banker*.

**Diagrams.** The donut slides (2.1–2.3), the napkin callouts (1.4 A–C) and the Myitsone donut
inset (3.3) carry the act's theory, so they must read exactly. Generate them in the house style
first; if a ring, label or arrow comes out wrong after two tries, draw that panel with
`draw_panel_svg` instead. The model draws no text, so labels (PREMISE, PESA, PROSPER) go in as
caption balloons.

**Lettering.** The script runs 166–237 words a page, above the playbook's 80–120 for the middle
acts. That is deliberate: Act Three teaches the era in the register of the Prologue and Act One,
as the Epilogue does (200–280). Captions in Rubik italic capitals at ~0.7em a character; Nusa's
page-2 speech as captions in her voice.

Rejected: building the act inside the *Prologue and Act One* comic (PAO). The acts are separate
comics, and PAO's 6-column grids don't match the script's 4 × 4.

## Tasks

- [ ] Cast: write the new members above, generate each sheet, check it by eye, star it
- [ ] Create the comic, set style and bands, add six pages, merge cells per the script's grids
- [ ] Page 1: generate panels and the A–C and 1.5 insets; letter; check by eye; fix
- [ ] Page 2: generate (diagrams first); letter; check; fix
- [ ] Page 3: generate (dashboard and 3.3 inset); letter; check; fix
- [ ] Page 4: generate; letter; check; fix
- [ ] Page 5: generate; letter; check; fix
- [ ] Page 6: generate; letter; check; fix
- [ ] Consistency pass at full resolution: Daria (1, 2), Nusa (1, 2, 3), Ismahan (2–6), Hamzah (4–6), Faris (5–6), the bar cat
- [ ] Yan reviews in the editor; apply his notes
- [ ] Close out: sync the script's lettering from the built comic, update the canon file's production state, sync the story network (Daria, Nusa, the brothers in 2040), diary, commit

## Verification

1. Open `/comics/<id>?page=1` … `?page=6` in Chrome, loading each page fresh (not by in-app
   navigation), wait for the images and zoom on the page.
2. Each page's panels and insets match the script's ASCII grid; header reads ACT THREE /
   KINETIC ADAPTATION ECONOMY with the page title.
3. No balloon overflows, covers a face, or points its tail at the wrong speaker; no text or
   frame drawn into the art.
4. Page 1.1 sits beside PAO:1:7 as the same moment: same pose, same office.
5. The donut reads the same way everywhere: floor = inner ring (PREMISE), ceiling = outer ring
   pushed out (PESA), propeller = isometric spiral (PROSPER).
6. At full resolution: Hamzah clean-shaven with his shirt tucked in on every panel; the bar cat
   calico on every panel; Nusa recognisably the 2028 speaker on page 3.

## Out of scope

Print versions (`make_print_version`), which get their own pass with the redraw checks from
the memory; changes to Act One or Act Two boards.

## Open questions

- [ ] The new birth years make Hamzah 31 and Faris 25 in Act Two's 2027, but *the General* and
      *the Financier* sheets (and the Act Two boards) draw them in their mid-forties and around
      forty. Keep Act Two as drawn, or redraw it younger? For Act Three the existing sheets
      already fit.
- [ ] The ⨁ on tablets, badges and the bar sign: the model draws no text, so is a plain
      teal cross symbol enough, or should it go in as a small caption?

## Outcome

_Filled in when this goes to `done` or `abandoned`._
