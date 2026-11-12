# Dealerships: the dealer login and FORGED's Dealers tab

Three sign-ins now exist:

| Who | Where | How they are allowed in |
|---|---|---|
| FORGED admin | `/admin` | email on `public.admin_users`, confirmed in Supabase Auth |
| Dealership | `/dealer` | email on `public.dealer_users` (one dealership each), confirmed, dealership switched on |
| Customer | the Account sheet in the configurator | Google, no allowlist (docs/ACCOUNTS.md) |

**Prices stay with FORGED.** No dealer policy touches `cars`, `paints`, `wheels`, `wheel_finishes` or the allowlists;
those remain `private.is_admin()` only. A dealer sees only the enquiries assigned to its dealership.

## What a dealer can do (`/dealer`)

Sign in with email + password (or Google), then see the enquiries FORGED assigned to the dealership: Reply, Open
build, status (New, Contacted, Quoted, Won, Lost), a notes box, and CSV export. They cannot delete, reassign, or see
other dealerships' enquiries or unassigned ones. `components/dealer/DealerPage.tsx`, the list is
`components/admin/EnquiriesPanel.tsx` in `mode="dealer"`.

## What FORGED does (`/admin`)

- **Dealers tab** (`DealersPanel.tsx`): add a dealership, switch it on or off, delete it (its enquiries return to
  FORGED), add or remove the emails that may sign in for it.
- **Enquiries tab**: a *Dealership* dropdown on every enquiry assigns it (or sends it back to FORGED), a status
  dropdown and notes, and a filter by dealership. The CSV now includes status and dealership.

## Owner steps

Done on 2026-11-11 (applied through the Supabase connector at the owner's request):

1. `supabase/migrations/20261111120000_dealers.sql` is applied (live migration name `dealers`).
2. The index is built and valid:
   ```sql
   create index concurrently if not exists leads_dealer_created_idx
     on public.leads (dealer_id, created_at desc) where dealer_id is not null;
   ```

Still to do:

3. In `/admin` → Dealers, add the dealership and the email of each person who will sign in.
4. The person signs in at `/dealer`. Easiest is **Continue with Google** (needs the Google provider from
   docs/ACCOUNTS.md; the address arrives confirmed). For a password login, create the user in Supabase Auth →
   Users → Add user → Auto Confirm, then they use *First time here, or forgot your password?* on `/dealer`
   (the link returns to `/dealer`). This real sign-in has not been tried yet.
5. Supabase Auth URL configuration already allows `https://forged-configurator.vercel.app/**`, so `/dealer` is covered.

## How it is locked down

- `private.current_dealer_id()` (security definer, pinned search_path) joins `auth.users` (confirmed email) to
  `dealer_users` and `dealers.active`. `public.my_dealer()` returns the caller's dealership; the page shows nothing
  without it, and the database enforces the same thing, the page is not the lock.
- `leads`: dealers read rows where `dealer_id` is theirs and update only those, and the `WITH CHECK` keeps
  `dealer_id` on their own dealership. The browser may update only `dealer_id`, `status`, `dealer_notes` (column
  grant); contact details and the build stay as the customer sent them.
- Visitors still send enquiries anonymously, but the insert policy now refuses a row that picks its own dealer,
  status or notes.
- Checked on 2026-11-11 against the live database, in a block that always ended in an error so nothing was kept
  (a throwaway dealer and user; existing leads reused so no enquiry email could fire): a dealer sees and updates only
  its own enquiries; cannot reassign one, edit a customer's email, delete a lead, write to `wheels` or `cars`, add its
  own login or edit its dealership; a switched-off dealership sees nothing; a visitor cannot choose a dealer or status.
  Repeat the same checks after any change to these policies.

## Sales agents, commission and sales (2026-11-12)

Admin only (`/admin`). Dealers and customers cannot see any of it. Migration:
`supabase/migrations/20261112140000_sales_agents_and_sales.sql` (two new tables and one column; additive).

- **Dealers tab:** each dealership has a **Commission per set (R)**: the rand FORGED pays it per wheel set sold.
  Below it, **Sales agents**: the dealership's salespeople (name, email, phone; switch off or remove). Agents do not sign in.
- **Enquiries tab:** set an enquiry to **Won** and a sale form appears: agent, sold on, sets, FORGED price, dealer markup,
  commission (pre-filled with the dealership's rate × sets, editable), commission paid, notes.
  **Customer price = FORGED price + dealer markup.** One sale per enquiry.
- **Sales tab:** totals (sales, sets, FORGED revenue, dealer markup, customer total, commission owed), by dealership and by
  agent, filters (dealership, agent, month, owed only), mark commission paid, delete, CSV export.
- **Changing a rate** affects new sales only: each sale keeps the commission it was recorded with.
- **Removing an agent** keeps their sales (no agent). **Deleting an enquiry** keeps its sale. **Deleting a dealership**
  removes its agents and keeps its sales as "Removed dealership".

After applying the migration, build the indexes on their own (they cannot run inside a migration):
```sql
create index concurrently if not exists sales_agents_dealer_idx on public.sales_agents (dealer_id);
create index concurrently if not exists sales_dealer_sold_idx on public.sales (dealer_id, sold_on desc);
create index concurrently if not exists sales_agent_idx on public.sales (agent_id);
```
