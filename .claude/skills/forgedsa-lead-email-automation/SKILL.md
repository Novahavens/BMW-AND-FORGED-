---
name: forgedsa-lead-email-automation
description: Operate, change or debug the FORGEDSA new-lead email. Every PDF download and enquiry inserted into public.leads is posted by a Postgres trigger (pg_net) to an n8n webhook, which emails forgedsa1@gmail.com a branded HTML summary via Gmail. Use for changing recipients, sender, template or colours, rotating the webhook, missing emails, or testing the flow end to end.
---

# Lead email automation

## Flow

```
browser insert → public.leads ─ AFTER INSERT trigger leads_notify_webhook
  └ private.notify_lead_webhook()  (SECURITY DEFINER, search_path '')
      · looks up car / paint / wheel / finish by the ids stored in leads.configuration
        (carId / paintId / wheelId / finishId; falls back to the display names)
        (generation, hex, type, image_url, price_usd)
      · price_usd = greatest(price_by_finish[finishId], price_by_size[size] or price_per_set):
        a dearer finish raises the price, never lowers it (same rule as services/pricing.ts rimPrice)
      · image_url: stocked wheels store a site-relative path (/rim-images/*.webp); the trigger sends it
        as an absolute URL on https://forged-configurator.vercel.app, and the Code node prefixes the
        same origin if a relative path still arrives (either side alone is enough)
      · net.http_post(url from Vault 'lead_webhook_url') — async, exceptions swallowed
        → n8n "FORGEDSA · Lead email (PDF downloads + enquiries)" (id Le68biVptAvswzqq)
           Webhook (POST, responds on receipt) → Code "Build branded email" → Gmail
```

- **Migrations:** the trigger and function were created in
  `supabase/migrations/20260928090000_lead_email_webhook.sql`; `20261001090000_lead_hardening.sql` added
  the flood guard and id lookups; the **current function body** is in
  `20261110153000_wheel_inventory_stock_sheet.sql` (finish price, absolute image URL). To change the
  function, `create or replace` it in a new migration; do not edit an applied one.
- **Template:** the n8n Code node. It is copied to `n8n/lead-email.code.js`, which is excluded from
  `tsc` via `tsconfig.json`. Keep the two identical, and add the three header comment lines only
  in the repo copy.
- **Gmail node:** `sendTo forgedsa1@gmail.com`, `emailType html`, `appendAttribution false`, sender
  name "FORGEDSA Leads", `replyTo` the customer. It uses the n8n credential "Gmail account".

## Rules

- **The webhook URL is a secret.** Its random path is the key, so keep it only in Vault. Never put
  it in the repo, docs or commits.
  - Rotate it: change the Webhook node path, publish, then
    `select vault.update_secret(id, '<new URL>') from vault.secrets where name='lead_webhook_url';`.
  - With no secret set, the trigger does nothing.
- **Escape all customer text** (`esc()` in the template). Tests showed `<b>` and `<script>` in the
  name and message render as text.
- **Keep the template's copies in step** with `config/brand.ts`: brand colours (#121212 / #1A1A1A /
  #CF9F52 / #F2EEE6 / #9C978E, action button #FF5A00) and region rates (za 18.2, uk 0.79, us 1,
  eu 0.92, ae 3.67).
- **HTML style:** table-based, inline styles, no web fonts required, logo from
  `https://forged-configurator.vercel.app/brand/forgedsa-wordmark.png`.

## Changing the template via MCP

1. Edit `n8n/lead-email.code.js`.
2. Call `update_workflow` with `setNodeParameter` path `/jsCode` on the node "Build branded email".
   The value is the full code, without the repo header lines.
3. Call `publish_workflow`. An unpublished draft doesn't run.

Preview locally before publishing: run the code with a sample `{ body: … }` through `new Function('$input', src)`,
write `out.html` and screenshot it at 640 and 390 px.

## Testing end to end

1. Insert a lead with `email='qa-test@forgedsa.com'`.
2. Check `select status_code, content from net._http_response order by created desc limit 3;`.
   Expect 200 "Workflow was started".
3. Check n8n `search_workflow_executions` for the workflow. Expect success.
4. Optionally find the sent message with the Gmail MCP (`to:forgedsa1@gmail.com`).
5. **Delete the QA leads.** The test emails remain in the inbox; say so.
