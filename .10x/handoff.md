# Handoff

This file carries context for every feature currently active under `.10x/`. One section per
feature — see `status.md` for current phase/blockers per feature.

## repo-cleanup-and-navigation

Done and shipped (see `status.md`).

**Update 2026-11-11, later:** the owner asked to actually run the rim-photo-to-3D pilot. FSA-07 had
no real multi-angle photos in the repo (only its already-traced grey mask — and it's now deleted
from the repo entirely, per the legacy-cleanup migration that landed on `main` in the meantime), so
the pilot moved to **FSA004** using real turntable photos from the owner's Drive ("WEBSITE wheels" →
"FSA4") — a better subject anyway, since FSA004 already has a ground-truth GLB to measure against.
Both photos are uploaded and confirmed in the Higgsfield media library, the `multi_image_to_3d` job
is preflighted (20 credits), but the connected Higgsfield workspace has 0 credits and the owner
chose not to top up right now. **Nothing was submitted, nothing was charged.** Full resume
instructions (exact media IDs and params) are in `docs/RIM_PHOTO_TO_3D_SPEC.md` → "Pilot log" —
resuming is one `generate_3d` call once the workspace has credits.

If `docs/PLATES_MASTER_PLAN.md`'s PR #13 merges later, revisit the "historical/separate initiative"
table in `docs/MAP.md` — it will need to move from "separate, unmerged" to either "current" or
"archived", depending on what actually landed.

**See also:** the `presentation-ready` feature below independently explored the *same* Drive folder
and the *same* multi-image-reconstruction idea (different provider — Tripo there, Meshy/Higgsfield
here). That session has since confirmed (see `status.md`) it's holding its Tripo spike in favour of
this one, so there's no remaining double-spend risk — just two blocked-by-funding pilots pointing at
the same eventual answer.

## presentation-ready

**From:** QA/Security · **To:** owner + DevOps
PR #40 is verified. After merge: production deploy from main, then check /configure on a real phone, /admin sign-in, /dealer sign-in once its auth user exists, and Google sign-in once the provider is on.
