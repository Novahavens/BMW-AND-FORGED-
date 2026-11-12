#!/usr/bin/env bash
# Starts Blender with its UI on a virtual display so the MCP for Blender add-on can
# serve on 127.0.0.1:9876. The add-on refuses `blender -b`: its commands run on the UI
# event loop, which background mode never starts. Idempotent; logs to /tmp/blender-mcp.log.
#
#   scripts/blender-mcp/start.sh [file.blend]     # start (or confirm already running)
#   scripts/blender-mcp/start.sh --stop
set -euo pipefail
PORT="${BLENDER_PORT:-9876}"
DISPLAY_NUM="${BLENDER_DISPLAY:-:99}"
export DISABLE_TELEMETRY=true BLENDERMCP_NO_UPDATE_CHECK=1

port_open() { (echo > "/dev/tcp/127.0.0.1/$PORT") 2>/dev/null; }

if [ "${1:-}" = "--stop" ]; then
  pkill -f "/opt/blender-.*/blender( |$)" || true
  pkill -f "Xvfb $DISPLAY_NUM" || true
  echo "Stopped."; exit 0
fi

if port_open; then echo "Blender MCP already listening on 127.0.0.1:$PORT"; exit 0; fi

if ! pgrep -f "Xvfb $DISPLAY_NUM" >/dev/null; then
  nohup Xvfb "$DISPLAY_NUM" -screen 0 1920x1080x24 -nolisten tcp >/tmp/xvfb.log 2>&1 &
  sleep 2
fi

# No GPU in the cloud sandbox: Mesa llvmpipe draws the UI, Cycles renders on CPU.
DISPLAY="$DISPLAY_NUM" LIBGL_ALWAYS_SOFTWARE=1 nohup blender "$@" >/tmp/blender-mcp.log 2>&1 &

for _ in $(seq 1 60); do
  if port_open; then echo "Blender MCP listening on 127.0.0.1:$PORT (log: /tmp/blender-mcp.log)"; exit 0; fi
  sleep 2
done
echo "Blender started but port $PORT never opened; see /tmp/blender-mcp.log"; exit 1
