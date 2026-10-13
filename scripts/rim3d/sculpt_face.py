"""Sculpted spoke faces for build_rim.py (spec key "spoke_profile"; the default flat slab is untouched when it is absent).

A traced face is a flat outline. A real forged spoke is not a slab: its edges are chamfered and filleted, its face is a little convex
(crown) or concave, it is thinner at the lip than at the hub, and the windows have a ledge. This module turns the outline into that:

  1. the outline is smoothed (Gaussian along its length, `smooth_mm`), which removes the wobble and zigzag of a traced mask,
  2. inward offsets of the outline are cut at the distances of a rounded chamfer profile (wall -> fillet -> chamfer -> fillet -> face),
     and every offset curve is a constraint line of one constrained Delaunay triangulation (the `triangle` package), so each edge
     highlight runs along a real ring of vertices - crisp, no jaggies, no stair-steps,
  3. a vertex's height is f(distance to the edge): the chamfer profile near the edge, then `crown_mm` (convex +, concave -) over the
     local half-width of the spoke (found with a distance transform), `channel_mm` (a milled pocket down each spoke), a `window_step_mm`
     ledge around the windows, and the engine's parabolic dish on top of it all,
  4. the back is a separate coarse surface whose thickness tapers from `thick_hub` to `taper` x that at the lip; a wall joins both.

Spec (all lengths in mm at the 262 mm lip radius R, so 1 mm = 0.003817 R):
  "spoke_profile": {
     "chamfer_mm": 3.0,       width of the edge chamfer measured across the face
     "chamfer_deg": 40,       its angle above the face (depth = width * tan)
     "fillet_mm": 1.2,        radius that rounds both ends of the chamfer (the crisp, thin highlight)
     "edge_mm": 0.8,          radius at the foot of the wall (the lower edge)
     "crown_mm": 1.0,         + convex across the spoke, - concave (rails at the chamfer, centre sunk)
     "channel_mm": 0, "channel_w_mm": 7,   a milled pocket along the spoke centre (depth, width); spokes only, not the hub
     "window_step_mm": 0, "window_step_w_mm": 5, "window_step_ramp_mm": 3   a ledge this deep, this wide (its top edge), with this soft a foot, around every window
     "hub_pad_mm": 0, "hub_pad_r": 0.245, "hub_pad_chamfer_mm": 2   a raised hub pad (height, radius in R, width of its sloped edge)
     "taper": 0.7,            back thickness at the lip as a fraction of the thickness at the hub
     "smooth_mm": 2.0,        outline smoothing (Gaussian sigma)
     "root_fillet_mm": 0,     radius of the plan-view fillets where spokes meet the hub / rim (the window corners)
     "tip_round_mm": 0,       radius that rounds convex plan-view corners (spoke tips)
     "detail": 1.0 }          mesh density multiplier (1 = about 0.004 R ring spacing; higher = finer)

Needs `pip install triangle shapely` (no other dependency beyond bpy, numpy, scipy, PIL).
"""
import math
import numpy as np
import shapely
from shapely.geometry import Polygon, MultiPolygon, Point
from shapely.ops import unary_union
import triangle as tr
from scipy import ndimage
from scipy.spatial import cKDTree

MM = 1 / 262.0


def _bezier(a, v, b, n):
    t = np.linspace(0, 1, n + 1)[:, None]
    return (1 - t) ** 2 * a + 2 * t * (1 - t) * v + t ** 2 * b


def _profile(c, depth, rb, rc, n=4):
    """(d, h) polyline of the edge: a wall coming up from below at d = 0, rounded into the chamfer, rounded into the flat face (h = 0)."""
    B = np.array([0.0, -depth]); C = np.array([c, 0.0]); A = np.array([0.0, -depth - 3 * MM]); E = np.array([c + 4 * MM, 0.0])

    def corner(P0, V, P1, r):
        u0 = (V - P0) / np.linalg.norm(V - P0); u1 = (P1 - V) / np.linalg.norm(P1 - V)
        phi = math.acos(max(-1, min(1, float(u0 @ u1))))
        t = min(r * math.tan(phi / 2), 0.45 * min(np.linalg.norm(V - P0), np.linalg.norm(P1 - V)))
        return _bezier(V - u0 * t, V, V + u1 * t, n)
    ab = corner(A, B, C, rb)
    bc = corner(B, C, E, rc)
    pts = np.vstack([ab, bc])
    pts[:, 0] = np.maximum.accumulate(np.maximum(pts[:, 0], 0))
    return pts[:, 0], pts[:, 1]


