---
slug: 2026-09-28_realtime-collaboration
status: active
started: 2026-09-28
finished:
issue:
---

# Real-time collaboration: several people editing one comic at once (Yjs)

## Context

Today a comic is one `comics` row: the whole document as JSONB, guarded by a `rev` that a
trigger bumps on every write (`supabase/migrations/20260928120000_comics_and_assets.sql`).
The editor autosaves the whole document after an 800 ms debounce
(`src/lib/persistence/autosave.ts`). A save against a stale `rev` becomes `ConflictError`,
and the user picks "reload" or "keep mine" (`EditorApp.svelte`). Remote updates arrive over
`postgres_changes` (`cloud-source.ts`). When there are no unsaved edits they replace the
document and **clear undo history** (`EditorApp.svelte` `adopt()` → `editor.load()`).

That was designed for "the MCP agent and one editor" (explicitly out of scope in
[accounts-cloud-mcp](2026-09-28_accounts-cloud-mcp.plan.md)). Two people would see a
conflict or an undo wipe on nearly every save.

Other facts this plan depends on:

- **Only the owner can do anything.** Every RLS policy is `auth.uid() = owner_id`. Images live
  at `assets/<user id>/<asset id>` with per-user storage policies, so a second person could
  open neither the comic nor its pictures.
- **The model is plain mutable `$state` objects.** Commands (`PatchCommand`, `InsertCommand`,
  `RemoveCommand`, `MoveCommand`, the panel commands) patch and splice those objects in place.
  Drags mutate the object live and `record()` a command at pointer-up.
- **Balloon text is an HTML string.** TipTap edits it in place and commits one "Edit text"
  step when it unmounts (`src/lib/editor/rich-text.ts`).
- **Grid panels must partition the page.** Every cell belongs to exactly one grid panel, and
  panels are 4-connected with no holes (`model/invariants.ts` `checkPage`). A CRDT merges data,
  not invariants: two people merging overlapping panels at once would leave cells claimed twice.
- **The MCP server edits with load → change → `checkPage` → save-with-rev, retrying once**
  (`src/lib/ops/ops.ts` `mutateComic`).
- **Accounts are admin-created**, with no sign-up and no email sending.
- **The signed-out editor is local-first** (IndexedDB, `local-source.ts`), with an import into
  the cloud (`import-local.ts`).

Option C was chosen over (A) sharing plus taking turns and (B) sharing plus a field-level
three-way merge of JSON snapshots. See the Approach for why C costs what it does.

## Goal

Two or more signed-in people who are members of a comic can open it simultaneously and edit
anything, including the same balloon's text. Each sees the others' changes within about half a
second, never gets a conflict dialog, and never loses an edit. Each person's undo reverts only
their own changes. Each sees who else is in the comic, which page they're on and what they've
selected, and sees remote carets while typing in a balloon. MCP edits merge in the same way.
The owner can invite existing accounts by email and remove them.

## Approach

### The document becomes a Y.Doc

Yjs (13.6) is the source of truth. The Svelte `$state` comic becomes a **mirror**: it is kept
up to date from `Y.Doc` events, and it's what components render. Local edits are Yjs
transactions, never direct mutations of the mirror. Shape:

```
comic: Y.Map
  title: string
  docVersion: 2
  pages: Y.Array<Y.Map>              // order matters; move = delete + insert of the same map's JSON
    id, width, height
    grid: Y.Map { rows, cols, gutter, margin }
    cells: Y.Map<"r,c", panelId>     // ← grid ownership, see below
    panels: Y.Map<panelId, Y.Map>    // kind, border, fill, image (plain object), and for free
                                     // panels x, y, w, h, z
    balloons: Y.Map<balloonId, Y.Map>// x, y, w, h, z, type, tail, font, fontSize, fill, stroke,
                                     // clipTo, text: Y.XmlFragment
```

Panels and balloons are **keyed maps, not arrays**. Order is already carried by `z`, and a
keyed map makes "move balloon 1" and "delete balloon 2" commute trivially. Each field is its
own map entry, so concurrent edits to different fields of the same balloon both survive, and
the same field is last-writer-wins. Plain values like `image` or `tail` are replaced whole;
merging partial image pans makes no sense.

### Grid ownership is stored per cell, so the partition cannot break

