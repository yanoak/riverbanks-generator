---
slug: 2026-10-02_style-typography
status: active
started: 2026-10-02
finished:
issue:
---

# Style typography, and Rubik as the Riverbanks font

## Context

A style profile today sets the look of generated images only: references, a style text, a
palette, things to avoid, a default model and a cast (`src/lib/styles/styles.ts`). Lettering is
not part of it.

- **Every balloon stores its own font.** `Balloon.font` is a CSS `font-family` string
  (`src/lib/model/types.ts`). `createBalloon` stamps `LETTERING_FONT` (Comic Neue) on every new
  balloon, or `SFX_FONT` (Bangers) on an SFX (`src/lib/model/balloons.ts`). Nobody chose those
  values; they are just the defaults.
- **The Inspector offers four fonts**: Comic Neue, Bangers, Patrick Hand and Permanent Marker
  (`Inspector.svelte`). `src/app.html` loads all four from Google Fonts. The PNG export waits
  for `document.fonts.ready` and inlines that stylesheet, so **only loaded fonts survive
  export**.
- **`PageView` → `BalloonView` renders every page**: the editor canvas, the page strip, the
  print pages in `EditorApp`, and the thumbnails on `/comics`.
- **The app UI uses Tailwind's default `font-sans`** (the system stack). `src/routes/layout.css`
  is just `@import 'tailwindcss'`.

**Sam's "RIVERBANKS Paneling" slides** (linked from `content/canon/riverbanks-canon.md`) use one
family throughout. I read them through the Slides API on 2026-10-02 and tallied characters per
font:

