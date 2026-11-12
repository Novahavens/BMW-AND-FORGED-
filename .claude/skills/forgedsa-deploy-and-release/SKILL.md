---
name: forgedsa-deploy-and-release
description: Ship FORGEDSA changes safely. Covers the pre-push checks (tsc, vite build, renders), commit attribution, the branch policy (work branch vs throwaway proof branches), production deploys to Vercel from a git SHA, verifying the live site, and PR upkeep. Use when committing, pushing, deploying, opening or updating the PR, or when trying something experimental that may be thrown away.
---

# Deploy and release

## Branches

- **Repo and base:** `FazalRSA/BMW-AND-FORGED-`, base `main`. PR #2 (branch `ccr-f52bf849-fnf7qs`) is merged.
  The open work is PR #3 (`claude/prepared-cars-render-frames`). Work on a `claude/<topic>` branch from `main`
  and merge `main` into it (never rebase or force-push a shared branch) when the PR reports a conflict.
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
6. Commit messages must be proper (the owner asked for this, Nov 2026):
   - The subject is `type(scope): what changed`, at most about 65 characters.
   - The body says why the change was made, what it touches, and what was checked.
   - Never repeat a message that says nothing. The learning-log commit
     (`.cto-toolkit/learning/patterns.jsonl`) says how many records it adds, the time span,
     and anything flagged.
   - Merges list what the other branch brings in.
   - Pushed history is never rewritten to fix a message. Write it properly the first time.

## Deploy (Vercel)

- **Project:** `forged-configurator` (team `team_YEcPHHbzFoa1DSSKBbNDiyEk`, project
  `prj_p1fOXWBPFfxedbLZFp9R3s1Qiq9P`). Vite framework, build `vite build`, output `dist`, no env
  vars.
- **Production:** Vercel MCP `create_deployment` with `target: production` and
  `gitSource {type: github, org: FazalRSA, repo: BMW-AND-FORGED-, ref: <branch>, sha: <commit>}`.
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
