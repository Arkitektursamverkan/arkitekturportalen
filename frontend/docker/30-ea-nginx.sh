#!/bin/sh
# Writes nginx's site config from /etc/nginx/ea/default.conf.template. Run by
# the nginx image's entrypoint (/docker-entrypoint.d), after
# 15-local-resolvers.envsh has found the container's DNS servers.
#
# An installation that mounts its own /etc/nginx/conf.d/default.conf (often
# read-only, with TLS) keeps it: the template is then not used at all.
set -eu

ME=$(basename "$0")
conf=/etc/nginx/conf.d/default.conf
mall=/etc/nginx/ea/default.conf.template

if grep -q " $conf " /proc/self/mountinfo 2>/dev/null || ! touch "$conf" 2>/dev/null; then
    echo "$ME: info: $conf is the installation's own – the template is not used"
    exit 0
fi

# Docker's embedded DNS when the image's resolver script found nothing.
NGINX_RESOLVER=${NGINX_LOCAL_RESOLVERS:-127.0.0.11}
PORT=${PORT:-80}
API_UPSTREAM=${API_UPSTREAM:-api:8000}
# Behind a proxy: trust X-Forwarded-For from TRUSTED_PROXY only, so the login
# limit counts each client rather than the proxy.
REAL_IP_CONFIG=""
for ea_proxy in $(printf '%s' "${TRUSTED_PROXY:-}" | tr ',' ' '); do
    REAL_IP_CONFIG="$REAL_IP_CONFIG    set_real_ip_from $ea_proxy;
"
done
if [ -n "$REAL_IP_CONFIG" ]; then
    REAL_IP_CONFIG="$REAL_IP_CONFIG    real_ip_header X-Forwarded-For;
    real_ip_recursive on;
"
fi
export NGINX_RESOLVER PORT API_UPSTREAM REAL_IP_CONFIG

# Only these: nginx's own $variables in the template stay as they are.
envsubst '${PORT} ${API_UPSTREAM} ${NGINX_RESOLVER} ${REAL_IP_CONFIG}' < "$mall" > "$conf"
echo "$ME: info: listening on :$PORT, /api → $API_UPSTREAM (DNS $NGINX_RESOLVER)${TRUSTED_PROXY:+, trusted proxy $TRUSTED_PROXY}"
