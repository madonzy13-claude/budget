# Multi-stage Bun image producing Next.js standalone server
# Stage 1: Install dependencies
# Stage 2: Build with bunx next build (Webpack — Turbopack disabled per CLAUDE.md)
# Stage 3: Minimal runtime image

# Stage 1: Install
FROM oven/bun:1.2-slim AS installer

WORKDIR /app

# Copy workspace manifests first (cache layer)
COPY package.json bun.lock* ./
COPY tsconfig.base.json ./
COPY apps/web/package.json ./apps/web/
COPY packages/ ./packages/
COPY apps/api/package.json ./apps/api/
COPY apps/api/src/ ./apps/api/src/

# Install all dependencies
RUN bun install --frozen-lockfile

# Stage 2: Build
FROM installer AS builder

WORKDIR /app

COPY apps/web/ ./apps/web/

# Build Next.js app (uses Webpack — turbopack: false in next.config.mjs)
ENV NODE_ENV=production
ENV NEXT_PUBLIC_API_URL=http://localhost:3001

ARG GIT_COMMIT=unknown
ENV GIT_COMMIT=$GIT_COMMIT

RUN bunx next build apps/web

# Stage 3: Runtime
FROM oven/bun:1.2-slim AS runtime

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

ARG GIT_COMMIT=unknown
ENV GIT_COMMIT=$GIT_COMMIT

# Copy only the standalone output + static assets
COPY --from=builder /app/apps/web/.next/standalone ./
COPY --from=builder /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=builder /app/apps/web/public ./apps/web/public

EXPOSE 3000

HEALTHCHECK --interval=15s --timeout=5s --start-period=30s --retries=3 \
  CMD bun -e "const r = await fetch('http://localhost:3000/en/health'); if (!r.ok) process.exit(1);"

CMD ["bun", "apps/web/server.js"]
