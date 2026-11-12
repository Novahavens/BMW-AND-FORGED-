#!/usr/bin/env python3
"""FORGEDSA plates: client for the cloud render service (cloud/app.py on Modal). Standard library only.

    client.py health
    client.py sync                                   upload PLATES_SRC (studio, cars, rims); skips unchanged files
    client.py render [--gpu auto] [--name N] [--entry dev/x.py] -- <script arguments>
                                                     run render.py (or another script in scripts/plates) on a
                                                     cloud worker; waits, then downloads what it wrote to PLATES_OUT
    client.py batch --tasks tasks.json --shards 8 [--gpu auto] [--name N] [--preset final]
                                                     one job per shard; returns at once (then: wait, fetch)
    client.py wait NAME [--minutes 60]               poll until every job of that run has ended
    client.py status [NAME]
    client.py fetch NAME [--to DIR] [--match '*.png']
    client.py cost                                   what the runs have cost so far (estimate) against the budget
    client.py rm NAME                                delete that run's outputs from the cloud volume

The service URL and key live in ~/.plates_cloud.json (written by cloud/local_token.py); neither is in the
repo. Spending is tracked in ~/.plates_cloud_state.json: a submit is refused when the estimate for what has
run, what is running and what is asked for would pass the budget (PLATES_BUDGET_USD, default 24 of Modal's
30 dollars of free monthly credit). The ledger is an estimate; Modal's dashboard is the bill.
"""
import argparse
import contextlib
import fcntl
import fnmatch
import hashlib
import io
import json
import os
import re
import ssl
import sys
import tarfile
import tempfile
import time
import urllib.error
import urllib.parse
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
PLATES_DIR = os.path.dirname(HERE)
SRC = os.environ.get("PLATES_SRC", "/home/claude/plates_src")
OUT = os.environ.get("PLATES_OUT", "/home/claude/plates_out")
CONF = os.path.expanduser("~/.plates_cloud.json")
STATE = os.path.expanduser("~/.plates_cloud_state.json")
BUDGET = float(os.environ.get("PLATES_BUDGET_USD", "24"))
CHUNK = 8 * 1024 * 1024

# Modal list prices per second (modal.com/pricing, checked 2026-11-11): GPU + 4 cores + 16 GiB for the GPU
# workers, 16 cores + 32 GiB for the CPU worker, as reserved in app.py.
_CORE, _GIB = 0.0000131, 0.00000222
RATE = {
    "t4": 0.000164 + 4 * _CORE + 16 * _GIB,
    "l4": 0.000222 + 4 * _CORE + 16 * _GIB,
    "l40s": 0.000542 + 4 * _CORE + 16 * _GIB,
    "cpu": 16 * _CORE + 32 * _GIB,
}
IDLE_S = {"t4": 120, "l4": 120, "l40s": 60, "cpu": 60}  # a container is billed until it scales down
MARGIN = 1.15


def fail(msg):
    print(f"plates-cloud: {msg}", file=sys.stderr)
    sys.exit(1)


def conf():
    try:
        with open(CONF) as fh:
            c = json.load(fh)
    except (OSError, ValueError) as e:
        fail(f"cannot read {CONF} ({e}); run cloud/local_token.py first")
    if not c.get("url"):
        fail(f"no service URL in {CONF}; run cloud/local_token.py --url https://...modal.run")
    if len(c.get("token", "")) < 32:
        fail(f"no service key in {CONF}; run cloud/local_token.py")
    return c


@contextlib.contextmanager
def state():
    """Read-modify-write of the state file under a lock (several agents may use the client at once)."""
    try:
        fd = os.open(STATE + ".lock", os.O_CREAT | os.O_RDWR, 0o600)
    except OSError as e:
        fail(f"cannot open the lock file {STATE}.lock: {e}")
    try:
        try:
            fcntl.flock(fd, fcntl.LOCK_EX)
        except OSError as e:
            fail(f"cannot lock {STATE}.lock: {e}")
        try:
            with open(STATE) as fh:
                st = json.load(fh)
        except FileNotFoundError:
            st = {}
        except (OSError, ValueError) as e:
            fail(f"state file {STATE} is unreadable ({e}); move it aside to start a new ledger")
        st.setdefault("synced", {})
        st.setdefault("bundles", [])
        st.setdefault("runs", {})
        yield st
        tmp = STATE + ".tmp"
        try:
            with open(tmp, "w") as fh:
                json.dump(st, fh, indent=1)
            os.chmod(tmp, 0o600)
            os.replace(tmp, STATE)
        except (OSError, TypeError, ValueError) as e:
            # The ledger is what keeps spending under the budget: never carry on with it unsaved.
            fail(f"could not save the state file {STATE} ({e}); the spending ledger was not updated. "
                 f"Fix the cause before submitting anything else.")
    finally:
        os.close(fd)


