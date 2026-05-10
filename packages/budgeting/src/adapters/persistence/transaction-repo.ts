/**
 * transaction-repo.ts — Drizzle adapter for TransactionRepo port.
 *
 * Single-tx ledger writer: INSERTs expense_ledger row(s) + updates accounts.current_balance
 * + upserts spending_by_category_month + emits budgeting.transaction.created outbox event.
 * ALL four side effects happen inside ONE withTenantTx (Pitfall 7 / D-05-e / ENGR-14).
 *
 * Two entry points (CROSS-PLAN CONTRACT):
 *   create()      — opens its own withTenantTx; used by createTransaction use case.
 *   createInTx()  — joins the caller's tx; used by plan 02-08 confirm-recurring-draft.
 * create() delegates its body to createInTx() — single source of truth, no diverged effects.
 */
import { sql } from "drizzle-orm";
import { withTenantTx, writeOutbox } from "@budget/platform";
import { TenantId, UserId } from "@budget/shared-kernel";
import type { TransactionRepo, TransactionRow } from "../../ports/transaction-repo";
import type { AccountRepo } from "../../ports/account-repo";
import type { SpendingProjectionRepo } from "../../ports/spending-projection-repo";
import type { Transaction } from "../../domain/transaction";

function firstDayOfMonth(dateStr: string): string {
  // dateStr = 'YYYY-MM-DD' → 'YYYY-MM-01'
  return dateStr.slice(0, 8) + "01";
}

function rowToTransaction(row: Record<string, unknown>): Transaction {
  const { Transaction: TxClass } = require("../../domain/transaction");
  return new TxClass(
    row.id as string,
    row.tenant_id as string,
    row.kind as "EXPENSE" | "INCOME" | "TRANSFER",
    String(row.amount_orig),
    row.currency_orig as string,
    String(row.amount_default),
    row.currency_default as string,
    String(row.fx_rate),
    row.fx_rate_date as string,
    row.fx_provider as string,
    row.transaction_date as string,
    (row.note as string | null) ?? null,
    row.account_id as string,
    (row.category_id as string | null) ?? null,
    (row.transfer_group_id as string | null) ?? null,
    (row.corrects_id as string | null) ?? null,
    new Date(row.created_at as string),
  );
}

export class DrizzleTransactionRepo implements TransactionRepo {
  constructor(
    private readonly accountRepo: AccountRepo,
    private readonly projectionRepo: SpendingProjectionRepo,
  ) {}

  /** Opens its own withTenantTx and delegates the body to createInTx. */
  async create(
    rows: TransactionRow[],
    userId: string,
    tenantId: string,
  ): Promise<void> {
    const r = await withTenantTx(TenantId(tenantId), UserId(userId), async (tx) => {
      await this.createInTx(tx, rows, userId, tenantId);
    });
    if (r.isErr()) throw r.error;
  }

