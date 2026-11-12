"""FORGEDSA plates: the cloud render service (Modal).

One deploy gives a small HTTPS API in front of GPU workers. The workers run whatever plate code was last
uploaded, so look-dev changes need no redeploy.

    POST /put?path=src/...        upload a source file (studio / car .blend, rim .glb) to the volume
    POST /bundle?id=<sha>         upload a tar.gz of scripts/plates (the render code)
    POST /submit                  {"gpu": "l40s", "jobs": [{"id", "bundle", "entry", "args", "timeout"}]}
    POST /poll                    {"call_ids": [...]} -> result, "pending" or "error" per call
    GET  /ls?path=out/<job>       list output files
    GET  /get?path=out/<job>/f    download one file
    GET  /tar?path=out/<job>      download a folder as one tar (optional &match=*.png)
    POST /rm?path=out/<job>       delete outputs
    GET  /health

Every route needs "Authorization: Bearer <PLATES_API_TOKEN>". The token is set at deploy time and is
never stored in the repo.

Deploy:  PLATES_API_TOKEN=... modal deploy scripts/plates/cloud/app.py

PLATES_GPUS (default "t4,l4,l40s") lists the GPU workers to create. Modal refuses GPU functions on an
account without a payment method, so the deploy workflow falls back to PLATES_GPUS="" (CPU worker only).
"""
import os
import sys
import time

import modal

VERSION = "2026-11-11.3"
APP_NAME = "forgedsa-plates"
VOL = "/vol"

app = modal.App(APP_NAME)
vol = modal.Volume.from_name(APP_NAME, create_if_missing=True)

_token = os.environ.get("PLATES_API_TOKEN", "")
if modal.is_local() and len(_token) < 32:
    raise SystemExit("PLATES_API_TOKEN (32+ characters) must be set when deploying")
api_secret = modal.Secret.from_dict({"PLATES_API_TOKEN": _token})

# The same list must be seen at deploy time and inside every container, so it is baked into the images.
GPUS = [g for g in os.environ.get("PLATES_GPUS", "t4,l4,l40s").lower().split(",") if g]
_gpu_env = {"PLATES_GPUS": ",".join(GPUS)}

render_image = (
    modal.Image.debian_slim(python_version="3.13")
    .apt_install("xorg", "libxkbcommon0", "libegl1", "libgl1", "libsm6", "libgomp1")
    .pip_install("bpy==5.2.4", "numpy", "pillow")
    .env(_gpu_env)
)
web_image = modal.Image.debian_slim(python_version="3.13").pip_install("fastapi[standard]").env(_gpu_env)

WORKER = dict(image=render_image, volumes={VOL: vol}, timeout=3 * 3600, max_containers=10, cpu=4.0, memory=16384)


def _reload():
    try:
        vol.reload()
    except Exception as e:  # open files block a reload; the caller carries on with what is mounted
        print(f"volume reload skipped: {e}", flush=True)


def _commit():
    try:
        vol.commit()
    except Exception as e:
        print(f"volume commit failed: {e}", flush=True)


def _run_job(job: dict, tag: str) -> dict:
    """Run one uploaded script with bpy. Outputs go to /vol/out/<job id>/ and are committed as it runs."""
    import subprocess
    import threading

    t0 = time.time()
    _reload()
    job_id = str(job["id"])
    code_dir = f"{VOL}/code/{job['bundle']}"
    entry = os.path.join(code_dir, str(job["entry"]))
    out_dir = f"{VOL}/out/{job_id}"
    if not os.path.isfile(entry):
        return {"id": job_id, "code": 2, "seconds": 0, "gpu": tag, "log_tail": f"entry not found: {entry}"}
    try:
        os.makedirs(out_dir, exist_ok=True)
    except OSError as e:
        return {"id": job_id, "code": 3, "seconds": 0, "gpu": tag, "log_tail": f"cannot create {out_dir}: {e}"}
    env = dict(os.environ, PLATES_SRC=f"{VOL}/src", PLATES_OUT=out_dir, PLATES_CLOUD="1", PYTHONUNBUFFERED="1",
               PLATES_DEVICE="CPU" if tag == "cpu" else "GPU")
    log_path = f"{out_dir}/job.log"
    stop = threading.Event()

    def keep_committing():
        while not stop.wait(40):
            _commit()

    threading.Thread(target=keep_committing, daemon=True).start()
    code = -1
    try:
        with open(log_path, "w") as lf:
            proc = subprocess.run([sys.executable, "-I", entry, *[str(a) for a in job.get("args", [])]],
                                  cwd=code_dir, env=env, stdout=lf, stderr=subprocess.STDOUT,
                                  timeout=int(job.get("timeout", 9000)))
        code = proc.returncode
    except subprocess.TimeoutExpired:
        code = -9
    except OSError as e:
        code = -2
        start_error = f"could not start the job: {e}"
        try:
            with open(log_path, "a") as lf:
                lf.write(f"\n{start_error}\n")
        except OSError:
            print(start_error, flush=True)  # the log itself is unwritable; keep the reason in the container log
    finally:
        stop.set()
        _commit()
    try:
        with open(log_path, errors="replace") as lf:
            tail = lf.read()[-6000:]
    except OSError as e:
        tail = f"log unreadable: {e}"
    return {"id": job_id, "code": code, "seconds": round(time.time() - t0, 1), "gpu": tag, "log_tail": tail}


