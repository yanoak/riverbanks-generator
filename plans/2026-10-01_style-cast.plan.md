---
slug: 2026-10-01_style-cast
status: active
started: 2026-10-01
finished:
issue:
---

# Style cast: character and prop sheets, applied per panel

## Context

On 2026-10-01 we drafted three four-page comics: *The Youngest Delegate*, *The Year It Snowed* and
*Visa for a Hilsa*. They have 53 panels, generated with gemini-pro and no style profile. Characters
were held together only by text descriptions pasted into every prompt. Across panels:

- Ismahan's hair went from grey to dark.
- Ya's red jacket turned teal.
- The drone and Jalal's boat changed design from panel to panel.

Yan wants:

- consistent **characters and props** (boats, drones), built inside the style settings;
- each one with its own **portrait and description**;
- only the ones a panel needs applied to its prompt.

What exists today (plan `2026-09-29_style-profiles-generation`):

- `style_refs` rows have a `role` (`style` | `character` | `object`) and a free `label`. The editor
  is a flat grid of images with a role select and a name box (`src/routes/(app)/styles/[id]/+page.svelte`).
- `selectRefs` (`src/lib/generation/refs.ts`) sends **every** reference with **every** generation,
  in sort order, until the model's caps run out. Gemini caps characters at 4 (Pro) or 5 (Flash),
  and the rest are silently dropped (`dropped` count only).