  /**
   * Caller-managed-tx entry: accepts an existing tx.
   * Used by plan 02-08 confirm-recurring-draft so ledger INSERT + draft UPDATE share one tx.
   * Produces identical side effects as create(): ledger + balance + projection + outbox.
   */
  async createInTx(
    tx: unknown,
    rows: TransactionRow[],
    userId: string,
    tenantId: string,
  ): Promise<void> {
    const drizzleTx = tx as { execute: (q: unknown) => Promise<unknown> };

    for (const row of rows) {
      // 1. INSERT ledger row
      await drizzleTx.execute(
        sql`INSERT INTO budgeting.expense_ledger
              (id, tenant_id, amount_orig, currency_orig, amount_default, currency_default,
               fx_rate, fx_rate_date, fx_provider, corrects_id,
               transaction_date, note, account_id, category_id, kind, transfer_group_id,
               created_at)
            VALUES
              (${row.id}::uuid, ${row.tenantId}::uuid,
               ${row.amountOrig}::numeric, ${row.currencyOrig},
               ${row.amountDefault}::numeric, ${row.currencyDefault},
               ${row.fxRate}::numeric, ${row.fxRateDate}::date, ${row.fxProvider},
               ${row.correctsId ? sql`${row.correctsId}::uuid` : sql`NULL`},
               ${row.transactionDate}::date,
               ${row.note ?? null},
               ${row.accountId}::uuid,
               ${row.categoryId ? sql`${row.categoryId}::uuid` : sql`NULL`},
               ${row.kind},
               ${row.transferGroupId ? sql`${row.transferGroupId}::uuid` : sql`NULL`},
               now())`,
      );

      // 2. Sync accounts.current_balance (D-05-e)
      const signedDelta = row.balanceDeltaSign === 1
        ? row.amountOrig
        : `-${row.amountOrig}`;
      await this.accountRepo.applyDelta(tx, row.accountId, signedDelta);

      // 3. Upsert spending_by_category_month (ENGR-14) — EXPENSE/INCOME with categoryId only
      if (row.kind !== "TRANSFER" && row.categoryId) {
        const monthStart = firstDayOfMonth(row.transactionDate);
        await this.projectionRepo.upsert(tx, {
          tenantId: row.tenantId,
          workspaceId: row.tenantId, // workspace == tenant in single-workspace model
          categoryId: row.categoryId,
          monthStartDate: monthStart,
          deltaNormal: row.kind === "EXPENSE" ? row.amountDefault : "0",
          deltaCushion: "0",
          currency: row.currencyDefault,
        });
      }

      // 4. Write outbox (Pitfall 7 — same tx as ledger INSERT)
      await writeOutbox(tx, {
        tenantId: TenantId(row.tenantId),
        aggregateType: "transaction",
        aggregateId: row.id,
        eventType: "budgeting.transaction.created",
        payload: {
          ledgerId: row.id,
          tenantId: row.tenantId,
          kind: row.kind,
          accountId: row.accountId,
          categoryId: row.categoryId,
          amountDefault: row.amountDefault,
          currencyDefault: row.currencyDefault,
          transactionDate: row.transactionDate,
          transferGroupId: row.transferGroupId,
        },
      });
    }
  }

  async listLatest(
    tenantId: string,
    opts: { limit: number; before?: { transactionDate: string; id: string } },
  ): Promise<Transaction[]> {
    const tid = TenantId(tenantId);
    const uid = UserId(tenantId); // read path — tenantId as placeholder

    const r = await withTenantTx(tid, uid, async (tx) => {
      const drizzleTx = tx as { execute: (q: unknown) => Promise<{ rows: Record<string, unknown>[] }> };
      let result: { rows: Record<string, unknown>[] };

      if (opts.before) {
        result = await drizzleTx.execute(
          sql`SELECT id, tenant_id, kind, amount_orig, currency_orig, amount_default,
                     currency_default, fx_rate, fx_rate_date::text, fx_provider,
                     transaction_date::text, note, account_id, category_id,
                     transfer_group_id, corrects_id, created_at
              FROM budgeting.expense_ledger
              WHERE tenant_id = ${tenantId}::uuid
                AND corrects_id IS NULL
                AND id NOT IN (
                  SELECT COALESCE(corrects_id, '00000000-0000-0000-0000-000000000000'::uuid)
                  FROM budgeting.expense_ledger
                  WHERE tenant_id = ${tenantId}::uuid AND corrects_id IS NOT NULL
                )
                AND (transaction_date, id::text) < (${opts.before.transactionDate}::date, ${opts.before.id})
              ORDER BY transaction_date DESC, id DESC
              LIMIT ${opts.limit}`,
        );
      } else {
        result = await drizzleTx.execute(
          sql`SELECT id, tenant_id, kind, amount_orig, currency_orig, amount_default,
                     currency_default, fx_rate, fx_rate_date::text, fx_provider,
                     transaction_date::text, note, account_id, category_id,
                     transfer_group_id, corrects_id, created_at
              FROM budgeting.expense_ledger
              WHERE tenant_id = ${tenantId}::uuid
                AND corrects_id IS NULL
                AND id NOT IN (
                  SELECT COALESCE(corrects_id, '00000000-0000-0000-0000-000000000000'::uuid)
                  FROM budgeting.expense_ledger
                  WHERE tenant_id = ${tenantId}::uuid AND corrects_id IS NOT NULL
                )
              ORDER BY transaction_date DESC, id DESC
              LIMIT ${opts.limit}`,
        );
      }

      return result.rows;
    });

    if (r.isErr()) throw r.error;
    return r.value.map(rowToTransaction);
  }
}
