---
slug: 2026-10-12_toolbar-menus
status: active
started: 2026-10-12
finished:
issue:
---

# Toolbar: Text and Export menus

## Context

The editor toolbar (`src/lib/components/Toolbar.svelte`) has grown to six balloon buttons
(Speech, Thought, Whisper, Shout, Caption, SFX) and three export controls (PNG, PDF, and the
Watermark popover from `2026-10-12_export-watermark`). Yan asked (2026-10-12) to group them under
two menus.

The single-key shortcuts (S, T, W, K, C, X for balloons, ⌘E for PNG) are handled by the editor's
keydown handler, not by the buttons, so they keep working whatever the toolbar looks like.

## Goal

The toolbar shows a **Text** menu button where the six balloon buttons were, and an **Export**
menu button where PNG, PDF and Watermark were. Each opens a dropdown that adds the balloon, or
exports, or holds the watermark setting. Everything is reachable by keyboard, and the shortcuts
are unchanged.

## Approach

- **`Dropdown.svelte`**: a button that opens a panel below it (the disclosure pattern:
  `aria-expanded`, `aria-controls`). The panel is for any content, not only commands.
  - Opening it focuses the first control inside.
  - ↑/↓ move between its controls, wrapping around; Home and End jump to the first and last.
  - Escape closes it and returns focus to the button. A click outside closes it without
    taking focus.
  - A control marked `data-close` closes the panel once activated.
- **Text menu:** six items, each showing its label and shortcut ("Speech · S").
- **Export menu:**
  - "PNG — this page · ⌘E" and "PDF — every page".
  - A divider, then the watermark checkbox and text field, as before.
  - The Export button is tinted while the watermark is on, so that stays visible when the
    menu is closed.
- **Rejected: ARIA `role="menu"`.** A menu may only hold menu items, and Export holds a text
  field. A disclosure panel allows any controls, and Tab works inside it as usual.

## Tasks

- [x] `Dropdown.svelte`, with the Text and Export menus in the toolbar. Checked in Chrome on the
      dev server (`/local`): Enter opens either menu on its first item; ↑/↓/Home/End move;
      Text → Caption adds a caption in editing mode and closes the menu; space ticks the
      watermark, typing in its field fires no shortcuts, and Enter closes and refocuses Export,
      which stays tinted; a click outside closes a menu. The first build refocused the menu
      button after a balloon item and so took focus from the new balloon's text; refocusing is
      now opt-in (`data-close="refocus"`, PNG and PDF only).
- [ ] e2e: the Caption and PNG clicks go through their menus; a new test covers the menu
      keyboard flow and the watermark on the print pages
      — written, not yet run: the e2e config needs the local Supabase stack, whose ports
      another project's stack holds, and the machine's load (~900) made builds take 16 minutes.
- [x] Deploy and check: deployed 2026-10-12; Yan confirmed export from the Export menu works on the live site

## UI mockups (ASCII)

```
Before: … │ Panel  Full page │ Speech Thought Whisper Shout Caption SFX │   ⬇PNG 📄PDF ◈Watermark  Share
After:  … │ Panel  Full page │ T Text ▾ │                                  ⬇ Export ▾   Share

Text ▾ open:              Export ▾ open (watermark on → button tinted):
┌────────────────────┐    ┌──────────────────────────────┐
│ Speech           S │    │ PNG — this page           ⌘E │
│ Thought          T │    │ PDF — every page             │
│ Whisper          W │    ├──────────────────────────────┤
│ Shout            K │    │ [x] Watermark PNG and PDF    │
│ Caption          C │    │ Text                         │
│ SFX              X │    │ [PREVIEW                   ] │
└────────────────────┘    └──────────────────────────────┘
```

## Keyboard interaction

1. **Tab order:** … Full page, Text, … (status), Export, the people avatars, Share. Inside an
   open panel, Tab moves through its controls in order.
2. **Shortcuts:** unchanged: S T W K C X add balloons, and ⌘E exports the PNG. Inside a panel,
   ↑/↓/Home/End move between controls. In the watermark text field, ↑/↓ are left alone, and
   Enter closes the panel.
3. **Focus:** opening a panel focuses its first control. Escape returns focus to the menu
   button. Choosing a balloon closes the menu, and focus goes to the new balloon's text, as
   the shortcuts already do. Choosing PNG or PDF closes the menu and returns focus to Export.

## Test list (TDD)

The dropdown's logic is focus handling, so e2e (Playwright) is the right layer:

- [ ] Text → Caption adds a caption — e2e — `e2e/editor.e2e.ts` (existing test, via the menu)
- [ ] Export → PNG downloads the page — e2e — `e2e/export.e2e.ts` (existing test, via the menu)
- [ ] Keyboard: Enter opens Export with focus on PNG; ↓ moves to PDF; Escape closes and
      refocuses Export — e2e — `e2e/export.e2e.ts`
- [ ] The watermark checkbox puts a watermark on every print page, and it's still on after a
      reload — e2e — `e2e/export.e2e.ts`

## Verification

1. Open a comic. The toolbar shows Text ▾ and Export ▾, with no loose balloon or export buttons.
2. Tab to Text and press Enter: the menu opens on Speech. Press ↓ four times, then Enter: a
   caption is added, ready to type.
3. Press S on the canvas: a speech balloon is added, as before.
4. Tab to Export and press Enter, then ↓ and Enter: the print dialog opens (PDF).
5. Open Export and turn the watermark on: the Export button is tinted once the menu closes.
6. Click outside an open menu: it closes.

## Out of scope

- Moving the panel tools (Merge, Split, Panel, Full page) into menus.

## Open questions

- [ ] None.

## Outcome

_Filled in when this goes to `done` or `abandoned`._
