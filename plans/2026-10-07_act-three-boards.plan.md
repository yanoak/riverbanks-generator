---
slug: 2026-10-07_act-three-boards
status: in-progress
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
| Siratana | character | experienced Riverkeeper, 35, from Smita's material: lean, short dark hair, worn but well-kept bicycle; few words (replaces the kayaker, Yan 7 Oct) |
| Patika | character | newcomer Riverkeeper, early 20s, from Smita's material: WILD CURLY hair, gear still too clean |
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

- [x] Cast: 17 new members written, sheets generated, checked by eye and starred (7 Oct). The MHDF commander's first sheet was refused (PROHIBITED_CONTENT) until "rebel army" came out of his description
- [x] Create the comic (`739cacfd-7664-4fd0-8ed1-b72d43207d96`), set style and bands (header ACT THREE: KINETIC ADAPTATION ECONOMY, page title as subtitle), six pages, cells merged, inset free panels added on pages 1–3
- [x] Page 1: generate panels and the A–C and 1.5 insets; letter; check by eye; fix
- [x] Page 2: generate (diagrams first); letter; check; fix
- [x] Page 3: generate (dashboard and 3.3 inset); letter; check; fix
- [x] Page 4: generate; letter; check; fix
- [x] Page 5: generate; letter; check; fix
- [x] Page 6: generate; letter; check; fix
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

## Progress notes

- 7 Oct: page 1 generation stopped at the first call: Gemini prepaid credits depleted; Yan topped up and the build resumed.
- The Prologue's dream panel (PAO:1:7) draws the banker with black hair, while her sheet gave a silver-grey bob. PAO:1:7 is already printed, so Yan decided the sheet follows it: Daria now has straight shoulder-length black hair, and Act Three follows.
- All six pages generated, lettered and checked by eye (7 Oct). The three donut slides on page 2 and the Myitsone donut inset on page 3 are drawn as SVG: the generated versions of 2.1 and 2.3 did not read. Header changed to ACT THREE / KINETIC ADAPTATION ECONOMY · <page title>, because the full act name wrapped and clipped.
- Fixes along the way: 3.4 read "dashboard" as a car dashboard; 4.2 drew the teal cross as a grave-like post; 4.6 redrawn wider for Hamzah's lines, and his callback exchange moved to 4.7; 5.3 redrawn so Siratana reads as a woman (her description pinned, a new sheet drawn but not yet starred); 6.2 failed on a network drop and was retried.
- Drawn text to watch: the bar sign in 6.5 and the chalkboard in 5.7 are covered by balloons.
- Yan was editing live during the page 4–6 lettering; only my own new balloons were touched.

- Donut diagrams as props (Yan, 7 Oct): baselines rebuilt by code on Kate Raworth's Doughnut (CC BY-SA, DoughnutEconomics), then redrawn with Nano Banana Pro as isometric little worlds in comic style, compared on the "Kinetic Donut Canvas" artifact. Four cast props now hold the chosen images: the floor donut, the breathing donut, the donut tree (after the moodboard donut_tree.png) and the Myitsone donut. Images are in riverbanks/donut-props/ (untracked); SVG baselines and generator scripts in scripts/donut-props/.
- [x] Regenerate the diagram panels from the props: 1.4 callouts A–C, 2.1–2.3, 3.3 (7 Oct). 2.3's wide strip cropped the tall donut tree, so the strip is now plain cream and the tree sits in a borderless 3:2 free panel on its right half; callout C shows the whole image (fit).

## Out of scope

Print versions (`make_print_version`), which get their own pass with the redraw checks from
the memory; changes to Act One or Act Two boards.

## Open questions

- [x] The new birth years make Hamzah 31 and Faris 25 in Act Two's 2027, but *the General* and
      *the Financier* sheets (and the Act Two boards) draw them in their mid-forties and around
      forty. Keep Act Two as drawn, or redraw it younger? For Act Three the existing sheets
      already fit. **Settled (Yan, 7 Oct):** keep Act Two as drawn; they don't look too old there.
- [x] The ⨁ on tablets, badges and the bar sign: the model draws no text, so is a plain
      teal cross symbol enough, or should it go in as a small caption? **Settled (Yan, 7 Oct):** the drawn teal cross is enough.

## Outcome

_Filled in when this goes to `done` or `abandoned`._
