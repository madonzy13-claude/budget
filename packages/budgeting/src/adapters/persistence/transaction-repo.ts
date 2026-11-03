/**
 * transaction-repo.ts — Drizzle adapter for TransactionRepo port v1.1.
 *
 * v1.1 (Phase 2, Plan 02-01): categorical-only, FX-on-PATCH, confirmed_at draft flag.
 * All SQL uses new column names from migration 0013:
 *   amount_original_cents (bigint), the write-time converted amount (bigint),
 *   currency_original, fx_as_of, budget_id, kind SPENDING|INCOME,
 *   scheduled_payment_id, confirmed_at, updated_at, deleted_at.
 *
 * Phase 14 (D-02): every READ re-expresses the amount in the budget's CURRENT
 * currency at the row's own date via budgeting.fx_convert — the stored
 * write-time conversion is only written, never read (the currency may change).
 *
 * Removed: wallet balance delta, spending_by_category_month upsert, correction chain.
 * Added: updateInPlace, confirm, softDelete, listForMonth.
 */
import { sql } from "drizzle-orm";
import { withTenantTx, writeOutbox } from "@budget/platform";
import { fxConvert } from "./fx-sql";
import { TenantId, UserId } from "@budget/shared-kernel";
import type {
  TransactionRepo,
  TransactionRow,
} from "../../ports/transaction-repo";

export class TransactionNotFoundError extends Error {
  readonly kind = "TransactionNotFound" as const;
  constructor(public readonly id: string) {
    super(`Transaction ${id} not found`);
    this.name = "TransactionNotFoundError";
  }
}

function dbRowToTransactionRow(row: Record<string, unknown>): TransactionRow {
  return {
    id: row.id as string,
    tenantId: row.tenant_id as string,
    budgetId: (row.budget_id ?? row.tenant_id) as string,
    categoryId: row.category_id as string,
    date: (row.date as string) ?? (row.transaction_date as string),
    amountOriginalCents: String(row.amount_original_cents),
    currencyOriginal: row.currency_original as string,
    amountConvertedCents: String(row.converted_cents),
    currencyConverted: row.currency_converted as string,
    fxUnavailable: row.fx_unavailable === true,
    fxRate: String(row.fx_rate),
    fxAsOf: (row.fx_as_of ?? row.fx_as_of_text) as string,
    note: (row.note as string | null) ?? null,
    scheduledPaymentId: (row.scheduled_payment_id as string | null) ?? null,
    confirmedAt: row.confirmed_at ? new Date(row.confirmed_at as string) : null,
    kind: (row.kind as "SPENDING" | "INCOME") ?? "SPENDING",
    createdAt: new Date(row.created_at as string),
    updatedAt: new Date(
      (row.updated_at as string) ?? (row.created_at as string),
    ),
    deletedAt: row.deleted_at ? new Date(row.deleted_at as string) : null,
  };
}

/**
 * Ledger row columns, the amount re-expressed in the budget's CURRENT currency
 * at the row's own date (D-02). A pair with no FX history keeps the original
 * amount in its own currency and is flagged — never booked at par.
 */
const LEDGER_SELECT = sql`SELECT l.id, l.tenant_id, l.budget_id, l.category_id,
         l.transaction_date::text AS date,
         l.amount_original_cents, l.currency_original,
         COALESCE(x.cv, l.amount_original_cents) AS converted_cents,
         CASE WHEN x.cv IS NULL THEN l.currency_original ELSE b.default_currency::text END AS currency_converted,
         (x.cv IS NULL) AS fx_unavailable,
         l.fx_rate::text, l.fx_as_of::text AS fx_as_of,
         l.note, l.kind, l.scheduled_payment_id, l.confirmed_at, l.created_at, l.updated_at, l.deleted_at
    FROM budgeting.expense_ledger l
    JOIN tenancy.budgets b ON b.id = l.budget_id
    CROSS JOIN LATERAL (
      SELECT ${fxConvert(sql`l.amount_original_cents`, sql`l.currency_original`, sql`b.default_currency`, sql`l.transaction_date`)} AS cv
    ) x`;

/** SUM of spending in the budget's current currency, each row at its own date. */
const spendSum = (budgetId: string) =>
  sql`COALESCE(SUM(${fxConvert(
    sql`amount_original_cents`,
    sql`currency_original`,
    sql`(SELECT default_currency FROM tenancy.budgets WHERE id = ${budgetId}::uuid)`,
    sql`transaction_date`,
  )}), 0)`;

