---
slug: 2026-10-02_lettering-room
status: active
started: 2026-10-02
finished:
issue:
---

# Generated panels leave room for lettering, without blank areas

## Context

Yan saw two *Visa for a Hilsa* panels on 2026-10-02 whose images have a **blank cream band**
across the top: panel 2.3 (the drone over the river) and panel 2.5 (the drone projecting Ya). The
art should have carried the scene up to the edge, river and sky, with the balloons sitting on it.

The cause is in the prompts:

- **Panel prompts:** every panel prompt in the 2026-10-01 builds ended *"Leave calm, empty
  space at the top of the frame for speech balloons"* (there is a record in the session
  transcripts). Image models draw what they are told, and "empty space" came back as an empty
  area.
- **Palette:** the house style lists *warm paper cream #F3ECDC* among its colours, so the model
  painted that area as bare paper.
- **Lettering:** the app's own prompt (`src/lib/generation/prompt.ts`) adds only
  `NO_LETTERING`. That works: there is no text in either image. But nothing in it asks for room
  for the text, so whoever writes the panel prompt adds that line by hand, and the wording drifts.

## Goal

- **Every panel generation** says where the lettering will go, and asks for that part of the
  picture to be quiet, low-detail scenery that runs to the edges. It never asks for an empty
  area, band or box.
- **Where:** the app works out *where* from the balloons already on the panel. With none, it
  says the top.
- **Prompts:** panel prompts written by people and agents only need to describe the scene.

## Approach

**Where the room goes.**

- `letteringRoom(box, balloons)` takes the balloons that overlap the panel and finds the centre
  of their overlap area, weighted by size.
- It names that centre as one of `top`, `upper-left`, `upper-right`, `left`, `right`,
  `bottom`, `lower-left`, `lower-right` or `centre-top`. If the panel has no balloons, it gives
  `top`.
- The result is a fixed key, not free text, so the API route can validate it.

**What the prompt says.** `composePrompt` takes an optional `room`. When it is given, the
prompt adds this right after `NO_LETTERING`:

> Lettering will sit over the {where} of the frame, so keep that part quiet and low in detail:
> the scene's own sky, water, wall or ground, continuing right to the edges, with no faces or
> key action there. Never leave a blank or empty area, a plain band, a box or a frame for it:
> the picture fills the whole panel, and backgrounds are part of the scene, never bare paper.

- **Panel drafts** always pass `room`.
- **Print versions** don't: they redraw an image that is already right.
- **Cast portraits** don't either: they are not panels.

**Callers.**

- The editor's Generate (`GeneratePanel.svelte`, through `/api/generate`) and MCP's
  `generate_panel_image` both have the page, so each computes `room` from the page's balloons.
- `GenerateInput.room` carries it to the composer, and the API route checks it against the
  known keys.

**The style text.** The *Riverbanks house style* profile is data in production. It can't be
edited over MCP, because there is no tool for updating a style. Its "palette" line is fine once
the room sentence says *"never bare paper"*. If more is wanted, Yan can add *"backgrounds are
the scene, never bare paper"* to its Avoid field on its style page.

**Process.** My memory of the comic production process changes: panel prompts no longer ask for
"empty space". The app supplies the room.

## Tasks

- [ ] Plan
- [ ] `letteringRoom`, the `room` prompt sentence, and the callers (UI, API, MCP); tests
- [ ] Test generation: redraw panels 2.3 and 2.5 into a **scratch** comic (not the real one)
      and compare the results
- [ ] Memory and diary; then `done`

## Test list (TDD)

- [ ] `letteringRoom` behaviour. Layer: unit, `src/lib/generation/room.test.ts`
  - with no balloons it gives `top`;
  - one balloon in the panel's upper left gives `upper-left`;
  - balloons spread along the top give `top`;
  - a balloon that doesn't overlap the panel is ignored.
- [ ] `composePrompt` placement. Layer: unit, `src/lib/generation/prompt.test.ts`
  - with `room: 'upper-left'`, it puts the room sentence ("upper left") right after
    `NO_LETTERING`;
  - without `room`, it adds nothing;
  - the sentence never contains the words "empty space".
- [ ] `generatePanelImage` passes `room` through, and a print version leaves it out. Layer:
      unit, `src/lib/server/generation/*.test.ts` (fake provider)
- [ ] The API route refuses an unknown `room`. Layer: unit

## Verification

1. **The comparison.** In a scratch comic using the house style, a panel shaped like 2.3
   (cells 6–7 of a 3 × 4 portrait page) is generated twice:
   - (a) with the old wording, *"Leave calm, empty space at the top…"*;
   - (b) with the new room sentence.

   (b) should fill the top with river and sky, and (a) is expected to show the blank band.
   Then do the same for 2.5.
2. Yan judges the images. The real comic is not touched.

## Out of scope

- **Regenerating the real *Visa for a Hilsa* panels.** Yan asked for a test only.
- **Editing the production style profile.** See Approach.

## Outcome

_Filled in when this goes to `done` or `abandoned`._
