/**
 * route-coverage-audit.test.ts — ENGR-03 structural sentinel.
 *
 * Ensures every route file in apps/api/src/routes/ has at least one
 * corresponding integration test file in apps/api/test/routes/.
 *
 * - Scans apps/api/src/routes/*.ts (excluding index.ts and _* prefixed files)
 * - For each route file, checks for a matching test file using these candidates:
 *     1. <base>.test.ts          (e.g. transactions.test.ts)
 *     2. <base>s.test.ts         (e.g. budgets.test.ts for budget.ts)
 *     3. <overrides>[base]       (manual overrides for consolidated test files)
 * - Fails if any route file has no matching test
 *
 * KNOWN CONSOLIDATED TESTS:
 *   share-join.ts  → covered by share-links.test.ts (same domain feature)
 *
 * EXCLUDED (infrastructure / pass-through, no app logic to test here):
 *   auth.ts        → Better Auth handler pass-through; tested by Better Auth itself
 */
import { describe, test, expect } from "bun:test";
import { readdirSync, existsSync } from "node:fs";
import { join } from "node:path";

// Routes excluded from the audit — either pass-through infra or covered
// under a consolidated test file (see KNOWN CONSOLIDATED TESTS above).
const EXCLUDED_ROUTES = new Set(["auth.ts"]);

// Manual mapping: route filename → accepted test filename (for consolidated tests)
const CONSOLIDATED: Record<string, string> = {
  "share-join.ts": "share-links.test.ts",
};

describe("ENGR-03: every route has >=1 integration test", () => {
  test("each apps/api/src/routes/*.ts has a corresponding test file", () => {
    const routesDir = join(import.meta.dir, "..", "..", "src", "routes");
    const testsDir = join(import.meta.dir);

    const routeFiles = readdirSync(routesDir).filter(
      (f) => f.endsWith(".ts") && !f.startsWith("_") && f !== "index.ts",
    );

    const missing: string[] = [];

    for (const r of routeFiles) {
      if (EXCLUDED_ROUTES.has(r)) continue;

      const base = r.replace(/\.ts$/, "");

      // Check consolidated mapping first
      if (CONSOLIDATED[r]) {
        const hasConsolidated = existsSync(join(testsDir, CONSOLIDATED[r]));
        if (!hasConsolidated) missing.push(`${r} (expected consolidated test: ${CONSOLIDATED[r]})`);
        continue;
      }

      // Standard candidates
      const candidates = [`${base}.test.ts`, `${base}s.test.ts`];
      const hasTest = candidates.some((c) => existsSync(join(testsDir, c)));
      if (!hasTest) missing.push(r);
    }

    if (missing.length > 0) {
      console.error(
        "Routes missing integration tests:\n" +
          missing.map((m) => `  - ${m}`).join("\n"),
      );
    }

    expect(missing).toEqual([]);
  });
});
