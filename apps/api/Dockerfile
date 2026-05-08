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
RUN bun install --frozen-lockfile

# Stage 2: runtime — start from deps to inherit all workspace node_modules, then overlay source
FROM deps AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY packages ./packages
COPY apps/api ./apps/api
WORKDIR /app/apps/api
EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=5s --retries=3 CMD bun -e "fetch('http://localhost:4000/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["bun", "run", "src/server.ts"]
