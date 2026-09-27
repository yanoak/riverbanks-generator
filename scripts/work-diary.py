#!/usr/bin/env python3
"""Work-diary generator and plan-filename hygiene.

    ./scripts/work-diary.py                 # today's entry + a hygiene dry-run
    ./scripts/work-diary.py 2026-09-14      # a specific day
    ./scripts/work-diary.py --hygiene       # report misnamed plan files only
    ./scripts/work-diary.py --hygiene --apply   # rename them and rewrite every reference
    ./scripts/work-diary.py --no-cost       # skip the token-cost lines

Layout is detected, not configured: `.cursor/plans/` + `.cursor/work-diary/` if they exist,
otherwise `plans/` + `work-diary/` at the repo root.

The diary's "Plans & commits" section is regenerated from git: each day's commits grouped under
the plan named in their `Plan:` trailer, with untagged work under "Unplanned". Nothing outside
the generated markers is ever touched, so the section can be refreshed at any time.

Each group also carries what the day's agent turns cost, read from Claude Code's own session
transcripts under ~/.claude/projects/. Only counts and dollars are read; no prompt or file
content is touched, and nothing is written there. With no transcripts — a different harness, a
fresh clone, --no-cost — the cost lines are simply omitted.
"""
import argparse
import glob
import json
import os
import re
import subprocess
import sys
from datetime import date, datetime

MARK_OPEN = "<!-- generated: work-diary.py -->"
MARK_CLOSE = "<!-- /generated -->"
SEP = "\x1e"
DATED = re.compile(r"^\d{4}-\d{2}-\d{2}_")
UNDERSCORE_DATED = re.compile(r"^(\d{4})_(\d{2})_(\d{2})_")


def git(*args, check=True):
    r = subprocess.run(["git", "-C", ROOT, *args], capture_output=True, text=True)
    if check and r.returncode:
        sys.exit(f"git {' '.join(args)} failed: {r.stderr.strip()}")
    return r.stdout


def repo_root():
    r = subprocess.run(
        ["git", "rev-parse", "--show-toplevel"], capture_output=True, text=True
    )
    if r.returncode:
        sys.exit("not inside a git repository")
    return r.stdout.strip()


ROOT = repo_root()


def layout():
    """(plans_dir, diary_dir) relative to the repo root."""
    for plans, diary in ((".cursor/plans", ".cursor/work-diary"), ("plans", "work-diary")):
        if os.path.isdir(os.path.join(ROOT, plans)):
            return plans, diary
    sys.exit(
        "no plans directory found — expected .cursor/plans/ or plans/.\n"
        "Run the project-diary skill's init to scaffold one."
    )


PLANS_DIR, DIARY_DIR = layout()


# ---------------------------------------------------------------- plan lookup

def plan_files():
    """Real plans only — a leading underscore marks a template, never a plan."""
    return sorted(
        p for p in glob.glob(os.path.join(ROOT, PLANS_DIR, "*.plan.md"))
        if not os.path.basename(p).startswith("_")
    )


def resolve_plan(slug):
    """A `Plan:` trailer value -> a plan file. Accepts the full slug or the bare name."""
    files = plan_files()
    for want in (f"{slug}.plan.md",):
        for p in files:
            if os.path.basename(p) == want:
                return p
    for p in files:  # bare name: match after the date prefix
        base = os.path.basename(p).removesuffix(".plan.md")
        if base == slug or re.sub(r"^\d{4}-\d{2}-\d{2}_", "", base) == slug:
            return p
    return None


def plan_meta(path):
    """(title, status) from the first `# ` heading and any frontmatter `status:`."""
    text = open(path, encoding="utf-8").read()
    title = next(
        (m.group(1).strip() for m in re.finditer(r"^# (.+)$", text, re.M)),
        os.path.basename(path).removesuffix(".plan.md"),
    )
    status = next(
        (m.group(1).strip() for m in re.finditer(r"^status:\s*(.+)$", text, re.M)), ""
    )
    return title, status


# ------------------------------------------------------------------- commits

def commits_on(day):
    """[(hash, time, subject, plan_slug_or_None, epoch)] authored that day, oldest first."""
    out = git(
        "log", "--all", "--no-merges",
        f"--since={day} 00:00", f"--until={day} 23:59:59",
        "--date=format:%H:%M",
        f"--pretty=format:%h{SEP}%ad{SEP}%s{SEP}"
        f"%(trailers:key=Plan,valueonly,separator=%x2C){SEP}%at{SEP}",
    )
    rows = []
    for record in out.split(SEP + "\n"):
        parts = record.strip("\n").split(SEP)
        if len(parts) < 5 or not parts[0].strip():
            continue
        try:
            epoch = float(parts[4])
        except ValueError:
            epoch = 0.0
        rows.append((parts[0].strip(), parts[1], parts[2], parts[3].strip() or None, epoch))
    rows.reverse()  # git log is newest-first; a diary reads better in the order it happened
    return rows


