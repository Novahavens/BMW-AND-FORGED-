# DBA index
- [DISCOVERED] public: admin_users, dealer_users, dealers, profiles, saved_configurations, leads, cars, paints, wheels, wheel_finishes, calipers, ingest_keys.
- [DISCOVERED] 2026-11-12 counts: 1 admin (confirmed login), 1 active dealer, 1 dealer email with NO auth user, 0 Google identities, 6 active wheels all with model_url, 19 leads.
- [DISCOVERED] Live auth: email on, Google OFF, signup on, email confirmation required.
- Migrations only on the owner's go-ahead: read live schema, apply, read back.
- presentation-ready: decisions/dba/presentation-ready.md
