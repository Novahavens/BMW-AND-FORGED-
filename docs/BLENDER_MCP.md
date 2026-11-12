# Blender MCP + Blendkit

How Claude Code drives a live Blender in this repo's cloud sandbox, with the Blendkit
asset library (formerly BlenderKit, renamed June 2026) inside it.

## What is installed

| Piece | Version | Where |
|---|---|---|
| Blender | 5.3.0 (official linux-x64 build, sha256 checked) | `/opt/blender-5.3.0-linux-x64`, `blender` on PATH |
| MCP for Blender add-on (ahujasid, formerly `blender-mcp`) | matches the server below | `~/.config/blender/5.3/scripts/addons/blender_mcp.py` |
| MCP for Blender server | `mcp-for-blender@2.2.7` from PyPI, pinned | `.mcp.json` → `uvx mcp-for-blender@2.2.7` |
| Blendkit add-on | 3.21.3 (the owner's zip) | `~/.config/blender/5.3/extensions/user_default/blenderkit` |

All of this lives outside the repo, so it goes away when the container does. The repo
holds the scripts that put it back.

## Fresh container

```bash
scripts/blender-mcp/setup.sh /path/to/blenderkit-v3.21.3.261002.zip
scripts/blender-mcp/start.sh
```

Then restart the Claude Code session (or run `/mcp`) so it loads the `blender` server
from `.mcp.json`, and approve it when asked.

- Blendkit is not on extensions.blender.org and blendkit.com no longer offers the zip
  directly. That is why the zip has to be supplied. Without it, setup installs Blender
  and the MCP add-on only.
- `start.sh` runs Blender with its UI on Xvfb display `:99`. The add-on will not serve
  under `blender -b`: it runs commands on the UI event loop, which background mode
  never starts. `start.sh --stop` stops Blender and Xvfb; the log is `/tmp/blender-mcp.log`.
- There is no GPU. The UI draws through Mesa llvmpipe and Cycles renders on CPU, so
  renders are slow. Never report GPU-speed or phone results from here.

## The tools Claude gets

`get_scene_info`, `execute_blender_code`, `look` (viewport screenshot), `search_assets`
/ `import_asset` (the add-on's own sources, e.g. Poly Haven), `generate_3d`,
`get_addon_status`, `disable_telemetry`, `record_trajectory_feedback`.

The MCP server has no Blendkit tools of its own. Blendkit is driven through
`execute_blender_code`, for example:

```python
from bl_ext.user_default.blenderkit import search
import bpy
bpy.context.window_manager.blenderkit_models.search_keywords = "wheel"
search.search()                      # asynchronous: read results a few seconds later
# search.get_search_results() -> list of asset dicts
```

Searching works without an account (checked: 45 results came back). Downloads that need
a login need a Blendkit API key in the add-on preferences. Put it there in the Blender
UI or through an environment secret, never in the repo or the chat.

## Safety and licences

- The MCP socket (`127.0.0.1:9876`) runs any Python it is sent and has no
  authentication. Keep the add-on's Bind Address on `localhost`, and leave "Allow
  Remote Connections" off.
- Telemetry is off: `.mcp.json` and both scripts set `DISABLE_TELEMETRY=true`.
- Blendkit assets keep their own licences. The rule in CLAUDE.md still holds: Royalty
  Free cars only as pre-rendered images, never as a live GLB in the app.
- Blendkit's own update check gets a 403 from the GitHub API through the sandbox proxy.
  It does no harm: update by installing a newer zip with `setup.sh`.
