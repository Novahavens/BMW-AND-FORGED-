# SDE: repo-cleanup-and-navigation

## What was built

- `docs/MAP.md` (new): the four-question navigation map, a data-flow diagram for how a car and its
  wheels combine in the configurator (`CarConfiguratorEngine` → `applyWheelDesign`/`loadRimModel` →
  `wheelFinish.ts`), a table flagging historical/separate-initiative docs, and a by-topic index of
  everything else.
- `docs/RIM_PHOTO_TO_3D_SPEC.md` (new): researched (Nov 2026 web search) decision guide for going
  from a rim photo to a 3D file — CAD, multi-image AI reconstruction (new recommendation, not
  previously tried on this project), photogrammetry, and the existing single-photo route — with a
  decision table, licensing caveats, and a concrete low-risk pilot (re-run FSA-07, already flagged
  in this repo's own docs as the weakest single-photo result).
- `AGENTS.md`: appended the authored contributor guide (core principles, agent expectations, task
  playbooks) below the existing auto-generated handoff block; added a pointer to `docs/MAP.md`.
- Deleted: root `agents.md`, root `skills.md` (content merged or superseded as above).
- Moved to `docs/archive/`: `PHOTOREAL_SPEC.md`, `NO_BLENDER_AND_UI_PLAN.md`, each with a short
  banner pointing at the current doc; fixed their internal relative links for the new depth.
- Fixed every stale reference to the moved/deleted files: `README.md` (Contributing section,
  repository-layout table, new top-of-file pointer), `docs/HANDOVER.md` (two `NO_BLENDER…`
  references), `.claude/skills/forgedsa-codebase-map/SKILL.md` (the `PHOTOREAL_SPEC.md` reference).
- Added a one-line cross-link from `docs/RIM_3D_PROCESS.md` and `docs/PRODUCT_SPEC_CARS_AND_WHEELS.md`
  §5.1 to the new spec.

## Deviations from plan

None — scope matched the ADR.

## Tech debt / left for the owner

- `docs/PLATES_MASTER_PLAN.md` was deliberately left untouched and un-archived. Note:
  `docs/SESSION_HANDOVER_2026-11-11.md` describes its PR #13 as open and unreviewed, but `git fetch
  origin main` during this task showed it merged on 2026-11-11 — the render-pipeline tooling
  (`scripts/plates/`) only, not the web integration. `docs/MAP.md` reflects the verified state, not
  the (now stale) handover note. Whether/when to wire the React app onto plates is still that
  initiative's call, not this task's.
- The rim-photo-to-3D spec's multi-image-AI recommendation is a research-grounded proposal, not a
  built pipeline — no code was written against it. The spec itself names the next concrete step
  (pilot on FSA-07) if the owner wants to pursue it.
- Did not verify the current Meshy/Tripo/Rodin pricing or ToS pages directly (no account/API key in
  this session) — the spec says so explicitly and tells the reader where to check before budgeting.

## Verification

- `grep` for every renamed/deleted path across the whole repo, before relying on "done": zero
  remaining references to `agents.md`, `skills.md` (root), `docs/PHOTOREAL_SPEC.md`,
  `docs/NO_BLENDER_AND_UI_PLAN.md` outside the new `docs/archive/` paths.
- This is a docs-only change: no `bun run lint` / `bun run build` impact expected, but both were run
  before pushing to catch anything unexpected (e.g. an accidentally-deleted file still imported).