if "t4" in GPUS:
    @app.function(gpu="T4", scaledown_window=120, **WORKER)
    def run_t4(job: dict) -> dict:
        return _run_job(job, "t4")

if "l4" in GPUS:
    @app.function(gpu="L4", scaledown_window=120, **WORKER)
    def run_l4(job: dict) -> dict:
        return _run_job(job, "l4")

if "l40s" in GPUS:
    @app.function(gpu="L40S", scaledown_window=60, **WORKER)
    def run_l40s(job: dict) -> dict:
        return _run_job(job, "l40s")


@app.function(image=render_image, volumes={VOL: vol}, timeout=3 * 3600, max_containers=10, cpu=16.0, memory=32768,
              scaledown_window=60)
def run_cpu(job: dict) -> dict:
    return _run_job(job, "cpu")


@app.function(image=web_image, volumes={VOL: vol}, secrets=[api_secret], timeout=900, scaledown_window=300,
              max_containers=1)
@modal.concurrent(max_inputs=64)
@modal.asgi_app(label="forgedsa-plates-api")
def api():
    import fnmatch
    import hmac
    import io
    import shutil
    import tarfile
    import tempfile

    from fastapi import FastAPI, HTTPException, Request
    from fastapi.responses import FileResponse

    web = FastAPI(title="forgedsa-plates", docs_url=None, redoc_url=None, openapi_url=None)
    token = os.environ.get("PLATES_API_TOKEN", "")
    runners = {name: fn for name in ("t4", "l4", "l40s", "cpu") if (fn := globals().get(f"run_{name}"))}

    def auth(request: Request):
        given = request.headers.get("authorization", "")
        if len(token) < 32 or not hmac.compare_digest(given, f"Bearer {token}"):
            raise HTTPException(401, "missing or wrong token")

    async def commit_volume():
        try:
            await vol.commit.aio()
        except Exception as e:  # Modal raises several types here; the caller needs one clear answer
            raise HTTPException(500, f"the change was made on the worker but the volume commit failed: {type(e).__name__}: {e}")

    async def json_body(request: Request) -> dict:
        try:
            body = await request.json()
        except ValueError as e:
            raise HTTPException(400, f"the request body is not JSON: {e}")
        if not isinstance(body, dict):
            raise HTTPException(400, "the request body must be a JSON object")
        return body

    def safe(path: str, roots=("src", "code", "out")) -> str:
        p = os.path.normpath("/" + path).lstrip("/")
        if not p or p.split("/")[0] not in roots:
            raise HTTPException(400, f"path must start with one of {roots}")
        return f"{VOL}/{p}"

    @web.get("/health")
    def health(request: Request):
        auth(request)
        return {"ok": True, "version": VERSION, "gpus": sorted(runners)}

    @web.post("/put")
    async def put(request: Request, path: str, append: int = 0):
        auth(request)
        dst = safe(path, ("src", "code"))
        data = await request.body()
        try:
            os.makedirs(os.path.dirname(dst), exist_ok=True)
            with open(dst, "ab" if append else "wb") as fh:
                fh.write(data)
            size = os.path.getsize(dst)
        except OSError as e:
            raise HTTPException(500, f"could not write {path}: {e}")
        await commit_volume()
        return {"path": path, "size": size}

    @web.post("/bundle")
    async def bundle(request: Request, id: str):
        auth(request)
        if not id.isalnum() or len(id) > 64:
            raise HTTPException(400, "bundle id must be alphanumeric")
        dst = safe(f"code/{id}", ("code",))
        data = await request.body()
        try:
            with tarfile.open(fileobj=io.BytesIO(data), mode="r:gz") as tf:
                for m in tf.getmembers():
                    target = os.path.normpath(os.path.join(dst, m.name))
                    if not (target == dst or target.startswith(dst + os.sep)) or m.issym() or m.islnk():
                        raise HTTPException(400, f"unsafe path in bundle: {m.name}")
                shutil.rmtree(dst, ignore_errors=True)
                os.makedirs(dst, exist_ok=True)
                tf.extractall(dst, filter="data")
        except (tarfile.TarError, OSError) as e:
            raise HTTPException(400, f"bad bundle: {e}")
        await commit_volume()
        return {"bundle": id, "files": sum(len(f) for _, _, f in os.walk(dst))}

    @web.post("/submit")
    async def submit(request: Request):
        auth(request)
        body = await json_body(request)
        fn = runners.get(str(body.get("gpu", "")).lower())
        if fn is None:
            raise HTTPException(400, f"gpu must be one of {sorted(runners)}")
        calls = []
        for job in body.get("jobs", []):
            if not all(k in job for k in ("id", "bundle", "entry")):
                raise HTTPException(400, "each job needs id, bundle and entry")
            try:
                call = await fn.spawn.aio(job)
            except Exception as e:  # quota, missing payment method, Modal outage
                raise HTTPException(502, f"could not start job {job['id']} ({len(calls)} started before it): "
                                         f"{type(e).__name__}: {e}"[:1500])
            calls.append({"id": job["id"], "call_id": call.object_id})
        return {"calls": calls}

    @web.post("/poll")
    async def poll(request: Request):
        auth(request)
        body = await json_body(request)
        out = {}
        for cid in body.get("call_ids", []):
            try:
                out[cid] = {"status": "done", "result": await modal.FunctionCall.from_id(cid).get.aio(timeout=0)}
            except TimeoutError:
                out[cid] = {"status": "pending"}
            except Exception as e:  # the job itself failed (container error, cancelled, lost)
                out[cid] = {"status": "error", "error": f"{type(e).__name__}: {e}"[:2000]}
        return out

    @web.get("/ls")
    def list_files(request: Request, path: str):
        auth(request)
        _reload()
        root = safe(path)
        files = []
        for d, _, names in os.walk(root):
            for n in names:
                full = os.path.join(d, n)
                try:
                    files.append({"path": os.path.relpath(full, VOL), "size": os.path.getsize(full)})
                except OSError:
                    continue
        return {"files": sorted(files, key=lambda f: f["path"])}

    @web.get("/get")
    def get(request: Request, path: str, fresh: int = 1):
        auth(request)
        if fresh:
            _reload()
        full = safe(path)
        if not os.path.isfile(full):
            raise HTTPException(404, f"no such file: {path}")
        return FileResponse(full, filename=os.path.basename(full))

    @web.get("/tar")
    def tar(request: Request, path: str, match: str = "*"):
        auth(request)
        _reload()
        root = safe(path)
        if not os.path.isdir(root):
            raise HTTPException(404, f"no such folder: {path}")
        tmp = tempfile.NamedTemporaryFile(suffix=".tar", delete=False)
        try:
            with tarfile.open(fileobj=tmp, mode="w") as tf:
                for d, _, names in os.walk(root):
                    for n in sorted(names):
                        rel = os.path.relpath(os.path.join(d, n), root)
                        if fnmatch.fnmatch(rel, match):
                            tf.add(os.path.join(d, n), arcname=rel)
            tmp.close()
        except (OSError, tarfile.TarError) as e:
            raise HTTPException(500, f"could not pack {path}: {e}")
        return FileResponse(tmp.name, filename="plates.tar")

    @web.post("/rm")
    async def remove_tree(request: Request, path: str):
        auth(request)
        target = safe(path, ("out", "code"))
        try:
            if os.path.isdir(target):
                shutil.rmtree(target)
        except OSError as e:
            raise HTTPException(500, f"could not remove {path}: {e}")
        await commit_volume()
        return {"removed": path}

    return web
