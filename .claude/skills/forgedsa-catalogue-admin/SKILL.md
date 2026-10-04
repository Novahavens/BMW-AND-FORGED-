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

## Factory tyre per car (`cars.tyre`)

- **What it is:** the tyre BMW fits to the car at the factory (OE), drawn on the 3D tyre
  sidewalls: `{ "brand": "Michelin", "model": "Pilot Sport 4S", "marking": "★",
  "front": "275/35 ZR19 100Y XL", "rear": "285/30 ZR20 99Y XL" }` (jsonb, default `{}`).
  Inner keys are single words because `rowToApp` only camelCases top-level keys. App type:
  `TyreSpec` in `types.ts`.
- **Edit it in /admin:** Cars → *Factory (OE) tyre* (brand, model, marking, front, rear). Sizes are
  written as on the sidewall; the section width and the tread pattern come from them (`Cup 2`,
  `P Zero` and `Pilot Sport` names pick their own tread). Marking `★` draws the BMW star.
- **Generic markings:** leave the sizes empty (`{}`). An empty brand with sizes draws the OE size
  without a maker (used for the M235, whose maker could not be verified).
- **Brand rule (owner-approved, Oct 2026):** maker and model are drawn as plain lettering, never a
  logo; see `3d-car-perfect`. Add only what BMW actually fits, with the source in the migration.
- **Data:** `supabase/migrations/20261004110000_car_tyres.sql` (sources per car), mirrored in
  `data/configuratorData.ts`. The column must exist before the admin saves a tyre: apply that
  migration before deploying.

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
