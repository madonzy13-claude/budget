import { describe, expect, test } from "bun:test";
import { sql } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { fxConvert } from "../src/adapters/persistence/fx-sql";

const render = (q: ReturnType<typeof fxConvert>) =>
  new PgDialect().sqlToQuery(q).sql.replace(/\s+/g, " ");

describe("fxConvert", () => {
  // 261111 (user: "performance became slower"): every wealth snapshot ran
  // fx_convert five times — a SQL-function call even for a row already in the
  // budget's currency. Same currency must never reach the function.
  test("a row already in the target currency skips the function call", () => {
    const q = render(fxConvert(sql`amount`, sql`ccy`, sql`'PLN'`, sql`d`));
    expect(q).toMatch(
      /^CASE WHEN \(ccy\)::text = \('PLN'\)::text THEN \(amount\)::bigint ELSE budgeting\.fx_convert\(/,
    );
  });
});
