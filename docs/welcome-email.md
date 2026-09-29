# Welcome email for a new Riverbanks account

Sent to each new person once an admin has made their account. First sent on
2026-09-28, and revised on 2026-09-29 for the collaboration release: live editing,
Share, and a working MCP server.

## Before sending

1. **Make the account.** In the Supabase dashboard (project `riverbanks-comics`), go to
   **Authentication → Users → Add user → Create new user**. Enter the person's email and a
   temporary password, and tick **Auto Confirm User**.
2. **Use a unique temporary password,** such as `reed-kite-5112` (made up per person), not a shared one like
   `test1234`: until the person changes it, anyone who knows a shared password can sign in as
   them.
3. **Fill the placeholders:** `{{NAME}}`, `{{EMAIL}}`, `{{TEMP_PASSWORD}}`.
4. **Check the capability lines match what is live.** Once style profiles and image generation
   are deployed ([plan](../plans/2026-09-29_style-profiles-generation.plan.md)), replace the
   last line of the Claude section and add the **Styles and generating images** section below.

**Subject:** Riverbanks comic maker: how to sign in, make comics, and use it with Claude

---

Hi {{NAME}},

Riverbanks is up: a comic page maker for the seapunk team, for making Riverbanks comics. Here's
everything you need.

SIGNING IN

1. Go to https://riverbanks-generator.vercel.app and click Sign in.
2. Email: {{EMAIL}}
   Temporary password: {{TEMP_PASSWORD}}
3. Please change it as soon as you're in: "Change password" is at the top right of the comics
   page.

It's an internal tool, so there's no public sign-up and no emails. If you ever forget your
password, tell me and I'll reset it.

MAKING A COMIC

Click "+ New comic" (or press N). Everything saves automatically, and the toolbar shows "Saved".

Panels. A page starts as a 3 × 4 grid.
- Click a panel, then Shift-click (or Shift + arrow keys) to add neighbours, then press M to
  merge them. L and U shapes work.
- Shift+M splits a merged panel back into cells.
- "Full page" turns the whole grid into one borderless panel.
- "Panel" (or P) adds a free panel that floats on top and can be dragged and resized, for
  break-outs like Scott McCloud's Understanding Comics.

Images.
- Drop an image onto a panel, paste one with Cmd+V, or use Upload in the right-hand panel.
- Press Enter (or double-click) to crop: drag to pan, scroll to zoom, and Esc when done.

Text. The toolbar buttons (or keys) add balloons inside the selected panel:
- Speech (S), Thought (T), Whisper (W), Shout (K), Caption (C), SFX (X)
- Start typing straight away. Cmd+B for bold, Cmd+I for italic, and Esc to finish.
- Drag the orange dot to point the tail; double-click a balloon to edit it again.

Also:
- Cmd+Z undoes anything, including just your own changes when others are editing too.
- The left sidebar adds, reorders and deletes pages.
- "PNG" (Cmd+E) downloads the current page, and "PDF" prints the whole comic.

WORKING TOGETHER

- "Share" (top right in a comic) invites someone by their Riverbanks email. Everyone invited
  can edit.
- Several people can edit the same comic at once. Changes appear for everyone within a moment,
  and nothing is overwritten.
- You'll see who else is in the comic, which page they're on, what they've selected, and
  their cursor while they type in a balloon.
- Comics shared with you are listed under "Shared with me".

USING IT WITH CLAUDE (MCP)

Riverbanks has an MCP server, so Claude can build and edit your comics with you.

- Claude Code: run
    claude mcp add --transport http riverbanks https://riverbanks-generator.vercel.app/mcp
  then type /mcp inside Claude Code. A browser opens: sign in with your Riverbanks account and
  click Allow.
- claude.ai: Settings → Connectors → Add custom connector, and paste
    https://riverbanks-generator.vercel.app/mcp
- ChatGPT also works, on a plan with Developer mode. Ask me for the steps.

Then ask for things like: "Create a comic called Sediment. On page 1 merge the top row into one
wide panel with a caption 'Bangkok, October 2026', and put a speech balloon in cell 5 saying 'The
river does not hoard.'"

If you have that comic open in the browser, you'll see Claude's changes appear live, alongside
your own.

Claude can list, create, rename and delete comics; add, move and delete pages; change the grid;
merge and split panels; add free panels; place images from a URL; and add, edit and delete
balloons. It can't draw or generate images itself yet.

Any problems or wishes, send them my way.

Yan

---

## Styles and generating images (add once deployed)

```
STYLES AND GENERATING IMAGES

A style is a set of reference images plus a short description, a palette and things to avoid.
Make one under "Styles": upload references, mark characters and objects with a name (like
"Mae"), and press "Describe from references" to have it draft the text for you.

Pick a style when you create a comic, or later in the right-hand panel. Then select a panel,
press G, describe what happens in it, and press Cmd+Enter: the image comes back in the style,
shaped to the panel. Every take is kept, so you can switch back.
```

And in the Claude section, replace "It can't draw or generate images itself yet." with:
"It can also list styles, set a comic's style, and generate a panel's image in it."
