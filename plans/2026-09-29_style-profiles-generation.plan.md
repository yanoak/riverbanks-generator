---
slug: 2026-09-29_style-profiles-generation
status: active
started: 2026-09-29
finished:
issue:
---

# Style profiles and in-app image generation

## Context

Panel images today come from outside the app: an upload, a paste, or MCP `set_panel_image`
(`src/lib/server/mcp/images.ts`). The README says they are "mostly AI-generated", but every
generation happens in some other tool, and keeping a comic's look consistent is done by hand.

Yan wants three things:

1. **Prompt in the app.** Generate a panel's image from a prompt, in the editor.
2. **Style profiles.** Reference images plus written context (medium, line, rendering, palette,
   things to avoid), saved as a named profile.
3. **Pull a profile in when creating a comic.** Every generation in that comic then uses it.

Decisions taken with Yan on 2026-09-29:

- **Providers:** Yan is adding a **Gemini API key** (used for the LLM and for image generation)
  and a **Higgsfield API key**, for a wider range of generative models.
- **Visibility:** every account sees and can use every profile; only a profile's creator can edit
  or delete it.
- **Live link:** a comic points at its profile, so editing the profile changes future generations
  in every comic that uses it. Images already generated are untouched.
- **Where you prompt:** per panel, in the Inspector. The prompt is saved on the panel, and earlier
  takes are kept so you can switch back.

Things this plan relies on:

- **Documents are Yjs** (`src/lib/model/ydoc.ts`). The root map holds `title`, `docVersion` and
  `pages`. Panels are Y.Maps with one entry per field; `image` is a plain object.
- **Images live at `assets/<comic id>/<asset id>`**, a private bucket readable by comic members
  (`cloud-assets.ts`). `PanelImage` carries its natural size, offset and scale, and
  `fitImage(…, 'fill')` places it.
- **Server code acts as the user** (`locals.supabase` under RLS), so the per-comic storage
  policies already protect generated output.
- **Vercel request bodies are capped at 4.5 MB.** Reference images must not travel browser →
  function; the browser uploads them straight to Storage.
- **The API facts below come from a research pass** checked against the official docs on
  2026-09-29:
  - **Gemini** (`@google/genai` 2.24):
    - Models: `gemini-3.1-flash-image` (Nano Banana 2) costs $0.067 per 1K image and $0.101 per
      2K; `gemini-3-pro-image` (Nano Banana Pro) costs $0.134.
    - Up to 14 reference images. Flash's documented budget is 10 objects, 4 characters and
      3 styles.
    - **Only a fixed list of aspect ratios**, such as 1:1, 2:3, 3:2, 3:4, 4:3, 4:5, 5:4, 9:16,
      16:9 and 21:9, and Flash adds 1:4, 4:1, 1:8 and 8:1.
    - `gemini-2.5-flash-image` shuts down on 2026-10-02: never use it.
    - For describing the references, `gemini-3.1-flash-lite` with a JSON schema.
    - Latency is unpublished; expect 10–40 s.
  - **Higgsfield** (`https://api.higgsfield.ai`):
    - Auth is `Authorization: Key ID:SECRET`.
    - Asynchronous: submit returns a `request_id`, then poll `/requests/{id}/status` until
      `completed`, `failed` or `nsfw`. Results are URLs kept for 7 days.
    - References go in as **URLs** (`image_urls`).
    - Public catalog: Grok Image 2.0 (0–10 references), Marketing Studio Image (up to 16
      references), Qwen Image 3 edit (1–3), Ideogram 4.0 (1), Soul V2 (text only).
    - **Nano Banana, GPT Image and Seedream are not in the public API**, only in the OAuth-based
      CLI, so they can't run on a server.

## Goal

A signed-in user can:

- create a style profile at `/styles` from reference images, a style description, a palette and
  an "avoid" list, with Gemini drafting the description and palette from the references;
- pick a profile (or none) when creating a comic, and change it later from the Inspector;
- select a panel, type a prompt, press ⌘Enter, and get an image in the profile's style, fitted to
  the panel's shape, with Gemini or a Higgsfield model;
- see and restore that panel's earlier takes.

Collaborators see the prompt and the new image live. Generation also works over MCP.

## Approach

### Data

- **`style_profiles`** (a Postgres table):
  - Columns: `id`, `created_by`, `name`, `style` (text: medium, linework, rendering, lighting),
    `palette` (jsonb `[{hex, name?}]`), `avoid` (text), `model` (default model key),
    `created_at`, `updated_at`.
  - RLS: any authenticated user can read and insert; only the creator can update or delete.
