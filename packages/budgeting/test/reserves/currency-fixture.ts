/**
 * currency-fixture.ts — builder for Phase 14 reserve replay tests on real
 * Postgres. All dates in 1998 (before the real FX history); the test clock is
 * pinned so the open month is 1998-05. Writes go through app_role.
 */
import { Pool } from "pg";
import { setServerTestNow } from "@budget/shared-kernel";
import { getReservePositions } from "../../src/application/get-reserve-positions";
import { createReserveEventLoaderRepo } from "../../src/adapters/persistence/reserve-event-loader-repo";
import { DrizzleTransactionRepo } from "../../src/adapters/persistence/transaction-repo";
import { DrizzleCategoryLimitRepo } from "../../src/adapters/persistence/category-limit-repo";
import { DrizzleReservesSummaryRepo } from "../../src/adapters/persistence/reserves-summary-repo";
import { seedFxRates, deleteFxRates } from "../fx-seed";
import { withTenantTx } from "@budget/platform";
import { TenantId, UserId } from "@budget/shared-kernel";
import { recomputeReserveTopupTask } from "../../src/application/recompute-reserve-topup-task";
import { createTaskRepo } from "../../src/adapters/persistence/task-repo";

for (const k of ["DATABASE_URL_APP", "DATABASE_URL_WORKER", "DATABASE_URL_MIGRATOR"] as const) {
  if (process.env[k]) process.env[k] = process.env[k]!.replace("@db:", "@localhost:");
}

export const NOW = new Date("1998-05-15T12:00:00Z");

export class ReserveBudget {
  readonly tenant: string = crypto.randomUUID();
  readonly user = crypto.randomUUID();
  readonly provider = `test-14-11-${crypto.randomUUID()}`;

  async sql(q: string, p: unknown[] = []) {
    const pool = new Pool({ connectionString: process.env.DATABASE_URL_APP! });
    const c = await pool.connect();
    try {
      await c.query(
        `SELECT set_config('app.current_user_id', $1, false), set_config('app.tenant_ids', $2, false)`,
        [this.user, `{${this.tenant}}`],
      );
      return await c.query(q, p);
    } finally {
      c.release();
      await pool.end();
    }
  }

  async create(ccy: string) {
    process.env.ALLOW_TEST_CLOCK = "1";
    setServerTestNow(NOW);
    await this.sql(
      `INSERT INTO identity.users (id, email, name, email_verified, created_at, updated_at)
       VALUES ($1, $2, 'Reserve Ccy', true, now(), now())`,
      [this.user, `reserve-ccy-${this.user.slice(0, 8)}@example.com`],
    );
    await this.sql(
      `INSERT INTO tenancy.budgets (id, slug, name, kind, default_currency, owner_user_id, member_count, created_at, timezone)
       VALUES ($1, $2, 'Reserve Ccy', 'PRIVATE', $3, $4, 1, now(), 'UTC')`,
      [this.tenant, `reserve-ccy-${this.tenant.slice(0, 8)}`, ccy, this.user],
    );
    return this;
  }

  async category(ccy: string) {
    const id = crypto.randomUUID();
    await this.sql(
      `INSERT INTO budgeting.categories (id, tenant_id, name, currency, created_at, actor_user_id)
       VALUES ($1, $2, $3, $4, '1998-01-01', $5)`,
      [id, this.tenant, `c-${id.slice(0, 6)}`, ccy, this.user],
    );
    return id;
  }

  /** One SCD-2 segment [from, to). */
  limit(cat: string, cents: number, ccy: string, from: string, to: string | null = null) {
    return this.sql(
      `INSERT INTO budgeting.category_limits
         (id, tenant_id, category_id, normal_amount, normal_currency, cushion_amount, cushion_currency,
          effective_from, effective_to, actor_user_id, created_at)
       VALUES (gen_random_uuid(), $1, $2, $3, $4, $3, $4, $5::date, $6::date, $7, now())`,
      [this.tenant, cat, cents, ccy, from, to, this.user],
    );
  }

