---
slug: 2026-10-11_comic-thumbnails
status: in-progress
started: 2026-10-11
finished:
issue:
---

# Pre-generated thumbnails on My comics

## Context

On 2026-10-11 Yan asked for the My comics thumbnails to be pre-generated whenever someone closes
out of editing a comic, because it looked as if they were regenerated on every visit. They are:

- `src/routes/(app)/comics/+page.svelte` draws each card's first page live with `PageView` at
  180 px wide.
- Every panel image on those pages goes through `supabaseAssets().url`
  (`src/lib/persistence/cloud-assets.ts`), which asks Storage for a **new signed URL** on each
  visit. A new token means a new URL, so the browser cache never hits, and each visit downloads
  every first-page image again at full size: up to 10 MB each, and 4K for print versions.
- **Stale first pages:** the list reads the comic's JSON projection, which is only refreshed on
  compaction. The editor compacts when the tab is hidden, but **not** when you go back to My
  comics with the link: `CloudDoc.destroy` only flushes. So after editing, the list can show an
  out-of-date first page until a later compaction. MCP edits compact on every change
  (`src/lib/ops/ops.ts`), so they are not affected.

## Goal

My comics shows each comic as one small stored image, about 20–40 KB, so a visit no longer
downloads full-size panel images. Leaving the editor saves the comic and makes a fresh thumbnail
if page 1 changed. A comic whose thumbnail is missing or out of date, for example after edits
over MCP, is drawn live once and then saved, so the next visit is fast.

## Approach

**A thumbnail is named by what it shows.** `thumbKey` hashes, with SHA-256 cut to 16 hex
characters, the stable-ordered JSON of exactly what `PageView` draws on the card:

- page 1;
- its resolved header and footer (`bandsFor`);
- the style's typography;
- a version number, bumped by hand when rendering code changes how pages look.

The file is `assets/<comic id>/thumb-<key>.webp`, 360 px wide (2× the 180 px card). The same key
is computed in the browser and on the server (`crypto.subtle` exists in both), so:

- **The list needs no new table or column.** `load` computes each comic's key and signs all the
  expected paths in one `createSignedUrls` call. A path that does not exist comes back without a
  URL: that card is drawn live as today, captured, and uploaded.
- **Edits elsewhere invalidate it.** Changing page 2 does not, because only page 1, the bands
  and the lettering are in the key.
- **Old thumbnails are removed on upload:** the other `thumb-*` files in the comic's folder.
  Members cannot delete in comic folders today, so a migration adds a delete policy limited to
  `thumb-*` names.

**Capture in the browser with `html-to-image`, with small images.** The old PNG export hangs
because `html-to-image` inlines every full-size image as a data URL. `captureThumbnail(node)`
first replaces each `<img>` in the node with a copy downscaled to its displayed size × 2 (fetch,
then `createImageBitmap` with `resizeWidth`). Only then does it call `toCanvas` and encode WebP
at quality 0.85, or JPEG in Safari, which cannot encode WebP. Downscaled copies are cached by
URL. Fonts are embedded by our own `fontEmbedCss`, not by `html-to-image`, which inlines every
subset of every family the page uses (63 `@font-face` rules in our Google Fonts sheet, most of
them Cyrillic, Hebrew or Latin Extended). Ours inlines only the Basic Latin subsets of the
families in use, once per page. Each capture has a 10 s timeout; a failure just means the live
card stays.

**Close-out in the editor:** a hidden stage renders page 1 at card size.

- **On open,** the editor looks up whether a thumbnail of the current page 1 is stored.
  Close-out waits for that lookup, so a quick open-and-leave does not draw a second one.
- **While editing,** once page 1 has changed and then been left alone for 3 s, the stage is
  captured in the background (`prepare()`, one capture at a time). Doing this at close-out
  instead took more than 3 s under load in the full e2e run, and would on a real page 1 with
  several 4K images too. The capture is not uploaded yet.
- **`closeOut()`** compacts, which also fixes the stale-list problem. If page 1's key differs from
  the stored thumbnail, it uploads the prepared capture, or captures now if page 1 changed since.

It runs:

- **on in-app navigation away from the comic**, e.g. the Riverbanks link back to My comics.
  `beforeNavigate` cancels the navigation, runs `closeOut()` (up to 3 s, with "Saving…" in the
  status line), then goes to the same URL. The target page's `load` runs before `onNavigate`, so
  delaying in `onNavigate` would be too late.
- **when the tab is hidden or closed** (`visibilitychange`), best effort. A browser may kill it on
  close, in which case My comics catches the mismatch.