def _ssl():
    ctx = ssl.create_default_context()
    for var in ("SSL_CERT_FILE", "REQUESTS_CA_BUNDLE"):
        p = os.environ.get(var)
        if p and os.path.isfile(p):
            ctx.load_verify_locations(p)
            break
    return ctx


def call(method, route, params=None, body=None, json_body=None, to_file=None, timeout=600, tries=4):
    """One request to the service. Returns parsed JSON, or the path written when to_file is given."""
    c = conf()
    url = c["url"].rstrip("/") + route + ("?" + urllib.parse.urlencode(params) if params else "")
    headers = {"Authorization": f"Bearer {c['token']}"}
    data = body
    if json_body is not None:
        data = json.dumps(json_body).encode()
        headers["Content-Type"] = "application/json"
    elif body is not None:
        headers["Content-Type"] = "application/octet-stream"
    last = ""
    for attempt in range(tries):
        req = urllib.request.Request(url, data=data, method=method, headers=headers)
        try:
            with urllib.request.urlopen(req, timeout=timeout, context=_ssl()) as r:
                if to_file:
                    with open(to_file, "wb") as fh:
                        while True:
                            block = r.read(1 << 20)
                            if not block:
                                break
                            fh.write(block)
                    return to_file
                return json.loads(r.read().decode() or "null")
        except urllib.error.HTTPError as e:
            text = e.read().decode(errors="replace")[:600]
            if e.code in (401, 400, 404):
                fail(f"{method} {route} -> {e.code}: {text}")
            last = f"{e.code}: {text}"
        except (urllib.error.URLError, TimeoutError, ConnectionError, ssl.SSLError, OSError, ValueError) as e:
            last = f"{type(e).__name__}: {e}"
        # An upload that may have been written is not repeated blindly: only idempotent calls retry.
        if method == "POST" and route in ("/submit",):
            break
        time.sleep(3 * (attempt + 1))
    fail(f"{method} {route} failed: {last}")


# --------------------------------------------------------------------------------------------- commands

def cmd_health(a):
    t0 = time.time()
    r = call("GET", "/health", timeout=120)
    print(f"ok version {r.get('version')} gpus {','.join(r.get('gpus', []))} ({time.time() - t0:.1f}s)")


def cmd_sync(a):
    if not os.path.isdir(SRC):
        fail(f"source folder not found: {SRC}")
    remote = {f["path"]: f["size"] for f in call("GET", "/ls", {"path": "src"})["files"]}
    sent = skipped = 0
    for d, _, names in os.walk(SRC):
        for n in sorted(names):
            full = os.path.join(d, n)
            rel = "src/" + os.path.relpath(full, SRC).replace(os.sep, "/")
            try:
                size, mtime = os.path.getsize(full), int(os.path.getmtime(full))
            except OSError as e:
                fail(f"cannot stat {full}: {e}")
            with state() as st:
                known = st["synced"].get(rel)
            if remote.get(rel) == size and known == [size, mtime] and not a.all:
                skipped += 1
                continue
            try:
                with open(full, "rb") as fh:
                    first = True
                    while True:
                        block = fh.read(CHUNK)
                        if not block and not first:
                            break
                        call("POST", "/put", {"path": rel, "append": 0 if first else 1}, body=block, tries=1)
                        first = False
                        if len(block) < CHUNK:
                            break
            except OSError as e:
                fail(f"cannot read {full}: {e}")
            got = {f["path"]: f["size"] for f in call("GET", "/ls", {"path": rel.rsplit("/", 1)[0]})["files"]}.get(rel)
            if got != size:
                fail(f"{rel}: uploaded size {got} does not match local size {size}")
            with state() as st:
                st["synced"][rel] = [size, mtime]
            sent += 1
            print(f"sent {rel} ({size / 1e6:.1f} MB)", flush=True)
    print(f"sync done: {sent} sent, {skipped} unchanged")