  tx(cat: string, date: string, cents: number, ccy: string) {
    return this.sql(
      `INSERT INTO budgeting.expense_ledger
         (tenant_id, budget_id, category_id, transaction_date, amount_original_cents, currency_original,
          amount_converted_cents, fx_rate, fx_as_of, kind, confirmed_at, created_at)
       VALUES ($1, $1, $2, $3::date, $4, $5, 1, 1, $3::date, 'SPENDING', now(), clock_timestamp())`,
      [this.tenant, cat, date, cents, ccy],
    );
  }

  adjust(cat: string, cents: number, ccy: string, at: string) {
    return this.sql(
      `INSERT INTO budgeting.category_reserve_adjustments (tenant_id, category_id, delta_cents, currency, occurred_at)
       VALUES ($1, $2, $3, $4, $5::timestamptz)`,
      [this.tenant, cat, cents, ccy, at],
    );
  }

  rates(rows: { base: string; quote: string; date: string; rate: string }[]) {
    return seedFxRates(rows, this.provider);
  }

  wallet(ccy: string, balance: string, type = "RESERVE") {
    return this.sql(
      `INSERT INTO budgeting.wallets (id, tenant_id, name, currency, current_balance, wallet_type, created_at, actor_user_id)
       VALUES (gen_random_uuid(), $1, $2, $3, $4::numeric, $5, now(), $6)`,
      [this.tenant, `w-${crypto.randomUUID().slice(0, 6)}`, ccy, balance, type, this.user],
    );
  }

  /** Recompute the RESERVE_TOPUP task, then return its open payload (null when resolved). */
  async task(): Promise<Record<string, unknown> | null> {
    const ccy = (await this.sql(`SELECT default_currency FROM tenancy.budgets WHERE id = $1`, [this.tenant])).rows[0]
      .default_currency as string;
    const r = await withTenantTx(TenantId(this.tenant), UserId(this.user), (tx) =>
      recomputeReserveTopupTask(tx as never, { tenantId: this.tenant, budgetId: this.tenant }, {
        taskRepo: createTaskRepo(),
        reservePositions: (i) => this.positionsResult(i.tenantId),
        budgetCurrencyOf: async () => ccy,
        isReservesEnabled: async () => true,
      }),
    );
    if (r.isErr()) throw r.error;
    const row = (
      await this.sql(
        `SELECT payload_json FROM budgeting.tasks
          WHERE budget_id = $1 AND kind = 'RESERVE_TOPUP' AND resolved_at IS NULL`,
        [this.tenant],
      )
    ).rows[0];
    return row ? (row.payload_json as Record<string, unknown>) : null;
  }

  positionsResult(tenantId = this.tenant) {
    return getReservePositions({
      eventLoader: createReserveEventLoaderRepo({
        transactionRepo: new DrizzleTransactionRepo(),
        categoryLimitRepo: new DrizzleCategoryLimitRepo(),
        reservesSummaryRepo: new DrizzleReservesSummaryRepo(),
      }),
    })({ tenantId, budgetId: tenantId });
  }

  async positions() {
    const r = await getReservePositions({
      eventLoader: createReserveEventLoaderRepo({
        transactionRepo: new DrizzleTransactionRepo(),
        categoryLimitRepo: new DrizzleCategoryLimitRepo(),
        reservesSummaryRepo: new DrizzleReservesSummaryRepo(),
      }),
    })({ tenantId: this.tenant, budgetId: this.tenant });
    if (r.isErr()) throw r.error;
    return r.value;
  }

  async drop() {
    setServerTestNow(null);
    await this.sql(`DELETE FROM budgeting.tasks WHERE budget_id = $1`, [this.tenant]);
    for (const t of ["category_reserve_adjustments", "expense_ledger", "category_limits", "wallets", "categories"])
      await this.sql(`DELETE FROM budgeting.${t} WHERE tenant_id = $1`, [this.tenant]);
    await this.sql(`DELETE FROM tenancy.budgets WHERE id = $1`, [this.tenant]);
    await deleteFxRates(this.provider);
  }
}
