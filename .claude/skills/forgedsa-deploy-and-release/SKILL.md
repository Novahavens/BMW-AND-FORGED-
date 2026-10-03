---
name: forgedsa-deploy-and-release
description: Ship FORGEDSA changes safely. Covers the pre-push checks (tsc, vite build, renders), commit attribution, the branch policy (work branch vs throwaway proof branches), production deploys to Vercel from a git SHA, verifying the live site, and PR upkeep. Use when committing, pushing, deploying, opening or updating the PR, or when trying something experimental that may be thrown away.
---

# Deploy and release

## Branches

- **Work branch:** `claude/vigilant-brahmagupta-8sy04u` → PR
  [Novahavens/BMW-AND-FORGED-#2](https://github.com/Novahavens/BMW-AND-FORGED-/pull/2) into `main`.
- **Experiments go on their own branch** (e.g. `claude/photoreal-proof`), created from the work
  branch.
  - Commit locally and **don't push until the owner approves**. Then push, and preview on Vercel
    before any merge. Delete the branch if it's rejected.
  - The container is ephemeral, so tell the owner that unpushed work is lost if the session ends.

## Before every push

1. `bun run lint` (this is `tsc --noEmit`) prints nothing.
2. `bun run build` ends with "built in …". Watch the chunk list: heavy libraries (OpenCascade,
   the path tracer) must stay in their own lazily loaded chunks, not in `index-*.js`.
3. `node scripts/render/journey.cjs <out> <rimCache> both`: the customer journey at phone and
   desktop size, no FAILED step, no page error, no long task (`visual-qa`, layer 0). Then render
   any visual change (`forgedsa-render-verification`, `visual-qa`).
4. `git diff` read adversarially. No secrets:
   `grep -rn "sk-or-v1\|forgedsa-lead-\|INGEST" --exclude-dir=node_modules .` should find only
   docs mentioning names, never values.
5. Commit messages end with the session's attribution lines (Co-Authored-By plus the Claude-Session
   URL). Never put model names in commits or PRs.

## Deploy (Vercel)

- **Project:** `forged-configurator` (team `team_YEcPHHbzFoa1DSSKBbNDiyEk`, project
  `prj_p1fOXWBPFfxedbLZFp9R3s1Qiq9P`). Vite framework, build `vite build`, output `dist`, no env
  vars.
- **Production:** Vercel MCP `create_deployment` with `target: production` and
  `gitSource {type: github, org: Novahavens, repo: BMW-AND-FORGED-, ref: <branch>, sha: <commit>}`.
- **Verify:** poll the live HTML for something unique to the change, e.g.
  `until curl -s https://forged-configurator.vercel.app/ | grep -q "<marker>"; do sleep 5; done`.
- **Docs-only changes don't need a deploy.**
- A route returning 200 isn't proof a file exists: the SPA serves `index.html` for unknown paths.

## Database changes

Put the SQL in `supabase/migrations/`, apply it with `apply_migration` (project
`qxlfkfhzpqbxffuqqewg`), read it back, and mirror catalogue data in `data/configuratorData.ts`.
Migrations are applied live before the code that needs them is deployed.

## PR upkeep

- After meaningful pushes, update the PR description (latest round, migrations, test plan).
- Scheduled check-ins re-check CI, reviews and mergeability. The repo has no CI checks.
- Reply to review comments on the thread. Never force-push shared branches.
