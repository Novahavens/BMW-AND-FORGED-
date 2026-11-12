# DBA: presentation-ready
- No schema change, no migration. Read-only checks on 2026-11-12: RLS policies on leads, dealers, dealer_users, admin_users, profiles, saved_configurations match docs/DEALERS.md and docs/ACCOUNTS.md.
- Data gap: the allowlisted dealer email has no auth.users row; create it from the dashboard (Auto Confirm or Invite), not by SQL into auth.
