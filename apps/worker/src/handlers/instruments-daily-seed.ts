/**
 * instruments-daily-seed handler — Phase 9 (D-05/D-06/D-09/D-10/A1).
 * Daily pg-boss job:
 *   1. Upsert the instruments universe (injected feed) into budgeting.instruments.
 *   2. Flag instruments of the refreshed providers that are ABSENT from the feed as
 *      active=false (delisting detection — scoped per-provider so an unrelated
 *      provider's universe is untouched).
 *   3. For each held holding whose instrument just went inactive, emit ONE
 *      INVESTMENT_INSTRUMENT_DELISTED task (idempotent via the 0038 dedup index).
 *
 * Reference-data + cross-tenant scope: instruments upsert/deactivate via worker_role;
 * the held-set read uses investments_worker_cron_scan; the emit runs inside
 * withTenantTx(tenant) so the tasks RLS WITH CHECK passes.
 */
import type {
  TaskRepo,
  TenantTx,
  InvestmentDelistedPayload,
} from "@budget/budgeting/src/ports/task-repo";
import type { InstrumentUpsert } from "@budget/investments/src/ports/instrument-repo";
import { DrizzleInstrumentRepo } from "@budget/investments/src/adapters/persistence/instrument-repo";
import { withInfraTx, withTenantTx, workerPool } from "@budget/platform";
import { TenantId, UserId } from "@budget/shared-kernel";
import { sql } from "drizzle-orm";

const SYSTEM_USER_ID = "00000000-0000-0000-0000-000000000001";

interface PgBossLike {
  work(
    queue: string,
    handler: (job: unknown) => Promise<unknown>,
  ): Promise<void>;
}

export interface InstrumentsDailySeedDeps {
  fetchUniverse: () => Promise<InstrumentUpsert[]>;
  taskRepo: TaskRepo;
}

interface AffectedHolding {
  id: string;
  tenant_id: string;
  budget_id: string;
  name: string;
  symbol: string;
}

export async function runInstrumentsDailySeed(
  deps: InstrumentsDailySeedDeps,
): Promise<{ upserted: number; deactivated: number; delistedEmitted: number }> {
  const universe = await deps.fetchUniverse();
  const repo = new DrizzleInstrumentRepo(workerPool());

  // 1. Upsert the universe (active=true).
  for (const inst of universe) {
    await repo.upsert({ ...inst, active: true });
  }

  // 2. Deactivate the refreshed providers' instruments absent from the feed.
  // drizzle binds a JS array as a scalar param ("x" not "{x}"), so build the
  // Postgres array literals explicitly and bind them as text → ::text[].
  const providers = [...new Set(universe.map((u) => u.provider))];
  const keys = universe.map((u) => `${u.symbol}|${u.provider}`);
  const toArrayLiteral = (xs: string[]): string =>
    `{${xs.map((x) => `"${x.replace(/(["\\])/g, "\\$1")}"`).join(",")}}`;
  const providersLit = toArrayLiteral(providers);
  const keysLit = toArrayLiteral(keys);
  let deactivated = 0;
  if (providers.length > 0) {
    const r = await withInfraTx(async (tx) => {
      const res = await tx.execute(sql`
        UPDATE budgeting.instruments
           SET active = false
         WHERE active = true
           AND provider = ANY(${providersLit}::text[])
           AND (symbol || '|' || provider) <> ALL(${keysLit}::text[])
        RETURNING id
      `);
      return res.rows.length;
    });
    deactivated = r.isOk() ? r.value : 0;
  }

  // 3. Held holdings whose instrument is now inactive → emit one delisted task each.
  const affectedR = await withInfraTx(async (tx) => {
    const res = await tx.execute(sql`
      SELECT inv.id::text AS id, inv.tenant_id::text AS tenant_id,
             inv.budget_id::text AS budget_id, inv.name, i.symbol
        FROM budgeting.investments inv
        JOIN budgeting.instruments i ON i.id = inv.instrument_id
       WHERE inv.archived_at IS NULL AND i.active = false
    `);
    return res.rows as unknown as AffectedHolding[];
  });
  const affected = affectedR.isOk() ? affectedR.value : [];

  let delistedEmitted = 0;
  for (const h of affected) {
    const emitR = await withTenantTx(
      TenantId(h.tenant_id),
      UserId(SYSTEM_USER_ID),
      async (tx) => {
        const payload: InvestmentDelistedPayload = {
          holding_id: h.id,
          holding_name: h.name,
          instrument_symbol: h.symbol,
        };
        await deps.taskRepo.emitInvestmentDelisted(
          h.tenant_id,
          h.budget_id,
          payload,
          tx as unknown as TenantTx,
        );
      },
    );
    if (emitR.isOk()) delistedEmitted++;
  }

  return { upserted: universe.length, deactivated, delistedEmitted };
}

export function registerInstrumentsDailySeed(
  boss: PgBossLike,
  deps: InstrumentsDailySeedDeps,
) {
  boss.work("instruments-daily-seed", async () =>
    runInstrumentsDailySeed(deps),
  );
}
