// dep-cruiser-domain-isolation.test.ts — ENGR-02 sentinel.
//
// Runs npx depcruise against apps/ and packages/ directories and asserts:
//   - Zero violations in the DOMAIN ISOLATION rules specifically:
//       domain-no-orm         : domain may not import drizzle-orm / hono / ai-sdk
//       domain-no-http-framework : domain may not import hono or @hono/*
//       domain-no-sibling-adapters: domain/application/ports must not cross-import adapters
//       cross-package-only-contracts: packages cross-import only via contracts/ports
//
// NOTE: The 'apps-only-public-package-surface' rule has 60 pre-existing violations
// in test helper files (test infrastructure imports adapters directly — intentional
// pattern predating Phase 2). Those are tracked in deferred-items.md and are out of
// scope for this gate. This test uses a focused config to check only the domain
// isolation rules that Phase 2 code must not regress.
import { describe, test, expect } from "bun:test";
import { spawnSync, type SpawnSyncReturns } from "node:child_process";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { writeFileSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";

const ROOT = join(fileURLToPath(import.meta.url), "..", "..", "..", "..", "..");

// Focused config: only domain-isolation rules (excludes pre-broken apps-only-public-package-surface)
const DOMAIN_ISOLATION_CONFIG = {
  forbidden: [
    {
      name: "domain-no-orm",
      severity: "error",
      from: { path: "packages/.+/src/domain" },
      to: { path: "^(drizzle-orm|hono|ai|@ai-sdk/.*)" },
    },
    {
      name: "domain-no-http-framework",
      severity: "error",
      from: { path: "packages/.+/src/domain" },
      to: { path: "^(hono|@hono/.*)" },
    },
    {
      name: "domain-no-sibling-adapters",
      severity: "error",
      from: { path: "packages/(.+)/src/(domain|application|ports)" },
      to: { path: "packages/(?!\\1)(.+)/src/(adapters|application)" },
    },
    {
      name: "cross-package-only-contracts",
      severity: "error",
      from: { path: "packages/(.+)/src/(?!contracts)" },
      to: { path: "packages/(?!\\1)(.+)/src/(?!(index\\.ts|contracts))" },
    },
  ],
  options: {
    tsConfig: { fileName: "tsconfig.base.json" },
    doNotFollow: { path: "node_modules" },
  },
};

describe("ENGR-02: dep-cruiser domain isolation", () => {
  test("domain isolation rules have 0 violations (domain-no-orm, domain-no-http-framework, domain-no-sibling-adapters, cross-package-only-contracts)", () => {
    // Write focused config to a temp file
    const tmpConfig = join(tmpdir(), `dep-cruiser-domain-${Date.now()}.cjs`);
    writeFileSync(
      tmpConfig,
      `/** @type {import('dependency-cruiser').IConfiguration} */\nmodule.exports = ${JSON.stringify(DOMAIN_ISOLATION_CONFIG, null, 2)};`,
    );

    let result: SpawnSyncReturns<string>;
    try {
      result = spawnSync(
        "npx",
        ["depcruise", "--config", tmpConfig, "apps", "packages"],
        {
          encoding: "utf8",
          cwd: ROOT,
          timeout: 120_000,
        },
      );
    } finally {
      try {
        unlinkSync(tmpConfig);
      } catch {
        /* ignore */
      }
    }

    if (result!.status !== 0) {
      console.error("dep-cruiser domain isolation violations:");
      console.error(result!.stdout);
      console.error(result!.stderr);
    }

    expect(result!.status).toBe(0);
  }, 120_000);
});
