# Comic playbook: from a rough draft to a finished A1 comic

These are the steps that took *The Youngest Delegate* from a four-page art-style test
(2026-10-01) to a seven-board A1 comic (2026-10-02,
[plan](../plans/2026-10-02_youngest-delegate-a1.plan.md), comic `5a2cdb4a…`, code `YD`). Repeat them
for *The Year It Snowed* and *Visa for a Hilsa*.

Who does what: **Yan** decides and reviews. **The agent** (Claude Code with the Riverbanks MCP,
`gws` and Chrome) drafts, builds and checks.

---

## 0. Before you start

- **Read the canon:** `content/canon/riverbanks-canon.md`.
  - The story text in **RIVERBOOK › Edited Drafts** is canon for events.
  - The timeline sheet is canon for years and family.
  - Sam's slides are canon for the frame, the acts and the look of the world (e.g. the flotel).
- **Write a plan** under `plans/` (see `CLAUDE.md`). For *Snow* and *Hilsa*, the plan already
  exists: [Sam's feedback](../plans/2026-10-02_sam-feedback-snow-hilsa.plan.md).
- **Settle the act** the story belongs to. It goes in every board's header.

## 1. Script: one A1 board per scene

1. **Outline first, without dialogue.**
   - One board per Edited Drafts scene.
   - Each board is a 4 × 4 grid, cells 0–15, left to right and top to bottom.
   - For each page, draw an ASCII grid of the merged cells, then give each panel its cells and a
     one-line description.
   - Aim for 5–7 panels a page. One big panel carries the page; sparse pages are fine for
     teaching or climaxes.
2. **Decide the through-lines,** for example:
   - a recurring set seen from the same camera as power shifts (YD's throne room on pages 1, 4
     and 6);
   - a colour that spreads (the network's teal);
   - an object that travels (Hilsa's brass pot);
   - a face that must be recognisable later (Dew at the Summit).
3. **Put concepts in captions on the big panels.** Readers should learn the world as they read
   (Sam's principle). Dialogue stays character-driven.
4. **Review with Yan.** Then add dialogue: only the lines a panel needs, starting from Edited
   Drafts and trimmed.
   - Budget 80–120 words a page; visitors read standing up.
   - Count the words by script.
5. **Write it into the doc.**
   - Put the v2 script at the top of the story's *Script:* tab, above v1.
   - Use H2 for pages, H3 for panels, bold for lettering, and monospace for the grids.
   - Keep a local copy at `content/drafts/YYYY-MM-DD_<story>_v2.md`.

   `./scripts/script-to-doc.py <draft.md> <tab id> --below "Version 1: …"` builds the
   `gws docs documents batchUpdate` requests from the markdown and inserts them under the tab's
   title: `!` lines are bold, `##`/`###` are headings, and fenced blocks are monospace. Use
   `--dry-run` first. It only inserts; before replacing an existing v2 section, check it against
   the local copy, so no one's edits are lost.

## 2. Prepare the cast

The style is "Riverbanks house style" (`b5f76d95…`). A panel prompt that names a cast member,
by name or alias, gets that member's starred sheet attached.

1. **Every recurring set becomes a cast *place*.** Examples: *the flotel*, *the throne room of
   Muara*. Without one, the room is redrawn differently in every panel.
   - **To base one on existing art**, e.g. Sam's slides: pass the image's live Slides
     `contentUrl` to `add_style_reference` with the member's name. Base64 is too large to paste.
     Then run `generate_cast_portrait` to redraw it in the house style.
2. **Pin every recurring look in the description,** with capitals where it matters:
   - facial hair ("CLEAN-SHAVEN", "ALWAYS a short grey beard");
   - how clothes are worn (shirt tucked in, belt, sleeve length);
   - hair colour and age.

   Anything left open drifts from panel to panel. YD lost a moustache, an untucked shirt and a
   beard this way.
3. **Check every sheet by eye.**
   - Open the style page in Chrome, read the `img` `src` (a signed Supabase URL), `curl` it,
     then view it.
   - Sheets can carry garbled text or the wrong detail (e.g. rolled sleeves).
   - Redraw until the sheet is right, then **star** it: `set_cast_member … portraitId`.

## 3. Build the boards

1. **Create the comic and set its bands.**
   - `create_comic` (A1 board format by default), then `set_comic_style`.
   - `set_header_footer` for the comic-wide header ("ACT TWO / TAMING CURRENTS") and footer.
   - `add_page` for each page.
   - Merges are not copied to new pages, so `merge_panels` by cells on each page. A merged panel
     keeps its first cell's id.
2. **Generate a page's panels together.** `generate_panel_image` calls can run in parallel.
   - Describe only the scene, and name the cast members in it.
   - Don't write "full-bleed", "no frame" or "leave space": they make borders and blank bands
     *more* likely. To get room for lettering, name concrete scenery ("a broad pale sky with a
     few soft clouds", "a high timber ceiling").
   - To keep characters large, frame the shot in words ("close medium shot", "seen from the
     thighs up", "figures fill the frame height").
   - Spell out the pinned details again in the prompt (clean-shaven, shirt tucked in).
   - A call that times out has usually finished anyway. Check the page before retrying.
3. **Letter the page.**
   - Size each box from its text.
     - Captions are Rubik italic capitals: about **0.7em per character**, line height 1.12, a 6%
       inset.
     - Speech is about 0.53em per character, with a 15% inset in an ellipse.
   - Font sizes: captions 15–19, speech 16–18, name labels 14. `add_balloon` defaults to 26, so
     follow it with `update_balloon`.
   - On small panels the faces fill the frame. Put balloons across the border into clear floor or
     ceiling in the panel above, or into an empty part of the header band.
   - **Long lines:** split them into two balloons joined with `next`, or use a rounded box
     (`roundness` ≈ 0.3), which holds more text than an ellipse.
   - Name labels introduce the cast on the first page, because visitors need the cast up front.
4. **Check the page by eye.**
   - Open `/comics/<id>?page=N` in Chrome, wait for the images, and zoom on the page.
   - Look for text overflow, balloons covering faces, tails missing their speaker, and stray text
     drawn into the art.
   - Fix it, and look again.
5. **Check consistency at full resolution.** Thumbnails hide faces.
   - Read the panel `img` srcs from the editor and match them to panels by position.
   - `curl` them and crop the characters.
   - Check every panel each recurring character is in.
6. **Redraw what's wrong.** Reuse the same prompt so the layout and balloons stay put, then
   re-check the balloons: a new composition can put a face under one.

## 4. Review loop with Yan

Yan reviews in the editor and **edits lettering live** while the agent works.

- **Text:** never overwrite it. Change images; move a balloon only when a redraw demands it. Read
  the current comic (`fetch`, or `get_comic` for ids) before touching any balloon.
- **Art:** typical requests are a redraw for continuity, a closer shot (match Yan's manual zoom),
  or an object done differently (a touch-screen button, not a physical one).
- **Fix the cause, not just the panel.** When a character drifts, fix the cast description and
  sheet first, then redraw every affected panel.
- **Typos** in Yan's text: fix them, and say so.

## 5. Close out

1. **Sync the script with the built comic.** Rewrite the v2 lettering in the local draft from
   `fetch`, then replace the doc tab's v2 section. Check the section is unchanged before
   overwriting.
2. **Canon file:**
   - new decisions (names, looks, act);
   - production state (current comic id, new cast places);
   - open questions.
3. **Story network:** if names or people changed, run the `riverbook-network` skill. If
   `set_story_network` fails to copy a portrait with an empty error, retrying works.
4. **Plan:** tick the tasks, write the Outcome, and set `status: done`.
5. **Diary:** a work-log entry, then `./scripts/work-diary.py` to regenerate the commit table.
6. **Commit** the content with the plan's `Plan:` trailer next to `Co-Authored-By`.

## Things that went wrong on YD, and the fix

| Problem | Fix |
|---|---|
| Characters drift: a moustache, an untucked shirt, a missing beard, grey hair | Pin the look in the cast description in capitals, redraw and star the sheet, re-check every panel |
| A balloon has no room because faces fill the top of the panel | Redraw as a wider shot with named sky or ceiling, or put the balloon across the border |
| The model draws text into the image (a "2030" box, garbled sheet labels) | Cover it with a caption, or redraw |
| A caption box overflows | Italic capitals are wider: allow about 0.7em per character |
| The app shrinks text that doesn't fit an ellipse | Use a rounded box, or a wider balloon |
| A physical object comes out wrong (a 3D button out of a screen) | Say "flat, on-screen, two-dimensional" in the prompt |
| Gemini prepaid credits run out | Yan tops up in AI Studio; generation resumes |
| A generation times out | It has usually finished: check before retrying |
| A hologram comes out in full colour (VH 3.6) | Leave the character out of `cast` (their sheet brings their colours) and describe them in words as one flat colour |
| A set's colours drift between panels (green walls in a tan hut) | Name the material's colour in every prompt ("pale tan woven bamboo, not green") |
| Faces fill the top of a wide strip and leave no room for lettering | Say what fills the upper half ("the high ceiling fills the upper half") and that the figures sit in the lower half |
| A cast name gets drawn as text on the object ("Ya's e-paper notebook") | Leave the prop out of `cast` and describe it |
| Left and right won't hold (the boat in VH 7.4) | Spell out every direction; if it still flips, keep the take with the right emotion and flag it |
