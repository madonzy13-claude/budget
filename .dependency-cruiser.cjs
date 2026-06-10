/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: 'domain-no-orm',
      severity: 'error',
      from: { path: 'packages/.+/src/domain' },
      to:   { path: '^(drizzle-orm|hono|ai|@ai-sdk/.*)' },
    },
    {
      name: 'domain-no-http-framework',
      severity: 'error',
      from: { path: 'packages/.+/src/domain' },
      to:   { path: '^(hono|@hono/.*)' },
    },
    {
      name: 'domain-no-sibling-adapters',
      severity: 'error',
      from: { path: 'packages/(.+)/src/(domain|application|ports)' },
      to:   { path: 'packages/(?!\\1)(.+)/src/(adapters|application)' },
    },
    {
      name: 'cross-package-only-contracts',
      severity: 'error',
      from: { path: 'packages/(.+)/src/(?!contracts)' },
      to:   { path: 'packages/(?!\\1)(.+)/src/(?!(index\\.ts|contracts))' },
    },
    // PC-02: apps/** may import packages/*/src/index.ts AND packages/*/src/contracts/** ONLY.
    // BANS apps/** reaching into domain/application/adapters/ports.
    // EXCEPTIONS (intentional, by design):
    //   - apps/api/src/boot.ts and apps/worker/src/worker.ts — composition roots that
    //     wire adapters into modules; these must reach into adapters/ to construct them.
    //   - apps/api/src/routes/** — route handlers wire use cases + adapters per request
    //     scope; until createBudgetingModule covers every use case this is unavoidable.
    //   - apps/*/test/** — integration tests stand up real adapters against testcontainers.
    //   - apps/worker/src/handlers/** — pg-boss job handlers wire adapters per job.
    {
      name: 'apps-only-public-package-surface',
      severity: 'error',
      from: {
        path: '^apps/',
        pathNot: [
          '^apps/[^/]+/test/',
          '^apps/api/src/boot\\.ts$',
          '^apps/api/src/routes/',
          '^apps/worker/src/worker\\.ts$',
          '^apps/worker/src/handlers/',
        ],
      },
      to:   { path: 'packages/[^/]+/src/(domain|application|adapters|ports)' },
    },
    {
      name: 'no-direct-db-transaction',
      severity: 'error',
      from: { pathNot: 'packages/platform/src/db/tx\\.ts$' },
      to:   { path: 'drizzle-orm', dependencyTypes: ['local'] },
      // The grep gate (PC-04) is the load-bearing wall; this dep-cruiser rule provides
      // a documentation hook for IDE/lint tooling.
    },
  ],
  options: {
    tsConfig: { fileName: 'tsconfig.base.json' },
    doNotFollow: { path: 'node_modules' },
  },
};
