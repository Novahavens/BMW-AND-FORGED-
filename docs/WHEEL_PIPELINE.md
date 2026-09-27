# Wheel pipeline: from product photos to wheels in the configurator

This is how a real FORGED wheel gets from a photo to a rotatable 3D rim on every car in the app. It
covers what the app needs from an image, the tools that prepare one, and how to run a batch.

## What the app needs

The configurator builds each rim face in 3D from a single PNG (`services/rimExtrusion.ts`):

- **Straight-on face view**, square, the outer lip touching all four edges.
- **Transparent background and transparent gaps between the spokes.** The app traces the see-through
  areas into solid, bevelled spokes with a concave dish. With no transparency it shows a flat disc.
- **Neutral light grey, not the wheel's own colour.** The app multiplies the image by the finish the
  customer picks (Liquid Metal, Bronze Matte, Black Gloss, Silver). A gold photo would tint every finish
  gold, and a dark photo would make chrome look black. The image also acts as the metal's reflectance,
  so it has to stay light.

You never prepare that last part by hand: the ingest function (below) converts any cut-out into it.

## The pieces

| Piece | Where | What it does |
|---|---|---|
| `ingest-wheel` edge function | `supabase/functions/ingest-wheel/` | Normalizes the cut-out (rim circle only, 2048px, neutral grey at a common brightness), runs the app's 3D-readiness test, uploads to the `rim-images` bucket and creates or updates the wheel. Live when every check passes, hidden with reasons otherwise. Removes the six placeholder designs once a real wheel is live. |
| `normalize.ts` | same folder | The circle crop, stand/stray removal, alpha clean-up and grey mapping. |
| `validate.ts` | same folder | The 3D-readiness test: background gone, at least 5% see-through between the spokes (the app needs 2%), an unbroken lip, the rim filling the frame. |
| `png.ts` | same folder | Fast grey + alpha PNG writer (native zlib keeps the function inside its CPU budget). |
| n8n workflow "FORGED wheel pipeline (automated)" | novahavensai.app.n8n.cloud | Reads a Drive folder of photos and a `wheels` sheet, cuts each wheel out with an image model on OpenRouter, checks it against the original, retries once, and posts it to `ingest-wheel`. |
| `wheels` sheet | the Drive folder | One row per photo: the name, sizes, prices and finishes customers see. |

## The `wheels` sheet

| Column | Example | Notes |
|---|---|---|
| `file` | `DSC08145.jpg` | The photo's file name (the extension is optional). |
| `name` | `Zwartkops Branch` | Shown to customers. |
| `code` | `FSA-02` | Optional; the wheel's id is built from it (`forged_fsa_02`), so keep it stable. |
| `sizes` | `19\|20\|21\|22` | Separate values with `\|`. |
| `prices_zar` or `prices_usd` | `68000\|74000\|82000\|92000` | Price for a set of four, one per size. Rand is converted at the `config/brand.ts` rate. |
| `finishes` | `Liquid Metal\|Bronze Matte\|Black Gloss\|Silver` | Names or ids from the Finishes tab. |
| `subtitle`, `description`, `highlights` | | Optional copy; highlights separated by `\|`. The AI writes them if blank. |
| `style` | `Monoblock Forged` | Optional line under the name on the collection page. The AI suggests one if blank. |
| `skip` | `yes` | Optional. `yes` leaves the row alone on the next run (used for the wheels already live). |
| `notes` | | Free text, ignored by the pipeline. |

The live sheet is [wheels](https://docs.google.com/spreadsheets/d/1OJJYaZsVSuJIgjnYkiSE55hBF7_l6y2o4dJH0SehOIM/edit)
in the FORGED Drive folder. Its names (South African circuits), codes, sizes and prices are
placeholders to replace with the real ones.

Everything the sheet sets can be changed later in `/admin` → Wheels. Running the pipeline again for
the same `code` updates that wheel instead of adding a duplicate. Weights and spoke count are not
in the sheet; set them in `/admin`, and later runs keep them (as they keep a style when the cell is blank).

## Current catalogue

The first batch came from the 24 photos in `Wheel designs.zip`. Photos of the same design in another
colour were merged, which leaves 17 designs.

| Codes | Status |
|---|---|
| FSA-01 … FSA-09 | **Live.** Front-on photos, cut out without redrawing, checked by eye and on the car. |
| FSA-10 … FSA-17 | **Waiting.** Only three-quarter photos exist, so an image model has to redraw them face-on. That step needs OpenRouter (see one-time setup). Once it is allowed, run the workflow on the folder; these rows are already in the sheet. |

The six placeholder designs the app shipped with were removed when the first real wheel went live.
`data/configuratorData.ts` mirrors the live wheels as the offline fallback.

## Choosing photos

- **Front-on photos give the most faithful result.** They can be cut out without redrawing anything.
- **Angled (three-quarter) photos** need an image model to redraw the wheel face-on. The pipeline
  checks the result against the original for design drift, but always look at those wheels yourself.
- **One wheel per design.** The finish is chosen in the app, so a design photographed in gold, black
  and silver is one wheel. Use the best (front-on) photo and list the others in `notes`.

## Running a batch

1. Put the photos (or a zip of them) and the `wheels` sheet in one Drive folder. A zip is unpacked
   into the folder and then moved to the "(processed)" folder, so it is only unpacked once.
2. Open the workflow's form (Start Wheel Batch → Production URL), paste the folder link, submit.
3. When it finishes, the page says how many wheels went live. `wheel-report.csv` in the new
   "(processed)" folder lists every wheel with its status and, for hidden ones, the reason.
4. Fix hidden wheels (a better photo, a corrected sheet row) and run the batch again, or tick
   **Visible** in `/admin` if you are happy with them.

## One-time setup

- **OpenRouter:** the account's "allowed providers" setting (openrouter.ai/settings/privacy) must allow
  Sourceful (the Riverflow image model) and Google (the Gemini checker).
- **n8n credentials:** select "OpenRouter account" on Cut Out Wheel, AI Check, Retry Cut Out and
  AI Re-check; on Add Wheel to App create a Header Auth credential named `x-ingest-secret` whose
  value is an ingest key.
- **Ingest keys** are stored only as SHA-256 hashes in `public.ingest_keys`. To add one, generate a
  long random string and run
  `insert into public.ingest_keys (key_hash, label) values (encode(sha256('<key>'::bytea), 'hex'), 'who / what');`
  in the Supabase SQL editor. Delete the row to revoke it. (A Supabase function secret named
  `INGEST_SECRET` also works.)

## Troubleshooting

| Report says | Meaning | Fix |
|---|---|---|
| spoke gaps not transparent | The background still shows between the spokes | Use a front-on photo on a plainer background, or rerun. |
| outer rim lip is broken or cropped | The lip is cut off, or a stand covers it | Use a photo with the whole wheel in frame. |
| rim does not reach all four edges | The wheel is small in the frame after cropping | Usually an angled photo; use a front-on one. |
| AI check: design changes … | The image model altered the design | Use a front-on photo, or accept by hand after checking. |
| unknown finishes | A finish name in the sheet doesn't exist | Use one from the Finishes tab. |
