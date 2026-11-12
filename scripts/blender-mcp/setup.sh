#!/usr/bin/env bash
# Installs Blender 5.3 + the MCP for Blender add-on + the Blendkit (ex-BlenderKit) add-on
# in a fresh Linux container, so Claude Code can drive Blender through the `blender`
# MCP server in .mcp.json. Idempotent. See docs/BLENDER_MCP.md.
#
#   scripts/blender-mcp/setup.sh [path/to/blenderkit-vX.Y.Z.zip]
#
# Blendkit is not on extensions.blender.org and its site no longer offers a direct
# download, so the zip has to be supplied (argument or $BLENDKIT_ZIP). Without it the
# script installs Blender and the MCP add-on only.
set -euo pipefail

BLENDER_VERSION=5.3.0
BLENDER_SERIES=5.3
MCP_VERSION=2.2.7            # PyPI mcp-for-blender; keep in step with .mcp.json
BLENDKIT_ZIP="${1:-${BLENDKIT_ZIP:-}}"
export DISABLE_TELEMETRY=true BLENDERMCP_NO_UPDATE_CHECK=1

dir="/opt/blender-${BLENDER_VERSION}-linux-x64"
if [ ! -x "$dir/blender" ]; then
  tmp="$(mktemp -d)"
  base="https://download.blender.org/release/Blender${BLENDER_SERIES}"
  tarball="blender-${BLENDER_VERSION}-linux-x64.tar.xz"
  echo "Downloading $tarball (~400 MB)..."
  curl -sSfL "$base/$tarball" -o "$tmp/$tarball"
  curl -sSfL "$base/blender-${BLENDER_VERSION}.sha256" -o "$tmp/sums"
  (cd "$tmp" && grep " $tarball\$" sums | sha256sum -c -)
  tar -xJf "$tmp/$tarball" -C /opt
  rm -rf "$tmp"
fi
ln -sf "$dir/blender" /usr/local/bin/blender
blender --version | head -1

command -v uvx >/dev/null || { echo "uvx missing: curl -LsSf https://astral.sh/uv/install.sh | sh"; exit 1; }
uvx "mcp-for-blender@${MCP_VERSION}" install-addon

if [ -n "$BLENDKIT_ZIP" ]; then
  [ -f "$BLENDKIT_ZIP" ] || { echo "No such zip: $BLENDKIT_ZIP"; exit 1; }
  log="$(mktemp)"
  if ! blender --background --factory-startup --command extension install-file \
         -r user_default -e "$BLENDKIT_ZIP" >"$log" 2>&1 \
     || grep -q '^ERROR' "$log" \
     || [ ! -f "$HOME/.config/blender/${BLENDER_SERIES}/extensions/user_default/blenderkit/__init__.py" ]; then
    # Blender exits 0 even when the install fails, so its ERROR lines are checked too.
    echo "Blendkit install failed; Blender said:"; tail -20 "$log"; rm -f "$log"; exit 1
  fi
  rm -f "$log"
  echo "Blendkit installed from $BLENDKIT_ZIP"
else
  echo "No Blendkit zip given: skipping Blendkit."
fi

# Enable both add-ons and save the preferences.
blender --background --python-expr '
import bpy, addon_utils, os
mods = ["blender_mcp"]
if os.path.isdir(os.path.join(bpy.utils.user_resource("EXTENSIONS"), "user_default", "blenderkit")):
    mods.append("bl_ext.user_default.blenderkit")
for m in mods:
    addon_utils.enable(m, default_set=True, persistent=True)
bpy.ops.wm.save_userpref()
print("ENABLED:", ", ".join(mods))
' 2>&1 | grep ENABLED || { echo "Could not enable the add-ons: rerun the blender step above without the grep to see why."; exit 1; }
echo "Done. Start Blender with scripts/blender-mcp/start.sh"
