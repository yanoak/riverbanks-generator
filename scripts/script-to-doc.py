#!/usr/bin/env python3
"""Insert a comic script (content/drafts/*.md) at the top of a RIVERBOOK *Script:* tab.

Markdown mapping, as in docs/comic-playbook.md: `## ` → Heading 2, `### ` → Heading 3,
`! ` lines → bold, fenced blocks → Roboto Mono, blank lines dropped. The text goes right
after the tab's title, followed by an H2 that names the version below it (--below).
Nothing is deleted, and the write is tied to the doc's current revision.

    ./scripts/script-to-doc.py content/drafts/X_v2.md t.pmaik04qta2f \
        --below "Version 1: art-style test (4 pages, 1 Oct 2026)" [--dry-run]
"""
import argparse, json, os, subprocess, sys

DOC = "18NGMxqVUeZz93RChMafRJ-Eh0aKomNfE02zNmpqDh9U"  # RIVERBOOK
GWS_PATH = "/Users/yan/.nvm/versions/node/v22.18.0/bin"


def gws(*args):
    env = dict(os.environ, PATH=GWS_PATH + ":" + os.environ["PATH"])
    out = subprocess.run(["gws", *args], capture_output=True, text=True, env=env, check=True)
    return json.loads(out.stdout)


def find_tab(tabs, tab_id):
    for t in tabs:
        if t["tabProperties"]["tabId"] == tab_id:
            return t
        found = find_tab(t.get("childTabs", []), tab_id)
        if found:
            return found


def paragraphs(md, below):
    paras, fenced = [], False
    for line in md.splitlines():
        if line.startswith("```"):
            fenced = not fenced
        elif fenced:
            paras.append((line, "mono"))
        elif not line.strip():
            continue
        elif line.startswith("### "):
            paras.append((line[4:], "h3"))
        elif line.startswith("## "):
            paras.append((line[3:], "h2"))
        elif line.startswith("! "):
            paras.append((line[2:], "bold"))
        else:
            paras.append((line, "normal"))
    if below:
        paras.append((below, "h2"))
    return paras


def u16(s):
    return len(s.encode("utf-16-le")) // 2


def requests(paras, tab, start):
    text = "".join(t + "\n" for t, _ in paras)
    end = start + u16(text)
    rng = lambda a, b: {"startIndex": a, "endIndex": b, "tabId": tab}
    reqs = [
        {"insertText": {"location": {"index": start, "tabId": tab}, "text": text}},
        # Inserted text inherits the neighbouring run's style; reset it first.
        {"updateTextStyle": {"range": rng(start, end), "textStyle": {"bold": False, "italic": False},
                             "fields": "bold,italic,weightedFontFamily"}},
        {"updateParagraphStyle": {"range": rng(start, end), "paragraphStyle": {"namedStyleType": "NORMAL_TEXT"},
                                  "fields": "namedStyleType"}},
    ]
    i = start
    for t, kind in paras:
        n = u16(t) + 1
        if kind in ("h2", "h3"):
            style = "HEADING_2" if kind == "h2" else "HEADING_3"
            reqs.append({"updateParagraphStyle": {"range": rng(i, i + n), "paragraphStyle": {"namedStyleType": style},
                                                  "fields": "namedStyleType"}})
        elif kind == "bold" and n > 1:
            reqs.append({"updateTextStyle": {"range": rng(i, i + n - 1), "textStyle": {"bold": True}, "fields": "bold"}})
        elif kind == "mono" and n > 1:
            reqs.append({"updateTextStyle": {"range": rng(i, i + n - 1),
                                             "textStyle": {"weightedFontFamily": {"fontFamily": "Roboto Mono"}},
                                             "fields": "weightedFontFamily"}})
        i += n
    return reqs


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("markdown")
    ap.add_argument("tab_id")
    ap.add_argument("--below", help="H2 placed after the inserted script, above the older version")
    ap.add_argument("--dry-run", action="store_true")
    a = ap.parse_args()

    doc = gws("docs", "documents", "get", "--params",
              json.dumps({"documentId": DOC, "includeTabsContent": True}))
    tab = find_tab(doc["tabs"], a.tab_id)
    if not tab:
        sys.exit(f"tab {a.tab_id} not found")
    first = tab["documentTab"]["body"]["content"][1]
    if first["paragraph"]["paragraphStyle"].get("namedStyleType") != "HEADING_1":
        sys.exit("expected the tab to start with its Heading 1 title")
    paras = paragraphs(open(a.markdown).read(), a.below)
    body = {"requests": requests(paras, a.tab_id, first["endIndex"]),
            "writeControl": {"requiredRevisionId": doc["revisionId"]}}
    print(f"{len(paras)} paragraphs, {len(body['requests'])} requests, into '{tab['tabProperties']['title']}'")
    if a.dry_run:
        return
    gws("docs", "documents", "batchUpdate", "--params", json.dumps({"documentId": DOC}),
        "--json", json.dumps(body, ensure_ascii=False))
    print("written")


if __name__ == "__main__":
    main()
