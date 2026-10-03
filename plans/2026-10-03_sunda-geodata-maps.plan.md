---
slug: 2026-10-03_sunda-geodata-maps
status: done
started: 2026-10-03
finished: 2026-10-03
issue:
---

# Sunda maps from real geodata (PAO:3:1, PAO:3:2)

## Context

Board 3 of *Prologue and Act One* ("The Sunda Summit") opens with two map panels:

- **PAO:3:1** — "20,000 years ago … Southeast Asia was largely one connected landmass called
  'Sunda'."
- **PAO:3:2** — "Sunda's largest river drained … peninsular Malaysia, Borneo, Sumatra and
  Thailand (continuing today's Chao Phraya) before emptying off the edge of the Sunda Shelf."

Both are generated images today, and read as generic. Yan has collected reference maps in
`riverbanks/moodboard/Sunda/` (Voris-style −120 m contour maps, the Wikipedia Sunda/Sahul and
river-system maps, Irwanto 2025's paleo-river map). The best of them are copyrighted — reference
only, never traced.

`draw_panel_svg` already puts an agent-written SVG into a panel (≤500 KB, no `<text>`).

## Goal

Both panels show maps built from public geodata — present coastline, the −120 m lowstand
coastline, and the drowned river systems derived from the elevation grid — drawn in the house
ligne-claire palette, with place names as caption balloons. 3:2 marks the flotel at 5°N 110°E.
A script re-makes both SVGs from scratch.

## Approach

- **Elevation:** ETOPO 2022 (1 arc-minute; NCEI THREDDS WCS — the ERDDAP mirror was unreachable)
  clipped to 88–128°E, 12°S–24°N. GEBCO is
  finer but 15″ is far beyond what a 495-unit panel shows.
- **Lowstand coast:** contour the grid at −120 m (the LGM lowstand Voris 2000 uses).
- **Present coast:** the same grid at 0 m, so both coastlines share one source and line up exactly.
  (Natural Earth was the alternative; mixing sources makes slivers along the shore.)
- **Rivers:** flow routing on the grid with everything below −120 m treated as sea — fill
  depressions, D8 directions, flow accumulation, keep cells above a threshold, vectorise. This is
  how the Voris and Irwanto maps were made; the Molengraaff (North Sunda) river should emerge
  rather than be drawn. Rejected: tracing the moodboard maps (copyright, and no better than the
  data); HydroRIVERS (present-day only — the drowned rivers are the point).
- **Styling:** paper cream sea, present land and exposed shelf in two land tones, teal rivers with
  width by flow, ink outlines. Simplify with mapshaper to stay well under 500 KB.
- Script: `scripts/sunda-maps.py`, run with `uv run --with …`; downloads cached outside git.

## Tasks

- [x] Script: download + clip ETOPO 2022, contours, flow routing, SVG writer
- [x] Render both maps, check against the moodboard (shape of shelf, Molengraaff course)
- [x] Check 5°N 110°E against the derived main channel; flag if the caption needs changing
- [x] Draw both into PAO:3:1 and PAO:3:2, add place-name caption balloons
- [x] Visual check of board 3 in the editor

## Verification

- Open PAO page 3 in the editor: both maps fill their panels edge to edge, no letterboxing.
- 3:1: Sumatra, Java, Borneo and the peninsula are joined by exposed shelf; Gulf of Thailand dry.
- 3:2: a main trunk river runs NE between peninsula and Borneo to the shelf edge; the flotel marker
  sits on or beside it at 5°N 110°E.
- Labels are balloons, legible, and do not cover the key features.

## Out of scope

- Restyling PAO:3:3 / 3:4 (the flotel art).
- An interactive or zoomable map.

## Open questions

- [ ] Caption 3:2 says "one of Pangaea's largest" — Pangaea is ~200 million years too early.
      Suggested: "one of the planet's largest". Yan to decide.
- [ ] Caption 3:2 (y 44–162) runs under the top of PAO:3:2 (y 125), so its last line is hidden.
      Predates the maps. Shorten it or move the panel row down.

## Outcome

Both panels are now data-built SVGs (`draw_panel_svg`), with labels as size-11 caption balloons.

- The flow routing reproduced the published reconstructions without tracing: the Gulf of Thailand
  is a lowstand lake, the Siam river drains it into the North Sunda (Molengraaff) trunk, and the
  Malacca and East Sunda systems come out separately. The trunk reaches the shelf edge at about
  109.4°E 5°N, about 60 km from the flotel's 5°N 110°E, so caption 3:3 holds.
- Two fixes were needed. ETOPO has pits deeper than −120 m in mid-shelf; counted as sea, they
  pulled the rivers into false mouths, so "sea" is now only water joined to the open ocean. And
  filled depressions are drawn as lakes only when large and on today's sea floor; highland pits and
  channel pools were noise that broke the rivers.
- The SVG goes through the MCP as text, so the size budget is set by what can be passed reliably,
  not by the 500 KB limit: whole-unit relative coordinates, ~20–30 KB a map.
- Output lands in `riverbanks/maps/` (gitignored with the rest of `riverbanks/`); the script is
  the source of truth.
