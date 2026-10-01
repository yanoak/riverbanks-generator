# Riverbanks

A comic page maker for the seapunk team:

- panel grids that merge into any contiguous layout, plus break-out panels
- per-panel images, generated in the app from a prompt in a saved art style, or uploaded
- WYSIWYG captions, speech, thought, whisper and shout balloons, and SFX

Comics are saved to Supabase. An MCP server lets Claude build and edit pages alongside you, and
its changes appear live in the open editor.

- **App:** https://riverbanks-generator.vercel.app (SvelteKit on Vercel)
- **Data:** Supabase project `riverbanks-comics`, which holds Postgres, Auth and Storage
- **Plans and diary:** `plans/`, `work-diary/` (see `CLAUDE.md`)

## Accounts

This is an internal tool, so public sign-up is off and no emails are sent. An admin adds people
in the Supabase dashboard: **Authentication → Users → Add user → Create new user**, with
**Auto Confirm User** ticked. Give the person their password; they can change it from
**Change password** on the comics page. For a forgotten password, set a new one the same way.

`/local` works without an account and saves in that browser only. After signing in, the comics
page offers to import that local comic.

## Story network

**Network** (`/network`) maps every character in the canonised stories and how they are tied:
family, inspiration, friendship, work, membership and companions. It has filters by story, a year
scrubber that shows who is alive and how old, and a detail panel per person. Anyone can open it
without signing in. It is a working reference, not exhibition material.

The RIVERBOOK Google Doc is canon. The `riverbook-network` Claude Code skill
(`.claude/skills/riverbook-network`):

1. reads the Edited Drafts tab, its script tabs and the character timeline sheet;
2. rebuilds `content/network/riverbook.json`;
3. shows the diff (`./scripts/network-diff.py`);
4. saves it with the MCP tool `set_story_network`.

Run it after the doc changes. The page updates without a deploy. How it all fits together, and
how to update it by hand if needed: [`docs/story-network.md`](docs/story-network.md).

## Styles and generating images

A **style** (the **Styles** tab) is up to 14 style reference images plus a written description,
a palette, an "avoid" list and a **cast**. Every account sees every style; only its maker can
change it.