def make_bundle(extra=None):
    """tar.gz of scripts/plates (no cloud/, no caches) plus optional extra files; id = hash of the contents."""
    files = []
    for d, dirs, names in os.walk(PLATES_DIR):
        dirs[:] = sorted(x for x in dirs if x not in ("__pycache__", "cloud", "node_modules"))
        for n in sorted(names):
            if n.endswith((".pyc", ".log")):
                continue
            full = os.path.join(d, n)
            files.append((os.path.relpath(full, PLATES_DIR).replace(os.sep, "/"), full))
    for name, full in (extra or {}).items():
        files.append((name, full))
    buf = io.BytesIO()
    h = hashlib.sha256()
    try:
        with tarfile.open(fileobj=buf, mode="w:gz", compresslevel=6) as tf:
            for name, full in sorted(files):
                with open(full, "rb") as fh:
                    data = fh.read()
                h.update(name.encode() + b"\0" + data)
                info = tarfile.TarInfo(name)
                info.size, info.mode, info.mtime = len(data), 0o644, 0
                tf.addfile(info, io.BytesIO(data))
    except OSError as e:
        fail(f"cannot pack the render code: {e}")
    return h.hexdigest()[:20], buf.getvalue()


def upload_bundle(extra=None):
    bid, data = make_bundle(extra)
    with state() as st:
        have = bid in st["bundles"]
    if not have:
        r = call("POST", "/bundle", {"id": bid}, body=data, tries=1)
        with state() as st:
            st["bundles"] = (st["bundles"] + [bid])[-200:]
        print(f"code bundle {bid}: {r.get('files')} files, {len(data) / 1e3:.0f} kB", flush=True)
    return bid


def spent_and_reserved(st):
    spent = reserved = 0.0
    for run in st["runs"].values():
        for j in run["jobs"]:
            if j.get("status") in ("done", "error"):
                spent += j.get("usd", 0.0)
            else:
                reserved += j.get("est_usd", 0.0)
    return spent, reserved


def job_cost(gpu, seconds):
    return (seconds + IDLE_S[gpu]) * RATE[gpu] * MARGIN


def pick_gpu(want):
    """'auto' takes the cheapest GPU the service has (L4, then T4, then L40S) and the CPU worker if it has none."""
    have = call("GET", "/health", timeout=120).get("gpus", [])
    if want == "auto":
        for g in ("l4", "t4", "l40s", "cpu"):
            if g in have:
                return g
        fail(f"the service reports no workers: {have}")
    if want not in have:
        fail(f"the service has no '{want}' worker (it has: {', '.join(have)}); use --gpu auto")
    return want


def submit(name, gpu, jobs, est_minutes):
    gpu = pick_gpu(gpu)
    if gpu not in RATE:
        fail(f"--gpu must be one of {sorted(RATE)}")
    if not re.fullmatch(r"[A-Za-z0-9_.-]{1,60}", name):
        fail("run name may hold letters, digits, dot, dash and underscore only")
    est = job_cost(gpu, est_minutes * 60)
    with state() as st:
        if name in st["runs"]:
            fail(f"a run named {name} exists already; pick another --name")
        spent, reserved = spent_and_reserved(st)
        need = est * len(jobs)
        if spent + reserved + need > BUDGET:
            fail(f"budget stop: spent ${spent:.2f} + running ${reserved:.2f} + this ${need:.2f} "
                 f"would pass ${BUDGET:.2f}. Nothing was submitted.")
        # Reserve before the request, so two clients cannot both pass the check.
        st["runs"][name] = {"gpu": gpu, "submitted": time.time(),
                            "jobs": [{"id": j["id"], "status": "submitting", "est_usd": est} for j in jobs]}
    r = call("POST", "/submit", json_body={"gpu": gpu, "jobs": jobs}, tries=1)
    ids = {c["id"]: c["call_id"] for c in r.get("calls", [])}
    with state() as st:
        for j in st["runs"][name]["jobs"]:
            j["call_id"] = ids.get(j["id"], "")
            j["status"] = "pending" if j["call_id"] else "error"
    print(f"submitted {len(ids)} job(s) as run {name} on {gpu} (estimate ${est * len(jobs):.2f})", flush=True)