- **`style_refs`:**
  - Columns: `id`, `profile_id`, `role` (`style` | `character` | `object`), `label`, `sort`,
    `width`, `height`.
  - Files go in a new private bucket `style-refs` at `<profile id>/<ref id>`. Authenticated users
    can read; writes need the profile's creator, checked with a `security definer` helper as
    `can_access_comic` does.
  - Roles matter because Gemini budgets style, character and object references separately, and
    "this is Mae" belongs in the prompt next to her picture.
- **`generations`:** a log of every attempt.
  - Columns: `id`, `comic_id`, `panel_id`, `created_by`, `profile_id`, `model`, `prompt` (what
    the user typed), `full_prompt` (what was sent), `aspect`, `status` (`running` | `done` |
    `failed`), `error`, `asset_id`, `width`, `height`, `provider_ref` (the Higgsfield request id),
    `created_at`.
  - RLS: comic members read, and insert as themselves.
  - Takes come from this table, not the document, so the Y.Doc doesn't grow with every retry. It
    also gives a cost trail.
- **In the document:**
  - The root gets **`styleProfileId`** (optional), so a change syncs live and MCP `get_comic` sees
    it. Compaction carries it into `comics.doc`.
  - Panels get **`prompt`** (optional string), so a collaborator sees what the panel is asking for.
  - `docVersion` stays at 2: both fields are optional and old readers ignore them.

The comic → profile link is by id, a **live link**. A deleted profile leaves a dangling id; the
UI shows "Style deleted" and generates without a style.

### Generation path

```
Inspector ⌘Enter
  → POST /api/generate {comicId, panelId, prompt, model?, aspect}     (JSON, a few hundred bytes)
      server: insert generations(running) as the user (RLS = membership check)
              load profile + refs (Storage, as the user)
              composePrompt(profile, panel prompt, role labels)       ← pure, unit-tested
              provider.generate({prompt, refs, aspect})               ← Gemini or Higgsfield
              read + validate bytes (reuse readImage), upload assets/<comic>/<asset>
              update generations(done, asset_id, w, h)
  ← {generationId, assetId, naturalWidth, naturalHeight}
  → editor.patch('Generate image', panelId, {image: fill-fitted})     (undoable, syncs)
```

- **One synchronous request, even for Higgsfield.** The server polls Higgsfield itself (2 s
  rising to 5 s, up to 240 s; `maxDuration = 300`).
  - A webhook was rejected: localhost can't receive it, it needs a public signed callback route,
    and it only saves a function's idle time.
  - If the user leaves mid-generation, the row still reaches `done` and the take appears in the
    history. It just isn't placed.
- **The browser applies the image, not the server.**
  - Placing it through `editor.patch` keeps it on the user's undo stack.
  - If the server wrote the Y.Doc instead, the image would arrive as a remote change the user
    couldn't undo.
  - MCP generation writes on the server, as MCP already does.
- **Aspect ratio:** `nearestAspect(panelBox, model.aspects)` picks the supported ratio closest to
  the panel's in log space, and `fitImage('fill')` crops the difference. Only fixed lists exist,
  so an exact fit is impossible.
- **Reference images:**
  - Gemini gets them inline as base64: at most 14, each downscaled to 1536 px on the long side
    when uploaded.
  - Higgsfield gets **Supabase signed URLs** that expire after 10 minutes. This avoids Higgsfield's
    upload-URL dance; it is an open question whether Higgsfield's fetchers accept them.
- **The model registry** (`src/lib/generation/models.ts`) is data. Each entry lists provider,
  endpoint or id, label, supported aspects, maximum references, reference roles and sizes. Every
  picker and check reads from it, so adding a Higgsfield model is one entry.
- **Prompt composition is deterministic, not an LLM call.**
  - The template is the style block, then the palette ("limited palette: #1d3557 deep navy, …"),
    then "Avoid: …", then role-labelled reference notes ("Image 3 is the character Mae"), then
    the panel prompt.
  - It is predictable, free, testable, and `full_prompt` records exactly what was sent.
  - An "enhance prompt" LLM step is out of scope for now.

### Where the LLM is used

On the profile page, **"Describe from references"** sends the style references to
`gemini-3.1-flash-lite` with a JSON schema `{style, palette: [{hex, name}], avoid}`. The result
fills the fields; the user edits them and saves. This is how the written half of a profile gets
drafted from the pictures. The same route (`POST /api/styles/[id]/describe`) reads the references
from Storage, so nothing large is uploaded to a function.

