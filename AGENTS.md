# AGENTS.md

<!-- handoff:learnings:begin -->
## Session Learnings (auto-updated by handoff)

### Implicit Rules
- Stack: React 19, Vite 6, Three.js, bun, Supabase, Vercel, n8n; typecheck with bun run lint
- PR flow: draft PR after push, subscribe PR activity, attribution footer on PR and commits
- Brand and copy in config/brand.ts; catalogue source of truth is Supabase, data/configuratorData.ts is fallback
- Permission mode is set in the UI dropdown; settings.json only sets allow rules
- Scratchpad is session-scoped; do not rely on it persisting

### Key Decisions
- Decision: allow rules in .claude/settings.json for git, bun/npm, node, ffmpeg and basic file commands only — Reason: cut prompts without pre-approving credential lookups or external installs
- Decision: build video with local /hyperframes skill, not hosted MCP — Reason: user chose skill; hosted compose disabled for CLI
- Decision: 16:9, about 90s, British female VO with best voice model — Reason: user spec for BMW pitch

<!-- handoff:learnings:end -->

## Agent workflow

This repository uses a lightweight engineering workflow to keep features, automation, and
maintenance organized. (Merged here from the former root `agents.md`, which duplicated this
filename on case-insensitive filesystems and is now deleted — see `docs/MAP.md` for the
project's navigation map.)

### Core Principles

- Keep changes small and reviewable.
- Prefer explicit, documented workflows over implicit assumptions.
- Write readable TypeScript and avoid hidden side effects.
- Maintain a clean separation between UI logic, configuration, and data access.
- Keep environment variables and secrets out of source control.

### Project Context

This repository is a BMW wheel configurator built with React + TypeScript, Vite, Three.js,
Supabase (data/back-end) and Vercel (deployment). Package manager is **bun**.

### Agent expectations

- **Code generation:** prefer TypeScript-safe patterns, clear naming, component-driven design,
  centralized configuration-driven UI.
- **Deployment and environment:** never hardcode production secrets; use `.env` or Vercel
  environment variables; keep local setup documented.
- **Safety:** avoid destructive commands on shared branches unless explicitly requested; confirm
  deployment or environment changes before modifying live infrastructure; propose migration steps
  clearly for database changes.

### Task playbooks

Before changing a specific area (cars, wheels, paint, PDF, lead emails, brand, docs, deploys,
secrets), read the matching skill in `.claude/skills/` — index: [`docs/SKILLS.md`](docs/SKILLS.md).
Secrets on this project live in Supabase Vault and n8n credentials (no `.env` is needed for the app).

Start any task with [`docs/MAP.md`](docs/MAP.md): where cars are added, how they're made
photoreal, where wheels are added, and how wheels and cars come together in the configurator.