def _resample_closed(xy, step):
    xy = np.asarray(xy, float)
    if np.allclose(xy[0], xy[-1]): xy = xy[:-1]
    seg = np.linalg.norm(np.roll(xy, -1, axis=0) - xy, axis=1)
    s = np.concatenate([[0], np.cumsum(seg)]); L = s[-1]
    n = max(16, int(round(L / step)))
    t = np.linspace(0, L, n, endpoint=False)
    ext = np.vstack([xy, xy[:1]])
    return np.stack([np.interp(t, s, ext[:, 0]), np.interp(t, s, ext[:, 1])], 1), L / n


def _smooth_loop(xy, sigma, step=0.0015):
    pts, st = _resample_closed(xy, step)
    if sigma <= 0: return pts
    return np.stack([ndimage.gaussian_filter1d(pts[:, k], sigma / st, mode='wrap') for k in (0, 1)], 1)


def _polys(g):
    if g.is_empty: return []
    if isinstance(g, Polygon): return [g]
    return [p for p in getattr(g, 'geoms', []) if isinstance(p, Polygon)]


def _loops(poly):
    return [np.asarray(poly.exterior.coords)[:-1]] + [np.asarray(r.coords)[:-1] for r in poly.interiors]


def outline_polygon(traced, SC, clip_r, smooth, cuts=(), root=0.0, tip=0.0):
    """The (smoothed) face region in the traced plane: traced shapes, clipped to the face disc, minus bore / bolt holes."""
    polys = []
    for sh in traced['shapes']:
        outer = _smooth_loop(np.array(sh['outer']) * SC, smooth)
        holes = [_smooth_loop(np.array(h) * SC, smooth) for h in sh['holes']]
        p = Polygon(outer, holes)
        if not p.is_valid: p = p.buffer(0)
        polys.append(p)
    P = unary_union(polys)
    P = P.intersection(Point(0, 0).buffer(clip_r, 1024))
    # root fillet: spoke-to-hub and spoke-to-rim corners get this radius (dilate then erode); tip: spoke ends / outer corners rounded
    if root > 0: P = P.buffer(root, quad_segs=16).buffer(-root, quad_segs=16).intersection(Point(0, 0).buffer(clip_r, 1024))
    if tip > 0: P = P.buffer(-tip, quad_segs=16).buffer(tip, quad_segs=16)
    for cx, cy, r in cuts: P = P.difference(Point(cx, cy).buffer(r, 64))
    return unary_union([p for p in _polys(P) if p.area > 1e-5])


