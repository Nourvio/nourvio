#!/bin/sh
set -e

# Started as root (the default): make the data folder belong to PUID:PGID,
# then drop to that user so the app never runs as root. Started with an
# explicit `user:` in compose: run as-is.
if [ "$(id -u)" = "0" ]; then
  PUID="${PUID:-1000}"
  PGID="${PGID:-1000}"
  mkdir -p "$DATA_DIR"
  find "$DATA_DIR" \( ! -user "$PUID" -o ! -group "$PGID" \) -exec chown "$PUID:$PGID" {} +
  exec setpriv --reuid="$PUID" --regid="$PGID" --clear-groups "$@"
fi

exec "$@"
