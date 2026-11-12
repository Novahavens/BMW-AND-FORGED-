# Architect: repo-cleanup-and-navigation

See [ADR-001](../../adrs/001-docs-navigation-and-cleanup.md) for the decision and alternatives.

## Structure

- `docs/MAP.md` — new, canonical entry point. Table-driven, one row per "I want to…" question,
  linking straight to the existing doc + code that already answers it. A second table flags
  historical/separate-initiative docs so they're not mistaken for current behaviour.
- `AGENTS.md` — now holds both the auto-generated handoff block (unchanged, markers preserved for
  future handoff tooling) and the authored contributor guide that used to live in root `agents.md`.
- `docs/SKILLS.md` — unchanged; it was already the correct, specific skill index. Root `skills.md`
  (generic boilerplate, no project-specific content beyond bun commands already in `docs/SKILLS.md`)
  is deleted, not merged — nothing in it wasn't already said better elsewhere.
- `docs/archive/` — new folder for docs that describe superseded plans but are worth keeping for
  their citations/history.
- `docs/RIM_PHOTO_TO_3D_SPEC.md` — new, standalone (cross-linked from `RIM_3D_PROCESS.md` and
  `PRODUCT_SPEC_CARS_AND_WHEELS.md` §5.1 rather than inlined into either, since it's a decision
  guide for *which* route to pick, not a restatement of how the existing route works).

## Boundaries

- No code changes. No catalogue, schema, or engine changes. This is docs-only.
- Didn't touch `docs/PLATES_MASTER_PLAN.md`'s content — only referenced it from `docs/MAP.md`.
  Rewriting or archiving it is a call for whoever owns that initiative (open PR #13), not this task.
- Didn't rewrite `README.md`'s structure, only added the map pointer at the top and one line in the
  repository-layout table and the Contributing section, to keep the diff reviewable.

## Failure modes considered

- Stale cross-links after the move: checked with `grep` for every old path
  (`docs/PHOTOREAL_SPEC.md`, `docs/NO_BLENDER_AND_UI_PLAN.md`, `agents.md`, `skills.md`) across the
  whole repo before and after, fixed every hit (`docs/HANDOVER.md`,
  `.claude/skills/forgedsa-codebase-map/SKILL.md`, the archived files' own internal relative links,
  `README.md`).
- Case-insensitive filesystem collision (the actual motivation for merging agents.md→AGENTS.md):
  confirmed by the fact that `agents.md` and `AGENTS.md` already coexisted as two different files on
  this (case-sensitive) checkout with different content — exactly the symptom of two sessions/tools
  independently creating "the agents file" without noticing the other existed.
