# Project skills

Everything learned while building the FORGEDSA configurator is captured as **skills**: short,
task-focused playbooks in `.claude/skills/<name>/SKILL.md`. Claude Code loads them automatically
when it works in this repository. A developer can read them as checklists too; each one names the
exact files, commands, values and pitfalls for its task.

| Skill | Use it when… |
|---|---|
| [`forgedsa-codebase-map`](../.claude/skills/forgedsa-codebase-map/SKILL.md) | starting any task; finding which file owns a behaviour |
| [`forgedsa-add-car-model`](../.claude/skills/forgedsa-add-car-model/SKILL.md) | adding or replacing a car; unpainted panels, wrong wheels, scale or rotation |
| [`forgedsa-wheel-pipeline`](../.claude/skills/forgedsa-wheel-pipeline/SKILL.md) | adding wheels from photos (sheet + n8n + ingest-wheel) or CAD files |
| [`forgedsa-catalogue-admin`](../.claude/skills/forgedsa-catalogue-admin/SKILL.md) | prices, sizes, finishes, paints; admin accounts and sign-in problems |
| [`forgedsa-paint-and-lighting`](../.claude/skills/forgedsa-paint-and-lighting/SKILL.md) | paint looks plastic, blotchy or washed out; tuning the studio |
| [`forgedsa-photoreal-mode`](../.claude/skills/forgedsa-photoreal-mode/SKILL.md) | path-traced photorealism (proof branch `claude/photoreal-proof`) |
| [`forgedsa-render-verification`](../.claude/skills/forgedsa-render-verification/SKILL.md) | screenshotting the app/engine/PDF headlessly to prove a visual change |
| [`forgedsa-pdf-brochure`](../.claude/skills/forgedsa-pdf-brochure/SKILL.md) | the customer PDF, its email + mobile gate and lead capture |
| [`forgedsa-lead-email-automation`](../.claude/skills/forgedsa-lead-email-automation/SKILL.md) | new-lead emails to forgedsa1@gmail.com (trigger → n8n → Gmail) |
| [`forgedsa-brand-system`](../.claude/skills/forgedsa-brand-system/SKILL.md) | colours (orange = main actions, gold = emphasis), fonts, logo, socials |
| [`forgedsa-handover-docs`](../.claude/skills/forgedsa-handover-docs/SKILL.md) | updating client/technical docs; rebuilding the branded handover PDF |
| [`forgedsa-deploy-and-release`](../.claude/skills/forgedsa-deploy-and-release/SKILL.md) | checks before pushing, branch policy for experiments, Vercel deploys, PR upkeep |
| [`forgedsa-secrets-and-safety`](../.claude/skills/forgedsa-secrets-and-safety/SKILL.md) | anything touching keys, webhooks, passwords, customer data or licences |

## Keeping skills current

- When a process changes, update its skill in the same commit as the code: new files, new
  values, a pitfall hit.
- Each skill starts with `name` and `description` frontmatter. The description decides when
  Claude uses it, so keep it specific ("use when…").
- **Never put secret values in a skill.** Name where the secret lives (Vault, an n8n
  credential), not the value.
