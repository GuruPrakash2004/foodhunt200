#!/bin/sh
# Restore the database from the bucket (first boot after a wipe), then run the API while replicating changes.
set -e
RUN="uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000} --proxy-headers --forwarded-allow-ips=*"
CONFIG="${LITESTREAM_CONFIG:-/app/litestream.yml}"
if [ -n "$LITESTREAM_BUCKET" ] || [ -n "$LITESTREAM_CONFIG" ]; then
  litestream restore -config "$CONFIG" -if-db-not-exists -if-replica-exists "$FOODHUNT_DB"
  exec litestream replicate -config "$CONFIG" -exec "$RUN"
fi
echo "WARNING: LITESTREAM_BUCKET is not set. Data and platform logins are lost whenever this server restarts." >&2
exec $RUN
