# Rim template: "High poly Rims"

The quality bar for FORGEDSA 3D rims, and the source of the cross-section numbers the photo-to-3D
process uses (see [`../RIM_3D_PROCESS.md`](../RIM_3D_PROCESS.md)). The model files themselves are
**not committed** (4 MB); keep the originals with the owner.

## Credit (required: CC-BY-4.0)

> This work is based on "High poly Rims" (https://sketchfab.com/3d-models/high-poly-rims-3b3e8fc96c5849b58ad4a140a1d54e9c)
> by mak3r (https://sketchfab.com/mak3r) licensed under CC-BY-4.0 (http://creativecommons.org/licenses/by/4.0/)

Commercial use is allowed. The credit is **required wherever the geometry, or a copy changed from
it, is shown**. Numbers measured from it (the table below) are facts, not the model. Keep this
credit in the repo's credits/licences list anyway. The second file sent, "Shiny rim" by thezeek
(CC-BY-4.0), is kept as a reference only; the same rule applies.

## What it is

One rim, 65,032 vertices / 126,480 triangles, one material (colour map + metallic/roughness map).
Axle along X; the outer face looks toward +X. Overall 1.398 across.

## Measured cross-section

Radius is given as a fraction of the outer radius R = 0.699. X positions are in the file's units.

| Part | Radius (× R) | X range | Reading |
|---|---|---|---|
| Overall | 1.0 | −0.399 … +0.312 | Width 0.711 = **0.51 × diameter** (deep barrel) |
| Hub / centre | 0 – 0.3 | +0.076 … +0.141 | Flat, same plane as the spokes, 0.05–0.065 thick |
| Spokes (face plate) | 0.3 – 0.8 | +0.081 … +0.145 | **Flat plate, 0.052–0.064 thick = 7.4–9.2 % of R**, no dish of its own |
| Barrel wall | 0.8 – 0.9 | −0.358 … +0.225 | Barrel runs back 0.583 = 83 % of R |
| Lip / flange | 0.9 – 1.0 | −0.399 … +0.312 | Front lip stands 0.167 (**24 % of R**) in front of the spoke face |

So the "dish" is the face sitting **recessed behind the lip**, not a curved face: face front
+0.145, lip front +0.312.

- **Symmetry:** the spoke band (0.6–0.7 R) repeats 10 times; the inner band (0.45–0.55 R) reads 15.
  Do not assume spoke count equals the repeat number: count on the photo.
- **Surface:** fully metallic (metal channel 255/255), roughness about 0.07 (mean 18/255), base
  colour mean about RGB(133, 129, 110): a polished, slightly warm metal.
- **Cost:** 126k triangles. Four wheels per car makes 500k triangles of wheels, too heavy for a
  phone, so the live budget is lower (see the process, step 7). The full-detail version is for
  Blender renders only.

## How to re-measure

Read the GLB's POSITION accessor, take r = √(y² + z²) and bin x by r. Used to produce the table above
(numpy, read-only).
