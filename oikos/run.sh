#!/bin/sh
# Oikos HA Addon startup script.
# Runs as root → generates/loads secrets → drops privileges → starts Node.
set -e

# ── Permissions ──────────────────────────────────────────────────────────────
chown -R node:node /data

# ── Auto-generate secrets on first run (or if previous generation failed) ───
SECRETS_FILE="/data/secrets.env"
_needs_secrets=1
if [ -f "$SECRETS_FILE" ]; then
    # shellcheck source=/dev/null
    . "$SECRETS_FILE"
    [ -n "$SESSION_SECRET" ] && [ -n "$DB_ENCRYPTION_KEY" ] && _needs_secrets=0
fi
if [ "$_needs_secrets" = "1" ]; then
    echo "[oikos] Generating SESSION_SECRET and DB_ENCRYPTION_KEY …"
    printf 'SESSION_SECRET=%s\nDB_ENCRYPTION_KEY=%s\n' \
        "$(node -e "process.stdout.write(require('crypto').randomBytes(32).toString('hex'))")" \
        "$(node -e "process.stdout.write(require('crypto').randomBytes(32).toString('hex'))")" \
        > "$SECRETS_FILE"
    chown node:node "$SECRETS_FILE"
    chmod 600 "$SECRETS_FILE"
fi

# Load secrets into the environment
# shellcheck source=/dev/null
. "$SECRETS_FILE"
export SESSION_SECRET
export DB_ENCRYPTION_KEY

# ── Read HA addon options (/data/options.json) ───────────────────────────────
OPTIONS="/data/options.json"

export PORT=3000
export NODE_ENV=production
export DB_PATH=/data/oikos.db
export SESSION_SECURE=false
export TRUST_PROXY=1
export LOG_LEVEL
LOG_LEVEL=$(jq -r '.log_level // "info"' "$OPTIONS")

# OpenWeatherMap
WEATHER_KEY=$(jq -r '.weather_api_key // ""' "$OPTIONS")
WEATHER_CITY=$(jq -r '.weather_city // ""' "$OPTIONS")
WEATHER_UNITS=$(jq -r '.weather_units // "metric"' "$OPTIONS")
WEATHER_LANG=$(jq -r '.weather_lang // "en"' "$OPTIONS")
[ -n "$WEATHER_KEY" ]  && export OPENWEATHER_API_KEY="$WEATHER_KEY"
[ -n "$WEATHER_CITY" ] && export OPENWEATHER_CITY="$WEATHER_CITY"
export OPENWEATHER_UNITS="$WEATHER_UNITS"
export OPENWEATHER_LANG="$WEATHER_LANG"

# Google Calendar (OAuth)
GOOGLE_ID=$(jq -r '.google_client_id // ""' "$OPTIONS")
GOOGLE_SECRET=$(jq -r '.google_client_secret // ""' "$OPTIONS")
GOOGLE_REDIRECT=$(jq -r '.google_redirect_uri // ""' "$OPTIONS")
[ -n "$GOOGLE_ID" ]       && export GOOGLE_CLIENT_ID="$GOOGLE_ID"
[ -n "$GOOGLE_SECRET" ]   && export GOOGLE_CLIENT_SECRET="$GOOGLE_SECRET"
[ -n "$GOOGLE_REDIRECT" ] && export GOOGLE_REDIRECT_URI="$GOOGLE_REDIRECT"

# Apple iCloud CalDAV
APPLE_URL=$(jq -r '.apple_caldav_url // ""' "$OPTIONS")
APPLE_USER=$(jq -r '.apple_username // ""' "$OPTIONS")
APPLE_PASS=$(jq -r '.apple_app_password // ""' "$OPTIONS")
[ -n "$APPLE_URL" ]  && export APPLE_CALDAV_URL="$APPLE_URL"
[ -n "$APPLE_USER" ] && export APPLE_USERNAME="$APPLE_USER"
[ -n "$APPLE_PASS" ] && export APPLE_APP_SPECIFIC_PASSWORD="$APPLE_PASS"

# ── Auto-provision admin account (first run only) ───────────────────────────
ADMIN_USER=$(jq -r '.admin_username // ""' "$OPTIONS")
ADMIN_NAME=$(jq -r '.admin_display_name // ""' "$OPTIONS")
ADMIN_PASS=$(jq -r '.admin_password // ""' "$OPTIONS")
if [ -n "$ADMIN_USER" ] && [ -n "$ADMIN_PASS" ]; then
    ADMIN_DISPLAY="${ADMIN_NAME:-$ADMIN_USER}"
    echo "[oikos] Auto-provisioning admin account '${ADMIN_USER}' …"
    gosu node node /app/setup.js \
        --username "$ADMIN_USER" \
        --display-name "$ADMIN_DISPLAY" \
        --password "$ADMIN_PASS" \
        --skip-if-exists || true
fi

# ── Drop privileges and start oikos ─────────────────────────────────────────
echo "[oikos] Starting server on port $PORT …"
exec gosu node node /app/server/index.js
