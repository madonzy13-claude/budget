FROM oven/bun:1.3 AS deps
WORKDIR /app
COPY package.json bun.lockb ./
COPY apps/migrator/package.json apps/migrator/
COPY packages/platform/package.json packages/platform/
COPY packages/shared-kernel/package.json packages/shared-kernel/
RUN bun install --frozen-lockfile

FROM oven/bun:1.3
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
WORKDIR /app/apps/migrator
CMD ["bun", "run", "src/migrate.ts"]