export class DrizzleTransactionRepo implements TransactionRepo {
  // Constructor accepts repo handles for cross-aggregate side-effects
  // (account balance, projection bookkeeping). Stored but not yet consumed
  // by every method — kept as wiring point for factory-level composition.
  constructor(_accountRepo?: unknown, _projectionRepo?: unknown) {}

  async create(
    row: TransactionRow,
    userId: string,
    tenantId: string,
  ): Promise<void> {
    const r = await withTenantTx(
      TenantId(tenantId),
      UserId(userId),
      async (tx) => {
        const drizzleTx = tx as { execute: (q: unknown) => Promise<unknown> };

        await drizzleTx.execute(
          sql`INSERT INTO budgeting.expense_ledger
              (id, tenant_id, budget_id, category_id, transaction_date,
               amount_original_cents, currency_original,
               amount_converted_cents, fx_rate, fx_as_of,
               note, kind, scheduled_payment_id, confirmed_at,
               created_at, updated_at)
            VALUES
              (${row.id}::uuid,
               ${row.tenantId}::uuid,
               ${row.budgetId}::uuid,
               ${row.categoryId}::uuid,
               ${row.date}::date,
               ${row.amountOriginalCents}::bigint,
               ${row.currencyOriginal},
               ${row.amountConvertedCents}::bigint,
               ${row.fxRate}::numeric,
               ${row.fxAsOf}::date,
               ${row.note ?? null},
               ${row.kind},
               ${row.scheduledPaymentId ? sql`${row.scheduledPaymentId}::uuid` : sql`NULL`},
               ${row.confirmedAt ? row.confirmedAt.toISOString() : null}::timestamptz,
               now(), now())`,
        );

        await writeOutbox(tx, {
          tenantId: TenantId(row.tenantId),
          aggregateType: "transaction",
          aggregateId: row.id,
          eventType: "budgeting.transaction.created",
          payload: {
            ledgerId: row.id,
            tenantId: row.tenantId,
            budgetId: row.budgetId,
            categoryId: row.categoryId,
            kind: row.kind,
            amountOriginalCents: row.amountOriginalCents,
            currencyOriginal: row.currencyOriginal,
            amountConvertedCents: row.amountConvertedCents,
            date: row.date,
            confirmedAt: row.confirmedAt?.toISOString() ?? null,
          },
        });
      },
    );
    if (r.isErr()) throw r.error;
  }

  async categoryCurrency(tenantId: string, categoryId: string): Promise<string | null> {
    const r = await withTenantTx(TenantId(tenantId), UserId(tenantId), async (tx) => {
      const rs = await (
        tx as { execute: (q: unknown) => Promise<{ rows: { currency: string }[] }> }
      ).execute(
        sql`SELECT currency FROM budgeting.categories
             WHERE id = ${categoryId}::uuid AND tenant_id = ${tenantId}::uuid`,
      );
      return rs.rows[0]?.currency ?? null;
    });
    if (r.isErr()) throw r.error;
    return r.value;
  }

  async findById(tenantId: string, id: string): Promise<TransactionRow | null> {
    const r = await withTenantTx(
      TenantId(tenantId),
      UserId(tenantId),
      async (tx) => {
        const drizzleTx = tx as {
          execute: (q: unknown) => Promise<{ rows: Record<string, unknown>[] }>;
        };
        const result = await drizzleTx.execute(
          sql`${LEDGER_SELECT}
            WHERE l.id = ${id}::uuid
              AND l.tenant_id = ${tenantId}::uuid
              AND l.deleted_at IS NULL
            LIMIT 1`,
        );
        return result.rows[0] ?? null;
      },
    );
    if (r.isErr()) throw r.error;
    if (!r.value) return null;
    return dbRowToTransactionRow(r.value);
  }

