import { describe, it, expect, beforeAll } from "bun:test";
import { sql } from "drizzle-orm";
import { startTestcontainer } from "@budget/db/test/testcontainer";
import { appDb } from "@budget/platform";

beforeAll(async () => {
  await startTestcontainer();
}, 120_000);

describe("budget_members aggregation columns", () => {
  it("has ownership_share_pct (default 100) and include_in_aggregation (default true)", async () => {
    const cols = await appDb().execute<{
      column_name: string;
      column_default: string;
      is_nullable: string;
    }>(sql`
      SELECT column_name, column_default, is_nullable
      FROM information_schema.columns
      WHERE table_schema = 'tenancy' AND table_name = 'budget_members'
        AND column_name IN ('ownership_share_pct', 'include_in_aggregation')
      ORDER BY column_name`);
    const byName = Object.fromEntries(cols.rows.map((r) => [r.column_name, r]));
    expect(byName["include_in_aggregation"]?.is_nullable).toBe("NO");
    expect(byName["include_in_aggregation"]?.column_default).toContain("true");
    expect(byName["ownership_share_pct"]?.is_nullable).toBe("NO");
    expect(byName["ownership_share_pct"]?.column_default).toContain("100");
  });
});
