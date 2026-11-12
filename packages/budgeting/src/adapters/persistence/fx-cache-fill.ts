/**
 * fx-cache-fill.ts — stores the conversions that became final since they were
 * written (0110): a row dated today, or one whose day's rate arrived later.
 * Runs after the hourly FX fetch.
 *
 * withInfraTx only scans budget ids; each fill runs under its own budget's
 * withTenantTx so RLS scopes the UPDATE (mirrors budget-wealth-snapshot-3h).
 */
import { sql } from "drizzle-orm";
import { withInfraTx, withTenantTx } from "@budget/platform";
import { TenantId, UserId } from "@budget/shared-kernel";

const SYSTEM_USER_ID = "00000000-0000-0000-0000-000000000001";

type DrizzleTx = { execute: (q: unknown) => Promise<{ rows: Record<string, unknown>[] }> };

/** Returns how many rows were stored again. */
export async function fillFxCaches(): Promise<number> {
  const scan = await withInfraTx(async (tx) =>
    (await (tx as DrizzleTx).execute(sql`SELECT id::text AS id FROM tenancy.budgets`)).rows.map((r) => r.id as string),
  );
  if (scan.isErr()) throw scan.error;
  let n = 0;
  for (const id of scan.value) {
    const r = await withTenantTx(TenantId(id), UserId(SYSTEM_USER_ID), async (tx) =>
      Number((await (tx as DrizzleTx).execute(sql`SELECT budgeting.fx_cache_fill(${id}::uuid) AS n`)).rows[0]!.n),
    );
    if (r.isErr()) throw r.error;
    n += r.value;
  }
  return n;
}
