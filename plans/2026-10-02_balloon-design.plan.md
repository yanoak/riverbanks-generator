---
slug: 2026-10-02_balloon-design
status: active
started: 2026-10-02
finished:
issue:
---

# Balloon design: roundness, bumps and spikes, corner anchors, connected balloons, strikethrough

## Context

Yan wants more freedom in lettering. The references are the three
`riverbanks/moodboard/speech_bubble-inspo_IMG_527{8,9}`/`5280.HEIC` photos:

- **5278**: a speech balloon in a panel's top-left corner, **cut off flush by the panel border**
  on two sides, with its tail still pointing at the speaker.
- **5279**: **barely-rounded rectangles** stacked down a tall panel. Each is joined to the next
  by a short bridge whose outline merges with both, a **neck**. The top box sits flush against
  the panel's top edge.
- **5280**: soft rounded boxes, **chained by thin connecting lines**. One is cut off by the
  panel's left edge, and the emphasis words are in **bold**.

What the app does today:

- **Outlines:** one fixed shape per type, in `src/lib/geometry/balloon.ts`.
  - Speech and whisper are always an ellipse; a caption is always a square box.
  - A thought balloon's bump count comes from its size.
  - A shout always has 18 spikes, at a fixed depth.
- **Text inset:** `textInset(type)` is a constant per type.
- **Balloons live on the page,** not in panels, so they can already cross panel borders.
  `Balloon.clipTo` is declared in `types.ts`, but nothing reads it.
- **Text:** it is TipTap with StarterKit (`src/lib/model/text.ts`). Bold, italic **and strike**
  are in the schema already. The Inspector has buttons for bold and italic only (⌘B, ⌘I); strike
  works with ⌘⇧S but has no button. MCP's markdown subset (`ops/text.ts`) knows `**` and `*`,
  not `~~`.
- **Shapes over MCP:** agents can set a balloon's text, type, rect, tail, font size, font and
  fill (`update_balloon`), but none of the shape.

Yan decided on 2026-10-02:

- An anchored balloon is **trimmed flush** by its panel's border.
- Connected balloons use a **neck by default**, with a **thin line** as the option.

## Goal

From the Inspector, and from MCP:

- **Roundness:** a speech, whisper or caption balloon can be set anywhere from an exact ellipse
  to a square-cornered box.
- **Points:** a thought balloon's bump count and a shout's spike count and depth can be set.
- **Anchor:** a balloon can be anchored to any corner of a panel. It then sits in that corner,
  cut off flush by the panel border, and follows the corner when the grid changes.
- **Connection:** a balloon can be connected to a next one, by a merged neck or a thin line.
- **Strikethrough:** text can be struck through, as well as bolded and italicised.
- **Compatibility:** existing balloons look exactly as they do today.

## Approach

**Model.** Every addition is an optional `Balloon` field, so stored comics need no migration and
render unchanged. Absent means today's behaviour.

| Field | Meaning | Applies to | Absent means |
|---|---|---|---|
| `roundness` | 0 to 1: the corner radius as a fraction of the half-width and half-height | speech, whisper, caption | 1 for speech and whisper (ellipse); 0 for caption |
| `points` | bumps for a thought balloon, spikes for a shout; 5–48 | thought, shout | size-based bumps; 18 spikes |
| `depth` | 0 to 1: how deep the spikes cut | shout | today's depth, 0.55 |
| `anchor` | `{ panelId, corner: 'tl' \| 'tr' \| 'bl' \| 'br' }` | all except sfx | free placement |
| `next` | the id of the balloon this one connects to | all except sfx | not connected |
| `connector` | `'neck'` or `'line'` | the balloon that has `next` | neck |

`clipTo` stays as an unused legacy field. `anchor` implies the clip.

**Roundness geometry.** The outline is a rectangle with **elliptical** corners: rx = r·w/2 and
ry = r·h/2.

- At r = 1 this is exactly today's ellipse, so nothing old changes. At r = 0 it is a box.
- One shape covers 5278's oval, 5279's boxes and 5280's soft rectangles, and it is a plain SVG
  path.
- Rejected: a superellipse. Its exponent feels non-linear, and it is never exactly a box.

Tails attach where a ray from the centre meets the outline (`outlinePoint`), not on an assumed
ellipse. The text inset follows the corner: 0.146·r at the corners, never below the caption's
0.06. So text is not stranded in a box with nearly square corners.

**Bumps and spikes.** `points` replaces the bump and spike counts that are computed today. In
`spikyPath`, `depth` sets the inner radius: k = 1.08 − 0.4·depth. The default of 0.55 reproduces
today's 0.86.

**Anchor (trimmed flush).**

- **Placing:** anchoring moves the balloon so that it overhangs the panel's corner. The overhang
  is the stroke, plus 0.293 × the corner radius (the 45° point of the corner arc). So the border
  cuts through the rounded corner the way it does in 5278, and a box (r = 0) loses its own
  border on those two sides, like 5279's top box.
