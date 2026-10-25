#!/bin/sh
# Restore the database from the bucket (first boot after a wipe), then run the API while replicating changes.
set -e
RUN="uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000} --proxy-headers --forwarded-allow-ips=*"
CONFIG="${LITESTREAM_CONFIG:-/app/litestream.yml}"
if [ -n "$LITESTREAM_BUCKET" ] || [ -n "$LITESTREAM_CONFIG" ]; then
  # values pasted into a dashboard often carry a stray space or newline: strip them, then say what will be used (lengths only, no secrets)
  for name in LITESTREAM_BUCKET LITESTREAM_ENDPOINT LITESTREAM_REGION LITESTREAM_ACCESS_KEY_ID LITESTREAM_SECRET_ACCESS_KEY; do
    eval "value=\${$name:-}"
    export "$name=$(printf %s "$value" | tr -d '[:space:]')"
  done
  echo "Backup target: bucket=$LITESTREAM_BUCKET endpoint=$LITESTREAM_ENDPOINT region=$LITESTREAM_REGION key_id_chars=${#LITESTREAM_ACCESS_KEY_ID} secret_chars=${#LITESTREAM_SECRET_ACCESS_KEY}" >&2
  litestream restore -config "$CONFIG" -if-db-not-exists -if-replica-exists "$FOODHUNT_DB"
  exec litestream replicate -config "$CONFIG" -exec "$RUN"
fi
echo "WARNING: LITESTREAM_BUCKET is not set. Data and platform logins are lost whenever this server restarts." >&2
exec $RUN
