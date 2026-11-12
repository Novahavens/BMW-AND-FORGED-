# ADR-002: Sales agents, dealership commission and sales from won enquiries

**Status:** Accepted
**Date:** 2026-11-12
**Feature:** sales-tracking
**Author:** 10x-Team (Architect + Staff Engineer)

## Context
The owner wants to add sales agents, adjust commission and track sales in /admin. Answers (2026-11-12): agents are
dealership staff; FORGED pays the dealership a fixed amount per set and the dealership adds its own markup; a sale is an
enquiry marked Won; admin only for now.

## Decision
- `dealers.commission_per_set_zar` (rand) on the dealership; `sales_agents` (per dealership, no login); `sales` (one per
  lead, `lead_id` unique, kept if the lead is deleted) with FORGED price, dealer markup, sets, a commission snapshot and paid.
- All three admin-only via `private.is_admin()` RLS, the same lock as the catalogue. No dealer policy.
- UI: rate + agents in the Dealers tab, a sale form on Won enquiries, a Sales tab for totals, filters, paid and CSV.

## Alternatives Considered
| Alternative | Pros | Cons | Why Not |
|---|---|---|---|
| Sale columns on `leads` | No new table | `leads` update is column-granted to dealers; mixing money into it widens what a dealer row touches; a deleted lead loses the sale | Separate admin-only table is safer |
| Commission as a % of price | Common | Owner chose a fixed amount per set | Owner's answer |
| Agent logins | Self-service | More auth surface; owner chose admin-only | Later, if asked |

## Consequences
### Positive
- Money stays admin-only; dealers' access is unchanged. Past sales keep their commission when rates change.
### Negative
- Prices are typed in by hand (the enquiry stores names, not catalogue ids); no automatic price from the build.
### Risks
- Migration must be applied before the tabs work; until then each tab says which file to apply.