### Keys and configuration

- `GEMINI_API_KEY`, plus `HF_API_KEY` and `HF_API_SECRET`. They are server-only
  (`$env/dynamic/private`) and set with `vercel env add` for production and preview, and in
  `.env.development.local` for development.
- A provider whose key is missing is left out of the model picker; it doesn't error.
- Unit and e2e tests use a **fake provider**, selected with `GENERATION_PROVIDER=fake`. It
  returns a solid PNG of the requested aspect, so CI never spends money.

### Rejected routes

- **Vercel AI Gateway:** it was set up (OIDC) and supports image generation, but Yan chose direct
  keys, and Higgsfield isn't on it anyway.
- **Snapshotting the profile into the comic:** Yan chose the live link.
- **Takes stored in the Y.Doc:** they grow without limit, and every retry would sync to every
  collaborator.
- **Generating in the browser:** it would expose the keys.

## Tasks

Stages ship independently; each ends deployable.

**Stage 1 — profiles**

- [x] Migration: `style_profiles`, `style_refs`, the `style-refs` bucket and its policies,
      `generations`; integration tests for RLS
- [x] `src/lib/styles/` data module: list, get, save, and add, remove or reorder references
      (browser upload straight to Storage, downscaled first)
- [x] `/styles` list and `/styles/[id]` editor pages, plus an account-menu link
- [x] "Describe from references": Gemini client, JSON schema, route, button

**Stage 2 — comics use a profile**

- [x] `styleProfileId` on the Y.Doc root and projection, and `prompt` on panels (ydoc
      read/write/diff and tests)
- [ ] The New comic dialog on `/comics`, with a profile picker; `create` stores the id
- [ ] Inspector page section: Style row with Change…, which sets it through an undoable patch

**Stage 3 — generate with Gemini**

- [ ] `models.ts` registry, `nearestAspect`, `composePrompt` (test-first)
- [ ] Provider interface, Gemini provider, fake provider
- [ ] `POST /api/generate`: generations row, references, provider, store, respond
- [ ] Inspector Generate block: prompt (saved to the panel on blur), model picker, Generate
      (⌘Enter), spinner, error, a strip of takes (`GET /api/generations?comic&panel`)
- [ ] Hide the generation UI in `/local`; show "Sign in to generate"

**Stage 4 — Higgsfield**

- [ ] Higgsfield provider: submit, poll, download, and statuses mapped to messages (nsfw becomes
      "The model refused this prompt")
- [ ] Registry entries: Grok Image 2.0, Marketing Studio Image, Qwen Image 3 edit, Soul V2
      (text-only models warn that references are ignored)

**Stage 5 — MCP**

- [ ] Tools: `list_style_profiles`, `set_comic_style`, `generate_panel_image` (writes the image
      on the server)
- [ ] README: profiles, generation, keys; the diary; deploy with `supabase db push` and the env
      vars

## UI mockups (ASCII)

`/styles`: the list of profiles

```
┌ Riverbanks ── Comics  Styles ─────────────────────────── (YN) ┐
│ Styles                                        [ + New style ]  │
│ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐             │
│ │ ▣▣▣▣ (refs)  │ │ ▣▣▣           │ │   no refs    │             │
│ │ Tidewater ink│ │ Seapunk gouache│ │ Untitled     │             │
│ │ ■■■■■ palette│ │ ■■■■          │ │              │             │
│ │ by YN · 2 comics│ by AK         │ │ by YN        │             │
│ └──────────────┘ └──────────────┘ └──────────────┘             │
└────────────────────────────────────────────────────────────────┘
Empty: "No styles yet. A style is reference images plus a description that every
        generation in a comic follows."  [ + New style ]
```

`/styles/[id]`: the profile editor (read-only for anyone but the creator)

