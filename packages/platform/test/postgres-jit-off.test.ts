import { test, expect } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * 261102: SigNoz showed the Overview "planned limits" query at 665ms live. It
 * runs in 24ms — the rest was JIT compiling 70 functions, because the planner
 * guesses generate_series at 1000 rows (38 real) and the cost crosses
 * jit_above_cost. Every query here is a small tenant-scoped OLTP read; JIT has
 * only ever cost time (260613: /budgets/active 1.9s for the same reason).
 */
test("the Postgres config turns JIT off", () => {
  const conf = readFileSync(
    join(import.meta.dir, "../../../infra/postgres/postgresql.conf"),
    "utf8",
  );
  expect(conf).toMatch(/^jit\s*=\s*off\b/m);
});
