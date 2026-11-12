# Status

This file tracks every feature currently active under `.10x/`. One section per feature.

## repo-cleanup-and-navigation

**Phase:** Delivery complete (docs-only change; scaled down — no DBA/QA/Security/SRE phases needed,
nothing in the app's runtime behaviour, schema, or data changed)

### Done
- [x] Design: ADR-001 written (`.10x/adrs/001-docs-navigation-and-cleanup.md`)
- [x] Implementation: `docs/MAP.md`, `docs/RIM_PHOTO_TO_3D_SPEC.md` written; `agents.md`/`skills.md`
      deduped into `AGENTS.md`/`docs/SKILLS.md`; `PHOTOREAL_SPEC.md` and `NO_BLENDER_AND_UI_PLAN.md`
      archived; every stale cross-reference fixed and checked with `grep`
- [x] Verification: `bun run lint` and `bun run build` run clean (docs-only, but checked anyway)
- [x] Delivery: committed, pushed, PR #24 opened and subscribed; merged `main` back in twice
      (2026-11-12) to resolve conflicts with the concurrent `presentation-ready` feature's own
      `.10x/` files as it moved from discovery through to production delivery

### Not in scope for this task
- `docs/PLATES_MASTER_PLAN.md` left as-is (separate open initiative, PR #13, not this session's)
- No code, schema, or catalogue changes

## presentation-ready

**Feature:** presentation-ready · **Phase:** Delivered to production 2026-11-12 (dpl_AcV5FCQ5S21k7oTMVNQnAH3KHd1w); PR #40 still to merge
**Date:** 2026-11-12

| Phase | State |
|---|---|
| 0-3 | done (spec, ADR-001, plan) |
| 4 Implementation | done: wheel reflections on the stage, sign-in inbox line |
| 5 Verification | done: lint, build, shoot.cjs sheets, journey.cjs phone + desktop pass |
| 6 Delivery | deployed from PR head; owner: merge #40, real-phone check |

### Open, owner only
- Google provider in Supabase (docs/ACCOUNTS.md steps 1-4).
- Dealer login: create the Supabase Auth user for the allowlisted dealer email (Auto Confirm or Invite).
- Tripo API key, if the one-wheel spike is still wanted.

**Coordination note (`repo-cleanup-and-navigation` session, 2026-11-12):** the Tripo spike above
was exploring the same rim-photo-to-3D idea as this session's own pilot in
`docs/RIM_PHOTO_TO_3D_SPEC.md` (Meshy via Higgsfield, from real "WEBSITE wheels" Drive photos). The
`presentation-ready` session confirmed by reply it's holding that Tripo request — no cost/quality
evidence favours Tripo, and the Meshy pilot was already further along (photos uploaded, job
preflighted) before it hit its own funding blocker (0 Higgsfield credits). Resolve in favour of
Meshy/Higgsfield if either pilot gets funded later.
