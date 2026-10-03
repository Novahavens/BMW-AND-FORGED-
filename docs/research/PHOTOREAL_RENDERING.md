# Photoreal procedural wheels, tyres, brakes and cars in three.js r181 (WebGL): research notes

Date: 2026-10-02. Scope: web research only. Nothing in `/home/user/BMW-AND-FORGED-` was changed (I only read `package.json`, which shows vanilla `three@^0.181.1` with no R3F or drei, so every drei technique below is given as a vanilla port).

Labels used: **[src]** = primary source checked; **[code]** = read in the three.js r181 source; **[computed]** = my own arithmetic from sourced numbers; **[estimate]** = typical or artistic value, not verified; **[inference]** = drawn from code or specs but not tested.

---

## 0. The 15 changes that matter most

1. **Stop the IBL lighting the hidden parts.** In three.js, the environment map is not blocked by geometry. Inner barrels, the back faces of spokes, calipers and the disc hat all receive full studio light. That is the main reason procedural wheels look pasted on. Give every wheel, tyre and brake mesh a procedural `aoMap`. In r181 `aoMap` scales indirect diffuse, clearcoat and sheen, and it also scales env specular through `computeSpecularOcclusion` [code: `aomap_fragment.glsl.js`]. Also lower `envMapIntensity` on inner parts (about 0.3–0.6) [estimate].
2. **ACES crushes tyres to black.** A surface with linear albedo 0.023 (the physicallybased.info value for tyres) under unit-white light displays at sRGB 42 with no tone mapping, **24 with ACES** (20 at exposure 0.85), **11 with Neutral** and **41 with AgX** [computed from the r181 tone-mapping GLSL]. So: raise rubber albedo to about linear 0.03–0.035 (sRGB #303030–#343434), add a floor-bounce light in the environment, and add a little sheen.
3. **Tyre shape:** build it with `LatheGeometry` from a real cross-section (numbers in section 1). Put the circumferential grooves *in the profile*: they are rotationally symmetric, so they cost nothing. Put lateral grooves and sipes in a tiling normal map. Khronos CarConcept did the same: 324-vertex tube plus a 512×128 tread normal map, and wrote that it "looked better at a distance than geometry alone" [src].
4. **Sidewall lettering:** draw it into a canvas height strip, convert to a normal map, and add a roughness map. Letters should be satin (rough ≈ 0.45) on a rougher field (≈ 0.7). For a "velvet" band, use rough 0.9+. Keep markings in the *lower* sidewall, as UN R30 §3.2 requires [src].
5. **Loaded-tyre flattening** (8–12 mm) plus a contact-shadow blob under each tyre [estimate].
6. **Brake disc:** two 8 mm friction plates with a 20 mm air gap and 72 vanes (AP Racing data for 378×36) [src]. Machined cast-iron face with **anisotropy direction = radial**, which gives concentric turning marks and radial highlight streaks. On LatheGeometry UVs that is `anisotropyRotation = Math.PI/2` [spec + code + derivation].
7. **Caliper:** for a 6-piston caliper on a 378 mm disc, AP CP9660 measures **≈278 mm long, outer radius 210.5 mm (21.5 mm beyond the disc edge), body bottom at R127, ≈163 mm wide axially** [src drawing]. Extrude an arched profile with big bevels, add piston bosses, bleed screws and a pad window. Use gloss paint with `clearcoat: 1`.
8. **Wheel barrel:** use the ISO 4000-2 J-flange numbers: flange height 17.5 mm, flange width ≥ 11 mm, bead seat ≥ 19.5 mm at 5° taper, well depth ≥ 17.3 mm, well width ≥ 22 mm, well within 45 mm of the mounting-side flange [src]. The tyre bead must sit on the same contour, with no gap.
9. **Spokes:** `Shape` with window holes → `ExtrudeGeometry` with bevel (this chamfers the windows too) → tessellate the caps → displace for concavity → `mergeVertices` → `toCreasedNormals`. Raw `ExtrudeGeometry` is non-indexed and therefore faceted [code].
10. **Finishes:** paint uses clearcoat. Diamond-cut faces use metal + anisotropy (radial) + clearcoat. Polished lip: rough 0.04–0.08. Chrome uses the chromium F0 colour, #d3d8da [src values].
11. **Studio environment:** emissive "lightformer" planes rendered with `PMREMGenerator.fromScene(envScene, 0.02, 0.1, 100, {size: 512})`. Values ported from the pmndrs Porsche demo are in section 5.
12. **Anti-aliasing:** 4× MSAA on the composer render target while the camera moves. When it stops, `TAARenderPass` with `accumulate = true` converges to 32 jittered samples [code]. This is the best fix for thin spokes, tyre lettering and specular sparkle.
13. **AO:** N8AO (CC0, handles transparency, accumulates while still) or the built-in `GTAOPass`. GTAOPass renders glass as opaque in its normal pass [inference from code].
14. **Shadows:** one directional key light with a 2048–4096 shadow map, so spokes cast shadows onto the caliper and disc. Add contact shadows, or a ground shadow baked per car.
15. **Licences and trademarks:** use CC0 sources (Poly Haven, ambientCG, physicallybased.info, Khronos AnisotropyDiscTest). Use **no real tyre, Brembo or BMW-M logos** unless licensed. Use the client's own brand or generic markings.

---

## 1. Procedural tyres

### 1.1 Reference dimensions (275/35 R20 example)
- Section width S = 275 mm. Section height H = 0.35 × 275 = **96.25 mm**. Rim diameter 20" = 508 mm. Overall diameter = 508 + 2H = **700.5 mm** [computed]. Retail listings agree: 27.6" (701 mm).
- Michelin Pilot Sport 4S 275/35ZR20 listing: tread depth **9.5/32" (7.5 mm)**, measuring rim **9.5"**, approved rims **9–11"**, section width 10.9", overall diameter 27.6" ([tiresize.com](https://tiresize.com/tires/Michelin/Pilot-Sport-4S-275-35R20.htm)) [src, retailer data].
- Other new-tread depths: Toyo Proxes Sport 9.6/32" (7.6 mm); Nitto NT555 G2 11/32" (8.7 mm) [retailer listings].
- Rim-width effect, from Tire Rack's rule of thumb: "for every 1/2" change in rim width, the tire's section width will correspondingly change by approximately 2/10"". That is ≈ 0.4 mm of section width per mm of rim width. Section width is measured at the widest point "excluding any protective ribs, decorations or raised letters" ([Tire Rack](https://www.tirerack.com/upgrade-garage/how-to-determine-the-section-width-of-a-tire)) [src].
- Tread (crown) width as listed by retailers for track tyres: Bridgestone RE-71RS 275/35R18 **10.1"** (≈ 93% of S); Hoosier R7 275/35ZR18 **10.3"**, section 10.7" [retailer listings]. Road UHP tyres have rounder shoulders, so use **≈ 85–90% of S** [estimate].
- Where the maximum width sits: tyre patents put it at about 45–55% of section height above the bead ([US4427046](https://image-ppubs.uspto.gov/dirsearch-public/print/downloadPdf/4427046) and related) [src, patent context].
- Example BMW G80 fitments (third-party guides, please verify): front 275/35 R19 on 9.5×19 ET20, rear 285/30 R20 on 10.5×20 ET20. Overall diameters: 675.1 mm and 679 mm [computed].

### 1.2 Cross-section profile to lathe (half profile, mirror for the other side)
Coordinates: z is the axial distance from the tyre centre plane; r is the radius from the axle; both in mm, for 275/35 R20 on 9.5J. These are **estimates** shaped to the sourced numbers. Tweak them by eye against photos.

| point | z | r | notes |
|---|---|---|---|
| bead heel | 120.7 | 254.0 | hidden inside the flange. 9.5J flange inner faces sit at z = ±120.65 |
| flange contact | 121.5 | 266 | hidden |
| leaves the flange | 125 | 273 | flange top is at r = 254 + 17.5 = 271.5 (ISO), with flange curl R ≥ 9.5 |
| rim-protector root | 132 | 276 | UHP tyres only |
| rim-protector peak | 139 | 280 | sits 6–8 mm proud of the flange outer face (≈ z 131–133) |
| lower sidewall | 136.5 | 288 | |
| max section width | 137.5 | 300 | S/2, at ≈ 48% of H |
| upper sidewall | 135 | 320 | |
| shoulder start | 129 | 335 | shoulder radius ≈ 15–20 mm |
| shoulder | 122 | 345 | |
| tread edge | 118 | 348.3 | tread width ≈ 236 mm (86% of S) |
| crown centre | 0 | 350.25 | crown drops ≈ 2–4 mm from centre to edge |

Circumferential grooves go into the same profile as notches. Example for 275 width: 3–4 grooves centred near z = ±27 and ±77 mm, 10–14 mm wide, 7.5 mm deep, walls drafted 8–12°, bottom fillet R1.5 [estimate]. A Pirelli UHP patent gives 3 grooves: central and lateral **13–22 mm wide**, shoulder **10–14 mm**, depth **5.5–9 mm**. Transverse shoulder grooves are **4–8 mm wide and 4–8.5 mm deep**, inclined 3–10°, with **28–40 pattern pitches around the circumference**. Sipes are **1–2 mm** ([US9873290B2, Pirelli Tyre SpA](https://patents.google.com/patent/US9873290B2/en)) [src]. UN R30 §6.3 requires **at least 6 rows of tread-wear indicators** in the main grooves, marking 1.6 mm remaining depth (+0.6/−0) ([UNECE R30](https://www.unece.org/fileadmin/DAM/trans/main/wp29/wp29regs/r030r3e.pdf)) [src]. Model them as small bumps in the groove bottoms, plus small "TWI" marks or triangles on the shoulder.

### 1.3 How to build it in three.js r181
- **`LatheGeometry(points, segments)` revolves around +Y.** Its UVs are `u = i/segments` (around) and `v = j/(points.length-1)`. That `v` is spaced **by point index, not by arc length** [code]. So resample the profile at equal arc-length steps, or write your own UVs, or textures will stretch. Rotate the geometry afterwards so the axle lies along X.
- Normals come from averaging the neighbouring segments. To get a hard edge at a groove lip or flange edge, **duplicate the profile point**: the zero-length segment splits the normal [code reading; quick test advised].
- Use 192–256 radial segments for the tyre and rim lip so the silhouette stays round [estimate]. Use about 120–180 profile points, with more at the shoulders and grooves.
- Split the mesh into groups or separate meshes for **tread**, **shoulders** and **sidewalls**. Each needs its own maps, UV range and roughness.
- **Tread pattern:** a tiling normal map, one pitch per tile. Set `repeat.x` to the pitch count (30–36). Khronos CarConcept's `Tiretread_N.png` is 512×128 and CC-BY 4.0 ([README](https://github.com/KhronosGroup/glTF-Sample-Assets/tree/main/Models/CarConcept)) [src]. For a silhouette that is not perfectly smooth at the shoulders, use the same height texture as a `displacementMap` on a finely tessellated shoulder band, and keep the normal map for detail.
- **Sidewall lettering pipeline (runs once at load):**
  1. Make a canvas strip with u = around and v = radial. Draw white text in a straight line: lathe UVs bend it around the tyre automatically. If the text appears twice around the tyre, `repeat.x = 2` halves the strip. A 4096-px strip then covers ≈ 942 mm of circumference, ≈ 4.3 px/mm [computed].
  2. Blur by 1–2 px (`ctx.filter = 'blur(1.5px)'`) to make bevelled slopes.
  3. Sobel → normal map, wrapping x periodically. Use `colorSpace = NoColorSpace`, `anisotropy = renderer.capabilities.getMaxAnisotropy()`, mipmaps on.
  4. From the same mask, build a roughness map (three.js reads the **G** channel): letters 0.45–0.5, field 0.65–0.75.
  5. From the blurred mask, build a cavity `aoMap`.
- Raise lettering about 0.5–1 mm; real tyres also have knurled rings and a rim-protector band [estimate]. UN R30 lists what appears on the sidewall: trade name, size, R or ZR, load/speed (e.g. "(102Y)"), TUBELESS, XL / EXTRA LOAD, a 4-digit date code, and the approval mark. It requires them in the **lower area** of the sidewall, except the trade name [src]. The CarConcept sidewall normal map also shows OUTSIDE, DOT and UTQG text; it is a good layout reference, but it contains the Khronos logo, so do not reuse it.
- **Velvet sidewall contrast:** Michelin's "Premium Touch" uses a light-absorbing micro-texture to make velvet-black areas next to markings ([bmwblog](https://www.bmwblog.com/2017/06/17/michelin-premium-touch-offers-new-design-look-pilot-sport-4-s/)). To emulate it: field roughness 0.9–0.95 with albedo about #161616; logo and letters around 0.45 [estimate].

### 1.4 Rubber material values
Sources:
- physicallybased.info "Tire": linear albedo **0.023** (sRGB 42, #2a2a2a), **roughness 0.7**, metalness 0, IOR 1.5. Database is CC0 ([physicallybased.info](https://physicallybased.info/)).
- Poly Haven "Old Tyre" (CC0) maps, measured by me over the used texels: albedo median sRGB **(25, 23, 20)** (warm-tinted; p10–p90 runs from (11,9,7) to (48,44,41)) and roughness median **0.73** (p10–p90: 0.62–0.88) [computed]. It is old and dirty, so treat it as the low end.
- Khronos CarConcept: tread linear 0.009, roughness 0.6; sidewall texture base (mostly sRGB 29) with roughness 0.4 [src, from the glTF].
- pmndrs demos (artistic choices): Porsche tyre `#222`, roughness 0.6, **normalScale 4**; Lamborghini `#181818`, roughness 0.4.

Recommended starting values (MeshPhysicalMaterial; hex values are sRGB and three.js converts them to linear):
```js
const tread = new THREE.MeshPhysicalMaterial({
  color: 0x2e2c2b,           // ≈ linear 0.027, slightly warm; don't go below ≈ #262626 with ACES
  roughness: 0.85, metalness: 0,
  normalMap: treadN, normalScale: new THREE.Vector2(1.2, 1.2),
  aoMap: treadCavity, aoMapIntensity: 1,
});
const sidewall = new THREE.MeshPhysicalMaterial({
  color: 0x262626, roughness: 1, roughnessMap: sideRough, // G channel: letters 0.45, field 0.7
  normalMap: sideN, normalScale: new THREE.Vector2(1, 1),
  sheen: 0.3, sheenRoughness: 0.6, sheenColor: new THREE.Color(0x3a3a3a), // sheenColor defaults to BLACK, so sheen is invisible unless you set it [code]
  clearcoat: 0,              // only for "tyre shine": clearcoat 0.3, clearcoatRoughness 0.35
});
```
- Make the tread slightly rougher and lighter than the sidewall; the smoother sidewall reads darker with a satin finish. For a lived-in look, add a 2–5% warm dust tint toward #5a5550 on the tread edges and lower sidewall. Brown "blooming" is real: antiozonant and wax migrate to the surface and oxidise ([utires](https://www.utires.com/articles/tire-sidewalls-turn-brown-prevent/)). A configurator usually wants new-tyre black with only a hint of warmth [estimate].
- Add low-frequency noise of ±0.05 roughness and ±3 sRGB levels; real rubber is never uniform ([Games Artist tyre trim breakdown](https://gamesartist.co.uk/tire-trim/)).
- Tone-mapping table, for the albedo under unit-white light → displayed sRGB 8-bit [computed]:

| linear | no TM | ACES exp 1 | ACES exp 0.85 | AgX | Neutral |
|---|---|---|---|---|---|
| 0.010 | 25 | 8 | 6 | 18 | 2 |
| 0.023 | 42 | 24 | 20 | 41 | 11 |
| 0.035 | 53 | 36 | 31 | 56 | 21 |
| 0.050 | 63 | 50 | 43 | 70 | 34 |
| 0.18 | 118 | 127 | 115 | 128 | 105 |
| 1.0 | 255 | 226 | 221 | 202 | 240 |

  Takeaway: with ACES, dark parts lose almost half their brightness. AgX keeps the darks but flattens highlights. Khronos Neutral (`THREE.NeutralToneMapping`) is built for faithful product colour ([spec](https://github.com/KhronosGroup/ToneMapping/tree/main/PBR_Neutral)), but its toe pulls rubber close to black.
- Real studios bounce light from a grey floor or cyclorama into the lower tyre, the spoke undersides and the caliper. If the environment's lower hemisphere is black, tyres become holes. Add a floor-bounce lightformer at intensity ≈ 0.05–0.15 (section 5.1) [estimate].

### 1.5 Loaded flattening and grounding
- A perfectly round tyre on a line contact looks like a toy. Flatten the bottom by **8–12 mm**, which gives a flat roughly 120–160 mm long, and bulge the lower sidewall out by 2–4 mm with a smooth falloff [estimate].
- Simplest method: deform the tyre vertices on the CPU once, after placing the wheel, then call `computeVertexNormals()` for that region. If wheels spin, do it in world space in `onBeforeCompile`, before `project_vertex`.
- Under each tyre, add a small elliptical multiply-blended gradient decal (≈ 0.30 × 0.12 m) as a contact-occlusion blob, on top of the car-wide contact shadow [estimate].

---

## 2. Brake discs

### 2.1 Sizes
- **BMW M3/M4 (G80/G82), from BMW M** ([bmw-m.com](https://www.bmw-m.com/en/topics/magazine-article-pool/bmw-m3-m4-brakes.html)) [src]:
  - M Compound: **380×36 mm front, 370×24 mm rear**.
  - M Carbon ceramic: **400×38 mm front, 380×28 mm rear**.
  - All four discs are ventilated.
  - Front calipers: 6-piston, forged alloy. Rear: sliding caliper with the parking brake built in.
  - Compound caliper colours: **blue, red or black**. Carbon ceramic: **matte gold** painted calipers.
  - The calipers are "almost identical" between the two systems.
- An OEM-replacement listing describes the G80 front disc as "Cross Drilled with Floating Aluminum Hub (380 X 36 mm)" ([RM European](https://www.rmeuropean.com/Products/34108093710-MFG521-V13561.aspx)). That is consistent with "compound" meaning an iron ring on an aluminium hat [retailer].
- **AP Racing data** (2019 catalogue, [PDF](https://apracing.com/drawings/2019%20Catalogue/Brake%20Calipers.pdf)) [src]:
  - Disc Ø378 × 36 mm: **air gap 20 mm** (so each plate is (36−20)/2 = **8 mm** [computed]), **72 vanes**, 12 floating bobbins on PCD 240, eye Ø266 (a 56 mm friction band), inner flange Ø215, 7.4 kg.
  - Disc Ø390 × 36: air gap 21 mm, 84 vanes, eye Ø278.75.

### 2.2 Geometry recipe
- **Friction plates (×2):** a `Shape` annulus, R_out = D/2 and R_in ≈ D/2 − 56 mm. Add drilled holes as `shape.holes` circles. Then `ExtrudeGeometry({depth: 8 mm, bevelEnabled: true, bevelThickness: 0.6 mm, bevelSize: 0.6 mm, bevelSegments: 1})`. This produces **chamfered hole walls and edges automatically** [code: ExtrudeGeometry bevels outer contours and holes]. For undrilled discs, a LatheGeometry ring is cheaper.
- **Drilled hole pattern [estimate]:** holes Ø 6–8 mm with a 0.5–1 mm chamfer, in 24–30 curved rows of 3–4 holes, placed in the gaps between vanes. With 72 vanes, that is one row every 3rd gap.
- **Slots:** 1.5–2 mm deep, 2–3 mm wide [estimate]. Stack a thin "slot layer" extrusion (slots cut as holes) on a solid base plate, since an extrusion can't cut part-depth holes.
- **Vanes:** an `InstancedMesh` of 36–72 curved vane extrusions, 20 mm tall (the air gap) and 4–6 mm thick, in a dark as-cast material. They show only at the outer edge, through the holes and at the eye, so keep them cheap.
- **Hat / bell:** a lathe profile. For BMW-style hubs it needs 5 bolt holes on PCD 112 and a 66.6 mm centre bore. Add 10–12 drive pins or bobbins between the hat and ring tabs [estimate].
- Add a **dust shield / backplate** behind the disc (black, roughness 0.6) and a dark hub carrier. Otherwise you see through the wheel.

### 2.3 Anisotropic brushed look on a disc
How anisotropy works (KHR_materials_anisotropy spec, [link](https://github.com/KhronosGroup/glTF/blob/main/extensions/2.0/Khronos/KHR_materials_anisotropy/README.md)) [src]: "The direction vector of the anisotropy is the direction in which highlights will be stretched. The direction of the micro-grooves ... will run perpendicular." Roughness along that direction becomes `mix(r², 1, strength²)`. three.js r181 does exactly this: `material.alphaT = mix(pow2(roughness), 1.0, pow2(anisotropy))` [code].

Derivation (mine): if the grooves are **concentric** (lathe-turned friction face, diamond-cut wheel face), the highlights spread radially. A point light then produces a **radial streak through the centre**, the classic CD or brake-disc look. If the grooves are **radial** (sunburst or radial brushing), the spread is circumferential and the highlight is an **arc through the centre**.

The tangent frame three.js uses:
- With no `tangent` attribute, it builds the frame from screen-space derivatives of `vUv` (`getTangentFrame`). If a normal map exists, it uses `vNormalMapUv` instead [code]. So **T = ∂P/∂u**.
- `USE_ANISOTROPY` turns on the `vUv` varying even when there are no maps [code].
- If the geometry has a `tangent` (vec4) attribute and the material has a normal map or anisotropy, that attribute is used. The bitangent is `cross(N, T) * tangent.w` [code].

Three ways to set the direction:
1. **LatheGeometry** (u around, so T is circumferential). Concentric grooves: `anisotropyRotation = Math.PI/2`. Radial brushing: `anisotropyRotation = 0`.
2. **Planar-UV parts** (Extrude or Shape caps use world x,y UVs): write a tangent attribute.
```js
const p = geo.attributes.position, t = new Float32Array(p.count * 4);
for (let i = 0; i < p.count; i++) {
  const x = p.getX(i), y = p.getY(i), r = Math.hypot(x, y) || 1;   // disc in XY, axis Z
  t.set([x / r, y / r, 0, 1], i * 4);   // radial = concentric-groove look; use (-y/r, x/r) for radial brushing
}
geo.setAttribute('tangent', new THREE.BufferAttribute(t, 4));
mat.anisotropy = 0.8; mat.anisotropyRotation = 0;
```
   Caveat: the same tangent frame is used for any tangent-space normal map on that material.
3. **`anisotropyMap`**: RG holds the direction in [−1, 1] tangent/bitangent space, B holds strength. It is linear data, so use `NoColorSpace`. The shader does `normalize(2*rg - 1) * b` [code]. **A texel with rg exactly (0.5, 0.5) normalises a zero vector and gives NaN**, which a blue channel of 0 cannot hide. Never write a zero vector, and keep the disc centre off the anisotropic material. The CC0 Khronos `AnisotropyDiscs.png` (in [AnisotropyDiscTest](https://github.com/KhronosGroup/glTF-Sample-Assets/tree/main/Models/AnisotropyDiscTest)) encodes **circumferential** directions; I sampled the pixels. Add `anisotropyRotation = π/2` to get the concentric look.

Further caveats:
- Environment reflections use Filament's bent-normal approximation, and only for PMREM ("CUBE_UV") environments. Otherwise `getIBLAnisotropyRadiance` returns 0 [code]. Using `scene.environment` with an HDR or PMREM is fine.
- The stretch shows best with strip lightformers or real lights.
- Clearcoat stays isotropic, which is correct for lacquered machined wheels.

### 2.4 Disc materials
- Iron F0 is linear (0.53, 0.513, 0.494), sRGB #c0bebb (physicallybased.info).
- **Machined friction face:** color ≈ #a19f9b (cast iron reads darker than pure iron [estimate]), metalness 1, roughness 0.35–0.45, anisotropy 0.7–0.9 with radial direction. Add a 1-D radial band texture (±0.05 roughness, ±4% albedo) to suggest the pad-transfer bands.
- **Unswept and as-cast areas** (outer 1–2 mm, inner 3–5 mm, edges, vanes, hole walls): #4b4846, metalness 0.7, roughness 0.75. Optional rust: #5b4636, roughness 0.9, metalness 0 [estimate].
- **Aluminium hat:** black anodised #141416, metalness 0.7, roughness 0.4; or silver #b8bcc0, metalness 1, roughness 0.35 [estimate].
- **Carbon-ceramic option:** Brembo SGL describes a carbon-fibre-reinforced SiC/Si core with an extra ceramic friction layer ([Brembo](https://www.brembo.com/en/solutions/for-original-equipement-car/icons/ccb-disc)). Look [estimate]: base #2e2e30, metalness 0, roughness 0.5, mottled lighter-grey (#4a4a4c) blotches 1–5 mm across over 20–30% of the area. Friction faces slightly smoother (0.4); sparse metallic speckle optional. Matte gold calipers (BMW) [src].
- Epic's Automotive Materials pack drives its brake-rotor master from **radial UVs** with crack, stain and rust parameters ([UE docs](https://dev.epicgames.com/documentation/en-us/unreal-engine/automotive-materials-pack-in-unreal-engine)) [src].

---

## 3. Brake calipers (modern 6-piston monoblock)

### 3.1 Proportions from the AP Racing CP9660 drawing (6-piston, radial mount, Ø378×36 disc) [src]
- Overall length: **138.9 + 138.9 = 277.8 mm**. Caliper outer radius **R210.5** (disc R189, so it overhangs the disc by 21.5 mm). Disc pathway R192.5. Body bottom **R127**. Effective radius 160 mm.
- Axial width: **71.8 + 91.21 ≈ 163 mm**.
- Pistons: **Ø26.99 / 31.75 / 38.10 mm**, two of each, smallest at the leading end.
- Pad: **151.9 × 57.4 × 18 mm**.
- Radial mounts on 180 mm centres with 42 mm offset. 2.78 kg. Drawing corner radii are about R25–R30.
- Scaling rules [computed]: length ≈ 0.73 × disc diameter; radial height ≈ 84 mm; overhang ≈ 21 mm; width ≈ 4.5 × disc thickness. For BMW 380 discs use outer R ≈ 211.5. For the 400 mm carbon ceramic, outer R ≈ 221.5.
- Clearance check: a 20" barrel's inner radius is ≈ 254 − 5 = 249 mm, and a 19" barrel's is ≈ 236 mm [estimate wall 5 mm]. With carbon ceramic on 19" that leaves ≈ 15 mm.

### 3.2 Procedural construction (or author once as a GLB)
The caliper does not change with the wheel design; only scale, colour and logo do. A one-off Blender model, kept as a GLB, will look better than code, and the wheel face can stay procedural. If it must be procedural:
1. **Outboard and inboard halves.** Each is a `Shape` in the disc plane with:
   - an outer arc at R_out (spanning ≈ 80–95°, from the drawing: 2·asin(139/210) ≈ 83° at R210);
   - a shorter inner arc at R_in ≈ R_disc − 62 mm;
   - rounded ends of radius 25–30 mm.

   `ExtrudeGeometry({depth: 40–50 mm, curveSegments: 48, bevelEnabled: true, bevelThickness: 6–10 mm, bevelSize: 6–10 mm, bevelSegments: 5–6})` gives the soft forged/cast look. The bevel profile is a quarter circle (`z = t·cos`, `size = s·sin`) [code]. Use `bevelSegments = 1` for a crisp machined chamfer.
2. **Bridge** over the disc at R_disc + 3 … R_out, spanning the full width, with a **window** (shape hole) that shows the pad backing plates, the retaining pin (stainless cylinder) and the spring clip (a `TubeGeometry`).
3. **Face crown:** tessellate the caps and bulge the centre outward by 3–5 mm. Add **3 piston bosses** about 2–4 mm proud, sized to the bores + 7 mm. Monoblock calipers show these clearly [estimate].
4. **Bleed screws:** hex ≈ 8–10 mm plus a short cylinder, top of each half, zinc-plated (metalness 1, roughness 0.4). Optional rubber dust cap.
5. **Normals and placement:** `mergeVertices` → `toCreasedNormals(geo, 40°)`. Position it at the car's real clock position by checking photos [unverified per car].

### 3.3 Paint, logo, trademarks
- **Gloss:** `metalness 0, roughness 0.35, clearcoat 1, clearcoatRoughness 0.03–0.05`. Epic uses its car-paint master (flakes, clear coat, orange peel) for calipers [src].
- **Metallic or flake paint:** base `metalness 0.5–0.8` plus a per-pixel noise **normalMap** with `magFilter = NearestFilter` and `minFilter = NearestMipmapLinearFilter`. In three.js the clearcoat ignores the base normalMap and uses `nonPerturbedNormal` [code], so the top coat stays mirror-smooth while the base sparkles. This is the CarConcept technique [src].
- **Matte gold** (BMW carbon ceramic): ≈ #b08f55, metalness 0.7, roughness 0.5, clearcoat 0 [estimate].
- **Logo:** put the white print in the caliper's own `map` so the clearcoat covers it. Render the logo from SVG into a 2048-px canvas, or use an MSDF, with `anisotropy` 16. Alternatively use `DecalGeometry` (`three/addons/geometries/DecalGeometry.js`). Use the **client's own brand**. BMW "M" and "Brembo" logos imply endorsement; see the IBA article in section 7.

---

## 4. Procedural forged wheels

### 4.1 Rim barrel (ISO 4000-2:2007, 5° drop-centre rims, J flange) ([preview PDF](https://www.sis.se/api/document/preview/908761/)) [src]
- Rim width A = width code × 25.4 mm, ±2. So 9.5J = 241.5 mm and 10.5J = 266.7 mm.
- Flange:
  - height **G = 17.5 ± 1.0 mm**;
  - width **B ≥ 11 mm** (includes the edge radius);
  - outer radius **R2 ≥ 9.5 mm**; inner-face to bead-seat fillet ≤ R6.5;
  - top edge: a "break corner equivalent to 0.5 minimum R".
- Bead seats: **P, P1 ≥ 19.5 mm**, **5° ± 1° taper**. Tubeless rims need **humps** on the tyre-mounting side.
- Well:
  - depth **H ≥ 17.3 mm** (17 mm allowed with M ≤ 43);
  - width gauge **L = 22 mm**;
  - side angle ≥ 10°; corner radii R6.5 and R4;
  - **position M ≤ 45 mm** from the tyre-mounting-side flange.
  - Most OEM wheels put the well toward the face, which keeps the inboard barrel large for the brakes. "Reverse" or rear drop-centre forged designs put it inboard to allow a deep lip or concave face [general knowledge; verify per design].
- Construction: lathe the barrel as a closed profile (outer and inner surfaces) with a 4–6 mm wall [estimate]. Duplicate points at the flange top and well corners for crisp edges. Make the outer lip its own group so it can be polished or diamond-cut.
- **The tyre bead must sit on the flange and bead seat** (tyre profile points 1–3 in section 1.2). A visible gap or overlap is a giveaway.
- BMW hub data (third-party fitment guides): **5×112** PCD, **66.6 mm** centre bore, **M14×1.25** bolts with 60° cone seats. A 17 mm bolt hex is typical for BMW [verify].
- Face depth available for concave spokes [computed]: lip plane to hub face ≈ A/2 − ET + B.
  - 10.5×20 ET20: 133.35 − 20 + 11 ≈ **124 mm**.
  - 9.5×19 ET20: ≈ **112 mm**.
  - 9.5×20 ET35: ≈ **97 mm**.

  Subtract the hub-pad thickness (≈ 25–40 mm [estimate]) and the caliper envelope from that.

### 4.2 Spokes from a 2D silhouette, made to look 3D
1. **Silhouette:** `Shape` = face disc (R_face) with `holes` = the windows between spokes, plus the hub bore. Use `curveSegments` 48–96.
2. **Extrude with bevel:** `ExtrudeGeometry(shape, {depth: spokeThk, bevelEnabled: true, bevelThickness: 2–4 mm, bevelSize: 1.5–3 mm, bevelOffset: −bevelSize, bevelSegments: 1–2 for machined chamfers or 4–6 for forged radii})`. A negative `bevelOffset` keeps the silhouette size. **Window holes are bevelled too**, which gives chamfered windows for free [code]. Groups: 0 = caps (front/back), 1 = side walls including bevels [code], which maps neatly to *machined face vs painted pockets*.
3. **Faceting fix:** `ExtrudeGeometry` is non-indexed and calls `computeVertexNormals()`, so normals are per-face [code]. Run `BufferGeometryUtils.mergeVertices(geo, 1e-6)` then `BufferGeometryUtils.toCreasedNormals(geo, THREE.MathUtils.degToRad(30–40))`.
4. **Concavity:** cap triangles from earcut have no interior vertices, so tessellate them first. `TessellateModifier(maxEdgeLength ≈ 0.004–0.006 m, maxIterations 6–8)` (`three/addons/modifiers/TessellateModifier.js`) works, but **it drops groups** [code]. Split caps and sides into separate geometries before tessellating.
   - Then displace every vertex: `z += zLip − D·f(s)` with `s = (r − rHub)/(rLip − rHub)`. For `f`, use a designer-editable cubic Bezier (or `(1 − s)^γ`, γ ≈ 1.6–2.2).
   - Optionally add a 1–2 mm convex crown across each spoke, using the distance to the spoke centre-line ≈ r·Δθ.
   - For directional or twisted designs, rotate the cap vertices by θ(r).
   - Re-run the crease normals afterwards.
5. **Better topology (hero quality):** loft each spoke instead. Sweep a chamfered cross-section polygon along the hub-to-lip path, with width w(t), thickness h(t) and face curve z(t). This gives quads, exact chamfers that follow the concavity, and UVs aligned along the spoke for brushed anisotropy.
6. **Boolean options:** `three-bvh-csg` (MIT) for pockets and lug recesses at build time; `manifold-3d` (Apache-2.0) for robust booleans plus smoothing.
7. **UVs for anisotropy on extruded faces:** polar UVs have an atan2 seam, so prefer the **tangent attribute** from section 2.3.
8. **Small parts that sell realism:**
   - 5 lug bolts: hex 17 across flats, about 10–12 mm tall, zinc-flake silver (#b8bcc0, metal 1, rough 0.35) or black.
   - Bolt pockets Ø 24–30 mm with chamfers.
   - Centre cap Ø ≈ 56–68 mm, slightly domed, with the client logo.
   - TPMS valve (cap ≈ Ø 8–10 mm) at the face end of the well, between two spokes.
   - Inner barrel: bare or silver-painted aluminium (rough 0.45) [estimates].
9. **Procedural AO for the wheel:** a small DataTexture on the barrel's lathe UVs, with `u` periodic over the spoke count (dark behind spokes) and `v` along the profile (darker deeper inside). Also darken the hub and caliper zone. Because `aoMap` also attenuates env specular, chrome and brushed barrels stop glowing [code].

### 4.3 Finish presets (MeshPhysicalMaterial; sRGB hex)
Metal F0 colours come from physicallybased.info: Al #f5f6f6, Cr #d3d8da, stainless #d6d1cb, Ti #b1aaa2. Roughness, anisotropy and clearcoat values are estimates.

| finish | color | metal | rough | clearcoat / ccRough | anisotropy (lathe UV rotation) |
|---|---|---|---|---|---|
| gloss black | #0b0b0b | 0 | 0.30 | 1 / 0.03 | — |
| satin black | #121212 | 0 | 0.55 | 0.5 / 0.35 (or 0) | — |
| matte / "frozen" | #151515 | 0 | 0.75 | 0 | — |
| metallic gunmetal / silver | #5a5d61 / #b9bcc0 | 0.6–0.9 | 0.35–0.5 | 1 / 0.03 | flake normalMap (nearest filter), normalScale 0.05–0.3 (CarConcept paint uses 0.3) |
| brushed aluminium (radial brushing) | #d9dcde | 1 | 0.28–0.35 | 1 / 0.04 | 0.6–0.8, rot 0 → arc highlights |
| diamond-cut / machined (concentric) | #e6e8ea | 1 | 0.12–0.20 | 1 / 0.03 | 0.8–0.9, rot π/2 → radial streaks |
| polished lip | #f0f1f2 | 1 | 0.04–0.08 | 1 / 0.02 | 0–0.2 |
| chrome | #d3d8da | 1 | 0.02–0.05 | 0 | — |
| brushed bronze | #8c6a3f | 1 | 0.30 | 1 / 0.05 | 0.5 |

Example values from pro assets: CarConcept rim parts have roughness 0.049 (bright) and 0.4 (black). The three.js car demo body uses `metalness 1, roughness 0.5, clearcoat 1, clearcoatRoughness 0.03` ([webgl_materials_car](https://threejs.org/examples/webgl_materials_car.html)).

---

## 5. Real-time car photorealism in three.js r181 (WebGL)

### 5.1 Environment: lightformers vs HDRI
- **HDRI** (Poly Haven studio, CC0) gives natural complexity, but room clutter shows up in chrome and paint and you can't art-direct the highlight lines.
- **Lightformers** are emissive planes in a separate scene, captured into a PMREM. They give the clean "product" lines car photography relies on: an overhead strip for the roof and bonnet, side strips for the shoulder line, and a dark floor for contrast. drei's `<Environment>` and `<Lightformer>` do this ([drei Lightformer](https://drei.docs.pmnd.rs/staging/lightformer)).
- drcmda's vanilla recipe uses a CubeCamera into a `HalfFloatType` `WebGLCubeRenderTarget` ([forum](https://discourse.threejs.org/t/r3f-lightformers-in-vanilla-three-js/48495)).
- `PMREMGenerator.fromScene(scene, sigma, near, far, {size, position})` [code; default size 256] is simpler for a static studio. A `Color` background is used as the solid backdrop [code]. RoomEnvironment's light boxes use emissive intensities of 17–100 [code].
- Port of the values from the pmndrs "building-live-envmaps" Porsche demo (MIT repo; the 911 model in it is CC-BY-SA):
```js
const lf = (w, h, I, col = 0xffffff, form = 'rect') => new THREE.Mesh(
  form === 'circle' ? new THREE.CircleGeometry(0.5, 48) : new THREE.PlaneGeometry(w, h),
  new THREE.MeshBasicMaterial({ color: new THREE.Color(col).multiplyScalar(I), side: THREE.DoubleSide, toneMapped: false }));
const env = new THREE.Scene(); env.background = new THREE.Color(0.02, 0.02, 0.02);
const ceil = lf(10, 10, 0.75); ceil.rotation.x = Math.PI / 2; ceil.position.set(0, 5, -9); env.add(ceil);
for (let i = 0; i < 8; i++) { const c = lf(1, 1, 2, 0xffffff, 'circle'); c.scale.set(3, 1, 1); c.rotation.x = Math.PI / 2; c.position.set(i % 2 ? 0 : 2, 4, i * 4 - 14); env.add(c); }
const s1 = lf(20, 0.1, 4); s1.rotation.y =  Math.PI / 2; s1.position.set(-5,  1, -1); env.add(s1);
const s2 = lf(20, 0.5, 1); s2.rotation.y =  Math.PI / 2; s2.position.set(-5, -1, -1); env.add(s2);
const s3 = lf(20, 1.0, 1); s3.rotation.y = -Math.PI / 2; s3.position.set(10,  1,  0); env.add(s3);
const floor = lf(40, 40, 0.08); floor.rotation.x = -Math.PI / 2; floor.position.y = -3; env.add(floor); // floor bounce (my addition)
scene.environment = new THREE.PMREMGenerator(renderer).fromScene(env, 0.02, 0.1, 100, { size: 512 }).texture;
```
  The demo's own extras were a red ring accent, a moving circle group (`frames = Infinity`, with a PerformanceMonitor fallback to `frames = 1`), a spotlight with shadows and AccumulativeShadows (100 frames).
- Use size 512 for sharper chrome and paint reflections; 256 is the default. Also available: `scene.environmentIntensity`, `scene.environmentRotation`, `scene.backgroundRotation` (r162+) [code].
- **Good CC0 studio HDRIs** (Poly Haven, from its API; dynamic range shown as EVs): [studio_small_09](https://polyhaven.com/a/studio_small_09) (18 EV, medium contrast), [studio_small_08](https://polyhaven.com/a/studio_small_08) (17, low), [brown_photostudio_02](https://polyhaven.com/a/brown_photostudio_02) (15), [photo_studio_loft_hall](https://polyhaven.com/a/photo_studio_loft_hall) (16), [cyclorama_hard_light](https://polyhaven.com/a/cyclorama_hard_light) (26, high contrast).
- A hybrid works well: put an HDRI sphere at low intensity *inside* the lightformer scene, then PMREM the lot. For a showroom floor, the three.js `GroundedSkybox` (`webgl_materials_envmaps_groundprojected`) projects the HDRI onto a ground.

### 5.2 Shadows and grounding
- **Classic three.js car demo:** a pre-baked AO/shadow PNG (`ferrari_ao.png`) on a plane with `MultiplyBlending` [code]. Bake one per car (Blender, or offline with the project's three-gpu-pathtracer) for the best and cheapest result.
- **Contact shadows, vanilla** ([webgl_shadow_contact](https://threejs.org/examples/webgl_shadow_contact.html)): an orthographic camera looks up from the ground through a `MeshDepthMaterial` override, then a 512² render target gets a horizontal and vertical blur. Example values: plane 2.5×2.5, camera height 0.3, blur 3.5, darkness 1. For a car, use about a 6×3 m plane and 0.3–0.5 m camera height. **Render once per car or wheel change**, not every frame. drei's version is [ContactShadows](https://drei.docs.pmnd.rs/staging/contact-shadows).
- **Soft accumulated shadows:** drei [AccumulativeShadows](https://drei.docs.pmnd.rs/staging/accumulative-shadows) + RandomizedLight (demo: 100 frames, alphaTest 0.75, 8 lights). The vanilla equivalent is `ProgressiveLightMap` ([webgl_shadowmap_progressive](https://threejs.org/examples/webgl_shadowmap_progressive.html): shadow map 512, light map 1024, 8 lights).
- **Spoke shadows:** with lightformers only there is no direct light, so nothing casts sharp shadows on the brakes. Add one `DirectionalLight` (castShadow, 2048–4096 map, frustum fitted to ±3 m, `PCFSoftShadowMap` or the PCSS example, bias ≈ −0.0001, normalBias ≈ 0.02) [estimate].

### 5.3 Ambient occlusion
- **GTAOPass** (built-in; [example](https://threejs.org/examples/webgl_postprocessing_gtao.html)):
  - three.js describes it as "better quality than SSAOPass but also more expensive".
  - It renders its own normal and depth pass and has outputs Default, AO, Denoise and others.
  - Example settings: radius 0.25, distanceExponent 1, thickness 1, scale 1, samples 16. The denoiser takes lumaPhi, depthPhi, normalPhi, radius 4 and samples 16. `setSceneClipBox()` limits it to the car.
  - Its normal pass overrides every visible mesh and hides only points and lines, so **glass occludes the interior** [inference from code].
- **N8AO** (**CC0**, WebGL2, r161+ recommended; [repo](https://github.com/N8python/n8ao)):
  - `N8AOPass` replaces `RenderPass`.
  - `aoRadius` should be "one or two magnitudes less than scene scale", so 0.05–0.5 m for a car. `distanceFalloff` 1, `intensity` 2 (soft) to 5 (strong).
  - Presets (AO samples / denoise samples): Performance 8/4, Low 16/4, Medium 16/8, High 64/8, Ultra 64/16, plus Neural modes.
  - `halfRes` is "generally 2x–4x" faster, with depth-aware upsampling costing ≈ 1 ms.
  - `accumulate = true` while the camera is still (recommended with denoiseRadius 0 and denoiseSamples 1).
  - **Transparency-aware**: transparent objects are rendered twice, so `depthWrite:false` glass is "completely correct".
  - It says to use SMAA, because "hardware antialiasing does NOT work with ambient occlusion". It wants `three` and `postprocessing` available as packages.
  - Measure cost with `n8aopass.lastTime` in debug mode.
- **SAOPass** is older and lower quality; skip it.
- Screen-space AO can't see off-screen occluders and flickers on thin spokes. Use **procedural aoMaps for wheel, tyre and brakes** (section 4.2.9) plus a baked or per-car AO texture for the body. CarConcept baked AO with glass excluded so windows don't darken the interior, and with doors opened during the bake [src].

### 5.4 Anti-aliasing (pass order matters)
- **MSAA:** `new EffectComposer(renderer, new THREE.WebGLRenderTarget(w*dpr, h*dpr, { type: THREE.HalfFloatType, samples: 4 }))`. The composer's default target is HalfFloat [code]; the renderer's `antialias` flag does not apply to composer targets.
- **SMAAPass** goes before OutputPass (as in the example). **FXAAPass must come after OutputPass** because it needs sRGB/LDR [code comments].
- **TAARenderPass:** "When there is no motion in the scene, the TAA render pass accumulates jittered camera samples across frames". It uses 32 jitter offsets, and `sampleLevel` sets samples per frame during motion [code].
  - Configurator pattern: `RenderPass` while the user orbits; `TAARenderPass` with `accumulate = true` after about 200 ms idle. It converges in 32 frames at `sampleLevel 0`.
  - GTAOPass can follow it (it reads the read buffer). N8AO can't be combined with it, because both render the scene.
- Pass chain: `RenderPass/TAA → (GTAO) → UnrealBloomPass → (SMAA) → OutputPass`. OutputPass "is responsible for including tone mapping and color space conversion" [code].

### 5.5 Glass, windows and interior
- **Transparent opacity scales the reflections too.** Output alpha multiplies everything, specular included, so low-opacity glass looks dull. **Transmission keeps the Fresnel reflections.**
- r181 transmission details [code]:
  - It renders opaque objects into a per-camera target (4× MSAA, mipmaps for rough transmission).
  - `renderer.transmissionResolutionScale` (default 1) can be 0.5 on mobile.
  - The pass is skipped when `scene.overrideMaterial` is set.
  - Transmissive objects don't see other transmissive objects.
- Windows: `MeshPhysicalMaterial({ color: 0xffffff, metalness: 0, roughness: 0, transmission: 1, ior: 1.52, thickness: 0 })`. `thickness` 0 means thin-walled; physicallybased.info gives soda-lime glass IOR 1.52. Base colour tints the transmitted light: about #c8d0cc for front windows, #3a3f3e for rear privacy glass [estimate].
- The three.js car demo glass is `color 0xffffff, metalness 0.25, roughness 0, transmission 1`. CarConcept glass is transmission 1, roughness 0, double-sided.
- Epic's windshield uses **two meshes**, interior and exterior glass, with explicit sort priority [src]. In three.js, use `renderOrder`.
- **Interior too bright through the glass:** the environment lights the cabin with no roof occlusion. Set interior materials' `envMapIntensity` to about 0.2–0.4, give them an AO map, and/or tint the glass [estimate]. Interior material values in CarConcept are linear 0.001–0.004 albedo and roughness 0.4–0.5 [src].

### 5.6 Lights
- Emissive strengths in CarConcept: **headlight 10**, brake light 2, signal 2 (KHR_materials_emissive_strength) [src]. The pmndrs Lambo uses `emissiveIntensity: 3, toneMapped: false`.
- `UnrealBloomPass(res, strength ≈ 0.3–0.5, radius ≈ 0.3–0.5, threshold ≈ 1.0–2.0)` works on linear HDR before OutputPass. A threshold above 1 stops studio highlights on paint from blooming [estimate].
- Lens covers: transmission 1, roughness 0.02–0.05, IOR 1.49 (PMMA) or 1.585 (PC) (physicallybased.info). Reflectors are chrome.
- Epic builds taillights from 3 layers: glass, a tint layer, and emissive [src]. Its emissive master changes intensity between facing and edge-on views; emulate that with an `onBeforeCompile` Fresnel term [inference].

### 5.7 Paint, trim, panel gaps (beyond the paint skill)
- **Flakes:** per-pixel noise normal map with nearest filtering ("Nearest & linear mip") plus clearcoat (CarConcept) [src].
- **Orange peel:** a subtle `clearcoatNormalMap` (normalScale ≈ 0.02–0.05) [estimate; Epic has an "orange peel" parameter].
- **Gloss-black Shadowline trim:** #0a0a0a, metal 0, rough 0.15, clearcoat 1 / 0.03. **Chrome:** #d3d8da, metal 1, rough 0.03 [estimate].
- **Panel gaps:** don't smooth normals across a gap. Darken the gap flanges in the material and let the AO texture or N8AO pick them up.

### 5.8 Open-source references
- three.js examples (r181):
  - [webgl_materials_car](https://threejs.org/examples/webgl_materials_car.html): ACES, exposure 0.85; venice_sunset HDR; clearcoat paint, transmission glass, baked AO plane.
  - [webgl_loader_gltf_anisotropy](https://threejs.org/examples/webgl_loader_gltf_anisotropy.html)
  - [webgl_shadow_contact](https://threejs.org/examples/webgl_shadow_contact.html)
  - [webgl_shadowmap_progressive](https://threejs.org/examples/webgl_shadowmap_progressive.html)
  - [webgl_postprocessing_gtao](https://threejs.org/examples/webgl_postprocessing_gtao.html)
  - [webgl_postprocessing_taa](https://threejs.org/examples/webgl_postprocessing_taa.html)
  - webgl_postprocessing_smaa, webgl_postprocessing_ssr, webgl_materials_envmaps_groundprojected, webgl_shadowmap_pcss, webgl_decals
- [pmndrs/examples](https://github.com/pmndrs/examples) (MIT):
  - `building-live-envmaps`: Porsche 911, lightformers, AccumulativeShadows, PerformanceMonitor.
  - `building-dynamic-envmaps`: Lamborghini Urus material overrides. The model is CC-BY-NC, so not for commercial use.
  - `envmap-ground-projection`: Porsche 930, ContactShadows (frames 1, resolution 1024, blur 2, opacity 0.6), and Google model-viewer's "commerce" tone mapping, which is Khronos PBR Neutral.
- Khronos glTF Sample Assets:
  - [CarConcept](https://github.com/KhronosGroup/glTF-Sample-Assets/tree/main/Models/CarConcept): its README walks through tyre normal maps, AO baking, flake paint, transmission glass and emissive strengths.
  - AnisotropyDiscTest, CarbonFibre, ClearCoatCarPaint, CompareAnisotropy.
- [Epic Automotive Materials Pack docs](https://dev.epicgames.com/documentation/en-us/unreal-engine/automotive-materials-pack-in-unreal-engine): its master-material breakdown is a good feature checklist.
- Tone mapping: [Khronos PBR Neutral](https://github.com/KhronosGroup/ToneMapping/tree/main/PBR_Neutral) and its [write-up](https://modelviewer.dev/examples/tone-mapping). r181 has `NeutralToneMapping` and `AgXToneMapping` constants [code].

---

## 6. Assets and licences

| asset | what it gives you | licence |
|---|---|---|
| [Poly Haven](https://polyhaven.com/license) studio HDRIs (above), plus the [Old Tyre model](https://polyhaven.com/a/old_tyre) (600 × 165 mm, 4K diffuse, nor_gl, rough, AO; worn, with stamped markings) | environments; rubber reference | **CC0**: "any purpose, including commercial"; no attribution needed; redistribution allowed |
| [ambientCG](https://docs.ambientcg.com/license/): **Metal051A/B/C** (circular brushed aluminium), Metal009–012 (brushed steel), Metal052–055 (iron, rusted variants), Metal027/029 (black powder coat), Rubber001–004 (rubber micro-texture) | machined faces, disc and caliper detail | **CC0 1.0**, commercial OK, no attribution |
| [physicallybased.info](https://physicallybased.info/) (API `api.physicallybased.info/materials`) | measured F0 and albedo (Tire, Iron, Chromium, Aluminium, Glass, PC, PMMA) | **CC0** (repo LICENSE) |
| Khronos [AnisotropyDiscTest](https://github.com/KhronosGroup/glTF-Sample-Assets/tree/main/Models/AnisotropyDiscTest) `AnisotropyDiscs.png` (1024²) | ready-made disc anisotropy directions (circumferential) | **CC0** (© 2023 Public) |
| Khronos [CarConcept](https://github.com/KhronosGroup/glTF-Sample-Assets/tree/main/Models/CarConcept) `Tiretread_N.png` (512×128, tileable) | tread normal map | **CC-BY 4.0**, © 2024 Darmstadt Graphics Group, credit Eric Chadwick. Do **not** reuse `Tireside_*`: it carries the Khronos logo, a trademark |
| Khronos [CarbonFibre](https://github.com/KhronosGroup/glTF-Sample-Assets/tree/main/Models/CarbonFibre) | carbon fibre with anisotropy (hat or trim) | **CC-BY 4.0**, © 2023 Wayfair |
| [TextureCan "Radially Polished Metal"](https://www.texturecan.com/details/422/) | radial brushed maps (1–4K, plus .sbsar) | the site says CC0 [check its terms page] |
| Sketchfab (licences from the API on 2026-10-02; recheck on each page): [Brake Disk and Caliper](https://sketchfab.com/3d-models/brake-disk-and-caliper-5feda9dbf20a49cf9fd29d550e55e4b9) (Vladi, CC BY, 6.2k faces), [Car Disc Brake](https://sketchfab.com/3d-models/car-disc-brake-9e2440a2fa624b31abd0963902217407) (CC BY), [FREE – Brake Caliper Brembo](https://sketchfab.com/3d-models/free-brake-caliper-brembo-39980ecb6a474ba38b1cf8e7df411a56) (CC BY; **strip the Brembo logo**) | reference or base meshes | **CC BY 4.0**: "Author must be credited. Commercial use is allowed." Sketchfab *Standard* licence forbids making the asset "available ... as a stand-alone file", which is a risk for any GLB a browser downloads. CC-BY-NC models (e.g. the pmndrs Urus) are not allowed commercially |
| Libraries: [N8AO](https://github.com/N8python/n8ao) CC0; three-bvh-csg MIT; manifold-3d Apache-2.0; drei MIT (to port MeshReflectorMaterial or AccumulativeShadows logic) | | |

---

## 7. Trademarks (not legal advice)
- A real tyre brand or model name (Michelin, Pirelli P Zero, etc.), "Brembo", or the BMW "M" logo on calipers or centre caps can suggest endorsement or affiliation. The IBA notes that using trademarked objects in games "can infringe ... if it creates confusion about sponsorship" ([IBA](https://www.ibanet.org/ip-july-2021-3d-object-video-games-ip)).
- Use generic or fictional markings, or the client's own brand. Size designations ("275/35 R20 102Y XL"), "TUBELESS", "RADIAL", DOT-style date codes and TWI marks are regulatory text, not brands [inference].
- Even CC-BY models of branded parts can carry trademark textures. A copyright licence does not license the trademark.
- The BMW car models themselves (GLBs from Sketchfab) raise separate licence and trademark questions. Check each model's licence: CC-BY needs visible credit, and NC licences are not allowed.

---

## 8. Not verified, or estimates (worth checking)
- All "typical" dimensions not quoted from a source: tyre profile points, groove layout, lettering heights, flattening amount, hole and slot sizes, hat pin count, lug pocket size, centre-cap diameter, barrel wall thickness, hub-pad thickness, caliper clock position and camber.
- Artistic material values: rubber sheen, cast-iron colour, anodised hat, matte gold, carbon-ceramic look, glass tints, bloom thresholds.
- BMW 17 mm bolt hex, and whether the G80 OE front disc is drilled in every market (the retailer wording suggests drilled).
- GPU cost of GTAO and N8AO on your target hardware. Measure with `n8aopass.lastTime` or `EXT_disjoint_timer_query`.
- Whether a duplicated LatheGeometry profile point gives a clean hard edge (read from code; test it).
