"""Composites the proof: recoloured Blender body (the maths of services/renderedBody.ts, taken from scripts/render/oncar.py)
+ pre-rendered wheel layers (render_wheel_layer.py) + dark studio backdrop, and builds side-by-side sheets against the
live-wheel look (scripts/render/oncar.cjs).

  compose_proof.py body  <car> <view> '#hex' <Metallic|Pearl|Frozen|Uni> <out.png> <layer.json> [<layer.json> ...]
  compose_proof.py sheet <left.png> <right.png> <out.jpg> [label_left label_right]
  compose_proof.py zoom  <left.png> <right.png> <out.jpg> x0 y0 x1 y1 [scale]       (crop the same box from both, enlarge)

Layers are listed bottom to top (under layer, then rim layer); each is a json written by render_wheel_layer.py.
"""
import json, os, sys
import numpy as np
from PIL import Image, ImageDraw, ImageFont
ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..'))


def oncar_maths():
    """lin / srgb / neutral / backdrop and EXPOSURE, executed from oncar.py's own source (no copy to drift)."""
    src = open(os.path.join(ROOT, 'scripts', 'render', 'oncar.py')).read().split("kind = 'matte'")[0]
    argv = sys.argv; sys.argv = ['oncar.py', 'x', 'x', 'side', '#000000', 'Metallic', 'x']
    g = {}
    exec(compile(src, 'oncar.py', 'exec'), g)
    sys.argv = argv
    return g


def layer_canvas(layer_json, W=1440, H=900):
    j = json.load(open(layer_json)); d = os.path.dirname(layer_json)
    rgb = np.zeros((H, W, 3), np.float64); a = np.zeros((H, W, 1), np.float64)
    for r in j['regions']:
        x0, y0, x1, y1 = r['box']
        im = np.asarray(Image.open(os.path.join(d, r['file'])).convert('RGBA')).astype(np.float64) / 255
        h, w = im.shape[:2]
        rgb[y0:y0 + h, x0:x0 + w] = im[..., :3]; a[y0:y0 + h, x0:x0 + w] = im[..., 3:4]
    return rgb, a


def compose_body(car, view, hexc, ptype, out, layers, passes=None):
    g = oncar_maths()
    passes = passes or os.path.join(ROOT, 'public', 'renders', car)
    kind = 'matte' if ptype == 'Frozen' else 'gloss'
    lin, srgb, neutral = g['lin'], g['srgb'], g['neutral']
    Wp = np.asarray(Image.open(f'{passes}/{view}/{kind}_w.webp').convert('RGBA').resize((1440, 900))).astype(float) / 255
    Bp = np.asarray(Image.open(f'{passes}/{view}/{kind}_b.webp').convert('RGBA').resize((1440, 900))).astype(float) / 255
    col = lin(np.array([int(hexc.lstrip('#')[i:i + 2], 16) for i in (0, 2, 4)]) / 255)
    lb, lw = lin(Bp[..., :3]), lin(Wp[..., :3])
    body = srgb(neutral((lb + (lw - lb) * col) * g['EXPOSURE'])); a = Wp[..., 3:4]
    img = body * a + g['backdrop'](1440, 900, view) * (1 - a)
    for lj in layers:
        rgb, al = layer_canvas(lj)
        img = rgb * al + img * (1 - al)
    Image.fromarray((np.clip(img, 0, 1) * 255).astype(np.uint8)).save(out)


def label(im, text):
    d = ImageDraw.Draw(im)
    try: f = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', 22)
    except Exception: f = ImageFont.load_default()
    d.rectangle([0, 0, 8 + 13 * len(text), 34], fill=(0, 0, 0)); d.text((6, 4), text, fill=(255, 255, 255), font=f)
    return im