Instead of each panel listing its `cells`, the page stores `cells: "r,c" → panelId`. With
exactly one entry per cell, "every cell has exactly one panel" holds by construction whatever
merges concurrently. The remaining invariant (4-connected, no holes) *can* break. Example: A
merges cells 1+2 into P while B splits P. The mirror therefore **derives** grid panels from the
cell map. Each connected component of a panel id becomes one panel, and extra components get a
derived id (`<id>~<first cell>`) that inherits the original panel's properties. Any client that
then touches such a panel writes it back as a real panel. The derivation is deterministic and
pure, so every client renders the same page without anyone having to "repair" it (repairs by
several clients at once would duplicate panels). A hole becomes two panels under the same rule
(the ring is split at its bridge cells). This lives in `geometry/grid.ts` next to `canMerge`.

Keying by `"r,c"` rather than a row-major index keeps a concurrent `setGrid` (rows/cols change)
from reassigning everybody's cells. Out-of-range keys are ignored, and a cell with no entry
becomes its own single panel.

### Edits are draft diffs; undo becomes Y.UndoManager

**Revised while building stage 1: edits work on a draft, and only the difference is written.**
Every edit, from the editor or MCP alike, runs in three steps:

1. `projectComic(doc)` gives the current `Comic`.
2. The edit mutates a clone of it.
3. `applyComic(doc, before, after)` writes only the keys that differ, addressed by page, panel
   and balloon id, in one transaction.

The command logic survives as plain draft mutators (`model/panels.ts`). The MCP ops, which
already mutated a draft, barely change, and the UI keeps rendering the `Comic` shape. Minimal
writes are what make concurrent edits merge. Moving a page only renumbers it, and a merge only
rewrites the cells that change owner (tested). `DOC_VERSION` stays 1: the JSON projection keeps
the v1 shape.

This replaces rewriting every command class as a hand-written Yjs transaction, which would have
touched every command and duplicated the model logic.

`HistoryManager` is replaced by a `Y.UndoManager` scoped to the comic, with
`trackedOrigins = {LOCAL}` so undo never reverts a collaborator's edit.
`captureTimeout: 500` groups typing the way TipTap does today, and every command calls
`um.stopCapturing()` after its transaction, so one command is still one undo step (verified in
the spike). The step's description
("Merge panels") and the selection to restore go in the stack item's `meta`, keeping the
toolbar's "Undo Merge panels". Drags keep mutating the mirror live for smoothness and write
once to the Y.Doc at pointer-up, as `record()` does now.

### "Someone is moving this": a soft hold during drags

Drags are the one place where last-writer-wins would feel like lost work, so a drag or resize
places a **soft hold** on its object, carried in presence (awareness), not the document:

- **Claiming:** at pointer-down, awareness publishes `moving: { id, since, rect }`, and it
  updates `rect` as the pointer moves (throttled to 10 Hz for the Realtime message budget;
  receivers interpolate). The hold ends at pointer-up
  (after the Y.Doc write), on Esc, or when that person's presence drops. Presence entries time
  out after 5 s, not Yjs's default 30 s, so a closed laptop doesn't hold a balloon for long.
- **What others see:** the object follows the holder's `rect` live, outlined in their colour
  and tagged "A. K. is moving this".
- **What others can't do meanwhile:** drag, resize, nudge, reorder or delete it. Each attempt
  is refused in the status line ("A. K. is moving this balloon") and nothing changes. The hold
  doesn't cover the rest: others can still select it, edit its text and change its style. Text
  merges letter by letter, and style fields are separate from geometry.
- **Ties:** when two people press on the same object before seeing each other's claim, the
  earlier `since` keeps it (lower Yjs `clientID` if equal). The other drag snaps back to where
  it started, with "A. K. got there first".
- **Selection alone doesn't hold anything.** It only shows the outline, so leaving something
  selected never blocks anyone.
- **The hold is advisory.** The document itself doesn't enforce it, so the MCP server (which
  has no presence) can still move a held object, and the pointer-up write then wins. That's
  acceptable, because an agent moving the exact balloon a human is dragging is rare and
  visible.
- It covers free panels and balloons (the things `Transformer` moves), and image panning in
  image mode. Grid merges and splits are instant, not drags, and already converge through the
  cell map.

**Rejected: SyncedStore-style proxies** (keep writing `balloon.x = 5` and have a proxy turn it
into Yjs ops). It would preserve the command code almost unchanged, but it is a thinly
maintained layer between Svelte 5 runes proxies and Yjs, and it hides exactly the transaction
boundaries that undo and batching need.

### Balloon text: TipTap Collaboration on a Y.XmlFragment

A small **own extension** binds the in-place editor to the balloon's `text` fragment: only
`ySyncPlugin` from `@tiptap/y-tiptap`, at priority 1000, with ⌘Z/⇧⌘Z mapped to the comic-wide
UndoManager. `@tiptap/extension-collaboration-caret` shows remote carets. StarterKit's own undo
is off (`undoRedo: false`).

