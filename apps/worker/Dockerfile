FROM oven/bun:1.3 AS deps
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
RUN bun install --frozen-lockfile

FROM oven/bun:1.3
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
WORKDIR /app/apps/worker
HEALTHCHECK --interval=30s --timeout=10s CMD bun -e "process.exit(0)"
CMD ["bun", "run", "src/worker.ts"]
