---
slug: 2026-09-30_svg-sketches
status: active
started: 2026-09-30
finished:
issue:
---

# SVG sketches: Claude draws panels as vector sketches

## Context

[Style profiles and generation](2026-09-29_style-profiles-generation.plan.md) shipped on
2026-09-30. Every image comes from a paid image model: a Nano Banana 2 draft costs $0.045. Yan
wants a cheaper way to rough out panels:

> can we add a skill for you (i.e. just a LLM that can draw in svg) to draw sketches in the
> panels instead of having to use credits to use the image gen models?

Decided with Yan on 2026-09-30:

- **Both routes:** an in-app model and an MCP tool.
- **In the app, Claude writes the SVG,** through the Anthropic API. It is better at SVG than
  Gemini.

What this plan relies on:

- **Panel images are assets placed by `PanelImage`**, rendered with `<img>`. An `<img>` shows SVG
  and never runs scripts in it. PNG export (`html-to-image`) inlines images, SVG included.
- **Generation runs through `generatePanelImage`,** which logs to `generations`, stores in
  `assets/<comic>/<asset>` and places the image in the client. The `assets` bucket allows raster
  types only, and `measureImage` rejects SVG.
- **The Claude API reference** (the claude-api skill, cached 2026-06-24):
  - `@anthropic-ai/sdk` with `client.messages.create`;
  - Claude Sonnet 5 is `claude-sonnet-5`, at $2 per million input tokens and $10 per million
    output;
  - adaptive thinking with `output_config.effort`;
  - base64 image blocks in PNG, JPEG, GIF or WebP;
  - check `stop_reason` for `refusal` and `max_tokens`.

## Goal

- **In the app:** a "Sketch (SVG)" model in the Inspector's model menu. It draws the panel's
  prompt as a vector sketch in the comic's style (palette, description, style references) for a
  few cents, and it lands as a take like any other.
- **Over MCP:** Claude or ChatGPT can draw a panel by writing the SVG itself, through
  `draw_panel_svg`, at no cost beyond the user's own plan.
- **Safety:** SVG from either route is sanitised before it is stored.
- **Print:** SVG sketches don't need a print version, since they are vector already.

## Approach

- **Shape:** a sketch uses the panel's **exact** shape. The viewBox is the panel's box scaled to
  1000 on the long side, not the nearest of a fixed list. So the model gets `anyAspect: true`, and
  the aspect is written like `1000:562`.
- **Sanitising** (`src/lib/generation/svg.ts`, pure and test-first) keeps a strict allowlist:
  - The allowed elements are svg, g, path, shapes, defs, gradients, clipPath, mask, pattern,
    title, desc, and a small set of filter primitives (for paper texture and wobble).
  - Attributes: `on*` is dropped; `href` is kept only for `#local` references; `style` and
    `url()` are kept only for `#local`.
  - Dropped with their content: script, style, foreignObject, text and tspan (panels carry no
    lettering), image, a, use, comments, doctype, CDATA and processing instructions.
  - Finally it sets `width` and `height` from the viewBox, so `<img>` and `image-size` get a
    natural size.
  - The tokenizer is a small regex one, not a DOM, because this runs on the server. Input that
    is not a single well-formed `<svg>` element is refused rather than repaired.
- **Anthropic provider** (`src/lib/server/generation/anthropic-sketch.ts`):
  - `claude-sonnet-5` with adaptive thinking at effort `low` and `max_tokens` 16000.
  - The system prompt sets the job: one `<svg>` with the given viewBox, comic line art in the
    style, the palette as fills and strokes, no text.
  - Up to 4 style references go as image blocks.
  - The first `<svg>…</svg>` in the reply is taken and sanitised.
  - `refusal` and `max_tokens` become clear errors.
- **MCP `draw_panel_svg`** (comicId, page, panelId, svg, prompt?):
  - It goes through the same `run()` path, with a provider that returns the given SVG
    (registry model `svg-agent`, never shown in the picker). So it is logged, stored and placed
    like any generation.
  - The tool description gives the panel-shaped viewBox to use: the agent calls `get_comic`
    for the bbox.
- **Storage:** a new migration adds `image/svg+xml` to the `assets` bucket's allowed types.
  `measureImage` accepts SVG only when the caller allows it, so `set_panel_image` URL imports
  still refuse SVG, which would be unsanitised.
