---
slug: 2026-10-02_panel-refs
status: active
started: 2026-10-02
finished:
issue:
---

# Human-readable panel references: `<COMIC>:<PAGE>:<PANEL>`

## Context

Panels are known by UUIDs (`dc8351b8-…`). People can't say those, and agents have to call
`get_comic` to find them. Scripts and conversation already name panels by position: "Panel 2.3"
in the script tabs, and "Panel 3" in `fetch`'s plain-text script, numbered in reading order
(`ops/script.ts` `orderedPanels`: grid panels by first cell, then free panels bottom to top).

Yan asked on 2026-10-02 for IDs like `<COMIC>:<PAGE>:<PANEL>` that can be easily referenced.

## Goal

- **The ref:** every panel has `CODE:page:panel`, for example `TC:2:3`, shown in the editor and
  in everything agents read.
- **Comic code:** a short code per comic, editable, defaulting to the title's initials.
- **MCP:** every tool that takes a panel id also accepts a ref.

## Approach

**Positional, not permanent.** `TC:2:3` always means "page 2, panel 3 in reading order", which
is how the scripts and conversations already talk.

- **The catch:** it moves when pages are reordered or panels merged.
- **Rejected:** stored, permanent refs. They would drift away from what they describe (a
  "TC:2:3" sitting on page 4). The UUIDs stay underneath for anything that needs to be stable.

**Comic code.**

- **Storage:** `Comic.code`, optional. The UI and MCP clean it to 2–8 capital letters and digits.
- **Default:** the initials of the title's significant words. *Taming Currents* gives `TC`, *Visa
  for a Hilsa* `VH` and *The Youngest Delegate* `YD`.
- **Uniqueness:** not enforced. The code only has to make sense within the comic it is used in.

**One module, `model/refs.ts`:**

- `comicCode(comic)`;
- `readingOrder(page)`, which moves here from `script.ts`;
- `panelRef(comic, pageIndex, panelId)`;
- `resolvePanelRef(comic, ref)`, which returns `{ page, panelId }` or throws with a readable
  reason;
- `isPanelRef(s)`.

**MCP.** A single wrapper around `server.registerTool` resolves any `panelId`, `panelIds[]` or
`anchor.panelId` that looks like a ref before the tool runs.

- **Conflicts:** a tool's own `page` must agree with the ref's ("TC:2:3 is on page 2, not page
  1"), and a ref with a different comic code is refused.
- **Rejected:** adding resolution to each of the ~12 tools separately.

**Where refs show.**

- **`get_comic`:** each panel gets `ref`, and the comic gets `code`.
- **`fetch` (the script):** it says "Panel TC:2:3".
- **`rename_comic`:** it can set `code`.
- **Editor:**
  - the Inspector's Panel heading shows the ref, with a copy button;
  - the Comic section gets a Code field;
  - a canvas toggle, **IDs**, labels every panel on the page.

## Tasks

- [ ] `model/refs.ts`, `Comic.code` (Y.Doc), and tests
- [ ] MCP: ref resolution wrapper, `ref` and `code` in `get_comic`, the script, `rename_comic`
      code; tests
- [ ] Editor: Inspector ref, copy and Code field; the canvas IDs toggle
- [ ] Verify; `done`

## UI mockups (ASCII)

```
Canvas, IDs on:                           Inspector, a panel selected:
┌──────────────┬──────────────┐           PANEL  TC:1:3  [Copy]
│ TC:1:1       │ TC:1:2       │           1 cell
│              │              │           …
├──────────────┼──────────────┤
│ TC:1:3       │ TC:1:4       │           Inspector, nothing selected:
│              │              │           COMIC
└──────────────┴──────────────┘           Style  …            [Change…]
 zoom bar:  [IDs] − 54% + Fit             Code   [TC    ]
```

## Keyboard interaction

- **IDs toggle:** a button in the zoom bar, `aria-pressed`, reached with Tab.
- **Copy:** a button beside the ref. When it copies, it says "Copied TC:1:3" through the
  editor's status line.
- **Code field:** a text input that commits on Enter or blur, as one undo step.

## Test list (TDD)

- [ ] `defaultCode` gives "TC", "VH", "YD", and something sensible for a one-word or empty
      title. Layer: unit, `src/lib/model/refs.test.ts`
- [ ] `panelRef` numbers panels in reading order: grid panels by first cell, then free panels.
      Layer: unit, `refs.test.ts`
- [ ] `resolvePanelRef` round-trips a ref, ignores case, and refuses a wrong code, a missing page
      and a missing panel with readable reasons. Layer: unit, `refs.test.ts`
- [ ] `Comic.code` round-trips through the Y.Doc and can be cleared. Layer: unit,
      `src/lib/model/ydoc.test.ts`
- [ ] MCP behaviour. Layer: unit, `src/lib/server/mcp/server.test.ts`
  - `get_comic` reports `code` and each panel's `ref`;
  - `update_panel` with `panelId: "TC:1:3"` acts on that panel;
  - a page that disagrees with the ref is refused;
  - `merge_panels` accepts refs in `panelIds`;
  - `rename_comic` sets the code.
- [ ] The `fetch` script labels panels by ref. Layer: unit, `src/lib/ops/script.test.ts`

## Verification

1. Open a comic and turn on **IDs**. Each panel shows its ref in reading order. Merge two
   panels: the numbers update.
2. Select a panel. The Inspector heading shows its ref, and Copy puts it on the clipboard.
3. Change the Code to "ACT2". All the labels follow.

## Outcome

_Filled in when this goes to `done` or `abandoned`._