| Font | Where the slides use it |
|---|---|
| **Rubik** 400 | Body text (slide 8's principles) |
| **Rubik** 600 italic, uppercase | Narration blocks ("MEANWHILE, A GRIZZLED VETERAN BANKER…") |
| **Rubik Microbe** | Headlines and act titles ("SIX DISASTERS, ONE DREAM", "ACT ONE", "RIVER BANKS") |
| **Rubik Dirt** | Section labels ("THE FOUR TEAL TRUTHS") |
| **Rubik Vinyl**, **Wet Paint**, **Pixels**, **Burned** | One-off accents ("OCTOBER 2026", "CLIMATE FICTION", "SEAPUNK STUDIOS", "DRAFT US A PLAN…") |

All seven are on Google Fonts under the OFL. Rubik is variable (weights 300–900, with italics);
the six display cuts come in 400 only. The slides set them to "bold", which Slides fakes.

Decisions taken with Yan on 2026-10-02:

- **Rubik goes everywhere.** The app UI switches to Rubik, and the default lettering for comics
  becomes the Rubik family.
- **Balloons follow their style live**, matching the comic → style live link from
  [style profiles](2026-09-29_style-profiles-generation.plan.md). A balloon uses its style's font
  for its type, unless someone picked a font for that one balloon. Changing the style re-letters
  every comic that uses it.

## Goal

A style's creator can set the lettering for each balloon type on `/styles/<id>`: the family,
the weight, italic and uppercase, with a live sample of each. Every balloon that has no font of
its own takes its style's typography for its type. This holds in the editor, the page strip,
print, PNG export and the `/comics` thumbnails, and it updates live when the style changes.

With no style, or no typography set, the lettering is the house default: Sam's Rubik family. The
app UI (editor, `/comics`, `/styles`, `/network`, login) is set in Rubik, with Rubik Microbe for
the "Riverbanks" wordmark.

## Approach

### The font catalog: `src/lib/typography/fonts.ts`

- **The catalog is a fixed list**, because a font that isn't loaded falls back silently and
  breaks export. It holds the seven Rubik cuts plus the four existing fonts.
- **Each entry has** a `family` name, a CSS stack with a fallback, and its available `weights`:
  `[300…900]` for Rubik, `[400]` for the rest.
- **A unit test pins the catalog to `app.html`.** It reads `app.html` and checks that its Google
  Fonts URL requests every catalog family and every weight. Adding a font then means one edit in
  each place, and forgetting one fails the test.
- **Rejected: letting a style name any Google font.** It would need a font loaded at runtime per
  comic, and the PNG export's stylesheet inlining would have to follow it there. Eleven fonts is
  plenty for now; growing the list is a one-line change.

### Typography on a style

- **The shape:** `Typography = Record<BalloonType, Lettering>`, where
  `Lettering = { family, weight, italic, uppercase }`.
- **Storage:** `style_profiles.typography jsonb not null default '{}'` holds only the types the
  creator changed. `resolveTypography(partial)` fills the gaps from `DEFAULT_TYPOGRAPHY`. It
  also falls back for an unknown family, or a weight the family doesn't have, so a bad row can't
  break rendering.
- **`DEFAULT_TYPOGRAPHY` is the house default, after Sam's slides.** These are starting values;
  the Verification pass judges them on real pages.

  | Type | Lettering |
  |---|---|
  | speech | Rubik 500 |
  | thought | Rubik 400 italic |
  | whisper | Rubik 400 |
  | shout | Rubik 800, uppercase |
  | caption | Rubik 600 italic, uppercase (the slides' narration) |
  | sfx | Rubik Microbe 400 |

- **Plumbing:** `typography` joins `StyleProfile`, `StyleSummary` (so the editor and `/comics`
  get it with the styles they already load) and `ProfilePatch`.
- **Font size stays per balloon.** Different families do need different sizes, but sizes depend
  on the balloon's box. That is a separate change.

### How a balloon picks its font

- **`Balloon.font` becomes optional.** Absent means "follow the style". `createBalloon` stops
  stamping a font.
- **`letteringFor(balloon, typography)` returns the CSS** `font-family`, `font-weight`,
  `font-style` and `text-transform`:
  - With no `font`, it uses the style's lettering for `balloon.type`. So turning a speech
    balloon into an SFX re-letters it too.
  - With its own `font`, it uses that family at weight 400, upright, in mixed case. A per-balloon
    override is a family only, which keeps it predictable.
  - **Legacy stamps count as unset.** Existing balloons carry `LETTERING_FONT` (or `SFX_FONT` on
    an SFX) only because `createBalloon` put it there. Treating those exact values as "follow
    the style" moves every existing comic onto Rubik with no document migration.
  - The cost: someone who deliberately chose Comic Neue in the Inspector loses that choice. They
    can pick it again, and it then sticks, because the Inspector will store a value that differs
    from the legacy stamp (see Tasks).
- **Rendering:** `PageView` takes a `typography` prop and passes the resolved lettering to
  `BalloonView`, which sets the four properties. Bold and italic marks inside the text still
  apply on top.
  - `EditorApp` resolves the typography from `editor.comic.styleProfileId` and the `styles` it
    already has. All three of its `PageView`s and `PageStrip` get it.
  - `/comics` adds `styleProfileId:doc->styleProfileId` to its select, so each thumbnail gets its
    own style's typography.
- **The Yjs doc needs no version bump.** `font` was always present before. `patch()` already
  deletes a key that becomes `undefined`. Old readers given a balloon with no font render it
  with no font-family, which is the inherited UI font: after this change, Rubik. That is
  harmless.
- **The Inspector's font menu** gets a first option, **"Style — Rubik 500"** (the resolved
  lettering for that type), which clears `font`. Below it come all the catalog families.
- **MCP:** `update_balloon`'s `font` accepts `""` to clear back to the style. Today
  `if (args.font)` ignores an empty string. The description lists the catalog families.

### Rubik in the app UI

- **The font:** `layout.css` sets `@theme { --font-sans: 'Rubik', ui-sans-serif, system-ui, …;
  --font-display: 'Rubik Microbe', 'Rubik', …; }`. Every `font-sans` and default text then
  becomes Rubik, with no per-component edits.
- **The wordmark:** "Riverbanks" in `AppHeader`, `Toolbar` and `AuthCard` takes `font-display`.
  Microbe's texture may fall apart at `text-sm`. If it does, the toolbar wordmark uses Rubik 700
  instead, and only the larger `AuthCard` one keeps Microbe.
- **Left alone:** the collaboration caret labels (`system-ui` in `PageView`). They are tiny
  overlays, and the system face reads best there.

### Rejected

- **Stamping the style's font at creation.** Yan chose the live link.
- **Rewriting every stored comic doc** to delete the legacy font values. The read-time legacy
  rule does the same with no migration of Yjs state. The cost is that someone who deliberately
  chose Comic Neue is treated as unset, which is acceptable.
- **A separate "typography" entity** shared across styles. A style is already the unit people
  pick per comic.

## Tasks

- [x] Font catalog, `DEFAULT_TYPOGRAPHY`, `resolveTypography`, `letteringFor`, with unit tests
      first (`src/lib/typography/`)
- [x] `app.html` loads Rubik (`ital,wght@0,300..900;1,300..900`) and the six display cuts; the
      catalog ↔ `app.html` test passes
- [x] Optional `Balloon.font`, `createBalloon` stops stamping, `updateBalloon` clears on `""`,
      MCP `update_balloon` description; ydoc round-trip test
- [x] Migration `style_profiles.typography jsonb not null default '{}'`; `styles.ts` reads and
      saves it; `summarize` carries it; integration test against the local stack
- [x] `PageView`/`BalloonView` render resolved lettering; `EditorApp`, `PageStrip`, print pages
      and `/comics` thumbnails pass the comic's typography
- [x] Inspector font menu: "Style — …" option plus the catalog; picking Comic Neue stores a
      stack that differs from the legacy stamp (e.g. without the `cursive` fallback), so it sticks
- [x] Style page: Typography section (one row per type: family, weight, italic, uppercase,
      sample), saved through the existing debounced `queue()`; read-only for non-creators
- [x] App UI to Rubik: `@theme` fonts in `layout.css`, `font-display` wordmark in
      `AppHeader`/`Toolbar`/`AuthCard`
- [x] e2e: a balloon re-letters when its comic's style typography changes; the Inspector's
      "Style" option clears an override
- [x] Toolbar fits in Rubik: the editor toolbar needed 1466px (it clipped at 1440). Icon
      buttons' labels are screen-reader-only below 2xl (names unchanged), and the title field
      shrinks
- [x] Font menus show each font in its own face (`FontPicker`, a button + listbox), in the
      Inspector and on the style page, so a balloon or a style can pick any Rubik cut by eye. Yan
      asked for this on seeing Microbe as the one SFX font. A native `<select>` can't style its
      options in Chrome.
- [ ] Deploy, run the migration on production, Verification below, then Outcome

## UI mockups (ASCII)

Style page (`/styles/<id>`), in the right-hand column under Avoid and Default model:

```
 TYPOGRAPHY
 ┌──────────┬──────────────────┬──────────┬─────┬─────┬───────────────────────────┐
 │ Speech   │ [Rubik        ▾] │ [500 ▾]  │ [ I]│ [AA]│  What a day!              │
 │ Thought  │ [Rubik        ▾] │ [400 ▾]  │ [✓I]│ [AA]│  I wonder…                │
 │ Whisper  │ [Rubik        ▾] │ [400 ▾]  │ [ I]│ [AA]│  psst… over here          │
 │ Shout    │ [Rubik        ▾] │ [800 ▾]  │ [ I]│ [✓A]│  LOOK OUT!                │
 │ Caption  │ [Rubik        ▾] │ [600 ▾]  │ [✓I]│ [✓A]│  MEANWHILE, BY THE RIVER… │
 │ SFX      │ [Rubik Microbe▾] │ [400 ▾]  │ [ I]│ [AA]│  KRAK!                    │
 └──────────┴──────────────────┴──────────┴─────┴─────┴───────────────────────────┘
                                                    Reset to house default
```

- Each sample is set in its row's lettering.
- The weight menu lists only the weights the family has. For the display cuts it shows just
  "400" and is disabled.
- **I** (italic) and **AA** (uppercase) are toggle buttons with `aria-pressed`.
- **Read-only** (someone else's style): the same table with the controls disabled and the samples
  still live. "Reset to house default" is hidden.
- **Narrow screens:** each row wraps, with the sample on its own line under the controls.

Inspector, balloon selected:

```
 Font   [Style — Rubik 500        ▾]
          Style — Rubik 500          ← clears the balloon's own font
          ──────────────
          Rubik
          Rubik Microbe
          Rubik Dirt
          …
          Comic Neue
          Bangers
 Font size [ 26 ]
```

## Keyboard interaction

1. **Tab order, style page Typography:** row by row, left to right: family select → weight
   select (skipped when disabled) → Italic toggle → Uppercase toggle. After the last row comes
   "Reset to house default". The section follows Default model in the existing order.
2. **Shortcuts:** none new.
   - Space or Enter flips a focused toggle.
   - The selects are native, so the arrow keys change them.
   - **Font menus** (`FontPicker`):
     - ↓ or ↑ on the button, or Enter or Space, opens the list with focus on it.
     - ↑/↓ and Home/End move. Typing jumps to a name, and a space mid-name is part of the search.
     - Enter, or Space after a pause, picks and returns focus to the button. Escape closes. Tab
       closes and moves on.
     - Keys in the open list never reach the editor's window shortcuts.
3. **Focus management:**
   - Changing a family that lacks the current weight snaps the weight to the nearest one the
     family has. Focus stays on the family select.
   - "Reset to house default" keeps focus on the button. Its status text ("Saved") is announced
     through the page's existing status region.
   - Inspector: the Font select is where it is today. Choosing "Style — …" keeps focus on the
     select.

## Test list (TDD)

- [x] `resolveTypography({})` equals `DEFAULT_TYPOGRAPHY` — unit — `src/lib/typography/typography.test.ts`
- [x] A partial typography overrides only the types it names — unit — same file
- [x] An unknown family, or a weight the family lacks, falls back to the default for that type,
      or snaps to the nearest weight — unit — same file
- [x] `letteringFor`: a balloon with no `font` gets its type's lettering — unit — same file
- [x] `letteringFor`: a balloon's own font wins, at weight 400, upright and mixed case — unit —
      same file
- [x] `letteringFor`: `LETTERING_FONT` on a speech balloon and `SFX_FONT` on an SFX count as
      unset; `SFX_FONT` on a speech balloon counts as chosen — unit — same file
- [x] A changed balloon type changes the lettering of an inheriting balloon — unit — same file
- [x] Every catalog family and weight appears in `app.html`'s Google Fonts URL — unit —
      `src/lib/typography/fonts.test.ts`
- [x] `createBalloon` leaves `font` unset — unit — `src/lib/model/balloons.test.ts`
- [x] `updateBalloon({ font: '' })` deletes the font; `{ font: 'Rubik…' }` sets it — unit —
      `src/lib/ops/comic-ops.test.ts`
- [x] A balloon without a font round-trips through the Y.Doc, and clearing `font` deletes the
      key — unit — `src/lib/model/ydoc.test.ts`
- [x] `saveProfile({ typography })` persists and `getProfile`/`summarize` return it; a
      non-creator's save throws — integration — `src/lib/styles/styles.int.test.ts`
- [x] Changing a style's typography re-letters a balloon in an open comic using it; the
      Inspector's "Style" option clears an override — e2e — `e2e/typography.test.ts`

## Verification

On production, after the migration, signed in, keyboard first:

1. **App UI.** Open `/comics`. The comic titles, buttons and header are in Rubik (DevTools →
   computed `font-family` on body starts with `Rubik`). The "Riverbanks" wordmark is in Rubik
   Microbe at the larger size and legible in the toolbar. Same on `/styles`, `/network` and
   `/login`.
2. **Existing comics re-letter.** Open one of yesterday's Hilsa comics.
   - Its speech balloons are now Rubik 500, its captions Rubik 600 italic uppercase, and any SFX
     Rubik Microbe.
   - No balloon overflows its outline. If one does, adjust the default weights or sizes, not the
     comic.
   - The page-strip thumbnails match.
3. **Style typography.**
   - Open that comic's style on `/styles/<id>`. Tab to Typography → Caption family, choose
     "Rubik Dirt", and wait for "Saved".
   - In a second tab with the comic open, reload: the captions are now Rubik Dirt.
   - Tab back to the style, press "Reset to house default", reload the comic: the captions
     return to Rubik italic.
4. **Per-balloon override.**
   - Select a speech balloon, Tab to the Inspector's Font select, and choose "Bangers". Only that
     balloon changes.
   - Choose "Style — Rubik 500". It returns, and changing the style now moves it again.
5. **Export and print.**
   - Export the page as PNG: the lettering is Rubik and Microbe, not a fallback face.
   - Open print preview: the same.
6. **No style.** Create a comic with no style and add one balloon of each type: they get the
   house default table above.
7. **MCP.**
   - `update_balloon` with `font: ""` on an overridden balloon returns it to the style.
   - `get_comic` still works on a comic whose balloons have no font.

## Out of scope

- Per-style or per-type font **sizes**; sizes stay per balloon.
- Loading arbitrary Google Fonts, or uploading font files.
- Typography for page titles or other page furniture that doesn't exist yet.
- Restyling the `riverbanks/slides` decks, which use IBM Plex Sans Thai on purpose for Thai
  text.
- An MCP tool to set a style's typography. Add it if agents need it; the style page covers
  people.

## Open questions

- [ ] Is Rubik Microbe right for SFX, or should SFX use Rubik Dirt or Wet Paint? Decide on real
      pages during Verification.
- [ ] Should Rubik's Thai-less coverage matter? Rubik covers Latin, Cyrillic and Hebrew, not
      Thai or Burmese. Balloons with Thai or Myanmar text fall back to the system face. If the
      comics need those scripts, add Noto Sans Thai and Noto Sans Myanmar to the stacks as
      fallbacks.

## Outcome

_Filled in when this goes to `done` or `abandoned`._