  async updateInPlace(
    id: string,
    fields: Parameters<TransactionRepo["updateInPlace"]>[1],
    userId: string,
    tenantId: string,
  ): Promise<void> {
    const r = await withTenantTx(
      TenantId(tenantId),
      UserId(userId),
      async (tx) => {
        const drizzleTx = tx as { execute: (q: unknown) => Promise<unknown> };

        // Build SET clauses dynamically — only include provided fields
        const setClauses: ReturnType<typeof sql>[] = [];
        if (fields.date !== undefined) {
          setClauses.push(sql`transaction_date = ${fields.date}::date`);
          setClauses.push(
            sql`fx_as_of = ${fields.fxAsOf ?? fields.date}::date`,
          );
        }
        if (fields.fxAsOf !== undefined && fields.date === undefined) {
          setClauses.push(sql`fx_as_of = ${fields.fxAsOf}::date`);
        }
        if (fields.categoryId !== undefined) {
          setClauses.push(sql`category_id = ${fields.categoryId}::uuid`);
        }
        if (fields.amountOriginalCents !== undefined) {
          setClauses.push(
            sql`amount_original_cents = ${fields.amountOriginalCents}::bigint`,
          );
        }
        if (fields.currencyOriginal !== undefined) {
          setClauses.push(sql`currency_original = ${fields.currencyOriginal}`);
        }
        if (fields.amountConvertedCents !== undefined) {
          setClauses.push(
            sql`amount_converted_cents = ${fields.amountConvertedCents}::bigint`,
          );
        }
        if (fields.fxRate !== undefined) {
          setClauses.push(sql`fx_rate = ${fields.fxRate}::numeric`);
        }
        if (fields.note !== undefined) {
          setClauses.push(sql`note = ${fields.note}`);
        }
        if (fields.kind !== undefined) {
          setClauses.push(sql`kind = ${fields.kind}`);
        }
        if (fields.scheduledPaymentId !== undefined) {
          setClauses.push(
            fields.scheduledPaymentId
              ? sql`scheduled_payment_id = ${fields.scheduledPaymentId}::uuid`
              : sql`scheduled_payment_id = NULL`,
          );
        }
        if (fields.confirmedAt !== undefined) {
          setClauses.push(
            fields.confirmedAt
              ? sql`confirmed_at = ${fields.confirmedAt.toISOString()}::timestamptz`
              : sql`confirmed_at = NULL`,
          );
        }
        // Always bump updated_at
        setClauses.push(sql`updated_at = now()`);

        if (setClauses.length <= 1) {
          // Only updated_at — nothing to update
          return;
        }

        // Join SET clauses with commas
        const setFragment = setClauses.reduce((acc, clause, i) =>
          i === 0 ? clause : sql`${acc}, ${clause}`,
        );

        await drizzleTx.execute(
          sql`UPDATE budgeting.expense_ledger
            SET ${setFragment}
            WHERE id = ${id}::uuid
              AND tenant_id = ${tenantId}::uuid
              AND deleted_at IS NULL`,
        );

        await writeOutbox(tx, {
          tenantId: TenantId(tenantId),
          aggregateType: "transaction",
          aggregateId: id,
          eventType: "budgeting.transaction.updated",
          payload: { id, tenantId, fields },
        });
      },
    );
    if (r.isErr()) throw r.error;
  }

  async confirm(id: string, userId: string, tenantId: string): Promise<void> {
    const r = await withTenantTx(
      TenantId(tenantId),
      UserId(userId),
      async (tx) => {
        const drizzleTx = tx as { execute: (q: unknown) => Promise<unknown> };
        await drizzleTx.execute(
          sql`UPDATE budgeting.expense_ledger
            SET confirmed_at = now(), updated_at = now()
            WHERE id = ${id}::uuid
              AND tenant_id = ${tenantId}::uuid
              AND confirmed_at IS NULL
              AND deleted_at IS NULL`,
        );
        await writeOutbox(tx, {
          tenantId: TenantId(tenantId),
          aggregateType: "transaction",
          aggregateId: id,
          eventType: "budgeting.transaction.confirmed",
          payload: { id, tenantId },
        });
      },
    );
    if (r.isErr()) throw r.error;
  }

  async softDelete(
    id: string,
    userId: string,
    tenantId: string,
  ): Promise<void> {
    const r = await withTenantTx(
      TenantId(tenantId),
      UserId(userId),
      async (tx) => {
        const drizzleTx = tx as { execute: (q: unknown) => Promise<unknown> };
        await drizzleTx.execute(
          sql`UPDATE budgeting.expense_ledger
            SET deleted_at = now(), updated_at = now()
            WHERE id = ${id}::uuid
              AND tenant_id = ${tenantId}::uuid
              AND deleted_at IS NULL`,
        );
        await writeOutbox(tx, {
          tenantId: TenantId(tenantId),
          aggregateType: "transaction",
          aggregateId: id,
          eventType: "budgeting.transaction.deleted",
          payload: { id, tenantId },
        });
      },
    );
    if (r.isErr()) throw r.error;
  }

