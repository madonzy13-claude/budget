import { test, expect, beforeAll } from "bun:test";
import { sql } from "drizzle-orm";
import { startTestcontainer } from "@budget/db/test/testcontainer";
import { withUserContext } from "../src/db/tx";
import { UserId } from "@budget/shared-kernel";

beforeAll(async () => {
  await startTestcontainer();
}, 120_000);

test("withUserContext sets app.current_user_id only", async () => {
  const uid = UserId("00000000-0000-0000-0000-0000000000aa");
  const r = await withUserContext(uid, async (tx) => {
    const rows = await tx.execute(
      sql`SELECT current_setting('app.current_user_id', true) AS u, current_setting('app.tenant_ids', true) AS t`,
    );
    return rows.rows[0] as { u: string; t: string | null };
  });
  expect(r.isOk()).toBe(true);
  if (r.isOk()) {
    expect(r.value.u).toBe("00000000-0000-0000-0000-0000000000aa");
    expect(r.value.t === null || r.value.t === "").toBe(true);
  }
});