```
┌ ← Styles   Tidewater ink ______________________ [Delete]  Saved ✓ ┐
│ References                                                          │
│ ┌────┐┌────┐┌────┐┌────┐ ┌ ─ ─ ─ ─ ─ ┐                               │
│ │img ││img ││img ││img │   Drop images                              │
│ │style▾││char▾││style▾││obj▾│   or [Upload…]   (up to 14)           │
│ │Mae__ ││      ││      ││   │ └ ─ ─ ─ ─ ─ ┘                         │
│ └──[×]┘└──[×]┘└──[×]┘└──[×]┘                                         │
│ [✦ Describe from references]  ← fills the three fields below         │
│ Style                                                               │
│ ┌─────────────────────────────────────────────────────────────────┐ │
│ │ Loose brush ink, heavy blacks, flat washes, riso grain...        │ │
│ └─────────────────────────────────────────────────────────────────┘ │
│ Palette  ■#1d3557 ■#e76f51 ■#f4a261 ■#2a9d8f  [+]                  │
│ Avoid    [ photorealism, gradients, text in image              ]    │
│ Default model  [ Nano Banana 2 (Gemini)   ▾ ]                        │
└─────────────────────────────────────────────────────────────────────┘
Describing… : the button shows a spinner and the fields are disabled.
Error: an inline red line under the button, fields unchanged.
```

`/comics`: New comic (pressing `n` or the button opens this; it used to create straight away)

```
┌ New comic ─────────────────────────┐
│ Title  [ Untitled comic          ] │
│ Style                              │
│ (•) Tidewater ink   ■■■■           │
│ ( ) Seapunk gouache ■■■            │
│ ( ) No style                       │
│               [Cancel] [Create ↵]  │
└────────────────────────────────────┘
```

Inspector, with one panel selected (the new block above Image)

```
│ PANEL                         │
│ 2 cells                       │
│ Generate                      │
│ Style: Tidewater ink          │
│ ┌───────────────────────────┐ │
│ │ Mae on the bamboo raft at │ │
│ │ dawn, wide shot           │ │
│ └───────────────────────────┘ │
│ Model [Nano Banana 2 ▾]  4:3  │
│ [ Generate  ⌘↵ ]              │
│ Takes  ▣ ▣ [▣] ▣              │  ← current one ringed; click to use
│ Image                         │
│ [Fill] [Fit] [Crop…] [Remove] │
```

States: generating shows "Generating… 12 s" and a disabled button, with the panel dimmed and a
spinner on the canvas. An error shows a red line with the provider message and Retry. When a
teammate is generating, the panel shows "AK is generating…" through awareness.

Inspector, page section (nothing selected): a new row, `Style  Tidewater ink [Change…]`.
Change… opens the same picker as New comic.

## Keyboard interaction

1. **Tab order:**
   - `/styles`: New style, then each card (Enter opens it).
   - `/styles/[id]`: Back, Name, Delete, each reference (its role select, label, remove), Upload,
     Describe, Style, each palette swatch (Delete removes it), add colour, Avoid, Model.
   - New comic dialog: Title, the style radio group (arrow keys move within it), Cancel, Create.
   - Inspector Generate block: prompt, model, Generate, then the takes as a radio group.
2. **Shortcuts:**
   - `n` on `/comics` opens New comic, and Enter in the dialog creates.
   - With a panel selected, `g` focuses the prompt (it is a letter unused by the editor's
     shortcuts; check `shortcuts.ts`).
   - ⌘Enter in the prompt generates, and Esc blurs back to the canvas selection.
   - ←/→ in the takes group switches takes.
   - Paste and drop of references work on the profile page, as they do in the editor.
3. **Focus:**
   - Opening a dialog focuses Title (New comic) or the selected radio (Change style); closing
     returns focus to its opener.
   - After a generation finishes, focus stays in the prompt.
   - Removing a reference focuses the next one, or Upload.

## Test list (TDD)

- [ ] `nearestAspect` picks the closest supported ratio in log space (tall panel → 2:3 or 9:16;
      a 3-cell strip → 21:9), and only from the model's list — unit —
      `src/lib/generation/aspect.test.ts`
- [ ] `composePrompt`:
  - orders style, palette, avoid, references, then the prompt;
  - omits empty sections;
  - numbers references in the order they are sent;
  - with no profile, produces the bare prompt;
  - leaves out references the model can't take and says so in `dropped`.

  Unit — `src/lib/generation/prompt.test.ts`
- [ ] `selectRefs` respects the model's cap and per-role budget (Flash: 3 style, 4 character,
      10 object, 14 in total), in `sort` order — unit — `src/lib/generation/refs.test.ts`
- [ ] Model registry: every entry has at least one aspect; a provider without a key is filtered
      out — unit — `src/lib/generation/models.test.ts`
- [ ] Gemini provider:
  - builds the request (inline parts, `imageConfig.aspectRatio`, `imageSize`);
  - extracts the inlineData image;
  - maps a response without an image or blocked by safety to a clear error.

  Unit, with a mocked fetch — `src/lib/server/generation/gemini.test.ts`
