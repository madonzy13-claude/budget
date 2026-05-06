FROM oven/bun:1.3 AS deps
WORKDIR /app
COPY package.json bun.lockb ./
COPY apps/worker/package.json apps/worker/
COPY packages/platform/package.json packages/platform/
COPY packages/shared-kernel/package.json packages/shared-kernel/
RUN bun install --frozen-lockfile

FROM oven/bun:1.3
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
WORKDIR /app/apps/worker
HEALTHCHECK --interval=30s --timeout=10s CMD bun -e "process.exit(0)"
CMD ["bun", "run", "src/worker.ts"]
