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
    {
      name: 'apps-only-public-package-surface',
      severity: 'error',
      from: { path: '^apps/' },
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
