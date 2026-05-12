// dep-cruiser-domain-isolation.test.ts — ENGR-02 sentinel.
//
// Runs npx depcruise against apps/ and packages/ directories and asserts:
//   - Exit code 0 (no forbidden dependency violations)
//
// The dependency-cruiser rules in .dependency-cruiser.cjs enforce:
//   - domain-no-orm: domain may not import drizzle-orm
//   - domain-no-http-framework: domain may not import hono or @hono
//   - domain-no-sibling-adapters: domain/application/ports must not cross-import adapters
//   - cross-package-only-contracts: packages cross-import only via contracts/ports
//   - apps-only-public-package-surface: apps may only reach packages via index.ts/contracts
import { describe, test, expect } from "bun:test";
import { spawnSync } from "node:child_process";
import { join } from "node:path";

const ROOT = join(import.meta.dir, "..", "..", "..", "..");

describe("ENGR-02: dep-cruiser domain isolation", () => {
  test(
    "npx depcruise apps packages exits with 0 violations",
    () => {
      const result = spawnSync(
        "npx",
        [
          "depcruise",
          "--config",
          ".dependency-cruiser.cjs",
          "apps",
          "packages",
        ],
        {
          encoding: "utf8",
          cwd: ROOT,
          timeout: 120_000,
        },
      );

      if (result.status !== 0) {
        console.error("dep-cruiser stdout:", result.stdout);
        console.error("dep-cruiser stderr:", result.stderr);
      }

      expect(result.status).toBe(0);
    },
    120_000,
  );
});