Rejected:

- **Server-side rendering with headless Chromium**, as in the page-export plan
  (`2026-10-01_page-export`, still a draft). It would be exact, and it would also cover MCP edits
  and the web-friendly comics. But it means Chromium on Vercel, a signed render route and a much
  bigger build. The browser capture is enough for a 180 px card. This can move to the server
  renderer when that is built.
- **A thumbnail column on `comics`.** Writing it would bump `rev` and `updated_at` through the
  trigger and broadcast to open editors through Realtime. The key-in-the-path approach needs no
  table at all.
- **Uploading on every change while editing.** That means many uploads per session for no
  benefit. Captures are prepared while editing, but uploaded once, at close-out.
- **A server-made collage of panel images with sharp.** It would drop the lettering and the band
  titles, which are what make the cards recognisable.

## Tasks

- [x] `thumbKey` + stable JSON (tests first)
- [x] Storage: path, save (upload + remove old), sign many; migration for `thumb-*` delete
- [x] `captureThumbnail` with downscaled images and a timeout
- [x] My comics: show the stored thumbnail; draw live, capture and upload when missing
- [x] Editor close-out: compact + capture on leaving and on hide
- [x] e2e: leaving the editor makes a thumbnail; the list then shows an image, not a live page
- [ ] Ship: Yan runs `supabase db push` and deploys

## UI mockups (ASCII)

No visible change: a card looks the same, but its picture is an `<img>`.

```
┌──────────┐
│ <img>    │  ← thumb-<key>.webp, 360 px wide, drawn at 180 px
│          │     (no thumbnail yet: the live PageView, as today)
└──────────┘
Title
6 pages · edited 2 h ago
Rename Archive
```

The editor status line while leaving: `Saving…`, then the navigation completes.

## Keyboard interaction

Nothing new is focusable. The thumbnail `<img>` has `alt=""`, since the card link already has
`aria-label="Open <title>"`. Leaving the editor by keyboard (Tab to the Riverbanks link, Enter)
runs the same close-out as a click.

## Test list (TDD)

- [x] `stableJson` sorts keys at every depth and drops `undefined` — unit —
      `src/lib/thumbnails/key.test.ts`
- [x] `thumbKey` is the same for an object and its JSON round trip with keys in another order
      (as `jsonb` returns them) — unit — `key.test.ts`
- [x] `thumbKey` changes with page 1, the bands and the typography — unit — `key.test.ts`
- [x] `thumbKey` is 16 lowercase hex characters — unit — `key.test.ts`
- [x] `thumbPath(comic, key)` is `<comic>/thumb-<key>.webp` — unit —
      `src/lib/thumbnails/storage.test.ts`
- [x] `staleThumbs` picks every `thumb-*` file except the current one, and never another asset —
      unit — `storage.test.ts`
- [x] a member can upload and delete `thumb-*` in a comic folder but not delete other assets;
      `createSignedUrls` returns no URL for a missing thumbnail — integration —
      `src/lib/persistence/access.int.test.ts`
- [x] leaving the editor after an edit to page 1 stores a thumbnail, and My comics shows it as an
      image — e2e — `e2e/thumbnails.e2e.ts`
- [x] a comic with no thumbnail is drawn live, and on the next visit it is an image — e2e — same
      file

## Verification

_Steps 1 and 4 are automated in `e2e/thumbnails.e2e.ts`: a 3000 × 2000 image on page 1 comes out
as a stored thumbnail under 60 KB, with the right typefaces (checked by eye). The test also
checks that reopening without touching page 1 uploads nothing. Passed 2026-10-11, alone (3 runs
of 3) and in the full suite. Steps 2 and 3 are left for production._

1. Open a comic, merge two panels on page 1, and press the Riverbanks link to go back to My
   comics. "Saving…" shows briefly. The card shows the merged panels as an image (DevTools: an
   `<img>` with `thumb-…webp`).
2. Reload My comics with DevTools → Network: no full-size panel images load, only one small
   `thumb-…webp` per comic.
3. Edit page 2 of a comic and go back: no new thumbnail is uploaded (no `thumb-` upload in
   Network).
4. Over MCP, change page 1 of a comic, then open My comics: that card is drawn live once. After a
   reload it is an image.

## Out of scope

- Server-side rendering (the page-export plan).
- Thumbnails for `/local` comics, which have no list.
- Removing thumbnails when a comic is deleted. Its other images are not removed either.

## Open questions

- [ ] None yet.

## Outcome

_Filled in when this goes to `done` or `abandoned`._