- **Print:** a print version of an SVG is refused ("Sketches are vector: they print at any size
  already"), and the button is hidden when the current take is a sketch.

**Rejected:**

- **Rasterising SVG to PNG on the server:** it needs a native renderer (resvg or sharp) in the
  function, and it throws away the vector, which is what makes sketches print at any size.
- **Gemini writing the SVG:** Yan chose Claude.
- **DOMPurify with jsdom:** a heavy dependency for a closed allowlist over machine-written
  input.

## Tasks

- [x] `svg.ts` sanitiser, test-first
- [x] Migration: `image/svg+xml` in `assets`; `measureImage` gains an allowed-types option
- [x] Registry: `sketch-claude` (anyAspect, maxRefs 4) and `svg-agent` (hidden); exact aspect
      in `generatePanelImage`; print refuses SVG
- [x] Anthropic sketch provider plus the `ANTHROPIC_API_KEY` wiring, test-first with a mocked
      client
- [ ] Inspector: Sketch in the model menu, no Print button on sketch takes
- [ ] MCP `draw_panel_svg`
- [ ] Live check, README and template, then deploy (with Yan's go-ahead and a key)

## UI mockups (ASCII)

The Generate block itself is unchanged. The model menu gains one entry, and the Print button
hides for sketch takes:

```
│ Model [Sketch (SVG, Claude) ▾] 1000:562 │   ← exact panel shape, not a fixed ratio
│ [ Generate draft ⌘↵ ]                    │
│ Takes ▣ [▣] ▣                            │
│ (no "Print version" when the current take is a sketch)
```

## Keyboard interaction

Nothing new is clickable. The model `<select>` keeps its place in the tab order, and the Print
button is simply absent for sketch takes.

## Test list (TDD)

- [ ] Sanitise keeps shapes, paths, gradients, groups and local `url(#id)`; strips script,
      `on*`, foreignObject, external href and `url(http…)`, style elements, text and comments;
      sets width and height from the viewBox; refuses input with no `<svg>`, two root `<svg>`s,
      or no viewBox — unit — `src/lib/generation/svg.test.ts`
- [ ] Sanitise extracts the SVG from a reply with prose or ```` ```svg ```` fences around it —
      unit — `svg.test.ts`
- [ ] `exactAspect({w:900,h:300})` gives `1000:333`; `viewBoxFor('1000:333')` gives
      `0 0 1000 333` — unit — `src/lib/generation/aspect.test.ts`
- [ ] The Anthropic provider:
  - sends `claude-sonnet-5`, adaptive thinking at effort low, the system prompt with the
    viewBox, and the refs as base64 image blocks;
  - returns sanitised SVG bytes;
  - `refusal`, `max_tokens` and "no svg in reply" are each a clear error.

  Unit, with a mocked create — `src/lib/server/generation/anthropic-sketch.test.ts`
- [ ] A sketch-model generation stores `image/svg+xml` with the exact aspect; a print of an SVG
      is refused — integration — `generate.int.test.ts`
- [ ] MCP `draw_panel_svg` sanitises (a script is gone), stores, places and logs; bad SVG is a
      tool error — unit — `server.test.ts`
- [ ] e2e: pick Sketch and generate (fake provider); the take shows, and Print is absent —
      `e2e/generation.e2e.ts`

## Verification

1. Locally, with `ANTHROPIC_API_KEY`: in a styled comic, select a wide panel, choose **Sketch
   (SVG, Claude)**, and generate "Mae poling the raft at dawn".
   - Within about 30 s a line-art sketch in the style's palette fills the panel exactly (no
     crop).
   - The takes strip shows it, and there is no Print button.
2. PNG export of that page includes the sketch.
3. From Claude over MCP: "sketch panel 2 as a heron at dawn in SVG". The open editor shows it
   live, and `generations` logs `svg-agent`.
4. Try an SVG with `<script>` via MCP: the stored file has no script.

## Out of scope

- Editing a sketch's shapes in the app (it is an image, like any other).
- Turning a sketch into a painted image by feeding it to Nano Banana as a reference. That's a
  natural next step ("render this sketch"), but separate.
- Claude Opus for sketches (2.5× the price); the registry makes it a one-line addition later.

## Open questions

- [ ] Sonnet 5 at effort low: good enough sketches, or does it need `medium`? To check live.

## Outcome

_Filled in when done._
