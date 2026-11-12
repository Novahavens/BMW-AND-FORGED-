# SDE: sales-tracking (2026-11-12)
- Built: migration 20261112140000_sales_agents_and_sales.sql; services/salesService.ts; components/admin/DealerSalesSetup.tsx (rate + agents in Dealers), SaleForm.tsx (on Won enquiries), SalesPanel.tsx (Sales tab); AdminPage tab; docs/DEALERS.md section; ADR-002.
- Checked: bun run lint, vite build; a headless run of /admin with a fake admin session and faked Supabase replies (no real data touched): agent add, rate change, sale record (rate × sets pre-fill, customer = price + markup), Sales totals, no page errors; and the migration-missing path shows the "apply the migration" note on all three tabs.
- Not done: migration not applied to the live database (owner's go-ahead needed); not deployed.
