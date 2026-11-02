# ── Builder ────────────────────────────────────────────────────────────────────
FROM node:24-alpine AS builder

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
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY docker/40-ea-config.sh /docker-entrypoint.d/40-ea-config.sh

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
