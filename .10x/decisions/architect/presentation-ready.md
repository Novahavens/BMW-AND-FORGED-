# Architect: presentation-ready
## Root cause (rims dark on the stage)
In the stage and viewer looks the studio lights are hidden and every material reflects scene.environment, the stage cove: one overhead softbox, two rails, black elsewhere. A rim's spoke faces are near-vertical, so their reflections look sideways into black. Wheel materials have no envMap of their own (wheelMaterial.envMap is null), so GLB rim materials inherit the same black.
## Design (ADR-001)
- Wheel materials (spokes/GLB rim, barrel, image faces) carry their own envMap in the stage and viewer looks: the softbox studio PMREM the engine already builds at start (environmentTarget), at its own strength (WHEEL_ENV, URL ?wheelEnv= for tuning). The barrel keeps its 0.45 share.
- In the softbox studio look nothing changes: wheel envMap goes back to null and they follow scene.environment.
- One method, syncWheelEnvironment(), called from applyLook, after the studio is built, and when a rim material is made.
## Failure modes
- environmentTarget missing (HDRI mode before load, lost context): fall back to scene.environment (today's behaviour).
- Too bright: rims glow against a black stage. Tuned by render, URL override for comparison.
