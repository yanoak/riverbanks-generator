---
slug: 2026-10-01_story-network
status: done
started: 2026-10-01
finished: 2026-10-01
issue:
---

# Story network: an internal map of the characters and their ties

## Context

The canonised Riverbanks stories now live in RIVERBOOK › Edited Drafts (plus its Script tabs).
Years and family come from the character timeline sheet, which Yan made canon on 2026-10-01.
There are three stories so far:

- *The Youngest Delegate*
- *The Year It Snowed*
- *Visa for a Hilsa*

They share characters across 40 years: Ismahan meets Dew at the 2028 Summit, then sails with Dew's
granddaughter Ya in 2052, and in 2065 Ya recruits Jalal. Keeping the web of relationships straight
by reading the doc is getting hard.

Yan wants:

- an interactive network of every character and their connections;
- kept up to date, with the Google Doc as canon;
- as a separate route in the app. It is not exhibition material, but it can be public (Yan, later
  that day).

## Goal

Anyone opens `/network`, without signing in, and sees:

- a force-directed graph of characters, companions and institutions;
- edges typed (family, inspired, friends, work, member, companion) and labelled;
- filters by story;
- a year scrubber that shows who is alive and how old;
- a detail panel for the selected node.

The data is one canon document in Supabase. A project skill, `riverbook-network`, rebuilds it from
the Google Doc and the timeline sheet, shows the diff and saves it over MCP. A doc change reaches
the page with no deploy.

## Approach

**Storage.**

- A `story_network` table: one row per network (`id text` primary key, `'riverbook'`),
  `data jsonb`, `synced_at`, `updated_by`.
- RLS: anyone reads it, because the page is public. Signed-in members write it; canon is edited
  by sync, not by hand.
- The repo also keeps `content/network/riverbook.json`, so the canon has a reviewable history in
  git.
  - It isn't under `riverbanks/`, which is gitignored studio material because it names real
    people.
  - Tests use a made-up fixture (`src/lib/network/fixture.json`), not the canon.

**Shape**

- `src/lib/network/canon.ts` holds a zod schema:
  - `stories[]`;
  - `people[]` with `kind`: person | animal | companion | institution, plus `born`, `died`,
    `stories`, `summary` and `aliases`;
  - `links[]` with `type`, `label`, `story`, `year` and `note`;
  - `meta` with `syncedAt`, `sources` and `notes`.
- The same file has pure helpers: validation that every link points at a person, `ageIn(person,
  year)`, `aliveIn`, and a filtered view.
- The schema is shared by the route, the MCP tool and the tests.

**Rendering.**

- `d3-force` runs the layout. `d3-zoom` and `d3-drag` handle pan and drag. The SVG is drawn by
  Svelte, not by d3 selections, so it is reactive and accessible.
- Node shape encodes kind and colour encodes the first story. Edge stroke encodes type.
- The detail panel lists the node's ties as buttons, so the whole graph can be walked by keyboard.
- Rejected: an Artifact page. Yan wants it as a route in the app.

**Sync.**

- A skill at `.claude/skills/riverbook-network/SKILL.md`:
  1. Read the Edited Drafts tab, its child tabs and the timeline sheet with `gws`.
  2. Extract the network to the schema.
  3. Diff against `canon.json` and show the user the changes.
  4. Save via MCP `set_story_network`.
  5. Commit `canon.json`.
- The extraction is done by Claude when the skill runs; the app makes no LLM call. The skill says
  that the doc wins over the sheet for story events, and the sheet wins for years and family.
  Conflicts are flagged, not resolved silently.
- MCP adds `get_story_network` (read) and `set_story_network` (write, validated by the schema).

## Tasks

- [x] `canon.ts`: schema plus helpers, tests first
- [x] Migration `story_network` plus data module (`src/lib/network/store.ts`); RLS integration test
- [x] MCP `get_story_network` / `set_story_network`; unit tests
- [x] `/network` route: graph, story filters, year scrubber, detail panel; nav link
- [x] Skill `riverbook-network`
- [x] Seed production from `content/network/riverbook.json` (after `supabase db push` and deploy)
- [x] README section

## UI mockups (ASCII)

