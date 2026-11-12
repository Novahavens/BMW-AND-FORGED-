# ADR-001: One navigation map, deduped root docs, archived superseded plans

**Status:** Accepted
**Date:** 2026-11-11
**Feature:** repo-cleanup-and-navigation
**Author:** 10x-Team (Architect)

## Context

The repo already has deep, high-quality documentation (20+ files in `docs/`, 20 task-playbook
skills in `.claude/skills/`) built up over many sessions. The owner asked for the repo to be
cleaned up so it's easy to see, at a glance: where cars are added, how they're made photoreal,
where wheels are added, and how wheels and cars combine in the configurator — plus a researched
spec for the rim-photo-to-3D question specifically. The problem isn't missing documentation, it's
no single entry point, two pairs of duplicate/near-duplicate root files, and a few planning docs
that read as current but describe superseded or not-yet-merged work (confirmed against
`docs/CHECKPOINT.md` and `docs/SESSION_HANDOVER_2026-11-11.md`, which track what's actually merged).

## Decision

1. Add one navigation doc, `docs/MAP.md`, as the canonical entry point, linked from the top of
   `README.md` and from `AGENTS.md`. It answers the four questions directly with links to the
   existing canonical docs/code, rather than re-explaining them.
2. Merge root `agents.md` (real authored contributor guide) into `AGENTS.md` (previously only the
   auto-generated handoff block) and delete `agents.md`. The two filenames differ only by case,
   which collides on case-insensitive filesystems (macOS/Windows) and reads as a stray duplicate on
   any filesystem. Likewise delete root `skills.md`, a generic/boilerplate duplicate of the real
   skill index `docs/SKILLS.md`.
3. Move two docs that explicitly describe superseded plans (`PHOTOREAL_SPEC.md`,
   `NO_BLENDER_AND_UI_PLAN.md`) into `docs/archive/`, with a note at the top of each pointing to the
   current doc. Leave `PLATES_MASTER_PLAN.md` where it is: `docs/SESSION_HANDOVER_2026-11-11.md`
   describes its PR #13 as open and unreviewed, but a fresh `git fetch` during this task showed it
   had since merged into `main` — only its render-pipeline tooling (`scripts/plates/`), not the web
   integration (`App.tsx`/`components/`/`services/` still have zero references to `public/plates/`).
   Flag that precisely in `docs/MAP.md` rather than trusting the handover doc's now-stale status.
4. Add `docs/RIM_PHOTO_TO_3D_SPEC.md`, a Nov 2026 researched decision guide for the rim-photo
   question, cross-linked from the two docs that already cover the current in-house photo route.

## Alternatives Considered

| Alternative | Pros | Cons | Why not |
|---|---|---|---|
| Rewrite README.md into the single source of truth | One file to read | README is already 330 lines doing setup + features + reference; folding in a 4-topic map makes it longer, not clearer; the existing doc set would still need cross-links | A short, separate map is easier to keep current and link from multiple places |
| Delete the superseded planning docs outright | Fewer files | Loses the research citations and decision history inside them (e.g. BMW-model-licence findings, the October photoreal line-up's rationale) | Archiving preserves history at effectively zero cost; nothing here is secret or wrong, just outdated |
| Leave agents.md/AGENTS.md and skills.md/docs/SKILLS.md as-is | No merge risk | Case-collision risk on macOS/Windows checkouts; two files claiming to be "the skills index" is exactly the kind of ambiguity the owner asked to fix | The duplication is itself part of "hard to navigate" |

## Consequences

### Positive
- One place (`docs/MAP.md`) answers the four questions the owner asked, with no restating of
  content that already exists correctly elsewhere.
- No more same-name-different-case files at the repo root.
- Anyone opening `docs/` sees which plans are current vs. historical without reading each one.

### Negative
- One more doc to keep in sync if the architecture changes again (mitigated: it only links out,
  it doesn't duplicate detail, so it rarely needs an edit).

### Risks
- If `PLATES_MASTER_PLAN.md`'s initiative (PR #13) merges later, `docs/MAP.md`'s "separate,
  unmerged" note will need updating — flagged there explicitly so it's easy to find.

## Dependencies

- Assumes `docs/CHECKPOINT.md` and `docs/SESSION_HANDOVER_2026-11-11.md` are accurate as of
  2026-11-11 for what's merged vs. open (read directly from the repo, not from memory).
