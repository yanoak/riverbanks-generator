---
name: riverbook-network
description: Sync the story network (the /network page in Riverbanks) from the RIVERBOOK Google Doc, which is canon. Use when asked to update, refresh or sync the character network, network diagram or character map, after new stories or edits land in the Edited Drafts tab, or when checking who is connected to whom.
---

# Sync the story network from RIVERBOOK

The `/network` page in the Riverbanks app shows every character in the canonised stories and how
they are tied. Its data is one document, saved over the Riverbanks MCP (`set_story_network`) and
committed to `content/network/riverbook.json` for history. **The Google Doc is canon.** This skill
rebuilds the network from it. Never invent people or ties that the sources don't support.

## Sources, in order of authority

1. **RIVERBOOK › Edited Drafts and its child tabs**: the stories and their scripts.
   - Document `18NGMxqVUeZz93RChMafRJ-Eh0aKomNfE02zNmpqDh9U`, tab `t.igit5bn60vtm`.
   - The script tabs sit under it. Read every child tab, including ones added since the last sync.
   - This source wins for what happens in the stories.
2. **The character timeline sheet**: years, ages and family.
   - Sheet `1tSifqkz57Ociu9xq-dRsMxBDvGYcprkoxBNd77GNY_A`.
   - This source wins for birth and death years and for who is whose parent or grandparent.
3. **Other RIVERBOOK tabs** (older drafts, Material Kit) are **not** canon. Use them only to
   understand a name, and never to add a fact the two sources above don't state.

If the doc and the sheet disagree, don't pick silently. List the conflict for the user and, where
you have to choose, follow the order above.

## Steps

1. **Read the sources.** `gws` needs nvm on the PATH:

   ```bash
   export PATH="/Users/yan/.nvm/versions/node/v22.18.0/bin:$PATH"
   gws docs documents get --params '{"documentId":"18NGMxqVUeZz93RChMafRJ-Eh0aKomNfE02zNmpqDh9U","includeTabsContent":true}' > /tmp/riverbook.json
   gws sheets spreadsheets values get --params '{"spreadsheetId":"1tSifqkz57Ociu9xq-dRsMxBDvGYcprkoxBNd77GNY_A","range":"A1:ZZ500"}' > /tmp/timeline.json
   ```

   Extract the text of tab `t.igit5bn60vtm` and every child tab under it, walking `childTabs`.
   Paragraph text is in `documentTab.body.content[].paragraph.elements[].textRun.content`.

2. **Rebuild the network.** Write a new `content/network/riverbook.json` in the schema below.
   - Start from the current file and keep its ids stable, so diffs and links stay meaningful.
   - Rename an id only when a character's identity changes, not when their name is respelled.

3. **Validate and diff.**

   ```bash
   npx vitest run src/lib/network          # the schema accepts it; every tie resolves
   ./scripts/network-diff.py                # readable changes vs the committed version
   ```

4. **Show the user the diff and any conflicts, and wait for their go-ahead.** Saving replaces the
   live network the team sees.

5. **Save and commit.**
   - Call MCP `set_story_network` with the whole document as `network`.
   - Commit `content/network/riverbook.json` with a message naming what changed.
   - If a plan is in progress, end the message with that plan's `Plan:` trailer next to
     `Co-Authored-By`.

## Schema (validated by `src/lib/network/canon.ts`)

```jsonc
{
  "meta": {
    "syncedAt": "YYYY-MM-DD",
    "sources": [{ "name": "…", "url": "https://…" }],
    "notes": ["Caveats the team should see, e.g. where an age comes from the art, not canon."]
  },
  "stories": [{ "id": "hilsa", "title": "Visa for a Hilsa", "years": "2065", "order": 3 }],
  "people": [{
    "id": "ya",                       // kebab-case, stable
    "name": "Ya",
    "kind": "person",                 // person | animal | companion | institution
    "aliases": [],
    "born": 2032, "died": null,       // years from the timeline sheet; null when not canon
    "home": "Chiang Mai",
    "stories": ["snow", "hilsa"],     // story ids they appear in; "timeline" for sheet-only people
    "summary": "Two or three sentences: who they are and what they do in the stories."
  }],
  "links": [{
    "id": "dew-ya",                   // "<source>-<target>", stable
    "source": "dew", "target": "ya",
    "type": "family",                 // family | inspired | friends | work | member | companion
    "label": "grandmother, teacher",  // the relationship in a few words
    "story": "snow", "year": 2040,    // where and when it happens, or null
    "note": "One line of context."
  }]
}
```

## What goes in

- **People:** every named character in the Edited Drafts stories, plus unnamed ones who matter to
  the plot ("The General"). Also people the timeline sheet names (story `"timeline"`).
- **Animals and companions:** those with a role (Taro, the drone).
- **Institutions:** only when a character is tied to them (KAN, the Bengal Passage Cooperative).
  Not every institution in the world bible.
- **Ties:** only what the sources state or directly imply.
  - Family comes from the sheet, or from the story text.
  - A meeting, mentorship or recruitment comes from the story text.
  - Don't add a grandparent tie that is already implied by two parent ties, unless the sources make
    a point of it (e.g. a scene of Teja with Grandma Ismahan).
- **Summaries:** written from the canon text, in plain sentences, without speculation.
