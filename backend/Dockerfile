# ── Builder ────────────────────────────────────────────────────────────────────
FROM python:3.11-slim AS builder

WORKDIR /build

COPY requirements.txt .
RUN pip install --upgrade pip \
    && pip install --no-cache-dir --prefix=/install -r requirements.txt

# ── Runtime ────────────────────────────────────────────────────────────────────
FROM python:3.11-slim AS runtime

# The release workflow passes the tag (e.g. 0.1.0); shown in /health and
# Administration → Organisation.
ARG APP_VERSION=dev
ENV APP_VERSION=${APP_VERSION}
LABEL org.opencontainers.image.title="Arkitekturportalen API" \
      org.opencontainers.image.licenses="EUPL-1.2" \
      org.opencontainers.image.version="${APP_VERSION}"

WORKDIR /app

# WeasyPrint native dependencies for PDF rendering.
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        libcairo2 \
        libpango-1.0-0 \
        libpangoft2-1.0-0 \
        libharfbuzz0b \
        libgdk-pixbuf-2.0-0 \
        libffi8 \
        shared-mime-info \
        fonts-liberation \
        fonts-dejavu-core \
    && rm -rf /var/lib/apt/lists/*

# Copy installed packages from builder
COPY --from=builder /install /usr/local

# Copy application source
COPY app/ ./app/
COPY seed/ ./seed/
COPY content_packs/ ./content_packs/
COPY alembic/ ./alembic/
COPY alembic.ini .

# Non-root user for security
RUN useradd -m -u 1001 appuser \
    && mkdir -p /app/snapshots /app/sync_data \
    && chown -R appuser /app

EXPOSE 8000

# Fix volume ownership then drop to appuser, run migrations and start server
CMD ["sh", "-c", "chown -R appuser /app/snapshots /app/sync_data && exec su -s /bin/sh appuser -c 'alembic upgrade head && uvicorn app.main:app --host 0.0.0.0 --port 8000'"]