def build(traced, prof, SC, clip_r, FF, FT, dish_sink, hub_r, cuts=(), log=print):
    """-> (verts Nx3 wheel frame (x = axle, face toward +x), faces list of int tuples, info dict, per-vertex normals Nx3)"""
    chamfer = prof.get('chamfer_mm', 3.0) * MM; ang = math.radians(prof.get('chamfer_deg', 40))
    fil = prof.get('fillet_mm', 1.2) * MM; edge = prof.get('edge_mm', 0.8) * MM
    crown = prof.get('crown_mm', 0.0) * MM
    ch_depth = prof.get('channel_mm', 0.0) * MM; ch_w = prof.get('channel_w_mm', 7.0) * MM
    ws_depth = prof.get('window_step_mm', 0.0) * MM; ws_w = prof.get('window_step_w_mm', 5.0) * MM; ws_ramp = prof.get('window_step_ramp_mm', 3.0) * MM
    pad = prof.get('hub_pad_mm', 0.0) * MM; pad_r = prof.get('hub_pad_r', 0.245); pad_ramp = prof.get('hub_pad_chamfer_mm', 2.0) * MM
    taper = prof.get('taper', 1.0); smooth = prof.get('smooth_mm', 2.0) * MM
    detail = prof.get('detail', 1.0)
    step = 0.004 / detail

    D = outline_polygon(traced, SC, clip_r, smooth, cuts, prof.get('root_fillet_mm', 0.0) * MM, prof.get('tip_round_mm', 0.0) * MM)
    pd, ph = _profile(chamfer, chamfer * math.tan(ang), edge, fil)
    # ring offsets: the profile's own points plus extra ones along its straight parts, so no band is wider than 0.0015 R (a wide skinny
    # triangle between two rings interpolates the vertex normals in a zigzag along a fan, which shows as a saw-tooth highlight)
    gap = prof.get('ring_gap', 0.0015) / detail
    dd_ = [pd[0]]
    for a_, b_ in zip(pd[:-1], pd[1:]):
        n_ = max(1, int(math.ceil((b_ - a_) / gap)))
        dd_ += [a_ + (b_ - a_) * k / n_ for k in range(1, n_ + 1)]
    pd = np.array(dd_); ph = np.interp(pd, *_profile(chamfer, chamfer * math.tan(ang), edge, fil))
    ring_d = sorted(set(np.round(pd, 6)))
    # a window ledge adds two more offset lines (the ledge's foot and top) measured from the window edges only
    log(f'sculpt: area {D.area:.3f} R^2, perimeter {D.length:.1f} R, {len(ring_d)} offset rings {ring_d[0]:.4f}..{ring_d[-1]:.4f}')

    # ---- constraint rings -> PSLG
    verts = []; index = {}; segs = []; vd = []; ring0 = []; vun = {}      # vun: vertex id -> inward unit normal of its ring (exact)
    def vid(p, d):
        k = (int(round(p[0] * 1e6)), int(round(p[1] * 1e6)))
        i = index.get(k)
        if i is None:
            i = len(verts); index[k] = i; verts.append((p[0], p[1])); vd.append(d)
        return i
    # nearest-edge tree
    bpts = []
    for lp in [l for p in _polys(D) for l in _loops(p)]:
        ls = shapely.segmentize(shapely.LinearRing(lp), 0.0007); bpts.append(np.asarray(ls.coords))
    tree = cKDTree(np.vstack(bpts))
    # local clearance (half-width of the metal around a point, capped at 0.02 R) on a fine raster: an offset ring is only kept where the
    # strip is wide enough for it (d <= 0.8 x clearance); the end of a ring at a narrowing strip would otherwise be a saw-tooth of slivers
    gt = 0.002; Nt = int(2.2 / gt); offt = -1.1
    from PIL import Image, ImageDraw
    imt = Image.new('L', (Nt, Nt), 0); drt = ImageDraw.Draw(imt)
    tpt = lambda a: [((x - offt) / gt, (y - offt) / gt) for x, y in a]
    for p in _polys(D):
        drt.polygon(tpt(np.asarray(p.exterior.coords)), fill=255)
        for r_ in p.interiors: drt.polygon(tpt(np.asarray(r_.coords)), fill=0)
    dgt = ndimage.distance_transform_edt(np.array(imt) > 127) * gt
    rt = int(0.02 / gt); yyt, xxt = np.mgrid[-rt:rt + 1, -rt:rt + 1]
    clear = ndimage.maximum_filter(dgt, footprint=(xxt * xxt + yyt * yyt) <= rt * rt)
    def room(xy): return ndimage.map_coordinates(clear, [(xy[:, 1] - offt) / gt - 0.5, (xy[:, 0] - offt) / gt - 0.5], order=1, mode='nearest')

    def add_loop(coords, d):
        ls = shapely.segmentize(shapely.LinearRing(coords), step)
        c = np.asarray(ls.coords)[:-1]
        tg = np.roll(c, -1, axis=0) - np.roll(c, 1, axis=0)
        tg /= np.maximum(np.linalg.norm(tg, axis=1, keepdims=True), 1e-12)
        keep = np.ones(len(c), bool) if d <= 0 else room(c) >= d / 0.8
        if not keep.any(): return []
        runs = []                                       # consecutive kept vertices, cyclic
        if keep.all(): runs = [list(range(len(c)))]; closed = True
        else:
            closed = False; start = int(np.argmin(keep)); order = [(start + k) % len(c) for k in range(len(c))]; cur = []
            for k in order:
                if keep[k]: cur.append(k)
                elif cur: runs.append(cur); cur = []
            if cur: runs.append(cur)
        out = []
        for run in runs:
            ids = []
            for k in run:
                i = vid(c[k], d)
                if not ids or ids[-1] != i: ids.append(i)
                vun[i] = (-tg[k][1], tg[k][0])          # material is on the left (orient() below)
            if closed and len(ids) > 2 and ids[0] == ids[-1]: ids.pop()
            if len(ids) < 4 and not closed: continue
            pairs = zip(ids, ids[1:] + ids[:1]) if closed else zip(ids[:-1], ids[1:])
            for a, b in pairs:
                if a != b: segs.append((a, b))
            out = ids if closed else out + ids
        return out
    for p in _polys(D):
        p = shapely.geometry.polygon.orient(p, 1.0)
        for lp in _loops(p): ring0.append(add_loop(lp, 0.0))
    n0 = len(verts)
    for d in ring_d[1:]:
        G = D.buffer(-d, quad_segs=10)
        for poly in _polys(G):
            # a ring piece that has collapsed to a sliver (a narrow band narrower than twice the offset) would only add saw-tooth: drop it
            if poly.area < 3e-6 or 2 * poly.area / max(poly.length, 1e-9) < 0.003: continue
            poly = shapely.geometry.polygon.orient(poly.simplify(0.00001, preserve_topology=True), 1.0)
            for lp in _loops(poly):
                if len(lp) >= 4 and shapely.LinearRing(lp).length > 0.01: add_loop(lp, d)
    holes = [Polygon(r).representative_point().coords[0] for p in _polys(D) for r in p.interiors]
    # window ledge: distance to the nearest window on a raster (smooth, unlike a nearest-vertex query); extra mesh vertices along the
    # ledge's contour lines (foot and top, and between) so the triangles are small where the height changes
    dh_grid = None
    if ws_depth and holes:
        imh = Image.new('L', (Nt, Nt), 0); drh = ImageDraw.Draw(imh)
        for p in _polys(D):
            for r_ in p.interiors: drh.polygon(tpt(np.asarray(r_.coords)), fill=255)
        dh_grid = ndimage.gaussian_filter(ndimage.distance_transform_edt(np.array(imh) <= 127) * gt, 1.0)
        from skimage import measure
        for lev in np.linspace(ws_w, ws_w + ws_ramp, 5):
            for cn in measure.find_contours(dh_grid, lev):
                xy = np.stack([offt + (cn[:, 1] + 0.5) * gt, offt + (cn[:, 0] + 0.5) * gt], 1)
                if len(xy) < 4: continue
                seg = np.linalg.norm(np.diff(xy, axis=0), axis=1); cs = np.concatenate([[0], np.cumsum(seg)])
                tt = np.arange(0, cs[-1], 0.002); xy = np.stack([np.interp(tt, cs, xy[:, 0]), np.interp(tt, cs, xy[:, 1])], 1)
                ok = shapely.contains_xy(D, xy[:, 0], xy[:, 1]) & (tree.query(xy)[0] > 0.016)
                for pnt in xy[ok]: vid(pnt, -1.0)
    if pad:        # raised hub pad: concentric circles (exact radii) as constraint lines, so its rim is a crisp chamfer
        for k in range(7):
            rr = pad_r - pad_ramp * k / 6; m = int(2 * math.pi * rr / 0.003)
            ids = [vid((rr * math.cos(2 * math.pi * i / m), rr * math.sin(2 * math.pi * i / m)), -1.0) for i in range(m)]
            for a_, b_ in zip(ids, ids[1:] + ids[:1]): segs.append((a_, b_))
    V = np.array(verts)
    A = prof.get('area', 0.00004) / (detail * detail)     # max triangle area (R^2) in the interior
    T = tr.triangulate({'vertices': V, 'segments': np.array(segs), 'holes': np.array(holes) if holes else np.zeros((0, 2))}, f'pYa{A:.7f}')
    FV = T['vertices']; FT3 = T['triangles']
    log(f'sculpt: front {len(FV)} verts {len(FT3)} tris')
    # back: the face outline only, coarse
    bseg = [s for loop in ring0 for s in zip(loop, loop[1:] + loop[:1])]
    TB = tr.triangulate({'vertices': V[:n0], 'segments': np.array(bseg), 'holes': np.array(holes) if holes else np.zeros((0, 2))}, 'pYa0.0008')
    BV = TB['vertices']; BT = TB['triangles']

    # ---- distance to the nearest edge (exact on the rings, KD-tree for the rest), local half-width W
    d = tree.query(FV)[0]
    d[:len(vd)] = np.where(np.array(vd) >= 0, np.array(vd), d[:len(vd)])
    # raster for the local half-width: max of the distance in a ball of the typical spoke width
    g = 0.004; N = int(2.2 / g); off = -1.1
    from PIL import Image, ImageDraw
    im = Image.new('L', (N, N), 0); dr = ImageDraw.Draw(im)
    tp = lambda a: [((x - off) / g, (y - off) / g) for x, y in a]
    for p in _polys(D):
        dr.polygon(tp(np.asarray(p.exterior.coords)), fill=255)
        for r in p.interiors: dr.polygon(tp(np.asarray(r.coords)), fill=0)
    mask = np.array(im) > 127
    dg = ndimage.distance_transform_edt(mask) * g
    rb = int(0.085 / g); yy, xx = np.mgrid[-rb:rb + 1, -rb:rb + 1]
    Wg = ndimage.maximum_filter(dg, footprint=(xx * xx + yy * yy) <= rb * rb)
    Wg = ndimage.gaussian_filter(Wg, 2.0)
    W = ndimage.map_coordinates(Wg, [(FV[:, 1] - off) / g - 0.5, (FV[:, 0] - off) / g - 0.5], order=1, mode='nearest')
    W = np.maximum(W, d)

    # ---- heights: h(d, W, dh) of the distance d to the nearest edge, the local half-width W and the distance dh to the nearest window
    def grid_at(G, xy): return ndimage.map_coordinates(G, [(xy[:, 1] - offt) / gt - 0.5, (xy[:, 0] - offt) / gt - 0.5], order=1, mode='nearest')
    dh = grid_at(dh_grid, FV) if dh_grid is not None else np.full(len(FV), 9.0)
    def hfun(d, W, dh):
        # in a strip narrower than twice the chamfer the profile is compressed (same angles, smaller steps) so it meets itself on the centre
        # line without a sharp ridge; a ridge between mesh vertices would zigzag
        sc_ = np.maximum(1.0, pd[-1] / np.maximum(0.8 * W, 1e-4))
        h = np.interp(d * sc_, pd, ph) / sc_
        w = np.clip((d - chamfer) / np.maximum(W - chamfer, 1e-4), 0, 1)
        fade = np.clip((W - chamfer) / 0.02, 0, 1)              # no crown where the spoke is as thin as its chamfers
        if crown >= 0: h = h + crown * (1 - (1 - w) ** 2) * fade
        else: h = h + crown * (w * w * (3 - 2 * w)) * fade
        if ch_depth:
            spoke = 1 - np.clip((W - 0.05) / 0.012, 0, 1)        # spokes (half-width < 0.05 R) only, not the hub
            inner = np.clip((ch_w / 2 - (W - d)) / (1.2 * MM), 0, 1)   # W - d = distance from the spoke's centre line
            h = h - ch_depth * inner * inner * (3 - 2 * inner) * spoke * (d > chamfer)
        if ws_depth:
            sw = np.clip((ws_w + ws_ramp - dh) / ws_ramp, 0, 1)
            h = h - ws_depth * sw * sw * (3 - 2 * sw)
        return h
    h = hfun(d, W, dh)
    r = np.hypot(FV[:, 0], FV[:, 1])
    def padfun(r_):
        t = np.clip((pad_r - r_) / pad_ramp, 0, 1); return pad * t * t * (3 - 2 * t)
    if pad: h = h + padfun(r)
    sink = np.array([dish_sink(x) for x in r])
    fx = FF - sink + h

    # ---- analytic vertex normals (the triangulation is irregular: normals averaged from its triangles would be noisy along the edge lines)
    eps = 2e-5
    hd = (hfun(d + eps, W, dh) - hfun(np.maximum(d - eps, 0), W, dh)) / (d + eps - np.maximum(d - eps, 0))
    hdh = (hfun(d, W, dh + eps) - hfun(d, W, np.maximum(dh - eps, 0))) / (dh + eps - np.maximum(dh - eps, 0)) if ws_depth else np.zeros(len(FV))
    # direction of increasing d: exact inward ring normal on ring vertices, from the nearest edge point elsewhere
    q = tree.query(FV)[1]; uq = FV - tree.data[q]; nq = np.linalg.norm(uq, axis=1, keepdims=True)
    uq = np.where(nq > 1e-9, uq / np.maximum(nq, 1e-9), 0.0)
    u = uq.copy()
    for i, nrm in vun.items(): u[i] = nrm
    uh = np.zeros_like(FV)
    if dh_grid is not None:
        gy, gx = np.gradient(dh_grid)
        uh = np.stack([grid_at(gx, FV), grid_at(gy, FV)], 1); uh /= np.maximum(np.linalg.norm(uh, axis=1, keepdims=True), 1e-9)
    ds = 1e-4
    sink_r = (np.array([dish_sink(x + ds) for x in r]) - np.array([dish_sink(max(x - ds, 0)) for x in r])) / (2 * ds)
    rhat = FV / np.maximum(r[:, None], 1e-9)
    pad_slope = (padfun(r + 1e-4) - padfun(np.maximum(r - 1e-4, 0))) / 2e-4 if pad else np.zeros(len(FV))
    g = pad_slope[:, None] * (FV / np.maximum(r[:, None], 1e-9)) + hd[:, None] * u + hdh[:, None] * uh - sink_r[:, None] * rhat          # gradient of the front height in the traced plane (px, py)
    nF_ = np.stack([np.ones(len(FV)), -g[:, 1], g[:, 0]], 1)                  # wheel frame (x, y, z) = (height, py, -px): n = (1, -dF/dy, -dF/dz)
    nF_ /= np.linalg.norm(nF_, axis=1, keepdims=True)

    rB = np.hypot(BV[:, 0], BV[:, 1])
    t = np.clip((rB - hub_r) / (0.9 - hub_r), 0, 1); t = t * t * (3 - 2 * t)
    bx = FF - FT * (1 - (1 - taper) * t) - np.array([dish_sink(x) for x in rB])

    # ---- assemble: front surface, back surface, wall; px,py (traced plane) -> wheel (y, z) = (py, -px)
    # the wall has its own bottom vertices (same positions as the back surface's edge) so the back surface keeps flat normals and the wall
    # outward ones: one shared normal at that corner makes the back of every spoke look scalloped
    nF = len(FV); nB = len(BV)
    vf = np.stack([fx, FV[:, 1], -FV[:, 0]], 1); vb = np.stack([bx, BV[:, 1], -BV[:, 0]], 1)
    wall_ids = sorted({i for loop in ring0 for i in loop}); wall_row = {i: k for k, i in enumerate(wall_ids)}
    vw = vb[wall_ids]
    verts3 = np.vstack([vf, vb, vw])
    base_w = nF + nB
    # winding: front counter-clockwise seen from +x (normal +x); back reversed (normal -x); wall quads outward
    faces = [tuple(map(int, t_)) for t_ in FT3] + [tuple(int(nF + i) for i in t_[::-1]) for t_ in BT]
    for loop in ring0:
        for a, b in zip(loop, loop[1:] + loop[:1]): faces.append((base_w + wall_row[a], base_w + wall_row[b], b, a))
    # back normals: the back surface's own slope (the dish and the taper), flipped
    eps_b = 1e-4
    def bfun(r_):
        t_ = np.clip((r_ - hub_r) / (0.9 - hub_r), 0, 1); t_ = t_ * t_ * (3 - 2 * t_)
        return -FT * (1 - (1 - taper) * t_) - np.array([dish_sink(x) for x in r_])
    bs = (bfun(rB + eps_b) - bfun(np.maximum(rB - eps_b, 0))) / (2 * eps_b)
    gb = bs[:, None] * (BV / np.maximum(rB[:, None], 1e-9))
    nb = -np.stack([np.ones(nB), -gb[:, 1], gb[:, 0]], 1); nb /= np.linalg.norm(nb, axis=1, keepdims=True)
    nw = np.zeros((len(wall_ids), 3))
    for k, i in enumerate(wall_ids):
        ox, oy = -u[i]; nw[k] = (0.0, oy, -ox)                                  # outward in the traced plane -> wheel frame
    normals = np.vstack([nF_, nb, nw])
    info = dict(front_tris=len(FT3), back_tris=len(BT), d_max=float(d.max()))
    return verts3, faces, info, normals
