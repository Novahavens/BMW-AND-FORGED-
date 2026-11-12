# Customer accounts: Google sign-in and the garage

Customers can sign in with Google and keep a **garage** of saved builds. Everything still works
without an account exactly as before: share codes, PDF downloads and enquiries from anonymous
visitors are unchanged, and the admin at `/admin` (email + password, allowlist `public.admin_users`)
keeps working as it did, with one extra lock: because sign-ups are now open, an admin's email must
be **confirmed** in Supabase Auth (see *Owner steps* and *How RLS keeps customers out of /admin*).

## What was built

| Piece | Where |
|---|---|
| Schema, policies, trigger and the rename function | `supabase/migrations/20261110150000_customer_accounts.sql` |
| `private.is_admin()` requires a confirmed email; customers may update only their profile fields | `supabase/migrations/20261110170000_admin_requires_confirmed_email.sql` |
| Auth service: sign in / out, cached session, profile, garage | `services/authService.ts` |
| `user_id` on saved builds and leads | `services/journeyService.ts` (`saveConfiguration`, `submitEnquiry`) |
| The account sheet (sign-in, profile, garage) | `components/journey/AccountSheet.tsx` |
| Entry points | `App.tsx`: the **Account** button in the configurator's stage corner, and **Account & garage** in the configurator's **More options** (`MoreOptionsModal` in `Configurator.tsx`); `SummaryPage.tsx`: **Save to garage** / **Sign in to save** under the configuration code in *Share summary*; the PDF form and the enquiry form are prefilled from the profile |

**Signed out:** the sheet ("Sign in") explains what an account gives, offers **Continue with
Google** and states what is stored (POPIA line with the contact email from `config/brand.ts`).

**Signed in:** avatar, name and email; editable profile (display name, phone, city, your car from
the active catalogue, brake system); the garage lists every saved build (name or code, car · paint ·
wheel · size · finish, date) with **Open** (reopens it in the configurator through the existing
`/?config=CODE` flow), **Rename** and **Delete** (confirmed inline); **Sign out**.

**Data flow**

- `saved_configurations.user_id` is set on insert when a session exists (read synchronously from the
  cached session, never awaited). **Save to garage** saves a *new copy* of the build under a fresh
  code owned by the customer (with the name they typed); the summary then shows that code. Ownership
  of an existing row is never transferred: a share code opens a build, it is not proof of authorship,
  so a build reached through someone else's `/?config=CODE` link stays theirs and their link keeps
  working. Renaming a build in the garage goes through `rename_configuration(code, name)`, which only
  touches a row the caller already owns.
- `leads.user_id` is set the same way for enquiries and PDF downloads. The `configuration` object the
  lead email (n8n) reads is unchanged.
- The Google round trip reloads the page. From the configurator or summary the build in
  progress is first saved under a code and the visitor returns to `/?config=CODE`, which reopens it
  in the configurator; from any other page they return to that page. The token fragment Supabase
  puts in the URL is removed again (`history.replaceState`), so `/?config=` links and share links
  never see it. The admin's `#…type=recovery` link still works (its flag is read before that).

## Owner steps (once, in the Supabase dashboard)

Project `qxlfkfhzpqbxffuqqewg` (*Apex Forged Configurator*).

1. **Google Cloud Console → APIs & Services → Credentials → Create credentials → OAuth client ID**,
   type *Web application*.
   - Authorised JavaScript origins: the production URL (e.g. `https://forged-configurator.vercel.app`)
     and `http://localhost:5173`.
   - Authorised redirect URI: `https://qxlfkfhzpqbxffuqqewg.supabase.co/auth/v1/callback`.
   - Set up the OAuth consent screen (app name FORGEDSA, support email, the privacy link `/terms`);
     publish it (not "testing"), otherwise only listed test users can sign in.
   - Copy the client ID and client secret. **The secret goes only into the Supabase dashboard**,
     never into the repo, Vercel or n8n.
2. **Supabase → Authentication → Sign In / Providers → Google:** enable, paste the client ID and
   secret, save.
3. **Supabase → Authentication → URL Configuration:**
   - Site URL = the production URL.
   - Redirect URLs: the production URL with `/**`, the Vercel preview pattern
     (`https://*-<team>.vercel.app/**`) and `http://localhost:5173/**`. The app asks to come back to
     `/?config=CODE` or to the page the visitor was on, so the `/**` glob is needed.
