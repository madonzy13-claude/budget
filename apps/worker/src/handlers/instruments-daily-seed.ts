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
import { dedupeUniverse } from "@budget/investments/src/adapters/instruments/universe-catalog";
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

export interface ColdStartUniverseSeedDeps {
  /** Count of ACTIVE instruments currently in the universe (what search reads). */
  countActiveInstruments: () => Promise<number>;
  /** Enqueue a one-off run of the `instruments-daily-seed` job. */
  enqueueSeed: () => Promise<void>;
}

/**
 * Cold-start guard (260626): the instrument universe (`budgeting.instruments
 * WHERE active = true`) is the ONLY source investment search queries, so an empty
 * table — fresh DB, first boot, or a wiped dev stack — makes crypto/equity/ETF
 * search return nothing until the next daily-seed cron (18:00 Berlin). Call this
 * on worker boot: if no active instruments exist, enqueue the seed NOW instead of
 * waiting. Idempotent (the seed upserts ON CONFLICT (symbol, provider)); a normal
 * restart with a populated universe is a no-op. Best-effort — a failing count is
 * swallowed so it never blocks startup (it retries next boot / cron). Returns
 * whether the seed was enqueued.
 */
export async function coldStartUniverseSeedIfEmpty(
  deps: ColdStartUniverseSeedDeps,
): Promise<boolean> {
  try {
    const active = await deps.countActiveInstruments();
    if (active > 0) return false;
    await deps.enqueueSeed();
    return true;
  } catch (e) {
    console.warn("[worker] cold-start universe check failed:", e);
    return false;
  }
}

interface AffectedHolding {
  id: string;
  tenant_id: string;
  budget_id: string;
  name: string;
  symbol: string;
}

/** Rows per multi-row INSERT — keeps each statement well under the 65535-param cap
 *  (8 cols/row) while still cutting ~253k singleton round-trips to a few hundred. */
const SEED_BATCH = 1000;

export async function runInstrumentsDailySeed(
  deps: InstrumentsDailySeedDeps,
): Promise<{ upserted: number; deactivated: number; delistedEmitted: number }> {
  // Dedupe by (symbol, provider): a multi-row upsert cannot carry the same conflict
  // key twice in one statement. Cross-listings make duplicates common in the feed.
  const universe = dedupeUniverse(await deps.fetchUniverse());
  const repo = new DrizzleInstrumentRepo(workerPool());

  // Capture the run start on the DB clock BEFORE any upsert. Every upserted row
  // sets fetched_at = now() (≥ runStart); rows absent from this run's feed keep an
  // older fetched_at and are deactivated below. This replaces the old per-key
  // `<> ALL(array)` diff, which doesn't scale to a ~253k-symbol global universe.
  const startR = await withInfraTx(async (tx) => {
    const res = await tx.execute(sql`SELECT clock_timestamp() AS ts`);
    return (res.rows[0] as { ts: string }).ts;
  });
  const runStart = startR.isOk() ? startR.value : null;

  // 1. Bulk upsert the universe (active=true) in batches.
  for (let i = 0; i < universe.length; i += SEED_BATCH) {
    const batch = universe
      .slice(i, i + SEED_BATCH)
      .map((inst) => ({ ...inst, active: true }));
    await repo.upsertMany(batch);
  }

  // 2. Deactivate the refreshed providers' instruments absent from this feed:
  // active rows of those providers whose fetched_at predates the run start.
  const providers = [...new Set(universe.map((u) => u.provider))];
  const providersLit = `{${providers
    .map((p) => `"${p.replace(/(["\\])/g, "\\$1")}"`)
    .join(",")}}`;
  let deactivated = 0;
  if (providers.length > 0 && runStart) {
    const r = await withInfraTx(async (tx) => {
      const res = await tx.execute(sql`
        UPDATE budgeting.instruments
           SET active = false
         WHERE active = true
           AND provider = ANY(${providersLit}::text[])
           AND fetched_at < ${runStart}::timestamptz
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
