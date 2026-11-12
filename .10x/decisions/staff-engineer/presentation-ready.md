# Staff engineer: presentation-ready
- Follow syncBoundEnvironment's pattern (body parts pinned to an env map); keep the code in CarConfiguratorEngine next to it.
- URL tuning knobs follow the existing urlNum/static pattern (?wheelEnv=).
- shared/wheel-viewer is not touched (hash-checked copy owned by the website repo).
- Verify with scripts/render/shoot.cjs and &look=stage; harness writes stay stubbed.
