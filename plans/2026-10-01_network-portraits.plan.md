---
slug: 2026-10-01_network-portraits
status: active
started: 2026-10-01
finished:
issue:
---

# Portraits in the story network

## Context

`/network` (plan `2026-10-01_story-network`) draws people as coloured dots. The "Riverbanks house
style" already has an in-style character sheet for most of them in its cast (plan
`2026-10-01_style-cast`):

- Ismahan at 18, 20 and 42;
- Ya at 8, 20 and 33;
- Dew, the Sultan, the General, the Financier, Jalal and Shapla;
- Taro as a kitten and as a cat;
- the drone.

Yan asked for those portraits on the network.

The catch is access. `/network` is public, but styles, their cast and the `style-refs` bucket are
readable only by signed-in users. Opening styles to everyone was rejected: it would publish every
style, not just these portraits.

## Goal

- Each node with a portrait shows a circular face crop from its cast sheet, ringed in its story
  colour.
- The year scrubber picks the look for that year (Ismahan at 18 in 2028, at 42 in 2052).
- The detail panel shows the whole sheet.
- Portraits are public copies made at sync time, so the page needs no access to styles.

## Approach

**Canon.**

- `meta.styleProfileId` (optional) names the style whose cast the network uses.
- Each person may have `portraits: [{ cast, from, focus? }]`:
  - `cast` is a cast member's name in that style.
  - `from` is the year that look starts, or null for the default.
  - `focus` is an optional `{x, y, zoom}` for the face crop. The default is the front figure's
    head on a three-view sheet.
- Pure helper: `portraitFor(person, year)`. It returns the latest entry with `from <= year`; for
  all years, or a year before any `from`, it returns the first entry listed.

**Publishing.**

- A public bucket `network-portraits`: anyone reads, signed-in users write.
- `saveNetwork` resolves each portrait's cast member in the style:
  - It takes the member's starred portrait, or its first.
  - It copies the file from `style-refs` to `network-portraits/<network>/<cast id>`, overwriting
    any earlier copy.
  - It writes the public `url` into the saved document.
  - An unknown cast name fails the save with a clear message.
- This all runs as the signing-in user over MCP, who can read styles. A re-sync picks up a
  re-starred portrait.

**Rendering.**

- In the SVG, an `<image>` clipped to a circle, positioned by `focus`, with the story-colour ring.
  A node without a portrait keeps the dot.
- The detail panel shows the sheet image, and the person's other looks as small labelled chips.

## Tasks

- [x] `portraits` and `styleProfileId` in the schema; `portraitFor`; tests first
- [x] Migration: the `network-portraits` bucket and its policies
- [x] `saveNetwork` publishes portraits; integration test
- [x] Graph nodes and detail panel show portraits; e2e still green
- [ ] Canon maps people to the house-style cast; skill doc; re-sync production

## UI mockups (ASCII)

```
   ╭───╮                     ISMAHAN
  │ ◕‿◕ │  ← face crop,       ┌──────────────────────────┐
   ╰───╯     story-colour     │ [three-view sheet image] │
  Ismahan · 42 ring           └──────────────────────────┘
                              Looks: [at 18 · 2027] [at 20 · 2030] [at 42 · 2040]
```

States:

- **No portrait:** the coloured dot, as now.
- **Image fails to load:** the dot shows through. A coloured circle sits behind the image.

## Keyboard interaction

Unchanged: nodes stay focusable buttons. The "Looks" chips are informational, not controls.

## Test list (TDD)

- [x] `portraitFor` picks by year; uses the first entry for all years and for years before any
      `from`; returns null with no portraits — unit — `src/lib/network/canon.test.ts`
- [x] the schema accepts `portraits` and `styleProfileId`; it rejects a portrait without `cast` —
      unit — `src/lib/network/canon.test.ts`
- [x] `saveNetwork` copies the starred portrait to the public bucket and records its url; an unknown
      cast name fails; an anonymous user can read the copy — integration —
      `src/lib/network/store.int.test.ts`

## Verification

- On production after re-syncing:
  - Ismahan, Ya, Dew, Jalal, Shapla, Taro, the drone, the Sultan and the princes show faces;
  - moving the year from 2028 to 2052 changes Ismahan and Ya to their older looks;
  - the page works signed out.