def poll(name):
    """Refresh one run from the service. Returns (pending, done, failed)."""
    with state() as st:
        run = st["runs"].get(name)
        if not run:
            fail(f"no run named {name}; see: client.py status")
        ask = [j["call_id"] for j in run["jobs"] if j.get("status") == "pending" and j.get("call_id")]
    res = call("POST", "/poll", json_body={"call_ids": ask}) if ask else {}
    with state() as st:
        run = st["runs"][name]
        for j in run["jobs"]:
            got = res.get(j.get("call_id") or "")
            if not got or got["status"] == "pending":
                continue
            if got["status"] == "done":
                rr = got["result"]
                j.update(status="done", code=rr.get("code"), seconds=rr.get("seconds", 0),
                         usd=round(job_cost(run["gpu"], rr.get("seconds", 0)), 4), log_tail=rr.get("log_tail", "")[-3000:])
            else:
                secs = time.time() - run["submitted"]
                j.update(status="error", code=-1, seconds=round(secs, 1), usd=round(job_cost(run["gpu"], secs), 4),
                         log_tail=got.get("error", ""))
        jobs = run["jobs"]
        return (sum(j["status"] == "pending" for j in jobs),
                sum(j["status"] == "done" and j.get("code") == 0 for j in jobs),
                sum(j["status"] in ("error",) or (j["status"] == "done" and j.get("code") != 0) for j in jobs))


def wait(name, minutes):
    t_end = time.time() + minutes * 60
    last = None
    while True:
        now = poll(name)
        if now != last:
            print(f"[{time.strftime('%H:%M:%S')}] {name}: {now[0]} running, {now[1]} done, {now[2]} failed", flush=True)
            last = now
        if now[0] == 0:
            return now
        if time.time() > t_end:
            fail(f"{name}: still {now[0]} job(s) running after {minutes} min; run 'client.py wait {name}' again")
        time.sleep(8)


def fetch(name, to, match="*"):
    with state() as st:
        run = st["runs"].get(name)
        if not run:
            fail(f"no run named {name}")
        ids = [j["id"] for j in run["jobs"]]
    try:
        os.makedirs(to, exist_ok=True)
    except OSError as e:
        fail(f"cannot create {to}: {e}")
    count = 0
    for jid in ids:
        fd, tmp = tempfile.mkstemp(suffix=".tar")
        os.close(fd)
        try:
            call("GET", "/tar", {"path": f"out/{jid}", "match": match}, to_file=tmp, timeout=1800)
            with tarfile.open(tmp) as tf:
                for m in tf.getmembers():
                    target = os.path.normpath(os.path.join(to, m.name))
                    if not target.startswith(os.path.normpath(to) + os.sep) or not m.isfile():
                        continue
                    os.makedirs(os.path.dirname(target), exist_ok=True)
                    src = tf.extractfile(m)
                    with open(target, "wb") as fh:
                        fh.write(src.read())
                    count += 1
        except (tarfile.TarError, OSError) as e:
            fail(f"could not unpack the results of {jid}: {e}")
        finally:
            with contextlib.suppress(OSError):
                os.remove(tmp)
    print(f"fetched {count} file(s) into {to}")
    return count


def show_failures(name):
    with state() as st:
        for j in st["runs"][name]["jobs"]:
            if j["status"] == "error" or j.get("code") not in (0, None):
                print(f"--- {j['id']} failed (code {j.get('code')}) ---\n{j.get('log_tail', '')[-2500:]}")


def cmd_render(a):
    args = [x for x in a.args if x != "--"]
    if not args:
        fail("give the render.py arguments after --")
    name = a.name or f"r{int(time.time())}-{os.getpid() % 1000}"
    entry = os.path.normpath(a.entry).replace(os.sep, "/")
    if entry.startswith(("..", "/", "cloud/")) or not os.path.isfile(os.path.join(PLATES_DIR, entry)):
        fail(f"--entry must be a script inside scripts/plates (not cloud/): {a.entry}")
    bid = upload_bundle()
    submit(name, a.gpu, [{"id": name, "bundle": bid, "entry": entry, "args": args, "timeout": a.timeout}],
           a.est_minutes)
    _, done, failed = wait(name, a.minutes)
    to = a.to or os.path.join(OUT, "cloud", name)
    fetch(name, to)
    if failed:
        show_failures(name)
        fail(f"{name}: the render failed; its log is in {to}/job.log")
    print(f"done: {to}")


def cmd_batch(a):
    try:
        with open(a.tasks) as fh:
            n_tasks = len(json.load(fh))
    except (OSError, ValueError) as e:
        fail(f"cannot read the task list {a.tasks}: {e}")
    name = a.name or f"b{int(time.time())}"
    shards = max(1, min(a.shards, n_tasks))
    bid = upload_bundle({"_tasks.json": a.tasks})
    jobs = []
    for i in range(shards):
        args = ["--tasks", "_tasks.json", "--shard", f"{i}/{shards}", "--preset", a.preset]
        if a.extra:
            args += a.extra.split()
        jobs.append({"id": f"{name}-{i:02d}", "bundle": bid, "entry": "render.py", "args": args, "timeout": a.timeout})
    per_job = a.est_minutes or max(3.0, (n_tasks / shards) * a.minutes_per_task + 2.0)
    submit(name, a.gpu, jobs, per_job)
    print(f"{n_tasks} tasks in {shards} shard(s). Next: client.py wait {name} ; client.py fetch {name}")


