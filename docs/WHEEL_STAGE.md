# The 2D wheel stage

The configurator shows the wheel the customer picks as a **picture**, not a 3D model, wherever the
pictures exist: the car side-on with the rim photo composited on. It is what the rim card shows, so
the wheel on the car matches the product photo exactly. The 3D view stays for every other angle
(Front, Rear, Top) and for any car, paint or size without pictures.

## What the customer sees

- **Side** tab: the whole car side-on with the chosen rim, size and finish.
- **Wheel** tab: a close-up of the front wheel (the rim photo is drawn at screen resolution, so it
  stays sharp).
- Picking a wheel, size or finish goes to the Side view when the stage has that car, paint and size.
- The 3D renderer sleeps while the stage shows, so it is fast on phones.

## How a picture is built (all in the browser, `components/journey/WheelStage.tsx`)

1. **Plate**: the car in its paint with no wheels (`public/stage/<carId>/<paintId>.webp`).
2. **Tyre layer** for the rim size: tyre, disc, caliper and barrel, with the car body occluding them
   exactly (`public/stage/<carId>/wheels-<size>.webp`).
3. **Rim photo** for the finish, drawn into each axle's rim-lip ellipse (`layout.json`):
   - a ready photo in that finish if the wheel has one (`wheels.rim_sprites[finishId]`, made by the
     n8n workflow below), otherwise
   - the wheel's grey rim photo (`wheels.image_url`) re-coloured in the browser to the finish
     (`tintSprite` in `services/wheelStage.ts`).

`public/stage/manifest.json` lists which cars, paints and sizes have pictures.

## Adding a car or paint

The pictures are rendered from the 3D cars by the engine itself (dev server running):

```bash
bunx vite --host 127.0.0.1 --port 5173
# all four rim sizes + the paints given (indexes into the bundled paint list), or '-' for plates only
node scripts/render/build-stage.cjs /tmp/raw <carIndex> <paintIndexes> '19",20",21",22"'
node scripts/render/build-stage.cjs /tmp/raw <carIndex> <morePaintIndexes> -
python3 scripts/render/pack-stage.py /tmp/raw <carId>   # crop, WebP, layout.json, manifest
```

About a minute per picture in the sandbox (SwiftShader). Rebuild a car's tyre layers after any
change to the tyre, disc or caliper (`services/wheelKit.ts`), and its plates after a paint change.

## Finish photos (n8n "FORGED finish sprites")

A form in n8n: leave it blank to do every live wheel in every finish it offers that has no photo yet.
For each one, Riverflow repaints the grey rim photo in the finish, Gemini checks the design, framing,
transparency and finish, and the Supabase `ingest-sprite` function stores it in
`rim-images/sprites/` and records it in `wheels.rim_sprites`. The configurator uses it at once.

- Setup once: give the **Save Sprite** node a credential with the header `x-ingest-secret` = an
  ingest key (the same kind as the wheel pipeline uses).
- About $0.15–0.30 per photo; 11 wheels × 4–5 finishes ≈ $10–15.
- To drop a bad photo: POST `{ wheel_id, finish_id, clear: true }` to `ingest-sprite`, or run the
  form with "Redo" for that wheel and finish.
