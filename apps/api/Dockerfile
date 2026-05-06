FROM oven/bun:1.3 AS deps
WORKDIR /app
COPY package.json bun.lockb ./
COPY apps/api/package.json apps/api/
COPY packages/platform/package.json packages/platform/
COPY packages/shared-kernel/package.json packages/shared-kernel/
COPY packages/identity/package.json packages/identity/
COPY packages/tenancy/package.json packages/tenancy/
RUN bun install --frozen-lockfile

FROM oven/bun:1.3
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
WORKDIR /app/apps/api
EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=5s --retries=3 CMD bun -e "fetch('http://localhost:4000/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["bun", "run", "src/server.ts"]