4. **Supabase → Authentication → Sign In / Providers → Email:** "Allow new users to sign up" must be
   **on** (it is the default); customers are created on their first Google sign-in. **"Confirm email"
   must stay on** (also the default) and must never be switched off. The sign-up switch also opens
   email + password sign-up on the Auth API to anyone, so with confirmations off a stranger could
   register an allowlisted admin address before that admin has an account and get a session carrying
   it. Google accounts arrive verified, so customers never see a confirmation email and are not
   affected. The migration in step 5c makes `private.is_admin()` insist on a confirmed email as well,
   so the setting is a second lock, not the only one.
5. **Apply the migrations, in this order,** each as its own run in the SQL Editor (both files are
   idempotent; running them twice is safe):

   a. `supabase/migrations/20261110150000_customer_accounts.sql` (profiles, garage, `leads.user_id`).

   b. **As a separate run on its own**, the two indexes. They are not in the migration because
      `CONCURRENTLY` cannot run inside the transaction a pasted script runs in:

      ```sql
      create index concurrently if not exists saved_configurations_user_idx on public.saved_configurations (user_id, created_at desc);
      ```
      ```sql
      create index concurrently if not exists leads_user_idx on public.leads (user_id, created_at desc);
      ```

   c. `supabase/migrations/20261110170000_admin_requires_confirmed_email.sql` (needs the `profiles`
      table from a): `private.is_admin()` now also requires the admin's `auth.users.email_confirmed_at`,
      and customers may update only their own profile fields, never `email`. **First check that every
      admin is confirmed**, or `/admin` will tell them "not on the admin allowlist" afterwards:

      ```sql
      select u.email, u.email_confirmed_at
      from auth.users u join public.admin_users a on a.email = lower(u.email);
      ```

      A null `email_confirmed_at` means the user was created in the dashboard without **Auto Confirm
      User** and has not yet set a password through the emailed link (doing so confirms the address).
      Either send them a recovery link (Authentication → Users → … → Send password recovery) or confirm
      the row directly: `update auth.users set email_confirmed_at = now() where id = '<uuid>';`
      Create future admins with **Auto Confirm User** ticked (docs/HANDOVER.md, section 1).
6. Deploy the app as usual (`.claude/skills/forgedsa-deploy-and-release`).

## How RLS keeps customers out of /admin

A customer is an ordinary `authenticated` user. Every admin policy is
`using ((select private.is_admin()))`. Since `20261110170000_admin_requires_confirmed_email.sql` that
function looks up the caller's own `auth.users` row by `auth.uid()` and says yes only when its email
is on `public.admin_users` **and** `email_confirmed_at` is set. A Google account that is not on the
allowlist gets `false`, and so does an unconfirmed email + password sign-up that used an admin's
address, so neither can read or write the catalogue, leads (other than its own) or storage. This is
why **"Confirm email" stays on** and why every admin's email must be confirmed (owner step 5c). The
admin page itself also checks the allowlist (`isCurrentUserAdmin`) before showing the editor; that
read goes through the same function. Customers never see `/admin` in the app.

What a customer *can* do, and nothing more:

| Table | Customer (authenticated, not admin) | Anonymous |
|---|---|---|
| `profiles` | read / create **own row** only; update **own row**, and only the profile columns (`display_name`, `avatar_url`, `phone`, `city`, `primary_car_id`, `chassis_code`, `exterior_paint_id`, `brake_system`, `preferred_finish_id`, `marketing_opt_in`), never `email`, `id` or `created_at` (column-level grant) | nothing |
| `saved_configurations` | insert with `user_id` null or own id; read / rename / delete **own rows**; **Save to garage** saves a copy owned by the customer; `rename_configuration(code, name)` renames own builds | insert with `user_id` null; `get_configuration(code)` |
| `leads` | insert with `user_id` null or own id; read **own rows** | insert with `user_id` null |

There is no "claim": no function or policy moves an anonymous (or anyone else's) build into a
customer's garage. The code in a share link is a secret that opens the build, not proof of who made
it; letting the holder take it over would let them delete it later and kill the sharer's link.
**Save to garage** therefore inserts a fresh row owned by the customer. The one server-side change to
an existing row, `rename_configuration(code, name)`, is a `security definer` function that takes the
exact code and updates only a row whose `user_id` is the caller's (so a stray `UPDATE` without a
`WHERE` cannot touch other rows either); it returns `false` for an unknown code, an anonymous build
or someone else's.

## Data stored (POPIA)

| Data | Where | Why | Deleted when |
|---|---|---|---|
| Google account id, email, name, avatar URL | `auth.users`, `public.profiles` | run the account and garage | the user is deleted (cascade) |
| Phone, city, car, chassis code, paint, brake system, finish, marketing opt-in (all optional) | `public.profiles` | faster enquiries, fitment context | with the user |
| Saved builds (`payload`, name) | `public.saved_configurations` | the garage; share links | the customer deletes them, or `user_id` is set null when the user is deleted (the share code keeps working) |
| Enquiries / PDF downloads | `public.leads` | the sales follow-up (unchanged) | admin deletes them; `user_id` set null when the user is deleted |

