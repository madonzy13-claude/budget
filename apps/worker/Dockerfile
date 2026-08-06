# Stage 1: install workspace dependencies
FROM oven/bun:1.3.12-slim AS deps
WORKDIR /app
# bun.lock is deliberately NOT copied here. With a lockfile present, a
# --production install resolves a tree WITHOUT devDependencies, which bun
# reports as "lockfile had changes, but lockfile is frozen" and fails — it
# happened on every CI build of this branch and never locally. main has always
# built these images without it. The web image, which is the one that actually
# had a version-drift incident, keeps its lockfile; the hazard there (next) is
# pinned exactly in package.json besides.
COPY package.json ./
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
COPY packages/investments/package.json packages/investments/
# --frozen-lockfile, NOT --no-save: without the lockfile every build
# re-resolves ^ranges, so a dependency published this morning ships in an
# image built from unchanged source. next@16.3.0 landed exactly that way
# and broke page-data collection under Bun (260804).
# CI=false: bun turns --frozen-lockfile ON BY ITSELF when it thinks it is in
# CI, and on GitHub Actions it did so inside the image build — every job failed
# with "lockfile had changes, but lockfile is frozen" even with --no-save and no
# frozen flag anywhere, while the identical build passed locally. The lockfile
# is not the problem: a cold resolve in a clean container produces a file
# byte-identical to the committed one. Saying so explicitly is what stops the
# auto-detection.
RUN CI=false bun install --no-save --production
# Strip dev-only transitive deps that ship Go binaries (esbuild / vite /
# vitest / playwright) — bun --production keeps them in workspace mode.
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
COPY apps/worker ./apps/worker
WORKDIR /app/apps/worker
USER bun
HEALTHCHECK --interval=30s --timeout=10s CMD bun -e "process.exit(0)"
CMD ["bun", "run", "src/worker.ts"]