def table(rows):
    if not rows:
        return "_No commits yet._"
    lines = ["| Hash | Time | Subject |", "|---|---|---|"]
    lines += [f"| `{r[0]}` | {r[1]} | {r[2]} |" for r in rows]
    return "\n".join(lines)


def canonical(slug):
    """Trailer value -> the plan's real slug, so a bare name and a full slug group together."""
    path = resolve_plan(slug)
    return os.path.basename(path).removesuffix(".plan.md") if path else slug


# ---------------------------------------------------------------- token cost

TRANSCRIPTS = os.path.expanduser("~/.claude/projects")
USAGE_KEYS = (
    "input_tokens",
    "output_tokens",
    "cache_creation_input_tokens",
    "cache_read_input_tokens",
)


def transcript_dirs():
    """Session directories for this repo. Claude Code slugs the cwd; other harnesses have none."""
    if not os.path.isdir(TRANSCRIPTS):
        return []
    slug = re.sub(r"[^A-Za-z0-9]", "-", ROOT)
    found = [os.path.join(TRANSCRIPTS, slug)]
    found += glob.glob(os.path.join(TRANSCRIPTS, slug + "-*"))  # sessions started in a subdir
    return [d for d in found if os.path.isdir(d)]


def base_model(name):
    """`claude-opus-5[1m]` is `claude-opus-5` billed at the 1h cache tier — one model, not two."""
    return name.split("[", 1)[0]


def read_sessions(day):
    """(turns on `day`, cost by model, session tokens by model, billed tokens by model).

    Two things make this less obvious than it looks. Transcripts repeat a turn's record — the
    same `message.id` appears several times — so records are deduplicated or every count comes
    out high. And the session totals are deliberately not day-filtered: they are the denominator
    that splits a session's recorded dollars across its turns, so they must cover the session.
    """
    start = datetime.strptime(day, "%Y-%m-%d").timestamp()
    end = start + 86400
    turns, costs, totals, billed, seen = [], {}, {}, {}, set()

    for directory in transcript_dirs():
        for path in sorted(glob.glob(os.path.join(directory, "*.jsonl"))):
            try:
                if os.path.getmtime(path) < start:
                    continue  # last written before the day began: cannot hold its records
            except OSError:
                continue
            session = os.path.basename(path).removesuffix(".jsonl")
            try:
                handle = open(path, encoding="utf-8", errors="replace")
            except OSError:
                continue
            with handle:
                for line in handle:
                    try:
                        rec = json.loads(line)
                    except ValueError:
                        continue

                    if rec.get("type") == "cost-state":
                        # Claude Code's own figures, cumulative — the last one wins.
                        spend, tokens = {}, {}
                        for name, use in (rec.get("modelUsage") or {}).items():
                            model = base_model(name)
                            use = use or {}
                            spend[model] = spend.get(model, 0.0) + (use.get("costUSD") or 0.0)
                            tokens[model] = tokens.get(model, 0) + sum(
                                use.get(k) or 0
                                for k in ("inputTokens", "outputTokens",
                                          "cacheReadInputTokens", "cacheCreationInputTokens")
                            )
                        costs[session], billed[session] = spend, tokens
                        continue

                    if rec.get("type") != "assistant":
                        continue
                    message = rec.get("message") or {}
                    usage = message.get("usage")
                    if not usage:
                        continue
                    key = (session, message.get("id") or rec.get("uuid"))
                    if key in seen:
                        continue  # the same turn, logged again
                    seen.add(key)

                    model = base_model(message.get("model") or "unknown")
                    count = sum(usage.get(k) or 0 for k in USAGE_KEYS)
                    totals.setdefault(session, {})
                    totals[session][model] = totals[session].get(model, 0) + count
                    try:
                        when = datetime.fromisoformat(
                            (rec.get("timestamp") or "").replace("Z", "+00:00")
                        ).timestamp()
                    except ValueError:
                        continue
                    if start <= when < end:
                        turns.append((when, model, count, session))

    turns.sort()
    return turns, costs, totals, billed