  async listForMonth(
    tenantId: string,
    budgetId: string,
    month: string,
    confirmed: boolean | "any",
  ): Promise<TransactionRow[]> {
    // Parse 'YYYY-MM' into month boundaries
    const [year, mon] = month.split("-").map(Number);
    const firstDay = `${year}-${String(mon).padStart(2, "0")}-01`;
    const nextMonth =
      mon === 12
        ? `${year + 1}-01-01`
        : `${year}-${String(mon + 1).padStart(2, "0")}-01`;

    const r = await withTenantTx(
      TenantId(tenantId),
      UserId(tenantId),
      async (tx) => {
        const drizzleTx = tx as {
          execute: (q: unknown) => Promise<{ rows: Record<string, unknown>[] }>;
        };

        const confirmedFilter =
          confirmed === "any"
            ? sql`TRUE`
            : confirmed === true
              ? sql`l.confirmed_at IS NOT NULL`
              : sql`l.confirmed_at IS NULL`;

        const result = await drizzleTx.execute(
          sql`${LEDGER_SELECT}
            WHERE l.tenant_id = ${tenantId}::uuid
              AND l.budget_id = ${budgetId}::uuid
              AND l.transaction_date >= ${firstDay}::date
              AND l.transaction_date < ${nextMonth}::date
              AND l.deleted_at IS NULL
              AND l.dismissed_at IS NULL
              -- User (R6): set aside to a future date — back on that date.
              AND l.deferred_at IS NULL
              AND ${confirmedFilter}
            ORDER BY l.transaction_date DESC, l.created_at DESC`,
        );
        return result.rows;
      },
    );
    if (r.isErr()) throw r.error;
    return r.value.map(dbRowToTransactionRow);
  }

  async latestSpendingCreatedAt(
    tenantId: string,
    budgetId: string,
    monthStart: string,
    monthEnd: string,
  ): Promise<string | null> {
    const r = await withTenantTx(
      TenantId(tenantId),
      UserId(tenantId),
      async (tx) => {
        const drizzleTx = tx as {
          execute: (q: unknown) => Promise<{ rows: Record<string, unknown>[] }>;
        };
        const result = await drizzleTx.execute(
          // max(confirmed_at), NOT max(created_at): a scheduled draft is created
          // by the worker (created_at = generation time) and confirmed later, so
          // created_at would report a moment from the row's unconfirmed-draft era.
          // For manually added spendings the two are the same instant.
          sql`SELECT max(confirmed_at) AS latest
            FROM budgeting.expense_ledger
            WHERE tenant_id = ${tenantId}::uuid
              AND budget_id = ${budgetId}::uuid
              AND kind = 'SPENDING'
              AND transaction_date >= ${monthStart}::date
              AND transaction_date < ${monthEnd}::date
              AND confirmed_at IS NOT NULL
              AND deleted_at IS NULL`,
        );
        return result.rows[0]?.latest ?? null;
      },
    );
    if (r.isErr()) throw r.error;
    return r.value ? new Date(r.value as string | Date).toISOString() : null;
  }

  /** R6 (user): confirmed spending per day in [monthStart, monthEnd), budget
   *  currency — so a month's spend converts at the days it was paid. */
  async spendByDayForMonth(
    tenantId: string,
    budgetId: string,
    monthStart: string,
    monthEnd: string,
  ): Promise<{ date: string; cents: bigint }[]> {
    const SYSTEM_USER_ID = "00000000-0000-0000-0000-000000000001";
    const r = await withTenantTx(
      TenantId(tenantId),
      UserId(SYSTEM_USER_ID),
      async (tx) => {
        const res = await (
          tx as {
            execute: (
              q: unknown,
            ) => Promise<{ rows: { d: string; cents: string }[] }>;
          }
        ).execute(sql`
          SELECT transaction_date::text AS d,
                 ${spendSum(budgetId)}::text AS cents
            FROM budgeting.expense_ledger
           WHERE tenant_id = ${tenantId}::uuid
             AND budget_id = ${budgetId}::uuid
             AND kind = 'SPENDING'
             AND transaction_date >= ${monthStart}::date
             AND transaction_date < ${monthEnd}::date
             AND confirmed_at IS NOT NULL
             AND deleted_at IS NULL
           GROUP BY transaction_date
           ORDER BY transaction_date
        `);
        return res.rows.map((row) => ({
          date: row.d,
          cents: BigInt(row.cents),
        }));
      },
    );
    if (r.isErr()) throw r.error;
    return r.value;
  }

