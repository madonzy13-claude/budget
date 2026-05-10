# Stage 1: install workspace dependencies
FROM oven/bun:1.3-slim AS deps
WORKDIR /app
COPY package.json bun.lock ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY apps/worker/package.json apps/worker/
COPY apps/migrator/package.json apps/migrator/
COPY packages/crypto/package.json packages/crypto/
COPY packages/db/package.json packages/db/
COPY packages/identity/package.json packages/identity/
COPY packages/platform/package.json packages/platform/
COPY packages/shared-kernel/package.json packages/shared-kernel/
COPY packages/tenancy/package.json packages/tenancy/
COPY packages/budgeting/package.json packages/budgeting/
RUN bun install --frozen-lockfile --production
# Strip dev-only transitive deps that ship Go binaries (esbuild / vite /
# vitest / playwright) — bun --production keeps them in workspace mode.
# drizzle-kit is only used at design time; at runtime we call drizzle-orm's
# migrate() directly, so removing it is safe.
RUN rm -rf /app/node_modules/.bun/esbuild* \
           /app/node_modules/.bun/@esbuild* \
           /app/node_modules/.bun/@esbuild-kit* \
           /app/node_modules/.bun/vite@* \
           /app/node_modules/.bun/vitest@* \
           /app/node_modules/.bun/@vitest* \
           /app/node_modules/.bun/drizzle-kit@* \
           /app/node_modules/.bun/playwright@* \
           /app/node_modules/.bun/playwright-core@* \
           /app/node_modules/.bun/@playwright* \
           /app/node_modules/.bun/@rolldown*

# Stage 2: runtime — start from deps to inherit all workspace node_modules, then overlay source
FROM deps AS runtime
WORKDIR /app
ENV NODE_ENV=production
# Apply OS security upgrades (libssl3t64 etc.) available in the base
# image's release pocket.
RUN apt-get update \
    && apt-get upgrade -y --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*
COPY packages ./packages
COPY drizzle ./drizzle
COPY apps/migrator ./apps/migrator
WORKDIR /app/apps/migrator
USER bun
CMD ["bun", "run", "src/migrate.ts"]
