-- Admin access needs a confirmed email; a customer may not rewrite who their profile says they are.
--
-- Apply after 20261110150000_customer_accounts.sql (it needs public.profiles). Idempotent: every
-- statement is create or replace / revoke / grant, so running it twice changes nothing.
--
-- ----------------------------------------------------------------------------------------------
-- 1. private.is_admin(): the allowlisted address must belong to a CONFIRMED auth user
-- ----------------------------------------------------------------------------------------------
-- The original (20260922000000_catalog_schema.sql) matched the JWT's email claim against
-- public.admin_users and nothing else. That was enough while nobody could sign up: the admin's own
-- account was the only way to get a session with that email. Customer accounts (20261110150000) need
-- "Allow new users to sign up" ON for Google, and the same switch opens email + password sign-up on
-- POST /auth/v1/signup to anyone. If "Confirm email" were ever OFF, a stranger could register an
-- allowlisted admin address before that admin's own account exists (the first-sign-in flow adds the
-- address to admin_users first) and receive a session whose email claim is the admin's: every
-- "admins ..." policy (leads with customer names and phones, catalogue writes, storage) would say yes.
--
-- So the function now reads the caller's own auth.users row (by auth.uid(), not by a claim the caller
-- chose at sign-up) and also requires email_confirmed_at. An unconfirmed sign-up with an admin's
-- address is therefore an ordinary customer. Google accounts arrive confirmed; an admin created in the
-- dashboard with "Auto Confirm User", or who set their password through the emailed link (verifying a
-- recovery link confirms the address), is confirmed too. docs/ACCOUNTS.md: keep "Confirm email" ON as
-- the second lock, and the SQL to check that every admin is confirmed before this is applied.
--
-- Same signature, language, volatility, security definer, pinned search_path and grants as before, so
-- every existing policy that calls (select private.is_admin()) keeps working unchanged. Security
-- definer is what lets the function read auth.users and the allowlist on the caller's behalf without
-- exposing either table.
create or replace function private.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from auth.users u
    where u.id = (select auth.uid())
      and u.email_confirmed_at is not null
      and lower(u.email) in (select lower(a.email) from public.admin_users a)
  );
$$;
comment on function private.is_admin() is
  'True when the caller''s auth.users row has a confirmed email that is on public.admin_users. Looks the user up by auth.uid() and requires email_confirmed_at, so an unconfirmed email/password sign-up that used an admin''s address is not an admin (sign-ups are open for Google customers).';

revoke all on function private.is_admin() from public;
grant usage on schema private to anon, authenticated;
grant execute on function private.is_admin() to anon, authenticated;

-- ----------------------------------------------------------------------------------------------
-- 2. profiles: customers edit their details and car, not their identity columns
-- ----------------------------------------------------------------------------------------------
-- 20261110150000 granted UPDATE on the whole table, so the "owners update own profile" policy let a
-- customer PATCH their own email (copied from the Google account, and what an admin will see next to a
-- lead), id and created_at. Revoking the table grant first also clears any column grants (PostgreSQL
-- does that for us); the column grant then names exactly what the account sheet edits. SELECT and
-- INSERT stay table-wide: the client still reads every column and may still create its own row (the
-- "owners create own profile" policy); handle_new_user is security definer and unaffected.
--
-- Client side (services/authService.ts): updateMyProfile sends only the columns in the patch, so a
-- patch of display_name / phone / city / primary_car_id / brake_system keeps working. Two things must
-- change there: `email` must leave ProfilePatch / PATCH_COLUMNS (a patch carrying it is now
-- "permission denied for table profiles"), and the no-row fallback in getMyProfile must be a plain
-- insert, not .upsert(..., { onConflict: 'id' }): PostgREST turns an upsert into INSERT ... ON CONFLICT
-- (id) DO UPDATE SET id = excluded.id, email = excluded.email, ..., and PostgreSQL requires UPDATE on
-- every column in that SET list even when no conflict happens.
revoke update on public.profiles from authenticated;
grant update (display_name, avatar_url, phone, city, primary_car_id, chassis_code, exterior_paint_id,
              brake_system, preferred_finish_id, marketing_opt_in)
  on public.profiles to authenticated;
