"""Shared plumbing for the plate scripts: config, paths, logging and small colour helpers.

Paths come from the environment so the same code runs in the sandbox and on a cloud worker:
    PLATES_SRC  source scenes (studio .blend, car .blend files, decoded rim .glb files)
    PLATES_OUT  where masters and test renders go
    PLATES_DEVICE  CPU (default) or GPU
"""
import json
import os
import re
import sys

PLATES_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))   # scripts/plates
CONFIG_PATH = os.path.join(PLATES_DIR, "plates.config.json")
SRC = os.environ.get("PLATES_SRC", "/home/claude/plates_src")
OUT = os.environ.get("PLATES_OUT", "/home/claude/plates_out")
DEVICE = os.environ.get("PLATES_DEVICE", "CPU").upper()


def fail(msg):
    sys.exit(f"plates: {msg}")


def log(msg):
    print(msg, flush=True)


def slugify(name):
    return re.sub(r"[^a-z0-9]+", "_", str(name).lower()).strip("_")


def srgb_to_linear(c):
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def hex_to_linear(hex_code):
    """'#1F4DAE' -> (r, g, b, 1.0) in linear light."""
    h = str(hex_code).lstrip("#")
    if not re.fullmatch(r"[0-9A-Fa-f]{6}", h):
        fail(f"bad colour {hex_code!r}, expected #RRGGBB")
    return (*(srgb_to_linear(int(h[i:i + 2], 16) / 255.0) for i in (0, 2, 4)), 1.0)


class Config:
    """plates.config.json with lookups by id. Unknown ids stop with the list of valid ones."""

    def __init__(self, path=CONFIG_PATH):
        try:
            with open(path, encoding="utf-8") as fh:
                self.data = json.load(fh)
        except (OSError, json.JSONDecodeError) as e:
            fail(f"could not read config {path}: {e}")
        for key in ("frame", "colour", "quality", "views", "cars", "paints", "paint_finishes", "wheels", "wheel_finishes"):
            if key not in self.data:
                fail(f"config {path} has no '{key}' section")
        self.path = path

    def __getitem__(self, key):
        return self.data[key]

    def get(self, key, default=None):
        return self.data.get(key, default)

    def _pick(self, section, item_id):
        for item in self.data[section]:
            if item["id"] == item_id:
                return item
        fail(f"unknown {section[:-1]} {item_id!r}; known: {', '.join(i['id'] for i in self.data[section])}")

    def car(self, car_id):
        return self._pick("cars", car_id)

    def view(self, view_id):
        return self._pick("views", view_id)

    def wheel(self, wheel_id):
        return self._pick("wheels", wheel_id)

    def paint(self, paint_id):
        """A paint merged with its finish defaults and its own overrides. Accepts an id or a 1-based number."""
        if str(paint_id).isdigit():
            n = int(paint_id)
            if not 1 <= n <= len(self.data["paints"]):
                fail(f"paint number {n} is outside 1..{len(self.data['paints'])}")
            p = self.data["paints"][n - 1]
        else:
            p = self._pick("paints", paint_id)
        finish = self.data["paint_finishes"].get(p["finish"])
        if finish is None:
            fail(f"paint {p['id']!r} has unknown finish {p['finish']!r}")
        return {**finish, **p.get("o", {}), "id": p["id"], "name": p["name"], "hex": p["hex"], "finish": p["finish"]}

    def wheel_finish(self, finish_id):
        f = self.data["wheel_finishes"].get(finish_id)
        if f is None:
            fail(f"unknown wheel finish {finish_id!r}; known: {', '.join(self.data['wheel_finishes'])}")
        return {**f, "id": finish_id}

    def source(self, rel):
        path = os.path.join(SRC, rel)
        if not os.path.exists(path):
            fail(f"source not found: {path} (set PLATES_SRC, or run prepare_sources.py)")
        return path
