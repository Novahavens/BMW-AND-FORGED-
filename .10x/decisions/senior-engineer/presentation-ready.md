# Senior engineer: presentation-ready approach
- Task 2: services/CarConfiguratorEngine.ts. Add static WHEEL_ENV, private syncWheelEnvironment(): target = look !== 'studio' && environmentTarget ? environmentTarget.texture : null; set envMap on wheelMaterial, barrelMaterial, customFaceMaterials; envMapIntensity = target ? WHEEL_ENV (barrel x 0.45) : (1, barrel 0.45). needsUpdate only when the map changes.
- Call sites: end of applyLook, after environmentTarget is assigned (softbox and HDRI paths), makeRimFinishMaterial.
- Tricky: makeRimFinishMaterial copies wheelMaterial.envMap at construction, so it already follows once wheelMaterial is synced; still set intensity there.
- Tricky: the image-face materials also copy envMap; they are in customFaceMaterials so the sync covers them.