def reuse_canvas(rim_json_a, rim_json_b_meta, wheels=(1, 3), pad=1.3):
    """The reusable rim layer rendered on car A, cut out per wheel and scaled / moved onto the wheels of car B
    (centre and tyre radii in px from each render's json 'wheels'), returned as a full-frame canvas of car B."""
    def wheels_of(path):
        j = json.load(open(path)); w = j['wheels']
        if 'face' not in w[0]:   # older json: take the metadata a --meta-only run wrote next to it
            w = json.load(open(os.path.join(os.path.dirname(path), 'meta.json')))['wheels']
        return {'wheels': w}
    ja = wheels_of(rim_json_a); jb = wheels_of(rim_json_b_meta)
    rgb, al = layer_canvas(rim_json_a)
    H, W = al.shape[:2]
    out_rgb = np.zeros((H, W, 3)); out_a = np.zeros((H, W, 1))
    for i in wheels:
        A = ja['wheels'][i]['face']; B = jb['wheels'][i]['face']   # place by the rim's own lip-front circle
        hx, hy = pad * A['rx'], pad * A['ry']
        x0, x1, y0, y1 = int(A['cx'] - hx), int(A['cx'] + hx), int(A['cy'] - hy), int(A['cy'] + hy)
        # premultiplied resample so edges stay clean
        pm = np.concatenate([rgb[y0:y1, x0:x1] * al[y0:y1, x0:x1], al[y0:y1, x0:x1]], -1).astype(np.float32)
        sx, sy = B['rx'] / A['rx'], B['ry'] / A['ry']
        nw, nh = max(1, round((x1 - x0) * sx)), max(1, round((y1 - y0) * sy))
        chans = [np.asarray(Image.fromarray(pm[..., k], 'F').resize((nw, nh), Image.LANCZOS)) for k in range(4)]
        pm2 = np.stack(chans, -1)
        px0 = int(round(B['cx'] - (A['cx'] - x0) * sx)); py0 = int(round(B['cy'] - (A['cy'] - y0) * sy))
        xs0, ys0 = max(0, px0), max(0, py0); xs1, ys1 = min(W, px0 + nw), min(H, py0 + nh)
        sub = pm2[ys0 - py0:ys1 - py0, xs0 - px0:xs1 - px0]
        a2 = np.clip(sub[..., 3:4], 0, 1)
        # over
        out_rgb[ys0:ys1, xs0:xs1] = sub[..., :3] + out_rgb[ys0:ys1, xs0:xs1] * (1 - a2)
        out_a[ys0:ys1, xs0:xs1] = a2 + out_a[ys0:ys1, xs0:xs1] * (1 - a2)
    straight = np.where(out_a > 1e-4, out_rgb / np.maximum(out_a, 1e-4), 0)
    return np.clip(straight, 0, 1), out_a


def compose_reuse(car_b, view, hexc, ptype, out, under_json_b, rim_json_a):
    """Body of car B + B's own tyre/brake layer + the rim layer of car A placed on B's wheels."""
    g = oncar_maths()
    tmp = out + '.base.png'
    compose_body(car_b, view, hexc, ptype, tmp, [under_json_b])
    img = np.asarray(Image.open(tmp).convert('RGB')).astype(np.float64) / 255
    rgb, a = reuse_canvas(rim_json_a, under_json_b)
    img = rgb * a + img * (1 - a)
    Image.fromarray((np.clip(img, 0, 1) * 255).astype(np.uint8)).save(out); os.remove(tmp)


if __name__ == '__main__':
    cmd = sys.argv[1]
    if cmd == 'body':
        car, view, hexc, ptype, out = sys.argv[2:7]
        compose_body(car, view, hexc, ptype, out, sys.argv[7:])
    elif cmd == 'reuse':   # reuse <carB> <view> <hex> <type> <out.png> <under_B.json> <rim_A.json>
        compose_reuse(*sys.argv[2:9])
    elif cmd == 'sheet':
        l, r, out = sys.argv[2:5]; ll, rl = (sys.argv[5:7] + ['current (live three.js wheels)', 'new (Blender wheel layer)'])[:2] if len(sys.argv) > 5 else ('current (live three.js wheels)', 'new (Blender wheel layer)')
        A = label(Image.open(l).convert('RGB'), ll); B = label(Image.open(r).convert('RGB'), rl)
        S = Image.new('RGB', (A.width + B.width, max(A.height, B.height))); S.paste(A, (0, 0)); S.paste(B, (A.width, 0)); S.save(out, quality=93)
    elif cmd == 'zoom':
        l, r, out = sys.argv[2:5]; x0, y0, x1, y1 = map(int, sys.argv[5:9]); k = int(sys.argv[9]) if len(sys.argv) > 9 else 3
        ims = [Image.open(p).convert('RGB').crop((x0, y0, x1, y1)).resize(((x1 - x0) * k, (y1 - y0) * k), Image.LANCZOS) for p in (l, r)]
        S = Image.new('RGB', (ims[0].width * 2 + 8, ims[0].height), (255, 0, 255)); S.paste(ims[0], (0, 0)); S.paste(ims[1], (ims[0].width + 8, 0)); S.save(out, quality=93)
