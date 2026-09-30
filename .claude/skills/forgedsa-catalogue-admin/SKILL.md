---
name: forgedsa-catalogue-admin
description: Manage the FORGEDSA catalogue and admin access. Covers prices, sizes, finishes, paints and visibility, the /admin panel, the admin allowlist, first sign-in and password reset links, and keeping Supabase and the bundled fallback catalogue in sync. Use for price or catalogue changes, adding or removing admins, "can't sign in" problems, or schema questions about cars/paints/wheels/wheel_finishes/leads.
---

# Catalogue and admin access

Stack: Supabase project `qxlfkfhzpqbxffuqqewg` (Postgres, Auth, Storage).
- Tables: `cars`, `paints`, `wheels`, `wheel_finishes`, `leads`, `admin_users`, `ingest_keys`, and
  share codes.
- The browser reads the catalogue with the anon key. Writes pass row-level security via
  `private.is_admin()`, which checks the signed-in email against `public.admin_users`.

## The admin panel (`/admin`)

- **Tabs:** Cars, Wheels, Finishes, Paints, Enquiries. Fields are defined in
  `components/admin/entityConfig.ts`, and the UI is in `components/admin/AdminPage.tsx`.
- **Enquiries** (`EnquiriesPanel.tsx`): every lead, with `source` = `pdf` or `enquiry`, plus Reply,
  Open build (`/?config=CODE`), delete and CSV export.
- **Hide, don't delete:** untick *Visible in configurator*. Order with *Sort order*.
- **Wheel prices:** edit the size/price grid. `price_by_size` is USD per set, and `price_per_set` and
  `standard_sizes` are computed on save.
- A wheel offers only its ticked finishes, and *Default finish* must be one of them.

## Admin accounts

- **Allowlist:** `insert into public.admin_users (email) values ('x@y.com');`. Delete the row to
  revoke.
- **Account:** Supabase Auth → Users → Add user → Auto Confirm. The user then clicks *First time
  here, or forgot your password?* on `/admin`. That calls `resetPasswordForEmail` with redirect
  `${origin}/admin`, and `SetPasswordForm` calls `updateUser` (min 10 characters).
  `services/supabaseClient.ts` sets `authFlags.passwordRecovery` from the URL hash or the
  `PASSWORD_RECOVERY` event.
- **Auth URL configuration:** Site URL `https://forged-configurator.vercel.app`, redirect
  `https://forged-configurator.vercel.app/**`. This can't be set via MCP; ask the owner.
- Supabase's built-in SMTP only emails team members. Other admins need custom SMTP.
- Never paste or choose a password in chat. Accounts created via SQL get a random, unknown
  password.

## Editing by migration instead of the UI

- Put SQL in `supabase/migrations/<timestamp>_<name>.sql`, apply it with `apply_migration`, read it
  back, and mirror the change in `data/configuratorData.ts` (the fallback used when Supabase is
  unreachable).
- Free-tier projects pause after about a week idle; restore from the dashboard.

## Leads data hygiene

Test leads trigger real emails (see `forgedsa-lead-email-automation`). Use `qa-test*@forgedsa.com`
and delete them afterwards.
