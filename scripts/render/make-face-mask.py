"""
Prepared face mask for a photo wheel the automatic photo reading can't get right (see the
wheel3d skill, step 4). Writes public/rim-faces/<wheelId>.png; add the wheel to
services/rimFaces.ts, then re-run scripts/render/wheel-qa.cjs.

  OPENROUTER_API_KEY=... python3 scripts/render/make-face-mask.py <rimPhoto.png> <wheelId> [attempts]

1. An image model (google/gemini-2.5-flash-image via OpenRouter, the same account as the wheel
   pipeline) redraws the photo as a two-colour silhouette: spokes, hub and lip white, everything
   behind the spokes (barrel, rings, bolts, lettering) black. Several attempts are made.
2. Each attempt is aligned to the photo (scale, shift, small rotation) and scored by how well it
   matches the photo's own cut-out where that is reliable (the see-through window zone). The
   best one is kept; below 0.8 nothing is written (the model drifted from the design).
3. Composite: the photo decides inside the window zone, the silhouette behind the spokes further
   out; the silhouette may only remove material, never add it; the lip ring is the photo's.
4. Spokes that end short of the lip (the model often stops them at the barrel ring) are carried
   straight out to it.

Never commit the key; pass it in the environment only.
"""
import base64, io, json, os, sys, urllib.request
import numpy as np
from PIL import Image

PROMPT = ("This is a front-on photo of a forged car wheel on black. Produce a clean two-colour SILHOUETTE MASK of the same wheel, same size, position and framing: "
          "pure white (#FFFFFF) for the spokes, the centre hub and the outer rim lip ring; pure black (#000000) for EVERYTHING you can see through or behind the spokes, "
          "including the inner barrel, its rings, bolts and lettering between the spokes. Keep every spoke exactly where it is, with the exact same count, width, branching and straight edges. "
          "No shading, no grey, no lug holes, no logo. Square image.")


def ask_model(photo: Image.Image, key: str) -> Image.Image:
    bg = Image.new('RGBA', (1024, 1024), (0, 0, 0, 255))
    bg.alpha_composite(photo.resize((1024, 1024)))
    buf = io.BytesIO()
    bg.convert('RGB').save(buf, 'PNG')
    body = {"model": "google/gemini-2.5-flash-image", "modalities": ["image", "text"],
            "messages": [{"role": "user", "content": [{"type": "text", "text": PROMPT},
                         {"type": "image_url", "image_url": {"url": "data:image/png;base64," + base64.b64encode(buf.getvalue()).decode()}}]}]}
    req = urllib.request.Request("https://openrouter.ai/api/v1/chat/completions", data=json.dumps(body).encode(),
                                 headers={"Authorization": "Bearer " + key, "Content-Type": "application/json"})
    r = json.load(urllib.request.urlopen(req, timeout=300))
    url = r['choices'][0]['message']['images'][0]['image_url']['url']
    return Image.open(io.BytesIO(base64.b64decode(url.split(',', 1)[1]))).convert('L')


def warp(img: Image.Image, n: int, s: float, dx: float, dy: float, rot: float) -> np.ndarray:
    im = img.resize((n, n), Image.BICUBIC).rotate(rot, resample=Image.BICUBIC)
    a, c = 1 / s, (n - 1) / 2
    im = im.transform((n, n), Image.AFFINE, (a, 0, c - a * c - dx / s, 0, a, c - a * c - dy / s), resample=Image.BICUBIC)
    return np.asarray(im) / 255.0


def main():
    photo_path, wheel_id = sys.argv[1], sys.argv[2]
    attempts = int(sys.argv[3]) if len(sys.argv) > 3 else 3
    key = os.environ['OPENROUTER_API_KEY']
    photo = Image.open(photo_path).convert('RGBA')
    # 1-2: attempts, aligned and scored at 256 px
    n = 256
    yy, xx = np.mgrid[0:n, 0:n]
    r = np.hypot(xx - (n - 1) / 2, yy - (n - 1) / 2) / (n / 2)
    A = np.asarray(photo.resize((n, n)))[:, :, 3] > 127
    zone = (r > 0.35) & (r < 0.64)
    best = (0.0, None, None)
    for k in range(attempts):
        sil = ask_model(photo, key)
        for s in np.linspace(0.95, 1.05, 11):
            for rot in (-2, -1, 0, 1, 2):
                for dx in range(-4, 5, 2):
                    for dy in range(-4, 5, 2):
                        M = warp(sil, n, s, dx, dy, rot) > 0.75
                        iou = (A & M & zone).sum() / max(1, ((A | M) & zone).sum())
                        if iou > best[0]:
                            best = (iou, sil, (s, dx, dy, rot))
        print(f'attempt {k + 1}: best match so far {best[0]:.3f}')
    if best[0] < 0.8:
        sys.exit(f'no attempt matches the photo well enough ({best[0]:.3f} < 0.8); use CAD or a front-on photo')
    # 3: composite at full size
    N = 2048
    s, dx, dy, rot = best[2]
    M = np.clip((warp(best[1], N, s, dx * N / n, dy * N / n, rot) - 0.6) / 0.3, 0, 1)
    A = np.asarray(photo.resize((N, N)))[:, :, 3] / 255.0
    yy, xx = np.mgrid[0:N, 0:N]
    c = (N - 1) / 2
    r = np.hypot(xx - c, yy - c) / (N / 2)
    w = np.clip((r - 0.60) / 0.06, 0, 1)
    F = np.minimum(A, (1 - w) * A + w * M)
    F = np.where(r > 0.955, A, F)
    # 4: carry the spokes found just inside the barrel ring straight out to the lip
    t = np.arctan2(yy - c, xx - c)
    NT = 4096
    tt = np.linspace(-np.pi, np.pi, NT, endpoint=False)
    def ring(rr):
        x = np.clip((c + rr * N / 2 * np.cos(tt)).astype(int), 0, N - 1)
        y = np.clip((c + rr * N / 2 * np.sin(tt)).astype(int), 0, N - 1)
        return F[y, x]
    cov = [(F[(r >= b / 200) & (r < (b + 1) / 200)] > 0.5).mean() for b in range(120, 192)]
    # the outermost radius below the lip where spokes are still clearly separate
    separate = [i for i, v in enumerate(cov) if 0.12 < v < 0.6]
    if not separate:
        sys.exit('the silhouette has no band where the spokes are separate (lip ring filled solid?); use CAD or a front-on photo')
    r_tip = 0.6 + 0.005 * max(separate)
    spokes = np.maximum(ring(r_tip - 0.01), ring(r_tip - 0.03))
    ti = ((t + np.pi) / (2 * np.pi) * NT).astype(int) % NT
    band = (r >= r_tip - 0.01) & (r < 0.965)
    F[band] = spokes[ti[band]]
    out = np.zeros((N, N, 4), np.uint8)
    out[..., :3] = 200
    out[..., 3] = (np.clip(F, 0, 1) * 255).astype(np.uint8)
    dest = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'public', 'rim-faces', wheel_id + '.png')
    os.makedirs(os.path.dirname(dest), exist_ok=True)
    Image.fromarray(out).save(dest, optimize=True)
    print(f'wrote {os.path.normpath(dest)} (match {best[0]:.3f}, spokes carried out from r={r_tip:.2f})')


if __name__ == '__main__':
    main()
