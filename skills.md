# Skills

This repository includes a frontend configurator and supporting tooling. The skills guide below describes the primary capabilities expected when working on this project.

## Core Skills

### Frontend development
- Build and maintain React + TypeScript screens.
- Create reusable UI components for configurator workflows.
- Manage state efficiently for user selections and previews.

### 3D / visual interaction
- Work with Three.js-based rendering and scene updates.
- Support responsive visual previews for wheel configuration changes.
- Optimize rendering and update loops for smooth interaction.

### Product configuration logic
- Model wheel options, combinations, and validation rules.
- Connect configuration state to preview behavior.
- Keep user experience intuitive and polished.

### Data and backend integration
- Integrate with Supabase for persistence and data retrieval.
- Design secure and minimal database access patterns.
- Handle asynchronous loading and error states clearly.

### Deployment and environment management
- Configure Vercel deployment settings.
- Manage environment variables and secure secrets.
- Ensure production builds are stable and repeatable.

## Operational Expectations

- Keep features aligned with the BMW configurator experience.
- Prefer maintainable code and readable structure over clever shortcuts.
- Validate builds and type checks before finalizing changes.
- Keep dependencies and environment assumptions explicit.

## Recommended Quality Checks

- `npm install`
- `npm run build`
- `npm run lint` (TypeScript check)
- Verify local dev server runs as expected

## Example Workflow

```bash
npm install
npm run dev
```

For deployment validation:

```bash
npm run build
```

## Notes

This file is intended to communicate the technical skills and workflow expectations for contributors and automation working in this repository.

## Project-specific playbooks

The capabilities above are written up as step-by-step playbooks (exact files, commands, values
and known pitfalls) in `.claude/skills/`, indexed in [`docs/SKILLS.md`](docs/SKILLS.md). Claude
Code loads them automatically. This project uses **bun**: `bun install`, `bun run dev`,
`bun run build`, `bun run lint`.
