# Shared wheel viewer

The FORGED 3D wheel viewer. The website (`src/wheel-viewer/`) and the BMW configurator
(`shared/wheel-viewer/`) show wheels with this one folder.

**The website repo owns it.** Edit it here, in `FazalRSA/Forgedwebsite`. The configurator's copy is
overwritten by `pull` and a check fails if someone edits it by hand.

## What is in it

| File | What it is |
|---|---|
| `WheelStudio.tsx` | The stage (three.js scene, studio reflections, camera views, exploded view, Front/Rear) and its controls |
| `paint.ts` | `StudioFinish` rows and the `PaintRenderer` plug-in: how a finish becomes a material |
| `wheelStudioParts.ts` | Which part a mesh is, how far each part moves exploded (pure, unit-tested in the website) |
| `wheel-viewer.css` | All styles, plain CSS. Theme it with the `--wv-*` variables |
| `index.ts` | The public exports |
| `VERSION.json` | Content hash. `verify` compares it with the files |

It needs `react`, `three` (0.181 or newer) and `lucide-react` from the app, nothing else, and no
Tailwind. It knows nothing about either app's catalogue: the app hands it `StudioFinish` rows.

## Using it

```tsx
import { WheelStudio, type StudioFinish } from '../wheel-viewer'; // './shared/wheel-viewer' in the configurator

<WheelStudio
  wheelModel="FSA002"
  finishes={finishes}              // StudioFinish[]: id, name, swatchHex, paint numbers
  selectedFinish={finish}
  onSelectFinish={setFinish}
  modelUrl="/models/rims/forged_fsa002.glb"
  rearModelUrl={null}              // a second file adds a Front / Rear switch
  onEnquire={...}                  // optional accent button
  onClose={...}                    // optional "Close 3D" button
  paint={myPaintRenderer}          // optional: default is plain PBR paint
  className="h-[76vh] my-theme"    // size, and a class that sets --wv-* to theme it
/>
```

Rim files may be meshopt, quantized or Draco (decoder files at `dracoDecoderPath`, default `/draco/`),
in metres or other units, standing on any axis.

## Changing it

1. Edit the files in the website repo.
2. `bun run wheel-viewer:stamp` (website `npm test` runs `verify` and fails if you forgot).
3. In the configurator checkout, next to the website: `node scripts/wheel-viewer-sync.mjs pull`
   (`status` says whether it is behind). Commit the result.

Why a copy and not a package: the two apps are separate private repos with no package registry between
them. When one exists (GitHub Packages or npm), this folder is the package: move it as it is.