- [ ] Higgsfield provider:
  - submits with the Key auth header and `image_urls`;
  - polls with backoff to `completed`, then downloads;
  - `failed`, `nsfw` and a timeout become distinct errors.

  Unit, with a mocked fetch and fake timers — `src/lib/server/generation/higgsfield.test.ts`
- [ ] Describe: the JSON schema's response is parsed, and hex values are validated and
      normalised to `#rrggbb` — unit — `src/lib/server/generation/describe.test.ts`
- [ ] Y.Doc:
  - `styleProfileId` and panel `prompt` round-trip;
  - diff sets and deletes them;
  - they survive the projection;
  - an old doc without them still loads.

  Unit — `src/lib/model/ydoc.test.ts`
- [ ] RLS:
  - anyone can read profiles;
  - a non-creator's update, delete or reference upload is refused;
  - a `generations` insert for a comic you aren't a member of is refused.

  Integration — `src/lib/styles/styles.int.test.ts`
- [ ] `/api/generate` with the fake provider:
  - a member gets an asset and a `done` row;
  - a non-member gets 403;
  - a provider error gives a `failed` row and a 502 with the message.

  Integration — `src/routes/api/generate/generate.int.test.ts`
- [ ] MCP `generate_panel_image` places a fill-fitted image and returns the take — unit, with the
      fake provider — `src/lib/server/mcp/server.test.ts`
- [ ] e2e (fake provider):
  - create a style with two references, then create a comic with it;
  - select a panel, type a prompt, press ⌘Enter, and the panel shows an image with two takes
    after a second run;
  - pick the first take and undo.

  e2e — `e2e/generation.test.ts`

## Verification

Run on local first, with the real Gemini key (not the fake), then on production after deploy:

1. Go to `/styles` and press Tab to New style, then Enter. Name it "Tidewater ink".
2. Upload three reference images, mark one as `character` and label it "Mae". Reload: they persist
   in order.
3. Activate Describe from references. Within about 10 s, Style, Palette (4–8 swatches) and Avoid
   fill, and they match the references by eye. Edit a swatch and reload: it persists.
4. As a second account, open the profile: every field is read-only, and there is no Delete.
5. On `/comics`, press `n`, then ↓ to Tidewater ink, then Enter. The editor opens, and with
   nothing selected the Inspector shows `Style  Tidewater ink`.
6. Select the top-row panel (merged to a wide strip), press `g`, type "Mae on a bamboo raft at
   dawn, wide", then ⌘Enter.
   - It says "Generating…" with a timer, and an image in the ink style fills the panel within
     about 40 s.
   - The model line shows 21:9 or 16:9.
7. Press ⌘Enter again: a second take, with two thumbnails in the strip. Press ← in the strip:
   the first take returns. ⌘Z undoes the switch.
8. In a second browser as a collaborator: the prompt text and each image appear live.
9. Switch the model to Grok Image 2.0 (Higgsfield) and generate: an image arrives, and the
   references were honoured (check the style by eye).
10. Edit the profile's palette, regenerate the same panel, and see the change, with no change to
    the comic needed (live link).
11. Delete the profile as its creator. The comic's Inspector shows "Style deleted", and Generate
    still works without a style.
12. From Claude via MCP, run `generate_panel_image` on page 1, panel 2. The open editor shows the
    image within a few seconds.
13. Open `/local` and select a panel: the Generate block reads "Sign in to generate".

## Out of scope

- **Rate limits and budgets:** it is an internal tool. The `generations` table records usage;
  caps can come later if the bills say so.
- **Generating a whole page at once, and page-level prompts.**
- **An LLM "enhance my prompt" step, and in-painting or editing an existing image.**
- **Video or 3D from Higgsfield**, even though the key would allow it.
- **Nano Banana, GPT Image and Seedream through Higgsfield:** they aren't in its public API.
  Gemini covers Nano Banana directly.
- **Profile versioning or history, and snapshotting profiles into comics.**
- **Character sheets as their own concept:** for now, a character is a reference with a label.

## Open questions

- [ ] Do Higgsfield's fetchers accept Supabase signed URLs for `image_urls`? If not, use their
      `/files/generate-upload-url` upload before each call. This will be checked in stage 4.
- [ ] Does Yan's Higgsfield API account reach the models listed above, and what does each cost
      in credits? Use `/estimate` once the key is in.
- [ ] Default Gemini size: 2K ($0.10) or 1K ($0.067)? The plan assumes 2K, since panels print
      large.

## Outcome

_Filled in when done._
