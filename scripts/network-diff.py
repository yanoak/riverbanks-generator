#!/usr/bin/env python3
"""Readable diff between two story-network canon files.

    ./scripts/network-diff.py                      # committed (HEAD) vs working copy
    ./scripts/network-diff.py old.json new.json
"""
import json, sys

import subprocess

PATH = "content/network/riverbook.json"
EMPTY = {"people": [], "links": [], "stories": []}


def committed():
    r = subprocess.run(["git", "show", f"HEAD:{PATH}"], capture_output=True, text=True)
    return json.loads(r.stdout) if r.returncode == 0 else EMPTY


old = json.load(open(sys.argv[1])) if len(sys.argv) > 2 else committed()
new = json.load(open(sys.argv[2] if len(sys.argv) > 2 else PATH))

def diff(kind, key, describe):
    a = {x[key]: x for x in old.get(kind, [])}
    b = {x[key]: x for x in new.get(kind, [])}
    lines = []
    for k in b.keys() - a.keys():
        lines.append(f"  + {describe(b[k])}")
    for k in a.keys() - b.keys():
        lines.append(f"  - {describe(a[k])}")
    for k in a.keys() & b.keys():
        changed = [f for f in sorted(set(a[k]) | set(b[k])) if a[k].get(f) != b[k].get(f)]
        for f in changed:
            lines.append(f"  ~ {describe(b[k])}: {f}: {json.dumps(a[k].get(f))} → {json.dumps(b[k].get(f))}")
    return sorted(lines)

names = {p["id"]: p["name"] for p in old.get("people", []) + new.get("people", [])}
sections = [
    ("Stories", diff("stories", "id", lambda s: s["title"])),
    ("People", diff("people", "id", lambda p: p["name"])),
    ("Ties", diff("links", "id", lambda l: f'{names.get(l["source"], l["source"])} → {names.get(l["target"], l["target"])} ({l.get("label") or l["type"]})')),
]
if not any(lines for _, lines in sections):
    print("No changes to the story network.")
for title, lines in sections:
    if lines:
        print(title)
        print("\n".join(lines))
