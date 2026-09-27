## Project management

Plans live in `plans/`, the daily work diary in `work-diary/`. Both are committed alongside
the code they describe, never left untracked.

- **Substantial work gets a plan before implementation**, at
  `plans/YYYY-MM-DD_short-name.plan.md` — the date is the day the plan was started. Copy
  `plans/_template.plan.md` and keep the frontmatter `status` current. The template's four
  conditional sections are **required when they apply**: UI mockups (ASCII) for visible UI,
  Keyboard interaction for anything clickable, Test list (TDD) for any logic, Verification for
  anything users perceive. Delete only the ones that genuinely do not apply. See
  `plans/README.md`.
- **Never delete an abandoned plan** — the reason something was dropped is the part worth keeping.
  Set `status: abandoned` and write the Outcome.
- **Commits that advance a plan carry a `Plan:` trailer** naming that plan's slug, e.g.
  `Plan: 2026-09-13_scene-schema-greybox`. This is the only link between a commit and the thinking
  behind it, and the diary's commit table is generated from it — so it cannot drift.
- **Keep a daily work diary.** Run `./scripts/work-diary.py` at the start of each day: it creates
  `work-diary/YYYY-MM-DD.md` and regenerates that day's plans and commits. Write the tasks section
  first thing and do not rewrite it later; keep the work log as you go; note decisions and
  carry-forward at the end. See `work-diary/README.md`.
- **The generated section also prices each plan** in tokens and dollars, read from Claude Code's
  own session transcripts. The day total is exact; the split between plans is inferred from commit
  times, so treat it as a proportion rather than an invoice. A session still running shows `+`
  until it ends — re-run the next morning to settle it. `--no-cost` omits the lines entirely.
- **Mark things done immediately** — `[x]` the plan task as it lands, strike through a fixed ad hoc
  todo and note the resolution, move the plan's `status` to `done` and write its Outcome only once
  its Verification section actually passed.