**Rejected (spike): `@tiptap/extension-collaboration` with a shared UndoManager.** Its
`yUndoPlugin` calls `undoManager.destroy()` whenever the editor unmounts (every Esc out of a
balloon), even for a manager passed in. The comic-wide manager then stops recording until the
next text edit. The spike reproduced it: after unmount the manager was `alive: false`, and two
nudges recorded `1 → 1` undo steps. Our extension recorded `1 → 3`.

Balloons that aren't being edited render HTML derived from the fragment, cached per fragment and
invalidated on change. `getHTMLFromFragment` needs a DOM (it crashed during SSR in the spike),
so the browser uses it, and the server (MCP, compaction's `doc` projection) uses a DOM-free
serializer over the same schema. Candidates: `@tiptap/static-renderer`, or
`yXmlFragmentToProsemirrorJSON` plus a small JSON→HTML function for our few marks.
The "commit on unmount" path in `rich-text.ts` goes away. Auto-grow (`fit()`) becomes a
geometry write in its own transaction, which happens only when someone is typing locally.

### Transport and storage: Supabase, append-only update log

The alternatives for "where Yjs updates go":

| Route | For | Against |
|---|---|---|
| **Supabase update log + Realtime broadcast** (chosen) | Already our auth and DB; RLS reused for membership; the MCP server just inserts a row; no new vendor or bill | We write the provider (~200 lines) and compaction |
| Liveblocks / Y-Sweet / Hocuspocus Cloud | Mature providers, compaction and presence done | A second data store and vendor; bridge Supabase auth; MCP writes through their REST API; cost past free tiers |
| Self-hosted Hocuspocus | Standard Yjs server | A long-running server to run and pay for next to Vercel; Vercel functions can hold WebSockets, but instances don't share memory, so no single authoritative doc |

Design:

- **`comic_updates(id bigserial, comic_id, update bytea, author, created_at)`, insert-only.**
  Clients batch local Yjs updates (≈100 ms, and always at pointer-up or blur) and insert one row
  each. Nothing is ever overwritten, so no write can lose another's work. That is the property
  the current rev guard only approximates.
- **An insert trigger broadcasts the row** with `realtime.send` to the private channel
  `comic:<id>`. Durable-then-broadcast means there is one path for browsers and the MCP server
  alike. Private-channel access is RLS on `realtime.messages` via the same membership check.
- **Oversize updates:** hosted free-tier broadcasts cap at 256 KB (Pro 3 MB), and base64
  inflates by 4/3. So above 128 KB of update the trigger broadcasts only
  `{id, author, fetch: true}`, and receivers read that row over HTTP.
- **Message budget:** the free tier allows 100 messages/s and 20 Presence messages/s,
  project-wide. So:
  - local updates are batched at 150 ms;
  - awareness (selection, carets, soft-hold rects) travels as Broadcast, throttled to 10 Hz, and
    receivers interpolate drag rects;
  - Presence is used only for join and leave.
  - Three people dragging at once stays around 60 msg/s.
- **Presence goes straight client-to-client** over the same channel: a Yjs awareness state
  broadcast plus Realtime Presence for who's online. It carries page, selection, live drag
  positions and user colour, and is never stored.
- **Load and reconnect:** fetch `comics.ydoc` (the compacted snapshot) plus **every**
  remaining `comic_updates` row (not "rows after N": an id is allocated before its row commits,
  so a lower id can become visible after a higher one). Joining or rejoining the channel does the
  same catch-up. Applying Yjs updates is idempotent, so overlaps are harmless.
- **Compaction** (revised while building): no endpoint or cron. Clients compact: the editor when
  its tab is hidden (and on open with 100+ pending rows), the MCP server after each write. The
  `compact_comic` RPC:
  - is compare-and-set on `ydoc_rev`. A loser merges the winner's snapshot and retries once,
    because its state must contain the snapshot it replaces.
  - deletes exactly the row ids the caller applied, so a late-committing row is never lost.
  - refreshes `title` and the `doc` projection.
  - `ydoc_upto` records the highest folded id, so revisions stay monotonic after rows are
    deleted.
- **Pre-Yjs comics** convert lazily on first open (`init_comic_ydoc`, compare-and-set on
  `ydoc is null`; racing openers adopt the winner's conversion). No migration script.
- **`comics.doc` (JSONB) stays** as a read projection for the comics list thumbnails, MCP
  `search`/`fetch`, and anything else reading JSON. It's refreshed by compaction and, debounced,
  after MCP writes. It may lag live edits by up to a compaction; the editor never reads it.
  `rev` and its trigger are dropped once nothing guards on them.

### MCP server

`mutateComic` becomes: load the Y.Doc (snapshot + rows) → run the op as one transaction with
origin `mcp` → run `checkPage` on the derived page, and throw `invalid` *before* inserting if the
op itself is illegal → insert the resulting update. No retry loop: concurrent edits merge.
`markdownToHtml` output goes into the balloon's fragment through the same TipTap schema,
headless (`@tiptap/html` + `@tiptap/y-tiptap`'s `prosemirrorJSONToYXmlFragment`).
`get_comic`/`describeComic` read the derived mirror.

### Sharing and images

- **`comic_members(comic_id, user_id, role 'owner'|'editor', added_by, created_at)`.** A
  security-definer `is_member(comic_id)` backs the RLS on `comics`, `comic_updates`,
  `realtime.messages` and storage. The owner row is created by a trigger on comic insert.
- **Invite by email** through a security-definer RPC that resolves an existing account's email
  to its id. Unknown emails get "No Riverbanks account with that email", since accounts are
  admin-created. Only the owner invites and removes; editors can leave. Deleting stays
  owner-only.
- **Images move to `assets/<comic id>/<asset id>`**, readable and writable by members. A
  one-off migration script copies existing objects and rewrites nothing in documents (asset ids
  don't change; only the path prefix does). `cloud-assets.ts` takes the comic id instead of the
  user id.

### Existing comics and the local editor

- **Existing comics:** `jsonToYDoc(comic)` converts a v1 JSON document (cells arrays → cell
  map, balloon HTML → fragment). A migration endpoint converts every row once. `migrate()` gains
  the v1→v2 step, so an old local document converts on open.
- **Local (signed-out) mode** keeps working on a Y.Doc too, persisted with `y-indexeddb`, so
  there is one model path. `import-local.ts` uploads its encoded state as the new comic's
  snapshot.

### Phasing

Three shippable stages, each ending in a working app:

1. **Y.Doc underneath, single user.** Model, mirror, commands, undo, text, persistence
   (snapshot + log), MCP. Behaviour looks the same as now, with no conflicts left to show.
   This is the risky 70%.
2. **Multiple people.** Membership, RLS, invite UI, images per comic, private broadcast channel.
3. **Presence.** Avatars, remote selections on the canvas, remote carets, a page-strip marker
   for where people are.

A spike precedes stage 1 to retire the two unknowns that could change the design: Realtime
limits and the TipTap-Svelte binding.

## Tasks

**Spike (throwaway branch, findings written into this plan)**

- [x] Realtime: private channel + `realtime.send` from an insert trigger + RLS on
      `realtime.messages`; measure insert→receive latency and confirm the free-tier message size
      and rate limits against a 50-row burst and a 200 KB initial state.
      **Result (local stack, `spike/realtime.mjs`): 14/14.**
      - Latency: median 14 ms, max 147 ms (local, so production will add network time).
      - The 50-row burst all arrived, and replicas converged.
      - 50 KB, 200 KB and 1 MB updates arrived.
      - A full log replay rebuilds the doc.
      - An outsider is refused the channel (`Unauthorized`), reads no rows, and can't insert
        (`42501`).
      - Client-to-client broadcast on the same channel works.
      - The local stack doesn't enforce hosted limits. From the docs, the free tier allows
        256 KB per broadcast and 100 msg/s, which led to the oversize-notice and
        message-budget design in the Approach.
- [x] TipTap 3 Collaboration + CollaborationCaret mounted on a Y.XmlFragment inside our Svelte 5
      attachment, sharing an external Y.UndoManager.
      **Result (`/spike/collab`, `spike/tiptap.mjs`): the stock Collaboration extension breaks a
      shared UndoManager on unmount (5/11). Our sync-only extension passes 11/11:**
      - Concurrent typing converges, and remote carets render.
      - ⌘Z undoes only your own typing.
      - The manager survives unmount, and text and geometry share one ordered stack.
      - Undoing a change a collaborator has since overwritten keeps their value.
      - Remounting still syncs.
      - Also found: `getHTMLFromFragment` needs a DOM.
- [x] Re-run `spike/realtime.mjs` with the >128 KB fetch-notice path: 16/16 (the 200 KB and 1 MB
      updates arrived as notices and were fetched; replicas converged)
- [ ] Run `spike/realtime.mjs` once against a hosted throwaway Supabase project (not production)
      to measure real latency and hit the real 256 KB broadcast cap. Needs Yan's go-ahead to
      create the project.

**Stage 1: Y.Doc underneath**

- [x] `model/ydoc.ts`: `comicToYDoc`, `projectComic`, `applyComic` (draft diff, page order by
      midpoints); `model/text.ts` HTML ↔ fragment without a DOM; `model/panels.ts` draft
      mutators. (No `DOC_VERSION` bump needed; see Approach.)
- [x] `geometry/grid.ts` `derivePanels`: components → panels, derived ids, holes split into
      row runs, missing owners → default single panels
- [x] Mirror: `model/reconcile.ts` patches the live `$state` comic in place from a fresh
      projection after every Y update (simpler than per-event `observeDeep` patching; comics are
      small, and fragment HTML is cached), keeping object identity for unchanged objects
- [x] Commands as draft edits through `Editor.change()` (patch, insert/remove/move, merge,
      split, setGrid, splash, free panel, balloon, image, page ops); `REASONS` refusals kept;
      old command classes and `HistoryManager` deleted; MCP ops use the same draft functions
- [x] Undo/redo on `Y.UndoManager` (`history/yhistory.svelte.ts`) with descriptions carried
      across undo/redo; toolbar and shortcuts unchanged. Selection is pruned rather than restored
      from meta. Found: Yjs skips a step a collaborator has fully overwritten and undoes the one
      before (pinned in `editor.test.ts`)
- [x] Balloon text on Y.XmlFragment via the sync-only extension (`editor/rich-text.ts`);
      fragment → HTML cache; auto-grow joins the typing undo step. Verified by the unit suite and
      all 15 e2e tests
- [x] Migration `20260928210000_comic_ydoc_log.sql`: `ydoc`, `ydoc_rev`, `ydoc_upto`,
      `comic_updates` + RLS (owner-only via `can_access_comic`), broadcast trigger with the
      oversize notice, channel policies, `init_comic_ydoc`, `compact_comic`; `comics` dropped
      from the `postgres_changes` publication. Existing rows convert lazily on first open.
      Applied locally only; **not yet pushed to production**
- [x] `persistence/cloud-doc.ts` (`CloudDoc`): load snapshot + log, 150 ms batched inserts
      with backoff while offline, private-channel subscribe, catch-up on every (re)join; the
      conflict banner, `ConflictError`, `CloudSource` and the rev guard are gone. The store
      (`ops/store.ts`, `ops/ydoc-store.ts`) is shared by browser and server
- [x] Compaction from clients (hidden tab, MCP writes) instead of an endpoint + cron; `doc`
      projection refreshed by it (see Approach)
- [x] ~~Local mode on `y-indexeddb`~~. Not needed: the signed-out editor is single-user, and
      it already runs on a Y.Doc in memory (`Editor.load` converts), so its JSON autosave to
      IndexedDB stays. `import-local` creates the cloud comic with a snapshot
- [x] MCP ops on the Y.Doc (origin `mcp`): open, draft edit, append one update, compact; the
      retry loop is gone. Revisions are update ids (monotonic, via `ydoc_upto`)

**Stage 2: sharing**

- [x] Migration `20260928220000_comic_members.sql`: `comic_members` (owners backfilled, owner
      row by trigger), `can_access_comic` now checks membership, so the update log and the
      channel follow it. Members read and update `comics`; only the owner deletes
- [x] Images at `assets/<comic id>/…` for members. There is no copy script: an image still in the
      uploader's own folder is copied into the comic's folder the first time the uploader loads
      it (`cloud-assets.ts`). The MCP `set_panel_image` and local import upload per comic
- [x] `invite_to_comic` / `remove_from_comic` / `comic_people` / `shared_comic_owners` RPCs;
      `ShareDialog.svelte` (native modal dialog); "Shared with me · Shared by …" in the comics
      list; leave comic; a removed editor's next write (or refused channel rejoin) returns them
      to `/comics` with "You no longer have access to that comic."
- [x] MCP: list and search include shared comics through RLS (tested); `whoami` unchanged
- [x] Fixed a stage 1 regression: revisions are now a per-comic update count that continues the
      pre-Yjs row revision, so a converted comic's revision never goes backwards

**Stage 3: presence**

- [x] Awareness over the channel (`collab/presence.svelte.ts`): user, colour, page, selection
      and move claims, sent at most every 100 ms, heartbeat every 2 s, dropped after 5 s of
      silence; joining asks others to resend; leaving (unmount or `pagehide`) says so at once
- [x] Toolbar avatars (one per person, "name — page N, k selected", click to go to their page);
      selection outlines and name tags on the canvas; page-strip dots
- [x] Remote carets in balloon text (`CollaborationCaret` on the same awareness)
- [x] Soft hold for moves, resizes and image pans (`collab/hold.ts`; `Transformer` claims when a
      drag really starts and aborts cleanly on a lost tie). Others see the object follow, with
      "<name> is moving this", and their move, resize, nudge, reorder, delete and image panning
      are refused with the holder's name. **Not done:** tail drags aren't held; Esc doesn't
      cancel a drag; no "A. K. edited page 1" announcements. Found and fixed on the way:
      double-click (to edit a balloon, or to enter image mode on a free panel) never fired,
      because Transformer's pointer capture retargets `dblclick`

## UI mockups (ASCII)

Editor toolbar with collaborators present (stage 3). Avatars show initials in the user's
colour, and hovering or focusing one shows name + page:

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│ Riverbanks  My comic ▾   ↶ Undo Merge panels  ↷      (YO)(AK)(+1)  [Share]  ⋯  │
└─────────────────────────────────────────────────────────────────────────────────┘
┌──────────┐ ┌─────────────────────────────────────────────────────┐
│ ▣ 1  •AK │ │  ┌──────────┬──────────┬──────────┐                  │
│ ▢ 2      │ │  │          │ ┏━━━━━━━━┿━━━━━━━━┓ ← AK's selection  │
│ ▢ 3  •SM │ │  │          │ ┃  AK    │        ┃   (their colour,  │
└──────────┘ │  ├──────────┼─┸────────┴────────┨    name tag)     │
             │  │ ╭──────╮ │                   ┃                  │
             │  │ │Hi!|SM│ │  ← SM typing: caret + tag in text    │
             │  │ ╰──────╯ │                   ┃                  │
             │  └──────────┴───────────────────┘                  │
             └─────────────────────────────────────────────────────┘
```

A balloon someone else is dragging (stage 3). It follows their pointer, and your attempt to
move it is refused in the status line:

```
             │  ┌──────────┬─────────────┐
             │  │    ┏━━━━━━━━━━┓        │
             │  │    ┃ ╭──────╮ ┃        │  ← dashed, in A. K.'s colour
             │  │    ┃ │ Hi!  │ ┃        │
             │  │    ┃ ╰──────╯ ┃        │
             │  │    ┗━━━━━━━━━━┛        │
             │  │   ✋ A. K. is moving this   │
             │  └──────────┴─────────────┘
 status: A. K. is moving this balloon.
```

Share dialog (stage 2), owner view:

```
┌─ Share "My comic" ───────────────────────────── ✕ ┐
│ Invite by email                                   │
│ ┌───────────────────────────────────┐ [ Invite ]  │
│ │ ak@thibi.co                       │             │
│ └───────────────────────────────────┘             │
│ ⚠ No Riverbanks account with that email.          │  ← error state
│                                                   │
│ People with access                                │
│  (YO) Yan Naung Oak   yan@thibi.co     Owner      │
│  (AK) A. K.           ak@thibi.co      [Remove]   │
│                                                   │
│                                          [ Done ] │
└───────────────────────────────────────────────────┘
```

Editor's view of the same dialog: no invite field, member list read-only, and a
`[Leave comic]` button instead of Remove.

Comics list gains a section (stage 2), which is hidden when empty:

```
My comics                                  [ New comic ]
 ▢ My comic · 3 pages · edited 2m ago
Shared with me
 ▢ Riverside · 5 pages · by A. K. · edited just now
```

Connection state in the toolbar replaces the save status: `Saved` → `Live` (green dot) /
`Offline — changes will sync` (amber) / `Reconnecting…`. The conflict banner is deleted.

## Keyboard interaction

1. **Tab order (toolbar):** … Undo, Redo, collaborator avatars (each focusable, tooltip on
   focus: "A. K. — page 1, 2 panels selected"), Share, menu.
2. **Shortcuts:** unchanged. ⌘Z/⇧⌘Z now undo only your own changes. **Enter on a focused
   avatar** jumps to that person's page and selects nothing. The Share dialog's Enter in the
   email field invites; Esc closes.
3. **Focus management:**
   - The Share dialog opens with focus in the email field (the owner) or on Done (an editor). It
     traps focus and returns focus to Share on close. After Invite, focus stays in the emptied
     field; after Remove, it moves to the next row's Remove, or to the field.
   - **A remote change never moves local focus or selection**, unless it deletes the selected
     object. The selection is then pruned, and focus goes to the canvas with an
     `aria-live` note: "A. K. deleted the balloon you had selected".
   - Remote edits are announced politely at most once per 5 s, per person, e.g.
     "A. K. edited page 1".
   - **Held objects:** arrow nudges, ⌘]/⌘[ (reorder) and Delete on an object someone else is
     moving do nothing and announce "A. K. is moving this balloon" (status line + `aria-live`).
     Selection and Enter-to-edit-text still work. If a tie-break takes away your drag, focus
     stays on the object and "A. K. got there first" is announced.

## Test list (TDD)

Written before each task's code. Unit = Vitest, int = `test:int` against local Supabase,
e2e = Playwright with two browser contexts.

**Model and grid**

- [x] `jsonToYDoc` ∘ `yDocToJson` round-trips every v1 fixture, including L-shapes, free
      panels, images, tails and rich HTML — unit — `model/ydoc.test.ts`
- [x] `derivePanels`: normal partition → same panels as v1 — unit — `geometry/grid.test.ts`
- [x] `derivePanels`: a disconnected id → two panels, and the second gets a derived id and
      inherits the original's properties — unit
- [x] `derivePanels`: a holed ring → split into hole-free panels, and the result passes
      `checkPage` — unit
- [x] `derivePanels`: missing cells → singleton panels; out-of-range keys ignored after
      `setGrid` shrinks — unit
- [x] Two docs merge overlapping cells concurrently → both converge to the same derived page,
      and it passes `checkPage` — unit — in `model/ydoc.test.ts`
- [x] Concurrent merge vs split of the same panel → converge, and it passes `checkPage` — unit
- [x] Concurrent `setGrid` vs merge → converge, and it passes `checkPage` — unit
- [x] Concurrent move of balloon A + delete of balloon B → both applied — unit
- [x] Concurrent edits to different fields of one balloon → both kept; same field → one value
      on every replica — unit
- [x] Deleting a page while the other side edits a balloon on it → the page stays deleted, no
      crash — unit

**Mirror**

- [x] A remote update to one balloon changes only that balloon, and other objects keep identity
      — unit — `model/reconcile.test.ts`, `editor/editor.test.ts`
- [x] Page reorder and delete reflect in the mirror's `pages` order — unit

**Commands and undo**

- [x] Every command's refusals are unchanged (port the existing command tests to run against a
      Y.Doc) — unit — `model/panels.test.ts`, `editor/editor.test.ts`
- [x] Undo reverts only local changes, and a collaborator's later edit to another object
      survives — unit — `history/yhistory.test.ts`, `editor/editor.test.ts`
- [x] Undo of a local move that a collaborator has since overwritten keeps the collaborator's
      value, and that undo then acts on the step before (Yjs semantics) — unit
- [x] One command = one undo step, even when it touches several maps (merge, splash) — unit
- [x] Undo descriptions come from stack-item meta (carried across undo/redo) — unit. Selection
      is pruned after undo rather than restored

**Persistence, transport and compaction**

- [ ] `CloudDoc` batching and retry as unit tests — not written; covered end to end by
      `e2e/collab.e2e.ts` (typing arrives live; an offline edit syncs on reconnect)
- [x] Compaction is compare-and-set; a loser merges and retries; it deletes exactly the rows it
      applied, and a late-committing lower id survives — unit (`ops/ops.test.ts`) and int
      (`persistence/supabase-store.int.test.ts`)
- [x] The projection and title are refreshed by compaction — unit, int
- [x] A pre-Yjs comic converts on first open, once, even with two racing openers; panel ids
      preserved — unit, int

**Access**

- [x] RLS: a non-member can't read the comic, its updates or its images, or write any of them;
      a member can; an editor can't delete the comic or remove others, but can leave — int —
      `persistence/access.int.test.ts` (the channel is covered by the spike and the e2e tests)
- [x] Invite by unknown email → the "no account" error; by the owner's own email, or again → a
      no-op — int
- [x] Share by keyboard, "Shared with me", edit together, removal returns the editor to their
      list — e2e — `e2e/share.e2e.ts`

**Soft hold**

- [x] `holderOf(id, awarenessStates, now)`: no claim → none; one claim → that user; a claim from
      a stale (> 5 s) state → none — unit — `collab/hold.test.ts`
- [x] Two claims on one object → earlier `since` wins, and equal `since` → lower clientID; the
      loser's drag is cancelled back to its start rect — unit
- [x] The editor's move, resize, nudge, reorder and delete on a held object are refused with the
      holder's name and leave the doc unchanged; select and edit text are allowed — unit —
      `editor/editor.test.ts`
- [x] The hold is released on pointer-up and on presence removal — unit, e2e (Esc: not
      implemented)
- [x] An object held by the *local* user is never refused locally — unit

**MCP**

- [x] An MCP op appends one update (then compacts); an illegal or empty op writes nothing —
      unit — `ops/ops.test.ts`
- [x] An MCP `add_balloon` with markdown renders in the open editor with its marks — e2e
      (`e2e/mcp.e2e.ts`); HTML ↔ fragment round-trips — unit (`model/text.test.ts`)

**End to end**

- [x] Two contexts, same comic: A merges panels, B sees it; B types in a balloon, A sees the text
      while it is typed — e2e — `e2e/collab.e2e.ts` (carets: stage 3)
- [x] Offline edit on B, reconnect → A receives it; A's undo leaves B's edits — e2e
- [x] An agent edit and a local edit at the same moment both survive, and are stored, with no
      conflict UI — e2e — `e2e/mcp.e2e.ts`

## Verification

Run on the production deploy with two accounts (the owner and a test account created in the
Supabase dashboard), in two browsers side by side. Keyboard throughout, except canvas drags.

1. **Owner:** `/comics` → open a comic → Tab to **Share** → Enter. Type the test account's email
   → Enter. It appears under "People with access". Esc closes, and focus is on Share.
2. **Test account:** `/comics` shows the comic under **Shared with me**. Open it. Its images
   load. The owner's avatar appears in its toolbar, and the test account's in the owner's.
3. **Structure:** the owner selects two cells and presses M. The test account sees the merge in
   under 1 s, with no banner or dialog on either side.
4. **Concurrent structure:** both select overlapping cells and press M within the same second.
   Both pages end up identical, with no overlapping or missing cells (`get_comic` via MCP
   agrees).
5. **Text:** both press Enter on the same balloon and type. Each sees the other's letters
   interleave and a name-tagged caret. Esc on both, then reload both: the text is identical.
6. **Undo:** the owner moves balloon 1 (arrow keys), and the test account then moves balloon 2.
   The owner presses ⌘Z: balloon 1 returns, and balloon 2 stays where the test account put it.
7. **Offline:** the test account turns off networking (DevTools → Offline), edits a caption, and
   sees "Offline — changes will sync". Networking back on: "Live", and the owner receives the
   edit.
8. **Soft hold:** the owner starts dragging balloon 1 slowly (mouse; there is no keyboard
   drag). The test account sees it follow, with a dashed outline and "Yan is moving this". The
   test account then Tabs to it and presses → and Delete: nothing moves or is deleted, and the
   status reads "Yan is moving this balloon". The owner releases: the outline goes, and the
   test account's → now nudges it. Repeat and close the owner's tab mid-drag: the hold clears
   within about 5 s.
9. **MCP:** ask ChatGPT/Claude to add a speech balloon to page 1 while both editors are open.
   It appears in both, and neither editor's undo removes it.
10. **Remove:** the owner opens Share → Remove the test account. On the test account's next
   action or reload, it gets "You no longer have access to this comic" and returns to `/comics`.
11. **Old comics:** a comic created before the migration opens with its layout, images and text
    unchanged.

## Out of scope

- Viewer / commenter roles, public or link-based sharing. The schema's `role` column leaves room.
- Self-service sign-up or email invitations to people without an account.
- Version history / "restore a previous version" UI. The update log makes it possible later,
  but compaction discards it for now.
- Per-object locking or "someone is editing this" warnings beyond presence.
- Collaborative image *uploading* progress indicators; others see the image when it lands.
- Moving off Supabase or Vercel.

## Open questions

- [x] **Who collaborates, and with what rights?** Confirmed 2026-09-28: existing
      (admin-created) accounts invited by email; everyone invited can edit; only the owner
      invites, removes and deletes. No view-only access or link sharing for now.
- [x] **Drag conflicts.** Decided 2026-09-28: a "someone is moving this" soft hold rather
      than last-writer-wins (see Approach).
- [ ] **Realtime free-tier limits** (message size, messages/second, concurrent connections):
      the spike measures them. If the size limit is below a typical initial load, the initial
      state goes over HTTP only (already the plan), and the only risk is a very large single
      paste.
- [ ] **Free-tier pausing** (inherited from accounts-cloud-mcp) matters more once others depend
      on the app.

## Outcome

_Filled in when this goes to `done` or `abandoned`._
