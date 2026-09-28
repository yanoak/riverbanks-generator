---
slug: 2026-09-28_accounts-cloud-mcp
status: active
started: 2026-09-28
finished:
issue:
---

# Accounts, cloud storage, Vercel deployment and an MCP server

## Context

[v1](2026-09-28_comic-page-editor-v1.plan.md) is a local-first editor: one comic in IndexedDB, no
accounts, running only on `npm run dev`. The brief now asks for four things:

- log in
- deploy online on **Vercel**
- store comics in a **Supabase** database on the free tier
- expose an **MCP server** so an AI agent can make comics

Decisions made with the user (2026-09-28):

| Question | Decision |
|---|---|
| Supabase provisioning | **Their own supabase.com account** (free plan), not the Vercel Marketplace |
| Sign-in | **Email + password** |
| MCP scope | **Full comic editing**: the agent edits exactly what the UI edits |
| MCP auth | **OAuth**, so it works as a claude.ai connector as well as in Claude Code and Desktop |

Relevant facts, checked against current docs:

- Supabase Auth ships an **OAuth 2.1 server**: beta, on all plans, no extra charge, and agents
  count as the user's MAU. It supports **dynamic client registration** (which MCP clients need),
  serves `/.well-known/oauth-authorization-server/auth/v1`, and leaves the **consent page** to the
  app. The consent page calls `supabase.auth.oauth.getAuthorizationDetails(id)`, then
  `approveAuthorization(id)` or `denyAuthorization(id)`, and redirects to the returned
  `redirect_url`. Asymmetric JWT signing keys are recommended, and required for `openid`.
  Sources: [OAuth server](https://supabase.com/docs/guides/auth/oauth-server/getting-started),
  [MCP authentication](https://supabase.com/docs/guides/auth/oauth-server/mcp-authentication).
- The MCP TypeScript SDK's web-standard Streamable HTTP transport runs inside a SvelteKit
  `+server.ts`. SDK 1.25.0–1.25.2 broke SvelteKit by overwriting `global.Response`, so pin
  ≥ 1.25.3.
- nadiio's `canvas-tool-template` (`f07f230`) already has Supabase SSR auth: `hooks.server.ts`,
  `src/lib/supabase/*`, `routes/auth/*`, and a `(protected)` group. Port it rather than rewrite.
- Supabase free-tier limits that matter here:
  - projects pause after ~7 days without activity
  - 500 MB database and 1 GB storage
  - the built-in auth email sender is heavily rate-limited (a handful per hour), fine for
    testing but not for real sign-ups (see Open questions)
- The Vercel CLI is logged in as `yan-6488`; the repo is not linked yet. The Supabase CLI 2.95
  is installed but not logged in. Docker Desktop is installed but not running.

## Goal

A deployed Vercel URL where someone can do the following:

- sign up with email and password, confirm, sign in and out, and reset a forgotten password
- keep a list of their own comics, each edited in the existing editor, saved to Supabase
  (document in Postgres, images in Storage), with row-level security so nobody sees anyone
  else's
- bring an existing local IndexedDB comic across on first sign-in

In addition:

- an MCP client (Claude Code, Claude Desktop, or a claude.ai custom connector) pointed at
  `https://<app>/mcp` goes through OAuth consent as that user, and can then list, create and
  fully edit their comics
- MCP edits appear live in an open editor

## Approach

**One SvelteKit app on Vercel** (`@sveltejs/adapter-vercel`, Node runtime, Fluid Compute) serves
the editor, the auth pages, the OAuth consent page and the MCP endpoint. Supabase is the only
backend.

**Data model** (Supabase migrations in `supabase/migrations/`):

```sql
comics (
  id uuid pk default gen_random_uuid(),
  owner_id uuid not null references auth.users on delete cascade default auth.uid(),
  title text not null,
  doc jsonb not null,          -- the existing serialized Comic (docVersion-migrated on load)
  rev integer not null default 1,  -- optimistic concurrency: every write is "where rev = $expected"
  created_at, updated_at timestamptz
)
-- RLS: owner_id = auth.uid() for select/insert/update/delete
storage bucket 'assets' (private): objects at {user_id}/{asset_id}; RLS on the first path segment
```

The whole document stays one JSONB blob, as in v1 and the template's `projects.graph`. Pages are
small, and a blob keeps the editor, the MCP tools and migrations working on the same type.
Normalising pages and panels into tables was rejected: every edit would become multi-row writes,
for no query we need.

**Persistence swap.** v1 put storage behind two small modules, and those are what get replaced.
The rest of the editor doesn't change.

- `persistence/documents.ts`: load and save go to Supabase through the browser client, under RLS.
  A save is `update … where id = $1 and rev = $2 returning rev`. Zero rows means someone else
  (usually the MCP server) wrote first, and the editor shows a "This comic changed elsewhere —
  reload / keep mine" banner rather than silently overwriting.
- `persistence/assets.svelte.ts`: uploads go to Storage at `{uid}/{assetId}`, and reads use
  short-lived signed URLs, cached per session. PNG export already fetches `blob:` and `https:`
  images, so signed URLs work there too.
- **Realtime**: the editor subscribes to its comic row. A change with a higher `rev` that
  arrives while nothing is unsaved is applied (via `editor.load`, keeping the page index);
  otherwise the conflict banner shows.

**Auth.** Port the template's `@supabase/ssr` setup:

- `hooks.server.ts` creates a per-request server client and safe `getClaims()` user; client and
  server Supabase factories
- routes: `/login`, `/signup`, `/auth/confirm` (email OTP verify), `/forgot-password` and
  `/reset-password`, plus sign-out as a form action
- the editor moves under `/(app)` routes guarded in `+layout.server.ts`: `/comics` (list) and
  `/comics/[id]` (editor)
- `/` becomes a small landing page that redirects signed-in users to `/comics`

**The MCP server** lives at `src/routes/mcp/+server.ts`:

- stateless Streamable HTTP using the SDK's web-standard transport, with GET/POST/DELETE
  delegated to it
- **auth**: without a valid `Authorization: Bearer`, it answers `401` with
  `WWW-Authenticate: Bearer resource_metadata="https://<app>/.well-known/oauth-protected-resource"`
- that metadata route names `https://<ref>.supabase.co/auth/v1` as the authorisation server
- tokens are verified with Supabase's JWKS (asymmetric keys turned on)
- tool handlers use a Supabase client **carrying the user's token**, so RLS applies and the MCP
  server never needs the service-role key
- the consent screen is `src/routes/oauth/consent/+page.svelte`: sign in if needed, show the
  client name and scopes, approve or deny

**Tools share the editor's model code.** The model layer is already framework-free: the
commands, geometry, factories and serialization. Each tool does this:

1. load the doc and its `rev`
2. `migrate()` the doc
3. run the same command classes the UI runs, e.g. `MergePanelsCommand.create`,
   `createBalloon` + `InsertCommand`
4. check `checkPage` invariants
5. save with the `rev` check, retrying once on conflict

Tool inputs address things the way a person would: page number, grid cells, panel/balloon ids
from `get_comic`. Refusals reuse the editor's reasons ("Panels must share an edge…"), so an agent
can recover.

Tool list:

- `list_comics`, `create_comic`, `get_comic`, `rename_comic`, `delete_comic`
- `add_page`, `delete_page`, `move_page`, `set_grid`
- `merge_panels` (by cells or panel ids), `split_panel`, `add_free_panel`, `update_panel`
  (border, fill, rect)
- `set_panel_image` (from an https URL or base64 → Storage) and `remove_panel_image`
- `add_balloon`, `update_balloon` (text as simple HTML or markdown-ish, type, rect, tail, font),
  `delete_balloon`

`get_comic` returns a compact description: per page, each panel's cells and bbox and each
balloon's type, text and rect, plus an app URL to view the page. A resource
`comic://{id}/page/{n}` returns the same for one page. **Server-side PNG rendering is out of
scope**: html-to-image needs a browser, and headless Chromium on Vercel is heavy. The agent gets
the view link instead.

**Environments.**

- local: `supabase start` (Docker) with `supabase/config.toml`, which turns on the OAuth server
  (`[auth.oauth_server] enabled = true, authorization_url_path = "/oauth/consent"`) and dynamic
  registration
- production: the user's free-tier cloud project, linked with `supabase link` and migrations
  applied with `supabase db push`
- env vars: `PUBLIC_SUPABASE_URL` and `PUBLIC_SUPABASE_PUBLISHABLE_KEY`, set in Vercel for
  Development, Preview and Production, and pulled into `.env.local`
- no secret key is needed by the app. The OAuth server and asymmetric-key settings are
  dashboard toggles on the cloud project.

**Rejected:**

- **Vercel Marketplace Supabase**: the user chose their own account.
- **Clerk / Auth0**: Supabase Auth comes with the database, is what the template ports, and is
  the OAuth server MCP needs.
- **Personal API tokens for MCP**: they don't work as a claude.ai connector.
- **A separate MCP deployment (Edge Function)**: splitting it from the app would duplicate the
  model code and its deploys.
- **Service-role key in the MCP server**: bypassing RLS makes every tool bug a cross-tenant bug.

## Tasks

**Infra**

- [x] Switch to `adapter-vercel`, `vercel link`, first preview deploy of the current app (proves the pipeline early)
- [ ] Supabase: `supabase init`, config.toml (auth, OAuth server, storage), migration for `comics` + RLS + `assets` bucket policies; local stack runs; generated DB types
- [ ] Cloud project: user creates the free project; `supabase link` + `db push`; enable asymmetric JWT keys, OAuth server, dynamic registration; set Site URL and redirect URLs; env vars into Vercel and `.env.local`

**Auth**

- [ ] Port the template's `@supabase/ssr` hooks and clients; the route guard on the `(app)` group
- [ ] Sign-up, confirm, sign-in, sign-out, and forgot/reset password pages

**Cloud persistence**

- [ ] Comics list (`/comics`): create, rename, delete, open; editor moves to `/comics/[id]` with a server load
- [ ] Documents in Postgres with the `rev` check and a conflict banner; autosave's injected `save()` points at Supabase
- [ ] Images in Supabase Storage with signed-URL cache; PNG export still embeds them
- [ ] Import the local IndexedDB comic (and its images) on first sign-in
- [ ] Realtime: apply remote changes live when clean; banner when there are unsaved edits

**MCP**

- [x] Headless ops layer (`src/lib/ops/`): load → migrate → command → invariants → save-with-rev, shared by the tools; `describeComic()` for `get_comic`
- [ ] `/mcp` endpoint (Streamable HTTP, stateless) with all tools and the page resource, authenticated by a bearer token verified against JWKS
- [ ] OAuth: `/.well-known/oauth-protected-resource`, the 401 challenge, and the `/oauth/consent` page
- [ ] Connect Claude Code to local and production `/mcp` via OAuth; write the connection how-to into README

**Ship**

- [ ] Production deploy, Supabase URL config for the prod domain, smoke test (Verification below)

## UI mockups (ASCII)

Sign in (sign-up and reset use the same card):

```
┌──────────────────────────────────────────┐
│               Riverbanks                 │
│  ┌────────────────────────────────────┐  │
│  │ Sign in                            │  │
│  │ Email     [______________________] │  │
│  │ Password  [______________________] │  │
│  │ [        Sign in        ]          │  │
│  │ Forgot password? · Create account  │  │
│  └────────────────────────────────────┘  │
│  error state: red line above the button  │
│  "Check your email to confirm" after     │
│  sign-up, with a Resend link             │
└──────────────────────────────────────────┘
```

Comics list:

```
┌ Riverbanks ─────────────────────────────── you@x.com ▾ (Sign out) ┐
│ My comics                                         [+ New comic]  │
│ ┌──────┐ ┌──────┐ ┌──────┐                                       │
│ │ p.1  │ │ p.1  │ │ p.1  │   thumbnails of page 1                 │
│ │thumb │ │thumb │ │thumb │                                       │
│ └──────┘ └──────┘ └──────┘                                       │
│ Riverbanks  Test   Untitled   title · 3 pages · edited 2h ago ⋯  │
│ empty: "No comics yet — New comic, or import your local comic"   │
└──────────────────────────────────────────────────────────────────┘
```

Conflict banner in the editor (under the toolbar):

```
│ ⚠ This comic was changed elsewhere (e.g. by an AI agent).  [Reload]  [Keep mine] │
```

OAuth consent:

```
┌──────────────────────────────────────────┐
│  Claude wants to access your Riverbanks  │
│  account (you@x.com)                     │
│   • Read and edit your comics            │
│   • See your email address               │
│  [ Deny ]                  [ Allow ]     │
└──────────────────────────────────────────┘
```

## Keyboard interaction

1. **Tab order**:
   - auth forms: email → password → submit → secondary links
   - comics list: New comic → each card (Enter opens; its ⋯ menu offers Rename and Delete)
   - consent: Deny → Allow
   - conflict banner: Reload → Keep mine
2. **Shortcuts**: the editor's shortcuts are unchanged. On the list page, N creates a comic.
3. **Focus management**:
   - auth pages focus the first empty field on load, and the error message when a submit fails
     (`aria-live`)
   - consent focuses Allow
   - the conflict banner takes focus when it appears, and focus returns to the canvas after a
     choice
   - after Delete, focus moves to the next card

## Test list (TDD)

- [x] `describeComic()` gives stable ids, 1-based page numbers, cells and bboxes, and plain balloon text — unit — `src/lib/ops/describe.test.ts`
- [x] Ops run a command on a loaded doc and reject invariant-breaking results — unit, with a fake store — `src/lib/ops/ops.test.ts`
- [x] Save with a stale `rev` fails with `conflict`; the op layer retries once on a fresh load and then surfaces the conflict — unit, with a fake store — `ops.test.ts`
- [ ] Tool input schemas: merge by cells, merge by ids, and invalid shapes return the editor's reason text — unit — `src/lib/mcp/tools.test.ts`
- [ ] `set_panel_image` rejects non-image and oversized URLs, and stores by the user's folder — unit — `tools.test.ts`
- [x] Balloon text input (simple markdown → the TipTap-compatible HTML subset) is sanitised — unit — `src/lib/mcp/text.test.ts`
- [ ] `/mcp` without a token answers 401 with the resource-metadata challenge; the metadata route names the Supabase issuer — integration (the route handler called directly) — `src/routes/mcp/mcp.test.ts`
- [ ] Documents store: the rev-checked update against local Supabase; user B can't read user A's comic (RLS) — integration against `supabase start` — `src/lib/persistence/documents.int.test.ts`
- [ ] E2E: sign up → confirm (read from local Inbucket/Mailpit) → create a comic → merge, add a balloon → reload → still there → sign out, and the route guard redirects — Playwright + local Supabase — `e2e/auth.e2e.ts`
- [ ] E2E: an MCP SDK client with a local user's token calls `create_comic`, `merge_panels`, `add_balloon`; the open editor updates live — Playwright + SDK client — `e2e/mcp.e2e.ts`

## Verification

On the **production** URL:

1. Open `/`, then Create account with a fresh email and a password. You land on the "Check your
   email" state, and the email arrives.
2. The confirm link lands signed in on `/comics`, which is empty with the import offer (or offers
   importing when a local comic exists).
3. New comic → the editor. Merge four cells, drop an image, and add a speech balloon with text.
   The toolbar shows "Saved".
4. Reload: everything is back, image included. Open in a second browser as the same user and
   the same comic appears.
5. Sign out: `/comics` redirects to `/login`. A second account can't see the first account's
   comic, even by pasting its URL (404).
6. Forgot password → the email → set a new password → sign in with it.
7. In Claude Code: `claude mcp add --transport http riverbanks https://<app>/mcp`. The browser
   opens the Supabase-backed consent page; Allow. Ask Claude to "create a comic called Test with
   a 2×2 merged panel and a speech balloon saying hello". With the editor open on the comics
   list, the new comic appears; open it and the layout and balloon match.
8. Keep the editor open on that comic, ask Claude to change the balloon text, and it updates live
   without a reload. Make an unsaved local edit first, and the conflict banner appears instead.
9. Add the same URL as a claude.ai custom connector; the OAuth flow completes and `list_comics`
   works.
10. Keyboard-only pass through sign-in, the comics list and consent, following the tab order
    above.

## Out of scope

- OAuth social providers (Google, GitHub) and magic links: easy to add later, since Supabase
  supports them
- Sharing comics between users, public read-only links, collaboration beyond "the MCP agent and
  one editor"
- Server-side PNG/PDF rendering for MCP (the agent gets view links)
- AI image generation (still blocked on the provider decision, plan v1 task 12). The MCP
  `set_panel_image` takes a URL, so an agent can bring images from anywhere.
- Custom domain, paid Supabase and Vercel tiers, billing
- Account deletion UI (Supabase dashboard for now)

## Open questions

- [ ] **Email sending.** Supabase's built-in sender allows only a few auth emails per hour, which
      is enough to build and test but will block real sign-ups. Add custom SMTP (e.g. Resend's
      free tier) before sharing the URL? Needs a sending domain.
- [ ] **Free-tier pausing.** The project pauses after about a week of inactivity, and the app
      shows errors until it's resumed in the dashboard. Acceptable for a hobby deployment, or add
      a weekly keep-alive cron (a Vercel cron hitting a cheap query)?
- [x] **Vercel project**: `riverbanks-generator` in the `yanthibicos-projects` team (Hobby).
      The first `vercel deploy` went to **production**, not preview, so
      https://riverbanks-generator.vercel.app has been public since 2026-09-28 (the local-first
      v1, with no server data).
- [ ] **OAuth beta.** Supabase's OAuth server is beta. If it misbehaves with a given MCP client,
      is falling back to personal tokens for that client acceptable?

## Outcome

_Filled in when this goes to `done` or `abandoned`._