def cost_by_plan(day, rows):
    """(slug -> {model: [tokens, usd, complete]}, day-only extras), by commit attribution.

    A turn is charged to the first commit that lands at or after it — the work that led up to it.
    Turns after the day's last commit are not committed yet, so they fall to "Unplanned".
    """
    turns, costs, totals, billed = read_sessions(day)
    if not turns:
        return {}, {}

    marks = sorted((r[4], r[3]) for r in rows)
    buckets = {}
    for when, model, count, session in turns:
        slug = next((s for epoch, s in marks if epoch >= when), None)
        entry = buckets.setdefault(slug, {}).setdefault(model, [0, 0.0, True])
        entry[0] += count
        spend = (costs.get(session) or {}).get(model)
        whole = (totals.get(session) or {}).get(model) or 0
        if spend is None or not whole:
            entry[2] = False  # session still open: no cost-state written yet
        else:
            entry[1] += spend * count / whole

    # Models billed without a turn of their own — background calls such as title generation.
    # Small, but real money, so it shows in the day total rather than vanishing.
    extra = {}
    for session in {t[3] for t in turns}:
        for model, spend in (costs.get(session) or {}).items():
            if (totals.get(session) or {}).get(model) or not spend:
                continue
            entry = extra.setdefault(model, [0, 0.0, True])
            entry[0] += (billed.get(session) or {}).get(model, 0)
            entry[1] += spend
    return buckets, extra


def human(n):
    for unit, size in (("B", 1_000_000_000), ("M", 1_000_000), ("k", 1_000)):
        if n >= size:
            scaled = n / size
            return f"{scaled:.0f}{unit}" if scaled >= 100 else f"{scaled:.1f}{unit}"
    return str(int(n))


def short_model(name):
    return re.sub(r"-\d{8}$", "", name.removeprefix("claude-"))


def cost_block(bucket, label):
    """One group's cost line, with a sub-line per model."""
    if not bucket:
        return ""
    tokens = sum(v[0] for v in bucket.values())
    usd = sum(v[1] for v in bucket.values())
    complete = all(v[2] for v in bucket.values())
    tail = "" if complete else "  _(a session is still open — dollars land when it ends)_"
    lines = [f"- **{label}:** {human(tokens)} tokens · {money(usd, complete)}{tail}"]
    for model, (count, spend, known) in sorted(bucket.items(), key=lambda kv: -kv[1][0]):
        lines.append(f"  - `{short_model(model)}` {human(count)} · {money(spend, known)}")
    return "\n".join(lines)


def money(usd, complete):
    """A running session has no dollars yet — say so rather than printing a confident $0.00."""
    if complete:
        return f"~${usd:,.2f}"
    return f"~${usd:,.2f}+" if usd else "$ pending"


def merge(*buckets):
    total = {}
    for bucket in buckets:
        for model, (count, spend, known) in bucket.items():
            entry = total.setdefault(model, [0, 0.0, True])
            entry[0] += count
            entry[1] += spend
            entry[2] = entry[2] and known
    return total


def build_body(day, show_cost=True):
    rows = [
        (h, t, s, canonical(slug) if slug else None, e)
        for h, t, s, slug, e in commits_on(day)
    ]
    costs, extra = cost_by_plan(day, rows) if show_cost else ({}, {})

    slugs = []
    for row in rows:
        if row[3] and row[3] not in slugs:
            slugs.append(row[3])
    for path in plan_files():  # plans started today appear before they have commits
        slug = os.path.basename(path).removesuffix(".plan.md")
        if slug.startswith(day) and slug not in slugs:
            slugs.append(slug)
    slugs.sort(key=lambda s: resolve_plan(s) is None)  # known plans first

    blocks = []
    for slug in slugs:
        path = resolve_plan(slug)
        if path:
            title, status = plan_meta(path)
            rel = os.path.relpath(path, os.path.join(ROOT, DIARY_DIR))
            heading = f"### [{title}]({rel})" + (f" · {status}" if status else "")
        else:
            heading = (
                f"### {slug}  \n"
                "_No plan file found — check the `Plan:` trailer or add the plan._"
            )
        body = table([r for r in rows if r[3] == slug])
        spend = cost_block(costs.get(slug) or {}, "Cost")
        blocks.append(f"{heading}\n\n{body}" + (f"\n\n{spend}" if spend else ""))

    loose = [r for r in rows if r[3] is None]
    if loose or costs.get(None):
        spend = cost_block(costs.get(None) or {}, "Cost")
        blocks.append(
            "### Unplanned\n\n" + table(loose) + (f"\n\n{spend}" if spend else "")
        )

    if not blocks:
        return "_No plans in play and no commits._"

    if len(costs) + bool(extra) > 1:
        total = cost_block(merge(*costs.values(), extra), "Day total")
        if total:
            blocks.append(total)
    return "\n\n".join(blocks)


# ------------------------------------------------------------------- hygiene