- **Style references** set the look and go with every panel.
- The **cast** holds the characters, props and places that recur, each with a name, aliases, a
  description of what stays the same, and up to 6 portraits. **Generate sheet** (⌘Enter in the
  member's dialog) draws front, three-quarter and side views in the style from the description;
  ★ marks the portrait that is sent with panels.
- A panel gets the cast members its prompt names, by name or alias ("the girl" for Mae), and only
  those: their starred portraits as references and their descriptions in the prompt. The
  Inspector shows them as chips under the prompt; remove or add one to choose by hand for that
  panel, and **↺ Auto** to go back. Members over a model's image limit go in as words only.
- **Describe from references** asks Gemini to draft the description, palette and avoid list
  from the style references. Edit what it writes.

Pick a style when you create a comic (**New comic**, or `N`), or later from the Inspector with
nothing selected. The comic follows the style as it is edited: a change to a style applies to
the next images generated in every comic using it.

To generate, select a panel, press `G`, describe what happens in it, and press ⌘Enter. You get
a cheap, low-resolution **draft** (Nano Banana 2 at 512, about $0.045), at the supported shape
nearest the panel's, filling it. When a take is the one, **Print version (4K)** redraws that
exact image at 5504 px (about $0.15, 25 s) for large prints such as A1, keeping your crop. The
style's palette is named in that request, because redraws otherwise drift in colour. The prompt stays on
the panel, and every take is kept under **Takes** to switch back to (←/→, or click). Undo works
as for any edit.

To rough out panels for free, ask Claude or ChatGPT to draw them over MCP: `draw_panel_svg`
has the agent draw the panel itself as vector line art, in the comic's style and at the panel's
exact shape, on your own plan with no image credits. The sketch lands as a take marked SVG, and
since it prints at any size it has no print version. Every SVG is sanitised before it's stored:
scripts, links, embedded images and text are removed.

Models: **Nano Banana 2** (the default) and **Nano Banana Pro** through the Gemini API, and
**Grok Image 2.0**, **Marketing Studio Image**, **Qwen Image 3 (edit)** and **Soul V2** through
Higgsfield. A model whose key is missing is not offered. Every attempt is logged in the
`generations` table, with the exact prompt sent.

## Using it with Claude or ChatGPT (MCP)

The MCP endpoint is `https://riverbanks-generator.vercel.app/mcp`. It uses Streamable HTTP and
OAuth, works with Claude and ChatGPT, and only accepts tokens issued through OAuth sign-in. The
first time a client connects, a browser opens: sign in with your Riverbanks account, then click
**Allow**.

- **Claude Code:** `claude mcp add --transport http riverbanks https://riverbanks-generator.vercel.app/mcp`,
  then `/mcp` inside Claude Code to sign in.
- **claude.ai:** Settings → Connectors → Add custom connector, and paste the URL.

Then ask, for example: *"Create a comic called Sediment. On page 1 merge the top row into one wide
panel, put a caption 'Bangkok, October 2026' in it, and a speech balloon in cell 5 saying 'The
river does not hoard.'"* Open the comic in the app to watch it happen.

### ChatGPT

This needs a ChatGPT plan with **Developer mode**: Plus, Pro, Business, Enterprise or Edu. It
works on the web app only.

1. **Settings → Security and login → Developer mode**, and turn it on. On Business or Enterprise
   an admin may need to allow custom connectors first.
2. **Settings → Plugins** (called Apps & Connectors in some versions) → **+**. Enter the name
   `Riverbanks`, the URL `https://riverbanks-generator.vercel.app/mcp`, and choose **OAuth** for
   authentication.
3. Allow access on the Riverbanks consent page.
4. In a chat, choose **+ → Developer mode → Riverbanks**, and name the app in your request, for
   example *"Use the Riverbanks app to list my comics."*

ChatGPT confirms before any change; reads don't need a confirmation. Deep research can search
your comics by their text and cite the page.

The tools are:

- **Comics:** `list_comics`, `create_comic`, `get_comic`, `rename_comic`, `delete_comic`
- **Pages:** `add_page`, `delete_page`, `move_page`, `set_grid`
- **Panels:** `merge_panels`, `split_panel`, `add_free_panel`, `update_panel`
- **Images:** `set_panel_image`, `remove_panel_image`
- **Balloons:** `add_balloon`, `update_balloon`, `delete_balloon`
- **Styles and generation:** `list_style_profiles`, `set_comic_style`, `generate_panel_image`
  (with an optional `cast`), `make_print_version`, `draw_panel_svg`
- **Building styles:** `create_style_profile`, `add_style_reference`, `set_cast_member`,
  `generate_cast_portrait`
- **Story network:** `get_story_network`, `set_story_network`
- **Search and account:** `search`, `fetch` (the comic as a script, for deep research), `whoami`

Each page is also available as the resource `comic://{id}/page/{n}`. Agents get the same
refusals the editor gives people, such as "Panels must share an edge to merge."

## Development

```sh
npm install
supabase start --ignore-health-check   # local Postgres/Auth/Storage (Docker); CLI 2.95's storage check is impatient
npm run dev                            # http://localhost:5173, uses .env.development.local
```

Create `.env.development.local` from `supabase status -o env`, with `PUBLIC_SUPABASE_URL` set to
`API_URL` and `PUBLIC_SUPABASE_PUBLISHABLE_KEY` set to `PUBLISHABLE_KEY`.

Image generation reads server-side keys, in `.env.development.local` locally and with
`vercel env add` for Production and Preview:

- `GEMINI_API_KEY`: Gemini (Nano Banana models, and Describe from references)
- `HF_API_KEY` and `HF_API_SECRET` (or `HF_CREDENTIALS=id:secret`): Higgsfield
- `GENERATION_PROVIDER=fake`: every model returns a flat test image for free. The e2e tests
  set this. Create a local user
with Supabase Studio (http://127.0.0.1:54323) or the admin API.

```sh
npm run test:unit -- --run   # vitest
npm run test:int             # against the local Supabase stack
npx playwright test          # e2e: builds and serves on :4318 against local Supabase
npm run check                # svelte-check
```

Schema changes go in `supabase/migrations/` and reach production with `supabase db push`.

## Studio material

`riverbanks/` holds the Riverbanks studio material (the Chao Phraya Accord, the lightning talk,
and their slide decks), copied from `cosmolocalcnx`. It names people, so it is **gitignored and
never pushed**, and exists only on the machine it was copied to.
