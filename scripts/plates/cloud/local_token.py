"""Work out this machine's key for the plates render service and keep it in ~/.plates_cloud.json.

The service's key is derived from the Modal token secret (the deploy workflow does the same sum), so nothing
extra has to be shared. This reads the secret from the local Modal profile (~/.modal.toml, written by
`modal token set`); it never prints it and never writes it anywhere else.

    python3 scripts/plates/cloud/local_token.py [--url https://<workspace>--forgedsa-plates-api.modal.run]
"""
import argparse
import hashlib
import json
import os
import sys
import tomllib

MODAL_TOML = os.path.expanduser("~/.modal.toml")
STORE = os.path.expanduser("~/.plates_cloud.json")


def fail(msg):
    sys.exit(f"local_token: {msg}")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--url", default=None, help="the service URL, once the deploy has printed it")
    a = ap.parse_args()
    try:
        with open(MODAL_TOML, "rb") as fh:
            profiles = tomllib.load(fh)
    except (OSError, tomllib.TOMLDecodeError) as e:
        fail(f"could not read {MODAL_TOML}: {e} (run `modal token set` first)")
    active = next((p for p in profiles.values() if isinstance(p, dict) and p.get("active")), None)
    active = active or next((p for p in profiles.values() if isinstance(p, dict) and p.get("token_secret")), None)
    if not active or not active.get("token_secret"):
        fail(f"no Modal profile with a token secret in {MODAL_TOML}")
    key = hashlib.sha256((active["token_secret"] + ":forgedsa-plates-api").encode()).hexdigest()
    store = {}
    if os.path.isfile(STORE):
        try:
            with open(STORE, encoding="utf-8") as fh:
                store = json.load(fh)
        except (OSError, json.JSONDecodeError):
            store = {}
    store["token"] = key
    if a.url is not None:
        store["url"] = a.url.rstrip("/")
    store.setdefault("url", "")
    try:
        # Created private from the start: the key must never be readable by others, even for a moment.
        fd = os.open(STORE, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
        with os.fdopen(fd, "w", encoding="utf-8") as fh:
            json.dump(store, fh)
        os.chmod(STORE, 0o600)
    except OSError as e:
        fail(f"could not write {STORE}: {e}")
    print(f"service key stored in {STORE} (url: {store['url'] or 'not set yet'})")


if __name__ == "__main__":
    main()
