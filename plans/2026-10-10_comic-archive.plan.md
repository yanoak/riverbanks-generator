---
slug: 2026-10-10_comic-archive
status: in-progress
started: 2026-10-10
finished:
issue:
---

# Archive comics instead of deleting them straight away

## Context

On 2026-10-10 Yan asked for "an archive function that does not delete straightaway". The comics
list had filled up with superseded drafts: two each of *Visa for a Hilsa*, *The Youngest Delegate*
and *The Year It Snowed*, plus `Test` and a `SCRATCH … (delete me)` comic. The only way to tidy it
was **Delete**, which drops the row for good:

- **Web:** `src/routes/(app)/comics/+page.svelte` shows Delete → "Really delete?", which calls the
  `delete` action in `+page.server.ts`.
- **MCP:** `delete_comic` in `src/lib/server/mcp/server.ts` ("Permanently delete a comic. Cannot
  be undone."), so an agent can delete a comic in one call.
- **Database:** both paths go through `SupabaseComicStore.delete`. RLS lets only the owner delete
  (`supabase/migrations/20260928120000_comics_and_assets.sql`). There is no backup short of
  Supabase's daily one.

## Goal

Archiving hides a comic from **My comics**, `list_comics` and `search`, and restoring brings it
back. A comic can only be deleted permanently once it is archived, and the database enforces
that, so neither the web page nor an agent can delete a live comic in one step.

## Approach

**An `archived_at timestamptz` column on `comics`.** Null means live. A timestamp, rather than a
boolean, lets the archive say when each comic was archived and sort by it.

- **Only the owner archives or restores,** as only the owner deletes. Members can update the row
  (compaction writes it), so RLS alone cannot stop an editor setting `archived_at`. The existing
  `comics_bump_rev` trigger gets the check: if `archived_at` changes and the caller is signed in
  but not the owner, it raises `42501`. The service role and SQL editor (no `auth.uid()`) are
  allowed, for admin clean-up.
- **Archiving is not an edit.** When `archived_at` changes, the trigger leaves `rev` and
  `updated_at` alone, so a restored comic keeps its "edited" time and place in the list. The store
  only ever writes `archived_at` alone in that update.
- **Delete needs an archived comic.** The owner delete policy gains `and archived_at is not
  null`. A delete of a live comic then matches zero rows, as an editor's delete does today.
- **Kept until deleted by hand.** There is no automatic purge after N days: that needs a cron job,
  and "archive" suggests keeping things. A purge can come later if the archive gets heavy.
- **Archived comics still open** at `/comics/<id>` and can still be edited. The archive is about
  the list, not a lock.

Store (`ComicStore`, `SupabaseComicStore`, `MemoryStore`):

- `list()` and `records()` leave out archived comics; `list({ archived: true })` returns only
  them, with `archivedAt`.
- New `archive(id)` and `restore(id)`, returning false if no row changed (not found, or not owner).

MCP:

- `archive_comic` and `restore_comic` (UPDATE annotations: reversible and idempotent).
- `list_comics` takes an optional `archived: true` to list the archive instead.
- `delete_comic` refuses a live comic with `not-archived: Archive the comic first
  (archive_comic); only archived comics can be deleted.` Its description says the same.

Web, on **My comics**:

- **Delete** becomes **Archive**, with no confirmation since it can be undone. Shared comics show
  no Archive, as they show no Delete now.
- An **Archived (n)** section at the bottom, collapsed by default (`<details>`), lists them as
  smaller cards with **Restore** and **Delete forever** → "Really delete?".
- After archiving, a status line says "Archived “Title”." with an **Undo** button that restores
  it.

Rejected:

- **A separate `archived_comics` table** that rows move into. It would mean copying the Y.Doc log
  and membership, and every foreign key would need re-pointing. A column is one migration.
- **Archive as a per-user flag** (on `comic_members`) so each person hides comics for themselves.
  The aim is to tidy the shared set of drafts, and only the owner deletes anyway.
- **Storing the flag in the comic JSON** (`doc.archived`). Then it would be in the Y.Doc and
  synced like an edit, the list query would filter inside JSONB, and RLS could not see it for the
  delete rule.

## Tasks

- [x] Migration: `archived_at`, trigger owner check that skips rev/updated_at, delete policy
- [x] Store: `list({ archived })`, `records()` filter, `archive`, `restore` (Supabase + memory)
- [x] MCP: `archive_comic`, `restore_comic`, `list_comics { archived }`, `delete_comic` refusal
- [ ] Web: Archive button, undo notice, Archived section with Restore and Delete forever
- [ ] Ship: Yan runs `supabase db push` and deploys

## UI mockups (ASCII)

My comics, with an archived comic and the undo notice:

```
My comics                                                    [+ New comic]

┌────────────────────────────────────────────────────────────────────────┐
│ Archived “Test”.  [Undo]                                               │
└────────────────────────────────────────────────────────────────────────┘

┌──────────┐  ┌──────────┐  ┌──────────┐
│  thumb   │  │  thumb   │  │  thumb   │
└──────────┘  └──────────┘  └──────────┘
Act Three…    The Youngest… Epilogue…
6 pages · 2 d 7 pages · 4 d 6 pages · 5 d
Rename Archive Rename Archive Rename Archive

Shared with me
…

▸ Archived (4)
```

The archive opened (`<details open>`):

```
▾ Archived (4)
  ┌──────┐ Visa for a Hilsa                 4 pages · archived 10 Oct
  │thumb │ [Restore]  [Delete forever]
  └──────┘
  ┌──────┐ Test                             1 page · archived 10 Oct
  │thumb │ [Restore]  Really delete?  Cancel      ← after Delete forever
  └──────┘
```

Empty archive: the section is not shown at all.

## Keyboard interaction

1. **Tab order:** on each card, the thumbnail link, then Rename, then Archive (as Delete now).
   After the shared section comes the Archived summary, then for each archived comic its link,
   Restore, Delete forever (or Really delete?, Cancel).
2. **Shortcuts:** none added. N still opens New comic. Enter/Space on the summary toggles the
   archive, as `<details>` already does.
3. **Focus:**
   - After Archive, focus goes to the notice's Undo button, so the action can be reversed at once
     and focus does not drop to `<body>` when the card disappears.
   - After Undo or Restore, focus goes to the restored card's thumbnail link.
   - After Delete forever, focus goes to the Archived summary.
   - Delete forever → Really delete? moves focus to Really delete?, and Cancel returns it to
     Delete forever.

## Test list (TDD)

- [x] archive hides a comic from `list()` and `records()`; `list({ archived: true })` returns it
      with `archivedAt` — unit (MemoryStore through MCP) — `src/lib/server/mcp/server.test.ts`
- [x] `restore_comic` brings it back to `list_comics` — unit — `server.test.ts`
- [x] `delete_comic` on a live comic is an error `not-archived`, and the comic remains — unit —
      `server.test.ts`
- [x] `delete_comic` on an archived comic deletes it — unit — `server.test.ts`
- [x] archive/restore of an unknown id is `not-found` — unit — `server.test.ts`
- [x] tool list and annotations include `archive_comic`, `restore_comic` (UPDATE) — unit —
      `server.test.ts`
- [x] owner archives: row hidden from `list()`, `rev` and `updated_at` unchanged — integration —
      `src/lib/persistence/supabase-store.int.test.ts`
- [x] owner cannot delete a live comic; can after archiving — integration — same file
- [x] an editor cannot archive or restore (`archive` returns false / raises), and can still edit —
      integration — `src/lib/persistence/access.int.test.ts`

## Verification

On the deployed app (or `npm run dev` against local Supabase), signed in as the owner:

1. Open **My comics**. Tab to **Archive** on `Test`, press Enter. The card disappears, "Archived
   “Test”." appears with focus on **Undo**.
2. Press Enter on Undo. `Test` is back in its old place with its old "edited" time, and focus is on
   its thumbnail.
3. Archive it again. Tab to **Archived (1)**, press Enter: it opens and shows `Test` with
   "archived <today>".
4. Restore → it returns to My comics. Archive it again.
5. Delete forever → Really delete? → Enter. The archive no longer lists it (and the section goes
   if it was the last).
6. In Claude Code over MCP: `list_comics` has no archived comics; `list_comics {archived: true}`
   lists them; `delete_comic` on a live comic returns `not-archived` and the comic is still there.
7. Signed in as an editor of a shared comic: no Archive button is shown for it.

## Out of scope

- Automatic purging of old archived comics.
- Deleting a comic's images from the `assets` bucket when it is deleted. Today's delete does not do
  that either.
- A banner or read-only mode for an archived comic opened in the editor.
- Archiving styles or cast members.

## Open questions

- [ ] Should archived comics be purged after some time (say 90 days)? Not doing it now.

## Outcome

_Filled in when this goes to `done` or `abandoned`._