def cmd_wait(a):
    _, done, failed = wait(a.name, a.minutes)
    if failed:
        show_failures(a.name)
        sys.exit(2)


def cmd_status(a):
    names = [a.name] if a.name else None
    with state() as st:
        names = names or sorted(st["runs"], key=lambda n: st["runs"][n]["submitted"])[-15:]
    for n in names:
        p, d, f = poll(n)
        with state() as st:
            run = st["runs"][n]
            usd = sum(j.get("usd", 0) for j in run["jobs"])
        print(f"{n:28s} {run['gpu']:5s} running {p:3d} done {d:3d} failed {f:3d}  ${usd:.2f}")


def cmd_fetch(a):
    fetch(a.name, a.to or OUT, a.match)


def cmd_cost(a):
    with state() as st:
        spent, reserved = spent_and_reserved(st)
        secs = {}
        for run in st["runs"].values():
            for j in run["jobs"]:
                secs[run["gpu"]] = secs.get(run["gpu"], 0) + j.get("seconds", 0)
    for g, s in sorted(secs.items()):
        print(f"{g:5s} {s / 60:7.1f} min")
    print(f"spent about ${spent:.2f}, running about ${reserved:.2f}, budget ${BUDGET:.2f} "
          f"(left ${BUDGET - spent - reserved:.2f}). Estimate only; Modal's dashboard is the bill.")


def cmd_rm(a):
    with state() as st:
        run = st["runs"].get(a.name)
        if not run:
            fail(f"no run named {a.name}")
        ids = [j["id"] for j in run["jobs"]]
    for jid in ids:
        call("POST", "/rm", {"path": f"out/{jid}"})
    print(f"removed the cloud outputs of {a.name} ({len(ids)} job(s)); the ledger entry is kept")


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)
    sub.add_parser("health").set_defaults(fn=cmd_health)
    p = sub.add_parser("sync")
    p.add_argument("--all", action="store_true", help="upload every file again")
    p.set_defaults(fn=cmd_sync)
    p = sub.add_parser("render")
    p.add_argument("--gpu", default="auto", help="auto, l4, t4, l40s or cpu")
    p.add_argument("--name", default="")
    p.add_argument("--to", default="", help="download folder (default PLATES_OUT/cloud/<name>)")
    p.add_argument("--entry", default="render.py",
                   help="script to run, relative to scripts/plates; it must write under $PLATES_OUT")
    p.add_argument("--minutes", type=float, default=45, help="how long to wait")
    p.add_argument("--est-minutes", type=float, default=6, help="expected run time, for the budget check")
    p.add_argument("--timeout", type=int, default=3600)
    p.add_argument("args", nargs=argparse.REMAINDER)
    p.set_defaults(fn=cmd_render)
    p = sub.add_parser("batch")
    p.add_argument("--tasks", required=True)
    p.add_argument("--shards", type=int, default=8)
    p.add_argument("--gpu", default="auto", help="auto, l4, t4, l40s or cpu")
    p.add_argument("--name", default="")
    p.add_argument("--preset", default="final")
    p.add_argument("--extra", default="", help="more render.py arguments, e.g. '--skip-existing'")
    p.add_argument("--minutes-per-task", type=float, default=1.5, help="for the budget check")
    p.add_argument("--est-minutes", type=float, default=0, help="expected minutes per shard (overrides)")
    p.add_argument("--timeout", type=int, default=9000)
    p.set_defaults(fn=cmd_batch)
    p = sub.add_parser("wait")
    p.add_argument("name")
    p.add_argument("--minutes", type=float, default=60)
    p.set_defaults(fn=cmd_wait)
    p = sub.add_parser("status")
    p.add_argument("name", nargs="?", default="")
    p.set_defaults(fn=cmd_status)
    p = sub.add_parser("fetch")
    p.add_argument("name")
    p.add_argument("--to", default="")
    p.add_argument("--match", default="*")
    p.set_defaults(fn=cmd_fetch)
    sub.add_parser("cost").set_defaults(fn=cmd_cost)
    p = sub.add_parser("rm")
    p.add_argument("name")
    p.set_defaults(fn=cmd_rm)
    a = ap.parse_args()
    a.fn(a)


if __name__ == "__main__":
    main()
