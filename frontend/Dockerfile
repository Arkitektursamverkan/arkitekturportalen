# ── Builder ────────────────────────────────────────────────────────────────────
FROM node:26-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .
# Nothing installation-specific is baked in: Entra settings reach the browser
# through /config.js, written by docker/40-ea-config.sh when nginx starts.
RUN npm run build

# ── Runtime (nginx) ────────────────────────────────────────────────────────────
FROM nginx:1.31-alpine AS runtime

ARG APP_VERSION=dev
LABEL org.opencontainers.image.title="Arkitekturportalen web" \
      org.opencontainers.image.licenses="EUPL-1.2" \
      org.opencontainers.image.version="${APP_VERSION}"

COPY --from=builder /app/dist /usr/share/nginx/html
# The site config is written from the template when the container starts
# (docker/30-ea-nginx.sh): PORT, API_UPSTREAM and the container's own DNS.
# Defaults fit docker compose; a platform such as Render sets PORT and
# API_UPSTREAM to the API's internal host:port.
ENV PORT=80 \
    API_UPSTREAM=api:8000 \
    NGINX_ENTRYPOINT_LOCAL_RESOLVERS=1
COPY nginx.conf.template /etc/nginx/ea/default.conf.template
COPY docker/30-ea-nginx.sh /docker-entrypoint.d/30-ea-nginx.sh
COPY docker/40-ea-config.sh /docker-entrypoint.d/40-ea-config.sh

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