- `composePrompt` (`src/lib/generation/prompt.ts`) names each attached image ("Image 3: the
  character "Mae"") but has nowhere to put a written description.

So a cast of ten characters can't work today. The wrong four get attached, and a drone is sent to
a throne-room panel.

## Goal

A style profile has a **Cast**: named characters, props and places, each with:

- a short written description,
- optional aliases,
- one or more portrait images.

These can be uploaded, or generated in the profile's own style from the description.

When a panel is generated, the cast members its prompt mentions are attached automatically: their
portraits as references, their descriptions in the prompt. The user sees and can override which
ones are attached in the Inspector. Style references still go with every panel.

## Approach

**A cast member is a first-class row, and its portraits are refs that point at it.**

- New table `style_cast`:
  - `id`, `profile_id`, `kind` (`character` | `object` | `place`), `name`
  - `aliases text[]`, `description text`, `sort`
  - RLS mirroring `style_refs`: everyone reads, the creator writes.
- `style_refs` gains a nullable `cast_id`. A ref with no `cast_id` is a style reference. A ref with
  a `cast_id` is that member's portrait.
- The old `role` / `label` columns stay readable for one release. The migration turns every
  labelled `character` or `object` ref into a cast member with that name and links the ref to it.

**Matching is deterministic, not an LLM call.**

- `matchCast(prompt, cast)` is a pure function. It matches each member's name and aliases against
  the prompt, case-insensitively, on word boundaries.
  - Matching the longest names first means "Grandma Dew" beats "Dew".
- The panel's own `cast` field (optional ids, in the Y.Doc like `prompt`) overrides the
  auto-detection when the user has edited the chips.
  - The field is `undefined` until the user edits the chips. Until then, auto-detection applies.
- Rejected: asking an LLM which characters are in the panel. It costs money, it is slow, and its
  results can't be predicted, whereas the generations log is meant to explain every image.

**Composing.**

- `selectRefs` becomes two passes:
  1. style refs, capped as now;
  2. one portrait for each matched member, in prompt order, within the character and object caps.
     Members over the cap still get their description.
- `composePrompt` gains a "Cast in this panel" block. Each member gets one line:

  ```
  - Ismahan at 42 (Image 4): elegant Malay woman, long dark braid streaked grey, cream linen, ochre selendang.
  ```

  Descriptions go in even when there's no image, which makes the cast useful on text-only models
  too.

**Portrait builder.**

- "Generate portrait" on a cast card calls the existing generation path with a fixed sheet prompt:
  - "character sheet: front, three-quarter and side views, full body, plain cream background", or
  - for props, "object sheet: three angles".
- It runs with the profile's style refs and description and saves into `style-refs` as that
  member's portrait. Earlier takes are kept, as for panels, and the user picks one.
- Age variants are just separate members ("Ismahan at 18", "Ismahan at 42") with distinct aliases.
  Rejected: a variant hierarchy. It's more UI for a case that names already handle.

**MCP.**

- `get_comic` lists the style's cast.
- `generate_panel_image` reports which members it attached and takes an optional `cast` override.
- New `add_cast_member` and `generate_cast_portrait` tools, so a cast can be built over MCP as well
  as in the app.

## Tasks

- [x] Migration: `style_cast`, `style_refs.cast_id`, a backfill from labelled refs, RLS; integration
      tests for RLS and the backfill
- [x] `matchCast` and two-pass `selectRefs`; cast block in `composePrompt` (unit tests first)
- [x] `src/lib/styles/styles.ts`: cast CRUD, portrait upload/link, reorder
- [x] Style editor: Cast section (cards, add/edit dialog, portraits, generate portrait)
- [x] Panel `cast` field in the Y.Doc and projection; Inspector chips with auto/override
- [x] Server generation: pass matched cast, record attached cast ids in `generations`
- [x] MCP: cast in `get_comic`, `cast` on `generate_panel_image`, `add_cast_member`,
      `generate_cast_portrait`
- [x] Docs: README / MCP instructions

Changes from the plan, as built:

- **The selection function:** It is `planRefs` in `src/lib/generation/refs.ts`. It replaces
  `selectRefs`.
- **MCP tools:**
  - Adding and editing a member is one tool, `set_cast_member`, matched by id or name, instead of
    `add_cast_member`.
  - `create_style_profile` and `add_style_reference` were added, so a whole style can be built
    over MCP.
  - The cast is listed by `list_style_profiles`, not `get_comic`. `get_comic` names the style only.
- **The migration backfill** was checked by running it on real rows in a rolled-back transaction
  against the local stack. There is no integration test file for it: the migration runs once,
  before any test can insert pre-migration rows.
- **Portraits aren't logged** in `generations`. That table needs a comic id, and a style has none.
- **Removing a cast chip** leaves focus on the Add select when it was the last chip.
- **Not part of this plan:** `e2e/styles.e2e.ts` is order-dependent when run in parallel with
  other tests that create styles. It passes alone and in the full suite.

## UI mockups (ASCII)

Style editor (`/styles/[id]`): References become **Style references** plus a new **Cast**.

```
┌ Riverbanks House Style ────────────────────────────── Saved ┐
│ STYLE REFERENCES  (go with every panel · up to 3)          │
│ [img] [img] [+]                                            │
│                                                            │
│ CAST  (attached only when a panel mentions them)  [+ Add ▾]│
│ Characters                                                 │
│ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐        │
│ │ [portrait]│ │ [portrait]│ │  (none)  │ │ [portrait]│      │
│ │Ismahan 18│ │Ismahan 42│ │ Sultan   │ │ Ya 20    │        │
│ │aka Isma… │ │aka princ…│ │ ✦ Generate│ │ aka Ya   │       │
│ └──────────┘ └──────────┘ └──────────┘ └──────────┘        │
│ Props                                                      │
│ ┌──────────┐ ┌──────────┐                                  │
│ │ [sheet]  │ │ [sheet]  │                                  │
│ │The drone │ │Jalal's   │                                  │
│ │          │ │boat      │                                  │
│ └──────────┘ └──────────┘                                  │
│ STYLE · PALETTE · AVOID · DEFAULT MODEL  (unchanged)       │
└────────────────────────────────────────────────────────────┘
```

Cast member dialog (opens on a card):

```
┌ Ismahan at 42 ─────────────────────────────── [Delete] ✕ ┐
│ Kind    (•) Character ( ) Prop ( ) Place                  │
│ Name    [Ismahan at 42                     ]              │
│ Aliases [Ismahan, the princess              ]  comma-sep. │
│ Description                                               │
│ [Elegant Malay woman, long dark braid streaked grey,    ] │
│ [fine laugh lines, cream linen, ochre selendang shawl.  ] │
│ Portraits                                                 │
│ [★ sheet 1] [sheet 2] [+ Upload] [✦ Generate sheet]      │
│   ★ = the one sent with panels     generating… ◌          │
└───────────────────────────────────────────────────────────┘
```

Inspector, with a panel selected (under the prompt):

```
│ PROMPT                                          │
│ [Ismahan crouches in the mud with mudskippers ] │
│ CAST  auto ◦                                    │
│ [Ismahan at 42 ✕] [+ Add]                       │
│ 4 of 4 character slots · 0 dropped              │
│ [Generate ⌘↵]                                   │
```

Notes on the Inspector:

- Chips update live as the prompt is typed while the label reads "auto". Removing or adding a chip
  switches to "custom" and shows a "↺ Auto" button to go back.
- When a matched member has to be dropped because of the caps, the chip shows as hollow with
  "description only".

States:

- **Empty cast:** an "Add your first character" card.
- **Portrait generating:** a spinner in the slot.
- **Generation failed:** an inline error on the card, same as `GeneratePanel`.

## Keyboard interaction

1. **Tab order** in the Cast section:
   - "Add" menu, then the cards in order.
   - Inside the dialog: kind radios, Name, Aliases, Description, portrait thumbnails (arrow keys
     move between them, Space stars one), Upload, Generate, Delete, Close.
2. **Shortcuts:**
   - Enter or Space on a card opens its dialog. Esc closes it.
   - ⌘↵ in the dialog runs "Generate sheet".
   - In the Inspector, focus the cast chips with Tab. Backspace on a chip removes it. "+ Add" opens
     a combobox that filters as you type, with Enter to add.
3. **Focus:**
   - Closing the dialog returns focus to its card.
   - Deleting a member moves focus to the next card, or to "Add" if there is none.
   - Removing a chip moves focus to the next chip, or to "+ Add".

## Test list (TDD)

- [x] `matchCast` matches a name case-insensitively on word boundaries ("Ya" does not match
      "Yangon") — unit — `src/lib/generation/cast.test.ts`
- [x] `matchCast` prefers the longest match ("Grandma Dew" over "Dew") and returns members in prompt
      order — unit — `src/lib/generation/cast.test.ts`
- [x] `matchCast` honours aliases — unit — `src/lib/generation/cast.test.ts`
- [x] the panel `cast` override replaces auto-detection; `undefined` means auto — unit —
      `src/lib/generation/cast.test.ts`
- [x] `selectRefs` (shipped as `planRefs`) always takes style refs first, then one portrait per matched member within the
      caps, and reports members left as description-only — unit — `src/lib/generation/refs.test.ts`
- [x] `composePrompt` writes the cast block with image numbers, and descriptions without images
      — unit — `src/lib/generation/prompt.test.ts`
- [x] the migration backfill turns labelled character/object refs into linked cast members, and
      unlabelled ones into style refs — integration — `supabase/tests/style-cast.test.ts`
- [x] RLS: anyone reads the cast, only the creator writes — integration —
      `supabase/tests/style-cast.test.ts`
- [x] MCP `generate_panel_image` reports the attached cast — unit —
      `src/lib/server/mcp/server.test.ts`

## Verification

1. Build a profile, either in the app or over MCP, with:
   - the house ligne-claire style refs;
   - cast members Ismahan 18/42, Ya 20/33, Dew, Jalal, Shapla, Taro, the drone and Jalal's boat,
     with sheets generated in-style.
2. Attach it to *Visa for a Hilsa*.
3. Regenerate panels 2-1, 2-2 and 4-5. Confirm that:
   - the Inspector shows exactly the members named in each prompt;
   - the generations log has the cast block;
   - the drone and boat look the same across the three panels.
4. A Sultan panel attaches no drone or boat.
5. Edit a panel's chips, regenerate, and confirm the override sticks and "↺ Auto" restores it.
6. Keyboard pass: navigate the editor with the keyboard only, as described above.