- **Clipping:** the balloon is clipped to the panel's outline polygon, tail included. The clip
  goes on the balloon's drawing, not on its Transformer, so the selection handles stay visible.
- **Following the panel:** `repinAnchors(page)` re-snaps anchored balloons, keeping their size,
  and is called by `setGrid`, `mergePanels` and `splitPanel` in `model/panels.ts`. Those cover
  the editor and MCP alike.
  - A balloon whose panel is gone loses its anchor and keeps its place.
- **Dragging** an anchored balloon detaches it, in one undo step with the move.
- **Resizing** keeps the anchor and re-pins the balloon, so the anchored corner stays put.
- **Choosing the panel:** the Inspector offers the corners of the panel under the balloon's
  centre. If there is no panel there, it falls back to the nearest one.

**Connections.**

- **Data:** `next` makes a chain, which is also reading order. Its rules:
  - each balloon has at most one `next`;
  - cycles are refused;
  - deleting a balloon removes any `next` pointing at it, in the same edit.
- **Placement:** a connector runs between the two outlines along the line joining their centres.
  The page draws connectors, because they belong to no single balloon.
- **Neck:** a band whose width is 22 % of the smaller balloon's height. Two layers make the
  outlines merge into one:
  - its **stroke** layer sits below the pair;
  - its **fill** layer sits above the pair's outlines. It covers each balloon's stroke across the
    mouth of the neck, so the joint reads as one shape.
  - The fill only reaches a stroke's width into each balloon, so it never covers text, which is
    inset.
- **Line:** a plain stroked line, under both balloons.
- Rejected: drawing a union path of the shapes, which needs polygon boolean operations on
  curves.

