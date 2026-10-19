#!/bin/sh
# Writes /config.js from the container environment, so one image serves every
# installation. Run by the nginx image's entrypoint (/docker-entrypoint.d).
set -eu

scope="${ENTRA_API_SCOPE:-}"
if [ -z "$scope" ] && [ -n "${ENTRA_CLIENT_ID:-}" ]; then
    scope="api://${ENTRA_CLIENT_ID}/access_as_user"
fi

# JSON-escape backslashes and double quotes; the values are IDs and URIs.
esc() { printf '%s' "$1" | sed 's/\\/\\\\/g; s/"/\\"/g'; }

cat > /usr/share/nginx/html/config.js <<JS
window.__EA_CONFIG__ = {
  entraTenantId: "$(esc "${ENTRA_TENANT_ID:-}")",
  entraClientId: "$(esc "${ENTRA_CLIENT_ID:-}")",
  entraApiScope: "$(esc "$scope")"
};
JS
