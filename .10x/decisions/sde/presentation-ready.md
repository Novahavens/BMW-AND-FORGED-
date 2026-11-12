# SDE: presentation-ready (what was built)
- services/CarConfiguratorEngine.ts: static WHEEL_ENV (0.1, ?wheelEnv=), private syncWheelEnvironment(); called at the end of applyLook and after the softbox/HDRI studio target is assigned; makeRimFinishMaterial copies the wheel envMap and its strength.
- Deviation from plan: no finish recipe changes were needed once the reflections were right; no arch fill light or tyre/contact work (the arch already reads in the renders). Kept the change to one mechanism.
- components/admin/AdminPage.tsx: the "Check your inbox" screen (admin and dealer) tells someone with no login to ask FORGED at BRAND.contact.email.
- Docs: forgedsa-rim-finishes skill, docs/CHECKPOINT.md, docs/ingest/rims-stage-before-after.jpg, rims-stage-all-finishes.jpg.
- Not built: Tripo spike (owner declined the key), admin sign-in redesign (not asked), Google provider and dealer auth user (owner dashboard steps).
- Tech debt: three's scene.environmentIntensity still overrides the barrel's 0.45 on the studio look (pre-existing).