```
┌ Riverbanks  Comics  Styles  Network ───────────────────────── account ┐
│ Story network · synced 1 Oct 2026 from Edited Drafts + timeline       │
│ [Youngest Delegate] [Year It Snowed] [Visa for a Hilsa] [Timeline]    │
│ [x] Institutions     Year ◄────●──────────► 2052  (All years)         │
├──────────────────────────────────────────────┬────────────────────────┤
│                                              │ ISMAHAN                │
│     (Sultan)──father──(Ismahan)──boatmates──(Ya)    born 2010 · 42 in 2052 │
│        │ │             │   ╲ inspired          │   Mua                │
│   (General)(Financier)  (Soraya)  (Dew)──────┘   Youngest child of… │
│                          │                     │ Ties                  │
│                       (Teja)     [KAN]──(Coop) │ › Sultan Ibrahim · father │
│                                     │          │ › Dew · inspired 2028 │
│                    (drone)──(Jalal)─(Shapla)   │ › Ya · boatmates 2052 │
├──────────────────────────────────────────────┴────────────────────────┤
│ Legend: ── family  ┄┄ inspired  ·· member  ─ ─ work   ● person ◆ institution │
└───────────────────────────────────────────────────────────────────────┘
```

States:

- **Empty:** "No network synced yet. Run the riverbook-network skill in Claude Code."
- **Loading:** the server loads it, so there is none.
- **Narrow:** the panel stacks under the graph.

## Keyboard interaction

1. **Tab order:**
   - story filter toggles, then the Institutions checkbox and the year slider ("All years" when at
     the left end);
   - then the graph nodes (each one a focusable button);
   - then the detail panel's tie buttons.
2. **Shortcuts:**
   - Enter or Space on a node selects it.
   - Arrow keys on the slider change the year. Esc clears the selection.
   - +/− zoom and 0 fits the graph, when it has focus.
3. **Focus:** selecting a tie in the panel selects that node and moves focus to it in the graph.

## Test list (TDD)

- [x] the schema accepts today's `canon.json` and rejects a link to an unknown person — unit —
      `src/lib/network/canon.test.ts`
- [x] `ageIn` and `aliveIn`: born/died bounds, unknown birth year → null — unit —
      `src/lib/network/canon.test.ts`
- [x] the filtered view by stories and institutions drops nodes and their dangling links — unit —
      `src/lib/network/canon.test.ts`
- [x] RLS: anyone reads, signed-in users write, anonymous users can't — integration —
      `src/lib/network/store.int.test.ts`
- [x] MCP `set_story_network` validates and saves; `get_story_network` returns it — unit —
      `src/lib/server/mcp/server.test.ts`
- [x] `/network` opens signed out, renders the nodes, filters by story, selects by keyboard — e2e —
      `e2e/network.e2e.ts`

## Verification

- On production, after the skill seeds the network:
  - `/network` shows all 14 nodes and 21 ties;
  - unticking *Visa for a Hilsa* hides Jalal, Shapla and the drone;
  - the year scrubber at 2052 shows Dew as died 2041 and Ismahan as 42.
- Edit a relationship in the doc, run the skill, and confirm that the diff names the change and the
  page shows it on reload.

## Notes from building it

- **Effect loop:** The graph's rebuild effect first read the `nodes` it had just written, and
  looped (`effect_update_depth_exceeded`). The production build failed quietly, so the e2e test
  passed; the dev server hung the tab. Fixed by building local arrays and assigning them once,
  with the earlier positions read in `untrack`.
- **Fitting the view:** The view now starts centred and fits once, as soon as the layout has
  mostly settled. Before, it fitted only when the simulation stopped, several seconds in.

## Outcome

Live on 2026-10-01:

- **Migration and deploy:** The migration was pushed and the code deployed.
- **Seed:** The canon was read from the RIVERBOOK doc (Edited Drafts plus its three script tabs,
  unchanged since it was built that morning) and saved over MCP `set_story_network`: 14 people and
  21 ties across 4 stories.
- **The page:** `https://riverbanks-generator.vercel.app/network` serves it publicly.
- **Checks:** The graph, the story filters, the keyboard walk and the year scrubber are covered by
  `e2e/network.e2e.ts`. They were also checked by rendering the real canon on the dev server, which
  is how the effect loop was found.
- **Not yet done:** Editing a tie in the doc and re-syncing waits for the first real change to the
  doc.
