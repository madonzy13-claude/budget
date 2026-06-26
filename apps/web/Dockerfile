# Multi-stage Bun image producing Next.js standalone server
# Stage 1: Install dependencies
# Stage 2: Build with bunx next build (Webpack — Turbopack disabled per CLAUDE.md)
# Stage 3: Minimal runtime image

# Stage 1: Install
FROM oven/bun:1.3.14-slim AS installer

WORKDIR /app

# Copy workspace manifests first (cache layer)
COPY package.json ./
COPY tsconfig.base.json ./
COPY apps/web/package.json ./apps/web/
COPY packages/ ./packages/
COPY apps/api/package.json ./apps/api/
COPY apps/api/src/ ./apps/api/src/
COPY apps/worker/package.json ./apps/worker/
COPY apps/migrator/package.json ./apps/migrator/

# Install all dependencies
RUN bun install --no-save

# Stage 2: Build
FROM installer AS builder

WORKDIR /app

COPY apps/web/ ./apps/web/

# Build Next.js app with Webpack. Next 16 defaults `next build` to Turbopack,
# but Serwist (stable 9.x) only hooks the Webpack build to emit public/sw.js —
# the SW is required for offline + push. `--webpack` opts back into Webpack.
ENV NODE_ENV=production
ENV NEXT_PUBLIC_API_URL=http://localhost:3001

ARG GIT_COMMIT=unknown
ENV GIT_COMMIT=$GIT_COMMIT

# Web push: NEXT_PUBLIC_VAPID_PUBLIC_KEY is INLINED into the client bundle at
# build time so pushManager.subscribe gets a non-empty applicationServerKey
# (without it, push subscription silently fails with an empty key). Empty when
# unset → push simply stays unavailable. Pass via docker-compose build.args
# (sourced from infisical), e.g. NEXT_PUBLIC_VAPID_PUBLIC_KEY=<vapid public key>.
ARG NEXT_PUBLIC_VAPID_PUBLIC_KEY=
ENV NEXT_PUBLIC_VAPID_PUBLIC_KEY=$NEXT_PUBLIC_VAPID_PUBLIC_KEY

RUN cd apps/web && bunx next build --webpack

# Stage 3: Runtime
FROM oven/bun:1.3.14-slim AS runtime

WORKDIR /app

# Apply OS security upgrades (libssl3t64 etc.) available in the base
# image's release pocket.
RUN apt-get update \
    && apt-get upgrade -y --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

ARG GIT_COMMIT=unknown
ENV GIT_COMMIT=$GIT_COMMIT

# Copy only the standalone output + static assets (chown so the non-root bun user can read)
COPY --from=builder --chown=bun:bun /app/apps/web/.next/standalone ./
COPY --from=builder --chown=bun:bun /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=builder --chown=bun:bun /app/apps/web/public ./apps/web/public

USER bun

EXPOSE 3000

HEALTHCHECK --interval=15s --timeout=5s --start-period=30s --retries=3 \
  CMD bun -e "const r = await fetch('http://localhost:3000/en/health'); if (!r.ok) process.exit(1);"

CMD ["bun", "apps/web/server.js"]