  async spendByCategoryForMonth(
    tenantId: string,
    budgetId: string,
    monthStart: string,
    monthEnd: string,
  ): Promise<Map<string, bigint>> {
    const SYSTEM_USER_ID = "00000000-0000-0000-0000-000000000001";
    const r = await withTenantTx(
      TenantId(tenantId),
      UserId(SYSTEM_USER_ID),
      async (tx) => {
        const drizzleTx = tx as {
          execute: (q: unknown) => Promise<{ rows: Record<string, unknown>[] }>;
        };
        const res = await drizzleTx.execute(sql`
          SELECT category_id::text, ${spendSum(budgetId)}::text AS spent_cents
            FROM budgeting.expense_ledger
           WHERE tenant_id = ${tenantId}::uuid
             AND budget_id = ${budgetId}::uuid
             AND kind = 'SPENDING'
             AND transaction_date >= ${monthStart}::date
             AND transaction_date < ${monthEnd}::date
             AND confirmed_at IS NOT NULL
             AND deleted_at IS NULL
           GROUP BY category_id
        `);
        const m = new Map<string, bigint>();
        for (const row of res.rows as Array<{
          category_id: string;
          spent_cents: string;
        }>) {
          if (row.category_id) {
            m.set(row.category_id, BigInt(row.spent_cents));
          }
        }
        return m;
      },
    );
    if (r.isErr()) throw r.error;
    return r.value;
  }

  async spendByCategoryForMonthInCategoryCurrency(
    tenantId: string,
    budgetId: string,
    monthStart: string,
    monthEnd: string,
  ): Promise<Map<string, bigint>> {
    const r = await withTenantTx(TenantId(tenantId), UserId(tenantId), async (tx) => {
      const res = await (tx as { execute: (q: unknown) => Promise<{ rows: Record<string, unknown>[] }> }).execute(sql`
        SELECT l.category_id::text AS category_id,
               COALESCE(SUM(${fxConvert(sql`l.amount_original_cents`, sql`l.currency_original`, sql`c.currency`, sql`l.transaction_date`)}), 0)::text AS cents
          FROM budgeting.expense_ledger l
          JOIN budgeting.categories c ON c.id = l.category_id
         WHERE l.tenant_id = ${tenantId}::uuid
           AND l.budget_id = ${budgetId}::uuid
           AND l.kind = 'SPENDING'
           AND l.transaction_date >= ${monthStart}::date
           AND l.transaction_date < ${monthEnd}::date
           AND l.confirmed_at IS NOT NULL
           AND l.deleted_at IS NULL
         GROUP BY l.category_id`);
      return new Map(res.rows.map((row) => [row.category_id as string, BigInt(row.cents as string)]));
    });
    if (r.isErr()) throw r.error;
    return r.value;
  }

  async spendByCategoryByMonth(
    tenantId: string,
    budgetId: string,
    beforeMonthEnd: string,
  ): Promise<Map<string, Map<string, bigint>>> {
    const SYSTEM_USER_ID = "00000000-0000-0000-0000-000000000001";
    const r = await withTenantTx(
      TenantId(tenantId),
      UserId(SYSTEM_USER_ID),
      async (tx) => {
        const drizzleTx = tx as {
          execute: (q: unknown) => Promise<{ rows: Record<string, unknown>[] }>;
        };
        const res = await drizzleTx.execute(sql`
          SELECT category_id::text,
                 to_char(transaction_date, 'YYYY-MM') AS month,
                 ${spendSum(budgetId)}::text AS spent_cents
            FROM budgeting.expense_ledger
           WHERE tenant_id = ${tenantId}::uuid
             AND budget_id = ${budgetId}::uuid
             AND kind = 'SPENDING'
             AND transaction_date < ${beforeMonthEnd}::date
             AND confirmed_at IS NOT NULL
             AND deleted_at IS NULL
           GROUP BY category_id, to_char(transaction_date, 'YYYY-MM')
        `);
        const out = new Map<string, Map<string, bigint>>();
        for (const row of res.rows as Array<{
          category_id: string;
          month: string;
          spent_cents: string;
        }>) {
          if (!row.category_id) continue;
          let byMonth = out.get(row.category_id);
          if (!byMonth) {
            byMonth = new Map<string, bigint>();
            out.set(row.category_id, byMonth);
          }
          byMonth.set(row.month, BigInt(row.spent_cents));
        }
        return out;
      },
    );
    if (r.isErr()) throw r.error;
    return r.value;
  }
}
