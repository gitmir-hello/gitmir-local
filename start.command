#!/bin/bash
# Double-click this file in Finder to launch GitMir Local.
DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$DIR"

# Same override the server honours, so a dashboard started on another port is
# still found here instead of being started a second time.
PORT="${GITMIR_PORT:-4599}"
URL="http://localhost:$PORT"

# Already up? Just open the browser and leave it alone.
if curl -s "$URL/api/ping" >/dev/null 2>&1; then
  open "$URL"
  exit 0
fi

# Otherwise start the server — it opens the browser itself.
exec node server.ts
