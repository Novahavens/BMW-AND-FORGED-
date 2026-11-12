# Architect index
- [DISCOVERED] Journey: welcome carousel -> /configure (stage look, StepDrawer) -> /summary. Rim page /rims/<id> uses shared/wheel-viewer (owned by the Forgedwebsite repo, hash-checked copy).
- [DISCOVERED] Rims: GLB per wheel in public/models/rims, finishes in services/wheelFinish.ts, mounted by applyWheelDesign.
- [DISCOVERED] Catalogue source of truth is Supabase; data/configuratorData.ts is the fallback.
- Active feature: presentation-ready (no design file until approval).
- presentation-ready: decisions/architect/presentation-ready.md
