# The story network: how it works and how to update it

`/network` ([live](https://riverbanks-generator.vercel.app/network)) is a public map of every
character in the canonised Riverbanks stories and how they are tied. It is a working reference
for the team, not exhibition material. This document is for whoever updates it next, human or
agent.

Plans with the reasoning behind it:

- [`2026-10-01_story-network`](../plans/2026-10-01_story-network.plan.md): the graph, the canon
  and the sync.
- [`2026-10-01_network-portraits`](../plans/2026-10-01_network-portraits.plan.md): the portraits.

## The one rule: the Google Doc is canon

The network is rebuilt from **RIVERBOOK**, never edited by hand on the page:

| Source | Canon for | Where |
|---|---|---|
| **Edited Drafts** tab and every tab under it (the *Script:* tabs) | What happens in the stories: who meets whom, who works for whom, who inspired whom | [doc](https://docs.google.com/document/d/18NGMxqVUeZz93RChMafRJ-Eh0aKomNfE02zNmpqDh9U/edit?tab=t.igit5bn60vtm), tab `t.igit5bn60vtm` |
| **Character timeline** sheet | Birth and death years, ages, who is whose parent or grandparent | [sheet](https://docs.google.com/spreadsheets/d/1tSifqkz57Ociu9xq-dRsMxBDvGYcprkoxBNd77GNY_A/edit?gid=0#gid=0) |

- **Other tabs are not canon.** That covers the older drafts, Material Kit and Sagas. Use them to
  understand a name, never to add a fact.
- **When the two sources disagree,** flag it to the user. Don't resolve it silently. Where you
  have to choose, the doc wins for story events and the sheet wins for years and family.
- **Never invent people or ties** that the sources don't state or directly imply.

## How to update it

**Use the skill.** Ask Claude Code to "sync the network" (or run `/riverbook-network`). The skill
is [`.claude/skills/riverbook-network/SKILL.md`](../.claude/skills/riverbook-network/SKILL.md),
and it holds the step-by-step instructions. In outline:

1. **Read the sources.** Pull the doc with every tab, and the timeline sheet, using `gws`.
   `gws` needs nvm on the PATH:
   `PATH="/Users/yan/.nvm/versions/node/v22.18.0/bin:$PATH" gws …`.
2. **Edit `content/network/riverbook.json`.** This is the canon file, committed to git.
   - Keep existing ids stable.
   - Add new people and ties, change what the sources changed, remove what they removed.
3. **Validate.** Run `npx vitest run src/lib/network`. One test parses the committed canon, so a
   broken file fails here.
4. **Diff.** `./scripts/network-diff.py` prints a readable list of what changed against the last
   commit.
5. **Show the user the diff and any conflicts, and wait for their OK.** Saving replaces what
   everyone sees.
6. **Save.** Call the Riverbanks MCP tool `set_story_network` with the whole file as `network`. It
   validates the file, publishes the portraits, and writes the database.
7. **Commit** `content/network/riverbook.json`. Put the `Plan:` trailer in the same final
   paragraph as `Co-Authored-By`, if a plan is in progress.

**The page updates as soon as step 6 succeeds.** No deploy is needed for data changes. A deploy
(`git push`) is only needed when code changes.

**Reading the live data:** `get_story_network` (MCP) returns what the page is showing, including
the published portrait URLs.

## Where things live

```
content/network/riverbook.json     the canon (committed; the skill edits this)
src/lib/network/canon.ts           zod schema, parseNetwork (cross-checks), ageIn, aliveIn,
                                   filterNetwork, portraitFor, DEFAULT_FOCUS
src/lib/network/store.ts           getNetwork / saveNetwork (also publishes portraits)
src/lib/network/fixture.json       made-up network for tests (Mae, Nana Oi, Kit, …)
src/lib/components/NetworkGraph.svelte   the graph (d3-force layout, Svelte draws the SVG)
src/routes/network/                the public page (+page.server.ts loads, +page.svelte renders)
src/lib/server/mcp/server.ts       get_story_network / set_story_network
supabase/migrations/20261001150000_story_network.sql     table story_network
supabase/migrations/20261001170000_network_portraits.sql public bucket network-portraits
scripts/network-diff.py            readable diff of the canon
.claude/skills/riverbook-network/  the sync skill
```

**Storage:**

- The `story_network` table has one row per network. `id = 'riverbook'`, and `data` is the whole
  JSON document.
- **Anyone reads it**, because the page is public. **Signed-in users write it.**

## The schema, briefly

`src/lib/network/canon.ts` is authoritative. The shape:

- **`meta`:**
  - `syncedAt`, `sources[]` (name and url, shown on the page), and `notes[]` (caveats shown on the
    page).
  - `styleProfileId`: the style whose cast supplies the portraits. Currently "Riverbanks house
    style", `b5f76d95-af53-4a85-b365-b85bfc781eae`.
- **`stories[]`:** `id`, `title`, `years`, `order`. Order sets the filter order and the node colours.
  `timeline` is the bucket for people who appear only in the sheet.
- **`people[]`:**
  - `id`, a stable kebab-case id.
  - `name`, `kind` and `aliases`. `kind` is `person`, `animal`, `companion` or `institution`.
  - `born` and `died`: years, or null when not canon.
  - `home`, `stories[]` and `summary`.
  - `portraits[]` (optional; see below).
- **`links[]`:**
  - `id`: `"<source>-<target>"`, stable.
  - `source` and `target`: person ids.
  - `type`: `family`, `inspired`, `friends`, `work`, `member` or `companion`.
  - `label`: the relationship in a few words, e.g. "grandmother, teacher".
  - `story` and `year`: where and when it happens, or null.
  - `note`: one line of context, shown in the detail panel.

**What `parseNetwork` rejects:**

- duplicate ids;
- a link to a person who isn't in the network;
- a person or link in an unknown story;
- a portrait with no `cast`.

`set_story_network` refuses such a file with the reason.

**What goes in:**

- every named character in the canon stories;
- unnamed ones who matter ("The General");
- animals and companions with a role (Taro, the drone);
- institutions only when a character is tied to them.

Don't add a grandparent tie that two parent ties already imply, unless the sources make a point
of it.

## Portraits

Each person can show their cast sheet from the house style. In the canon:

```jsonc
"portraits": [
  { "cast": "Ya at 20", "from": 2045 },                // first listed = the "All years" look
  { "cast": "Ya at 8",  "from": 2032 },
  { "cast": "Ya at 33", "from": 2060 },
  { "cast": "Taro the kitten", "from": 2052,
    "focus": { "x": 0.17, "y": 0.35, "zoom": 4 } }      // optional face crop
]
```

- **`cast`:** A cast member's **name** in the style named by `meta.styleProfileId`. Matching is
  case-insensitive. An unknown name fails the save.
- **`from`:** The year this look starts. The year scrubber shows the latest look that has started
  (`portraitFor`). For "All years", or a year before any look starts, it shows the first one listed.
- **Publishing:** On save, `saveNetwork` copies each member's starred portrait (or its first) from
  the private `style-refs` bucket into the public `network-portraits` bucket. The copy goes to
  `riverbook/<cast id>`, and the save records the public `url` and pixel size.
  - Styles stay private; only these copies are public.
  - **Re-sync after re-starring a portrait** in the style, or the page keeps the old one.
- **`focus` (`{x, y, zoom}`):** It picks the face crop for the node. `x` and `y` are fractions of
  the sheet, and `zoom` is how many circle-widths the sheet spans.
  - The default, `DEFAULT_FOCUS = {x: 0.2, y: 0.16, zoom: 7}`, suits a standing three-view
    character sheet: the front figure's head.
  - Props and animals need their own. The drone is `{0.2, 0.45, 2.8}` and Taro is
    `{0.17, 0.35, 4}`.
  - To tune one, download the sheet from its published URL, find the face as a fraction of
    width and height, and check the page.
- **A new character without a cast card:**
  1. Add one in the style: MCP `set_cast_member`, then `generate_cast_portrait` (Nano Banana Pro,
     about $0.13).
  2. Look at the sheet and redraw it if it's off-model.
  3. Add it to `portraits` and sync.

## Checking your work

- **Tests:**
  - `npx vitest run src/lib/network` covers the schema, the helpers and the canon file.
  - `npm run test:int -- src/lib/network` covers the database and bucket against local Supabase.
  - `npx playwright test e2e/network.e2e.ts` covers the page: filters, keyboard walk and year
    scrubber, using the fixture.
- **Look at it.** The e2e test uses made-up data, so after a real sync, look at the live page.
  The page is public, so a headless browser needs no sign-in: open
  `https://riverbanks-generator.vercel.app/network`, wait about 3 seconds for the layout to settle,
  and take a screenshot. Check that:
  - every expected person appears;
  - faces fill their circles (none blank, none tiny);
  - setting the year to a story year shows the right looks.
- **Local preview with real data:** Write the canon into the local `story_network` row (with
  `psql`, using the local stack's `DB_URL` from `supabase status -o env`), then run
  `npm run dev -- --port 5199`. For portraits, the local row can reuse production's public
  portrait URLs.

## Gotchas learned the hard way

- **Svelte effect loops in the graph.**
  - `NetworkGraph.svelte` rebuilds the d3 simulation in an `$effect`.
  - It must not read the `nodes` or `edges` state it writes. Read earlier positions inside
    `untrack`, build local arrays, and assign once.
  - Getting this wrong froze the tab on the dev server (`effect_update_depth_exceeded`), while
    the production build failed quietly and the e2e test still passed.
  - Always look at the page on the dev server after touching the graph.
- **d3 mutates its own objects.** The template renders from the `view` snapshot, which is
  rebuilt on every tick (`frame`), not from the d3 node objects directly.
- **Face images are SVG patterns, not clipped `<image>`s.** A clipped image still gives the node
  a sheet-sized box, so clicks beside the face missed and the focus ring sat in the wrong place.
- **The view fits once per layout,** when the simulation's alpha drops below 0.12. After that the
  pan and zoom are the user's.
- **`riverbanks/` is gitignored,** because it holds studio material that names real people. The
  canon therefore lives in `content/network/`, and tests use `src/lib/network/fixture.json`.
- **New MCP tools need a reconnect.** After a deploy that adds or changes MCP tools, the Claude
  Code session must run `/mcp` to see them.
- **Schema changes need a migration.** Run `supabase db push` before deploying code that depends
  on it, and `supabase migration up --local` for local tests.
