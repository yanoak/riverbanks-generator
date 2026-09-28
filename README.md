# Riverbanks

A comic page maker for the seapunk team:

- panel grids that merge into any contiguous layout, plus break-out panels
- per-panel images (mostly AI-generated)
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
`API_URL` and `PUBLIC_SUPABASE_PUBLISHABLE_KEY` set to `PUBLISHABLE_KEY`. Create a local user
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