**Text.** Add a strikethrough button (⌘⇧S, TipTap's own binding) to the Inspector toolbar. Over
MCP, `~~text~~` becomes `<s>`, and `htmlToPlain` maps it back.

**Order.**

1. Strikethrough (cheap).
2. Roundness, bumps and spikes: geometry plus Inspector.
3. Anchors.
4. Connections.

Each step is usable on its own.

## Tasks

- [ ] Plan, and the diary entry
- [ ] Strikethrough: Inspector button, `~~` over MCP, and tests
- [ ] Shape geometry: rounded-rect outline, `outlinePoint` tails, inset by roundness, `points`
      and `depth`; tests
- [ ] Shape controls: Inspector sliders, and the MCP `add_balloon`/`update_balloon` fields;
      `get_comic` reports them
- [ ] Anchors: `anchorBalloon`, `repinAnchors` in the grid ops, the clip in the render, drag to
      detach, the Inspector menu and MCP; tests
- [ ] Connections: `next`/`connector`, cycle and delete rules, neck and line rendering, the
      Inspector menu and MCP; tests
- [ ] Verify in the browser (below); then status `done`

## UI mockups (ASCII)

Inspector with a speech balloon selected. The new rows sit under the existing ones; rows that
don't apply to the type are hidden:

```
┌ Inspector ──────────────────────────┐
│ BALLOON                             │
│ [B] [I] [S̶] [≡] [≡] [≡]  ← strike   │   (toolbar while editing text)
│ Font        [Style — Rubik 500  ▾]  │
│ Type        [speech ▾]              │
│ Font size   [ 26 ]                  │
│ Fill        [■]                     │
│ Tail        [✓]                     │
│ ─ Shape ─────────────────────────── │
│ Roundness   oval ◯━━━━━━━━●━ box    │   speech / whisper / caption
│ Bumps       [ 14 ]  ━━━●━━━━        │   thought only ("Spikes" for shout)
│ Depth       ━━━━━●━━━━              │   shout only
│ ─ Placement ─────────────────────── │
│ Anchor      [None ▾]                │   None / Top-left / Top-right /
│                                     │   Bottom-left / Bottom-right of panel 3
│ ─ Connection ────────────────────── │
│ Connect to  [None ▾]                │   other balloons: "2 · There wasn't even…"
│ Connector   (•) Neck  ( ) Line      │   only when connected
│ [To front] [To back]                │
│ [Delete balloon]                    │
└─────────────────────────────────────┘
```

On the canvas, an anchored balloon and a necked pair:

```
┌─────────────── panel ───────────┐
│HUMAN BEINGS MUST    )           │  ← balloon cut flush by the panel's top
│WORK TO CREATE SOME )            │    and left edges, its tail still drawn
│COHERENCE…  ______/              │
│        \/                       │
│                ╭──────────────╮ │
│                │ THERE WAS    │ │
│                ╰────╮  ╭──────╯ │  ← neck: one merged outline
│                ╭────╯  ╰──────╮ │
│                │ …BY FIRELIGHT│ │
│                ╰──────────────╯ │
└─────────────────────────────────┘
```

## Keyboard interaction

1. **Tab order in the Inspector** follows the order of the mockup. Sliders are
   `<input type="range">`, so the arrow keys step them (1 % for roundness and depth, 1 for
   points) and Home/End jump to the ends. Anchor and Connect to are `<select>`s. The connector
   style is a radio pair.
2. **Undo:** each control commits on `change` as one undo step. A slider that the keyboard
   steps several times groups into one step, the way a balloon's text does while it is being
   typed.
3. **Shortcuts:** ⌘⇧S toggles strike while editing text (TipTap's binding), like ⌘B and ⌘I.
   No new canvas keys.
4. **Focus:** it stays on the control after a change. Anchoring or connecting moves things on
   the canvas but not the focus.

## Test list (TDD)

- [ ] `markdownToHtml('~~gone~~')` gives `<s>gone</s>`, and `htmlToPlain` gives it back.
      Layer: unit, `src/lib/ops/text.test.ts`
- [ ] Roundness outlines. Layer: unit, `src/lib/geometry/balloon.test.ts`
  - `roundedPath` with r = 1 traces the same ellipse as today (same points at 0/90/180/270°);
  - with r = 0 it is the bounding box.
- [ ] `outlinePoint` lies on the outline. It meets a box's edge at the right place, and an
      ellipse's at the same place as `ellipsePoint`. Layer: unit, `balloon.test.ts`
- [ ] `textInset` is 0.15 for an ellipse, 0.06 for a box, and monotonic in between. Layer: unit,
      `balloon.test.ts`
- [ ] `points` sets the bump count (counting arcs) and the spike count (outer vertices), and
      `depth` sets the inner radius. Absent values reproduce today's paths exactly. Layer: unit,
      `balloon.test.ts`
- [ ] Anchors. Layer: unit, `src/lib/model/balloons.test.ts`
  - `anchorBalloon` places the balloon overhanging the chosen corner by the formula, for each
    of the four corners;
  - `repinAnchors` keeps the anchor through a grid margin change;
  - it drops the anchor of a balloon whose panel was merged away.
- [ ] `setGrid`, `mergePanels` and `splitPanel` re-pin anchored balloons. Layer: unit,
      `src/lib/model/panels.test.ts`
- [ ] Connections. Layer: unit, `balloons.test.ts`
  - `connectBalloons` refuses a cycle and a balloon pointing at itself;
  - a delete removes the dangling `next`;
  - the neck geometry starts and ends on the two outlines.
- [ ] The Y.Doc round-trips `roundness`, `points`, `depth`, `anchor`, `next` and `connector`.
      Layer: unit, `src/lib/model/ydoc.test.ts`
- [ ] MCP covers it all: `update_balloon` sets and clears the new fields, refuses a cycle and an
      unknown panel or balloon, and `get_comic` reports them. Layer: unit,
      `src/lib/server/mcp/server.test.ts`
- [ ] The editor detaches an anchored balloon when it is dragged, as one undo step, and keeps the
      anchor through a resize. Layer: unit, `src/lib/editor/editor.test.ts`

## Verification

In the dev server against the local Supabase, on a new board comic:

1. Add a speech balloon. It looks exactly as it does today: an ellipse with its tail.
   - Drag Roundness to "box". The outline goes through rounded rectangles to a box; the tail
     stays attached and the text stays inside.
   - Press ⌘Z. It returns in one step.
2. Change the type to shout, and set Spikes to 8 and then 30, and Depth low and then high. The
   outline follows each change.
   - Do the same for a thought balloon's Bumps.
3. Double-click a balloon, select a word, and press ⌘⇧S. It is struck through. The new toolbar
   button shows it as active.
4. With a balloon over panel 1, set Anchor to Top-left. The balloon moves into the corner, and
   the panel border cuts it on the top and left; its tail still shows.
   - Change the grid gutter. The balloon stays in the corner.
   - Drag the balloon away. The anchor clears, and ⌘Z restores both.
5. Add two caption-like speech balloons with roundness about 0.15, one above the other. Set the
   first's Connect to the second.
   - A neck joins them, and the outlines merge with no line across the joint.
   - Switch Connector to Line. A thin line joins them instead.
   - Delete the second balloon. The connector goes, and the first balloon's menu says None.
6. Export a PNG. The clip and the connectors are in the image.
7. Over MCP, `update_balloon` with `roundness`, `anchor` and `next` changes the open editor
   live, and `get_comic` reports the fields.

## Out of scope

- **Style-level shape defaults** (a house roundness and connector). This was suggested
  2026-10-02 as a follow-up that hooks into the style typography work.
- **Freeform tails:** curved, multiple or wavy ones.
- **Using connection chains as reading order** in the script export.
- **Snapping a dragged balloon into a corner** to anchor it. Anchoring is done from the
  Inspector or over MCP.
- **Underline.** It was not asked for.

## Open questions

- [ ] Should an anchored balloon's tail be clipped too, when it points out of the panel? The plan
      clips the whole balloon, which matches the references.

## Outcome

_Filled in when this goes to `done` or `abandoned`._