To delete an account on request: **Authentication → Users → … → Delete user**. The profile goes
with it; builds and leads lose their owner. The sheet tells customers to ask via the brand email or
the enquiry form. Google receives nothing from the app beyond the sign-in itself.

## Manual test script

Run the dev server (`bun run dev`, or Vite on 5173) with `http://localhost:5173/**` in the redirect
list, or test on a preview deployment.

1. Open `/`, **Enter** (it opens the configurator on the car showing). Click the **Account** button
   (top-right corner of the stage): the sheet says "Sign in" and shows **Continue with Google**.
2. Click it, choose a Google account. You land back in the configurator with the same car and paint
   (`/?config=…` → `/configure`); the address bar has no `#access_token`.
3. **Account** again: avatar, name, email. Fill in phone and city, pick your car, **Save profile** →
   "Profile saved". Close, reopen: the values are there.
4. **Summary** → **Share summary** → **Save to garage**: the name field reads "<badge> · <wheel>";
   **Save** → "Saved to your garage".
5. Reload the page. **Account**: the garage lists the build with car · paint · wheel · size · finish
   and today's date.
6. **Open**: the configurator shows that build. **Account** → **Rename** → type a name → **Save**:
   the list shows it. **Delete** → **Delete**: it is gone.
7. **Summary → PDF** and **Enquire**: name, email and phone are prefilled from the profile; sending
   still works and the lead email arrives as before.
8. **Sign out** (bottom of the sheet): the sheet returns to **Continue with Google**.
9. Anonymous: in a private window, go to the summary, **Share summary** shows the code and
   **Sign in to save**; **Copy link** and opening it in another window still work; the PDF and the
   enquiry still save leads.
10. `/admin`: the password sign-in works for an admin; a customer's Google account signed in on the
    site and then visiting `/admin` sees "… is not on the admin allowlist".

## Verifying RLS in SQL

In the SQL Editor (runs as `postgres`), impersonate the roles. Replace the UUIDs with real ones
from **Authentication → Users**.

```sql
-- anonymous: may insert an unowned build, may not read, may not rename
set local role anon;
insert into public.saved_configurations (code, payload) values ('TESTANON01', '{"carId":"m2_g87"}');          -- ok
insert into public.saved_configurations (code, payload, user_id) values ('TESTANON02', '{}', gen_random_uuid()); -- fails (policy)
select count(*) from public.saved_configurations;                                                              -- 0 rows visible
select public.rename_configuration('TESTANON01', 'x');                                                          -- permission denied
reset role;

-- a customer: sees and edits only their own rows; an anonymous build cannot be renamed or taken over
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"<customer-uuid>","role":"authenticated","email":"customer@example.com"}', true);
select * from public.profiles;                                   -- exactly one row, theirs
update public.profiles set phone = '+27 82 000 0000' where id = '<customer-uuid>';           -- 1 row
update public.profiles set email = 'someone.else@example.com' where id = '<customer-uuid>';  -- permission denied for table profiles
select public.rename_configuration('TESTANON01', 'Mine now');    -- false (not theirs; row untouched)
insert into public.saved_configurations (code, payload, user_id) values ('TESTANON03', '{"carId":"m2_g87"}', '<customer-uuid>'); -- ok (own id)
select public.rename_configuration('TESTANON03', 'My M2');       -- true (own row)
select code, name, user_id from public.saved_configurations;    -- only TESTANON03, named "My M2"; TESTANON01 not visible
update public.saved_configurations set user_id = '<customer-uuid>' where code = 'TESTANON01'; -- 0 rows (policy)
update public.cars set active = false where id = 'm2_g87';       -- 0 rows (not an admin)
select count(*) from public.leads;                               -- only their own
reset role;

-- back as postgres: the anonymous build is still unowned
select code, name, user_id from public.saved_configurations where code = 'TESTANON01'; -- name null, user_id null

-- an admin: everything the admin page needs, still (the admin's auth.users row must have
-- email_confirmed_at set, otherwise is_admin() is false and every count below is 0)
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"<admin-uuid>","role":"authenticated","email":"<admin email>"}', true);
select count(*) from public.saved_configurations;                -- every row
select count(*) from public.leads;                               -- every row
select count(*) from public.profiles;                            -- every row (read only)
reset role;

delete from public.saved_configurations where code like 'TESTANON%';
```

Policies in place after the migration: `select policyname, cmd, roles from pg_policies where
tablename in ('profiles','saved_configurations','leads') order by tablename, cmd;`.