def first_commit_date(rel_path):
    out = git("log", "--diff-filter=A", "--follow", "--format=%ad", "--date=short",
              "--", rel_path, check=False)
    dates = [l for l in out.splitlines() if l.strip()]
    return dates[-1] if dates else date.today().isoformat()


def hygiene(apply_changes):
    """Plan and diary filenames must be date-prefixed with hyphens. Rename and fix links."""
    renames = []

    for path in plan_files():
        base = os.path.basename(path)
        rel = os.path.join(PLANS_DIR, base)
        if DATED.match(base):
            continue
        m = UNDERSCORE_DATED.match(base)
        if m:  # 2026_09_12_slug -> 2026-09-12_slug
            new = f"{m.group(1)}-{m.group(2)}-{m.group(3)}_" + base[m.end():]
        else:  # undated -> prefix with the date it entered git
            new = f"{first_commit_date(rel)}_{base}"
        renames.append((rel, os.path.join(PLANS_DIR, new), base, new))

    for path in sorted(glob.glob(os.path.join(ROOT, DIARY_DIR, "*.md"))):
        base = os.path.basename(path)
        m = re.fullmatch(r"(\d{4})_(\d{2})_(\d{2})\.md", base)
        if m:
            new = f"{m.group(1)}-{m.group(2)}-{m.group(3)}.md"
            renames.append((os.path.join(DIARY_DIR, base), os.path.join(DIARY_DIR, new), base, new))

    if not renames:
        print("hygiene: all plan and diary filenames conform.")
        return
    print(f"hygiene: {len(renames)} file(s) to rename")
    for _, _, old, new in renames:
        print(f"  {old}  ->  {new}")
    if not apply_changes:
        print("dry run. Re-run with --apply to rename and rewrite references.")
        return

    for old_rel, new_rel, _, _ in renames:
        tracked = subprocess.run(
            ["git", "-C", ROOT, "ls-files", "--error-unmatch", old_rel],
            capture_output=True,
        ).returncode == 0
        if tracked:
            git("mv", old_rel, new_rel)
        else:
            os.rename(os.path.join(ROOT, old_rel), os.path.join(ROOT, new_rel))

    targets = sorted(
        glob.glob(os.path.join(ROOT, DIARY_DIR, "*.md")) + plan_files()
    ) + [p for p in (os.path.join(ROOT, "CLAUDE.md"), os.path.join(ROOT, "AGENTS.md"))
         if os.path.exists(p)]
    touched = 0
    for target in targets:
        text = original = open(target, encoding="utf-8").read()
        for _, _, old, new in renames:
            text = text.replace(old, new)
        if text != original:
            open(target, "w", encoding="utf-8").write(text)
            touched += 1
    print(f"renamed {len(renames)} file(s); rewrote references in {touched} file(s).")


# ---------------------------------------------------------------------- main

def write_entry(day, show_cost=True):
    path = os.path.join(ROOT, DIARY_DIR, f"{day}.md")
    if not os.path.exists(path):
        tpl_path = os.path.join(ROOT, DIARY_DIR, "_template.md")
        if not os.path.exists(tpl_path):
            sys.exit(f"missing {DIARY_DIR}/_template.md — run the project-diary skill's init")
        dayname = datetime.strptime(day, "%Y-%m-%d").strftime("%A")
        tpl = open(tpl_path, encoding="utf-8").read()
        open(path, "w", encoding="utf-8").write(
            tpl.replace("YYYY-MM-DD (Dayname)", f"{day} ({dayname})")
        )
        print(f"created {os.path.relpath(path, ROOT)}")

    src = open(path, encoding="utf-8").read()
    new, n = re.subn(
        rf"({re.escape(MARK_OPEN)}\n).*?(\n{re.escape(MARK_CLOSE)})",
        lambda m: m.group(1) + build_body(day, show_cost).replace("\\", "\\\\") + m.group(2),
        src, flags=re.S,
    )
    if not n:
        sys.exit(f"no generated block in {os.path.relpath(path, ROOT)} — restore the markers")
    open(path, "w", encoding="utf-8").write(new)
    print(f"updated plans & commits in {os.path.relpath(path, ROOT)}")


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("day", nargs="?", default=date.today().isoformat())
    ap.add_argument("--hygiene", action="store_true", help="check plan/diary filenames only")
    ap.add_argument("--apply", action="store_true", help="with --hygiene, perform the renames")
    ap.add_argument("--no-cost", action="store_true", help="omit the token-cost lines")
    args = ap.parse_args()

    if args.hygiene:
        hygiene(args.apply)
        return
    if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", args.day):
        ap.error("day must be YYYY-MM-DD")
    write_entry(args.day, show_cost=not args.no_cost)
    hygiene(False)


if __name__ == "__main__":
    main()
