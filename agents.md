# Agents

This repository uses a lightweight engineering workflow to keep features, automation, and maintenance organized.

## Purpose

The `agents.md` file documents how project agents and automation should work together when maintaining or extending this project.

## Core Principles

- Keep changes small and reviewable.
- Prefer explicit, documented workflows over implicit assumptions.
- Write readable TypeScript and avoid hidden side effects.
- Maintain a clean separation between UI logic, configuration, and data access.
- Keep environment variables and secrets out of source control.

## Project Context

This repository is a BMW wheel configurator built with:

- React + TypeScript
- Vite
- Three.js for visualization
- Supabase for data/back-end services
- Vercel for deployment

## Agent Expectations

### Code generation
- Prefer TypeScript-safe patterns.
- Use clear naming conventions and component-driven design.
- Keep configuration-driven UI features centralized.
- Validate that app logic remains maintainable and testable.

### Deployment and environment
- Do not hardcode production secrets.
- Use `.env` or Vercel environment variables for real credentials.
- Keep local development setup documented.

### Safety
- Avoid destructive commands on shared branches unless explicitly requested.
- Confirm deployment or environment changes before modifying live infrastructure.
- When working with database changes, propose migration steps clearly.

## Operational Notes

- The project should remain easy to run locally using `npm install` and `npm run dev`.
- When adding environment variables, update the docs and `.env.example` if present.
- New features should be aligned with the configurator and product experience for BMW wheel customization.

## Recommended Workflow

1. Review the relevant UI and data flow before editing.
2. Keep implementation focused on one goal or feature at a time.
3. Validate with the project build (`npm run build`) and TypeScript checks when relevant.
4. Document required environment changes if they affect setup or deployment.

## Ownership

This file is intended as a lightweight system note for contributors and automation agents working in the repo.

## Task playbooks

Before changing a specific area (cars, wheels, paint, PDF, lead emails, brand, docs, deploys,
secrets), read the matching skill in `.claude/skills/` — index: [`docs/SKILLS.md`](docs/SKILLS.md).
Secrets on this project live in Supabase Vault and n8n credentials (no `.env` is needed for the app).
