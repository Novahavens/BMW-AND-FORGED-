# Tutorial videos (HyperFrames)

Two narrated how-it-works films, made with [HyperFrames](https://hyperframes.heygen.com) (HTML + GSAP rendered frame by frame):

| Project | What it shows | Length |
|---|---|---|
| `m2-tutorial/` | The customer configurator: a BMW M2 CS in Black Sapphire on FF-3 (Pure Bronze, 21"), every function and what it is for | about 2 min 55 s |
| `admin-tutorial/` | The dealership admin (`/admin`): sign-in, cars, wheels, sizes and prices, finishes, paints, enquiries | about 4 min |

Everything on screen is a real capture of the running app, never a redraw. The cursor, gold ring and purpose cards are
placed from the measured box of each real control (`assets/shots/manifest.json`). Each project has `SPEC.md` (the brief),
`build.mjs` (the scene table: voice-over text, which control each beat points at, card wording) and `tools/voice.py`.

## Rebuild a film

```bash
# 1. dev server (other shell)
bunx vite --host 127.0.0.1 --port 5173

# 2. screens (SwiftShader, no GPU: a few minutes for the configurator, ~2.5 min for the admin)
node scripts/video/capture-tutorial.cjs video/m2-tutorial/assets/shots          # configurator
bun run scripts/video/admin-fixture.ts > video/admin-tutorial/assets/shots/fixtures.json
node scripts/video/capture-admin.cjs   video/admin-tutorial/assets/shots        # admin (stubbed session, see below)
# the opening/closing still of the configurator film (1920x1080, stage look):
#   scripts/render/shoot.cjs with car 5, paint 3, wheel sixnine_ff3, finish pure_bronze, size 21", view frontThreeQuarter, q "&look=stage"

# 3. voice-over (OpenRouter openai/gpt-audio; retries until the spoken transcript equals the script)
cd video/m2-tutorial     # or admin-tutorial
node tools/extract-vo.mjs   # writes assets/voice/src/<id>.txt from the `vo` strings in build.mjs
python3 tools/voice.py --all

# 4. build, check, render
node build.mjs && npx hyperframes check && npx hyperframes render --output renders/<name>.mp4
```

## Notes

- **The admin film never touches the live database or any real account.** `capture-admin.cjs` runs the real admin page with
  a stubbed demo session and answers every Supabase call from `admin-fixture.ts` (the bundled catalogue plus four fictional
  `example.com` enquiries, labelled "sample data" on screen). Writes are swallowed locally.
- The configurator capture stubs Supabase writes too, so no lead (each one emails the owner) is created.
- Voice: HeyGen's voices need a paid HyperFrames plan on this account, so the narration uses OpenAI's speech model through
  OpenRouter. It has not been listened to by the person who built it (a cloud session has no audio output): check it by ear.
- No music bed: the music catalogue also needs the HeyGen CLI and plan. Click sounds sit on real clicks only.
