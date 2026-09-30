---
name: forgedsa-secrets-and-safety
description: Handle credentials, customer data and outward-facing actions on the FORGEDSA project safely. Covers where each secret may live (Vault, n8n credentials, hashed ingest keys), what must never be committed, pasted-key handling, test-data clean-up and actions that need the owner's go-ahead. Use whenever a task touches API keys, webhooks, passwords, leads, emails or publishing.
---

# Secrets and safety

## Where secrets live

| Secret | Lives in | Never in |
|---|---|---|
| Lead-email webhook URL (random path = the key) | Supabase Vault `lead_webhook_url` | repo, docs, commits, chat summaries |
| Wheel ingest keys | `public.ingest_keys` as SHA-256 only; n8n Header Auth credential `x-ingest-secret` | node parameters, repo |
| OpenRouter key | n8n credential "OpenRouter account" | repo, workflow JSON |
| Gmail sending | n8n OAuth credential "Gmail account" | anywhere else |
| Supabase anon key | the client bundle (public by design, protected by RLS) | not a secret |
| Admin passwords | only the admin, via the emailed set-password link | chat, SQL, docs |

## Rules

- **n8n:** never put API keys or tokens in node parameters; always use credentials.
- **Pasted keys:** if a user pastes a key in chat, treat it as exposed. Store it only in the
  session scratchpad (chmod 600) if needed, tell them to rotate it, and never write it to files,
  workflows or commits.
- **Before committing, grep the diff** for key prefixes and webhook paths.
- **Customer data:** leads hold names, emails and mobiles (POPIA applies). Test with
  `qa-test*@forgedsa.com`, then delete the rows. Say that test emails remain in the inbox.
- **Customer text:** HTML-escape everything customers type before it goes into email or HTML.
- **Needs the owner's confirmation:** publishing externally, deleting their data or files, buying
  3D models, and pushing an experimental branch.

## Licensing is also a safety issue

- 3D models must allow commercial real-time/web use, and credits go in `public/models/CREDITS.md`.
- Editorial or NC licences are out.
- Legal pages (`config/pages.ts`) are drafts until an attorney signs off; keep `LEGAL_DRAFT = true`
  until then.
