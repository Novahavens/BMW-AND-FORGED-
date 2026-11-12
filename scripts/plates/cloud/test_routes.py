"""Exercise the render service's HTTP routes locally, without Modal: auth, path safety, bad input, and the
failure paths (volume commit and job start cannot work off Modal, so they must come back as clear errors).
Usage: python3 scripts/plates/cloud/test_routes.py [path to the cloud folder]   (needs fastapi and httpx)"""
import io, os, sys, tarfile, tempfile

cloud_dir = sys.argv[1] if len(sys.argv) > 1 else os.path.dirname(os.path.abspath(__file__))
os.environ["PLATES_API_TOKEN"] = "t" * 40
os.environ["PLATES_GPUS"] = ""
sys.path.insert(0, cloud_dir)
import app as svc  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

svc.VOL = tempfile.mkdtemp(prefix="vol_")
svc._reload = lambda: None


class _Unreachable:
    """Stands in for Modal objects: every call fails at once, as it would with Modal down."""
    def __init__(self, what):
        self.what = what

    def __getattr__(self, name):
        return _Unreachable(f"{self.what}.{name}")

    def __call__(self, *a, **k):
        raise ConnectionError(f"{self.what}: Modal is not reachable in this test")

    async def aio(self, *a, **k):
        raise ConnectionError(f"{self.what}: Modal is not reachable in this test")


svc.vol = _Unreachable("volume")
svc.run_cpu = _Unreachable("run_cpu")
raw = getattr(svc.api, "_raw_f_", None) or svc.api.info.raw_f
while hasattr(raw, "__wrapped__"):
    raw = raw.__wrapped__
web = raw()
c = TestClient(web, raise_server_exceptions=False)
H = {"Authorization": "Bearer " + "t" * 40}
results = []

def check(name, got, want_status, want_text=""):
    ok = got.status_code == want_status and (want_text in got.text)
    results.append(ok)
    print(("PASS" if ok else "FAIL"), name, "->", got.status_code, got.text[:110].replace("\n", " "))

check("health without a token is refused", c.get("/health"), 401)
check("health with a wrong token is refused", c.get("/health", headers={"Authorization": "Bearer nope"}), 401)
check("health with the token", c.get("/health", headers=H), 200, '"gpus":["cpu"]')
check("put outside the allowed roots", c.post("/put?path=../etc/passwd", headers=H, content=b"x"), 400, "path must start")
check("put into out/ is refused", c.post("/put?path=out/x", headers=H, content=b"x"), 400)
check("put: file written, commit failure reported clearly", c.post("/put?path=src/a/b.bin", headers=H, content=b"abc"), 500, "volume commit failed")
print("     file on disk:", os.path.getsize(os.path.join(svc.VOL, "src/a/b.bin")), "bytes")
check("ls lists it", c.get("/ls?path=src", headers=H), 200, "src/a/b.bin")
check("get returns it", c.get("/get?path=src/a/b.bin", headers=H), 200, "abc")
check("get of a missing file", c.get("/get?path=src/nope", headers=H), 404, "no such file")
check("bundle with a bad id", c.post("/bundle?id=../x", headers=H, content=b""), 400, "alphanumeric")
check("bundle that is not a tar", c.post("/bundle?id=abc", headers=H, content=b"not a tar"), 400, "bad bundle")
buf = io.BytesIO()
with tarfile.open(fileobj=buf, mode="w:gz") as tf:
    info = tarfile.TarInfo("../../escape.py"); info.size = 1; tf.addfile(info, io.BytesIO(b"x"))
check("bundle with a path that escapes", c.post("/bundle?id=abc", headers=H, content=buf.getvalue()), 400, "unsafe path")
buf = io.BytesIO()
with tarfile.open(fileobj=buf, mode="w:gz") as tf:
    info = tarfile.TarInfo("render.py"); info.size = 5; tf.addfile(info, io.BytesIO(b"pass\n"))
check("good bundle: extracted, commit failure reported", c.post("/bundle?id=abc", headers=H, content=buf.getvalue()), 500, "volume commit failed")
print("     extracted:", os.path.isfile(os.path.join(svc.VOL, "code/abc/render.py")))
check("submit with a body that is not JSON", c.post("/submit", headers=H, content=b"{nope"), 400, "not JSON")
check("submit with a JSON list", c.post("/submit", headers=H, json=[1]), 400, "JSON object")
check("submit for a worker that does not exist", c.post("/submit", headers=H, json={"gpu": "l4", "jobs": []}), 400, "gpu must be one of")
check("submit with a job missing fields", c.post("/submit", headers=H, json={"gpu": "cpu", "jobs": [{"id": "x"}]}), 400, "needs id, bundle and entry")
check("submit: job start failure reported clearly", c.post("/submit", headers=H, json={"gpu": "cpu", "jobs": [{"id": "x", "bundle": "abc", "entry": "render.py"}]}), 502, "could not start job x")
check("poll with a body that is not JSON", c.post("/poll", headers=H, content=b"x"), 400, "not JSON")
check("tar of a missing folder", c.get("/tar?path=out/none", headers=H), 404, "no such folder")
check("rm outside the allowed roots", c.post("/rm?path=src/a", headers=H), 400, "path must start")
check("rm of a missing folder: nothing to do, commit failure reported", c.post("/rm?path=out/none", headers=H), 500, "volume commit failed")

# the worker's own failure paths
r = svc._run_job({"id": "j1", "bundle": "abc", "entry": "missing.py"}, "cpu")
ok = r["code"] == 2 and "entry not found" in r["log_tail"]; results.append(ok); print("PASS" if ok else "FAIL", "worker: missing entry ->", r["code"], r["log_tail"][:60])
r = svc._run_job({"id": "j2", "bundle": "abc", "entry": "render.py", "args": []}, "cpu")
ok = r["code"] == 0; results.append(ok); print("PASS" if ok else "FAIL", "worker: runs an uploaded script ->", r["code"], repr(r["log_tail"][:40]))
blocker = os.path.join(svc.VOL, "out", "j3"); open(blocker, "w").close()   # a file where the output folder should go
r = svc._run_job({"id": "j3", "bundle": "abc", "entry": "render.py"}, "cpu")
ok = r["code"] == 3 and "cannot create" in r["log_tail"]; results.append(ok); print("PASS" if ok else "FAIL", "worker: output folder cannot be created ->", r["code"], r["log_tail"][:70])

print(f"{sum(results)}/{len(results)} passed")
sys.exit(0 if all(results) else 1)
