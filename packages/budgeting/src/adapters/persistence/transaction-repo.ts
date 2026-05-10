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
 *
 * Plan 02-07 additions:
 *   findById()           — SELECT by id (RLS-scoped)
 *   insertCorrection()   — correction-row writer with delta reversal + re-apply
 *   getCorrectionChain() — recursive CTE to walk full chain
 */
import { sql } from "drizzle-orm";
import { withTenantTx, writeOutbox, writeAudit } from "@budget/platform";
import { TenantId, UserId } from "@budget/shared-kernel";
import type { TransactionRepo, TransactionRow } from "../../ports/transaction-repo";
import type { AccountRepo } from "../../ports/account-repo";
import type { SpendingProjectionRepo } from "../../ports/spending-projection-repo";
import type { Transaction } from "../../domain/transaction";
import { buildCorrectionRow } from "../../domain/correction";

export class AlreadyCorrectedError extends Error {
  readonly kind = "AlreadyCorrected" as const;
  constructor(public readonly originalId: string) {
    super(`Transaction ${originalId} has already been corrected`);
    this.name = "AlreadyCorrectedError";
  }
}

export class TransactionNotFoundError extends Error {
  readonly kind = "TransactionNotFound" as const;
  constructor(public readonly id: string) {
    super(`Transaction ${id} not found`);
    this.name = "TransactionNotFoundError";
  }
}

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

function dbRowToTransactionRow(row: Record<string, unknown>): TransactionRow {
  const kind = row.kind as "EXPENSE" | "INCOME" | "TRANSFER";
  return {
    id: row.id as string,
    tenantId: row.tenant_id as string,
    kind,
    amountOrig: String(row.amount_orig),
    currencyOrig: row.currency_orig as string,
    amountDefault: String(row.amount_default),
    currencyDefault: row.currency_default as string,
    fxRate: String(row.fx_rate),
    fxRateDate: row.fx_rate_date as string,
    fxProvider: row.fx_provider as string,
    transactionDate: row.transaction_date as string,
    note: (row.note as string | null) ?? null,
    accountId: row.account_id as string,
    categoryId: (row.category_id as string | null) ?? null,
    transferGroupId: (row.transfer_group_id as string | null) ?? null,
    correctsId: (row.corrects_id as string | null) ?? null,
    balanceDeltaSign: kind === "INCOME" ? 1 : -1,
  };
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
          sql`SELECT e.id, e.tenant_id, e.kind, e.amount_orig, e.currency_orig, e.amount_default,
                     e.currency_default, e.fx_rate, e.fx_rate_date::text, e.fx_provider,
                     e.transaction_date::text, e.note, e.account_id, e.category_id,
                     e.transfer_group_id, e.corrects_id, e.created_at,
                     EXISTS(SELECT 1 FROM budgeting.expense_ledger c WHERE c.corrects_id = e.id) AS has_corrections
              FROM budgeting.expense_ledger e
              WHERE e.tenant_id = ${tenantId}::uuid
                AND e.corrects_id IS NULL
                AND e.id NOT IN (
                  SELECT COALESCE(corrects_id, '00000000-0000-0000-0000-000000000000'::uuid)
                  FROM budgeting.expense_ledger
                  WHERE tenant_id = ${tenantId}::uuid AND corrects_id IS NOT NULL
                )
                AND (e.transaction_date, e.id::text) < (${opts.before.transactionDate}::date, ${opts.before.id})
              ORDER BY e.transaction_date DESC, e.id DESC
              LIMIT ${opts.limit}`,
        );
      } else {
        result = await drizzleTx.execute(
          sql`SELECT e.id, e.tenant_id, e.kind, e.amount_orig, e.currency_orig, e.amount_default,
                     e.currency_default, e.fx_rate, e.fx_rate_date::text, e.fx_provider,
                     e.transaction_date::text, e.note, e.account_id, e.category_id,
                     e.transfer_group_id, e.corrects_id, e.created_at,
                     EXISTS(SELECT 1 FROM budgeting.expense_ledger c WHERE c.corrects_id = e.id) AS has_corrections
              FROM budgeting.expense_ledger e
              WHERE e.tenant_id = ${tenantId}::uuid
                AND e.corrects_id IS NULL
                AND e.id NOT IN (
                  SELECT COALESCE(corrects_id, '00000000-0000-0000-0000-000000000000'::uuid)
                  FROM budgeting.expense_ledger
                  WHERE tenant_id = ${tenantId}::uuid AND corrects_id IS NOT NULL
                )
              ORDER BY e.transaction_date DESC, e.id DESC
              LIMIT ${opts.limit}`,
        );
      }

      return result.rows;
    });

    if (r.isErr()) throw r.error;
    return r.value.map(rowToTransaction);
  }

  /** Plan 02-07: Find a single transaction row by id (RLS-scoped). */
  async findById(tenantId: string, id: string): Promise<TransactionRow | null> {
    const tid = TenantId(tenantId);
    const uid = UserId(tenantId);

    const r = await withTenantTx(tid, uid, async (tx) => {
      const drizzleTx = tx as { execute: (q: unknown) => Promise<{ rows: Record<string, unknown>[] }> };
      const result = await drizzleTx.execute(
        sql`SELECT id, tenant_id, kind, amount_orig, currency_orig, amount_default,
                   currency_default, fx_rate, fx_rate_date::text, fx_provider,
                   transaction_date::text, note, account_id, category_id,
                   transfer_group_id, corrects_id, created_at
            FROM budgeting.expense_ledger
            WHERE id = ${id}::uuid AND tenant_id = ${tenantId}::uuid
            LIMIT 1`,
      );
      return result.rows[0] ?? null;
    });

    if (r.isErr()) throw r.error;
    if (!r.value) return null;
    return dbRowToTransactionRow(r.value);
  }

  /**
   * Plan 02-07: Insert a correction row atomically.
   * SELECT FOR UPDATE on original serializes concurrent edits (T-2-07-02).
   * Returns AlreadyCorrectedError if original already has a correction row pointing at it.
   * Side effects in same tx: INSERT correction + balance delta reversal/re-apply + projection +
   * writeAudit + writeOutbox budgeting.transaction.corrected.
   */
  async insertCorrection(
    originalId: string,
    newFields: Partial<TransactionRow>,
    userId: string,
    tenantId: string,
    diff: Record<string, { before: unknown; after: unknown }>,
  ): Promise<{ ledgerId: string }> {
    let resultLedgerId = "";

    const r = await withTenantTx(TenantId(tenantId), UserId(userId), async (tx) => {
      const drizzleTx = tx as {
        execute: (q: unknown) => Promise<{ rows: Record<string, unknown>[] }>;
      };

      // 1. Advisory transaction lock on originalId to serialize concurrent corrections (T-2-07-02)
      // SELECT FOR UPDATE requires UPDATE privilege which is REVOKE'd (D-01-b, T-2-07-01).
      // pg_advisory_xact_lock() holds until end of transaction — same serialization guarantee.
      // We hash the uuid bytes to a bigint for the lock key.
      await drizzleTx.execute(
        sql`SELECT pg_advisory_xact_lock(hashtext(${originalId}))`,
      );

      const originalResult = await drizzleTx.execute(
        sql`SELECT id, tenant_id, kind, amount_orig, currency_orig, amount_default,
                   currency_default, fx_rate, fx_rate_date::text, fx_provider,
                   transaction_date::text, note, account_id, category_id,
                   transfer_group_id, corrects_id, created_at
            FROM budgeting.expense_ledger
            WHERE id = ${originalId}::uuid AND tenant_id = ${tenantId}::uuid`,
      );

      if (!originalResult.rows[0]) {
        throw new TransactionNotFoundError(originalId);
      }

      const originalRow = dbRowToTransactionRow(originalResult.rows[0]);

      // 2. Check if already corrected — another row already has corrects_id = originalId
      const alreadyCorrectedResult = await drizzleTx.execute(
        sql`SELECT id FROM budgeting.expense_ledger
            WHERE corrects_id = ${originalId}::uuid AND tenant_id = ${tenantId}::uuid
            LIMIT 1`,
      );

      if (alreadyCorrectedResult.rows.length > 0) {
        throw new AlreadyCorrectedError(originalId);
      }

      // 3. Build the correction row
      const correctionRow = buildCorrectionRow(originalRow, newFields as Parameters<typeof buildCorrectionRow>[1], userId);
      resultLedgerId = correctionRow.id;

      // 4. INSERT the correction row
      await drizzleTx.execute(
        sql`INSERT INTO budgeting.expense_ledger
              (id, tenant_id, amount_orig, currency_orig, amount_default, currency_default,
               fx_rate, fx_rate_date, fx_provider, corrects_id,
               transaction_date, note, account_id, category_id, kind, transfer_group_id,
               created_at)
            VALUES
              (${correctionRow.id}::uuid, ${correctionRow.tenantId}::uuid,
               ${correctionRow.amountOrig}::numeric, ${correctionRow.currencyOrig},
               ${correctionRow.amountDefault}::numeric, ${correctionRow.currencyDefault},
               ${correctionRow.fxRate}::numeric, ${correctionRow.fxRateDate}::date, ${correctionRow.fxProvider},
               ${correctionRow.correctsId}::uuid,
               ${correctionRow.transactionDate}::date,
               ${correctionRow.note ?? null},
               ${correctionRow.accountId}::uuid,
               ${correctionRow.categoryId ? sql`${correctionRow.categoryId}::uuid` : sql`NULL`},
               ${correctionRow.kind},
               ${correctionRow.transferGroupId ? sql`${correctionRow.transferGroupId}::uuid` : sql`NULL`},
               now())`,
      );

      // 5. Balance delta: reverse original, apply correction
      const oldAmountDefault = parseFloat(originalRow.amountDefault);
      const newAmountDefault = parseFloat(correctionRow.amountDefault);
      const netDelta = newAmountDefault - oldAmountDefault;

      // For EXPENSE (balanceDeltaSign=-1): original subtracted from balance, correction must subtract more/less
      // Net effect: (newAmount - oldAmount) with same sign as original
      const signedNetDelta = correctionRow.balanceDeltaSign === 1
        ? String(netDelta)
        : String(-netDelta);

      if (netDelta !== 0) {
        await this.accountRepo.applyDelta(tx, correctionRow.accountId, signedNetDelta);
      }

      // 6. Projection reversal + re-apply (EXPENSE/INCOME with category only)
      if (correctionRow.kind !== "TRANSFER") {
        // Reverse original projection contribution
        if (originalRow.categoryId) {
          const monthStart = firstDayOfMonth(originalRow.transactionDate);
          const reverseDelta = originalRow.kind === "EXPENSE"
            ? `-${originalRow.amountDefault}`
            : "0";
          await this.projectionRepo.upsert(tx, {
            tenantId: correctionRow.tenantId,
            workspaceId: correctionRow.tenantId,
            categoryId: originalRow.categoryId,
            monthStartDate: monthStart,
            deltaNormal: reverseDelta,
            deltaCushion: "0",
            currency: originalRow.currencyDefault,
          });
        }

        // Apply correction projection contribution
        if (correctionRow.categoryId) {
          const monthStart = firstDayOfMonth(correctionRow.transactionDate);
          await this.projectionRepo.upsert(tx, {
            tenantId: correctionRow.tenantId,
            workspaceId: correctionRow.tenantId,
            categoryId: correctionRow.categoryId,
            monthStartDate: monthStart,
            deltaNormal: correctionRow.kind === "EXPENSE" ? correctionRow.amountDefault : "0",
            deltaCushion: "0",
            currency: correctionRow.currencyDefault,
          });
        }
      }

      // 7. Write audit (T-2-07-03 — same tx, actor + before/after diff)
      await writeAudit(tx as Parameters<typeof writeAudit>[0], {
        tenantId: TenantId(tenantId),
        entityType: "transaction",
        entityId: originalId,
        action: "update",
        actorUserId: UserId(userId),
        before: { ...originalRow, diff },
        after: { ...correctionRow, correctionId: correctionRow.id },
      });

      // 8. Write outbox (budgeting.transaction.corrected — same tx as INSERT)
      await writeOutbox(tx, {
        tenantId: TenantId(correctionRow.tenantId),
        aggregateType: "transaction",
        aggregateId: originalId,
        eventType: "budgeting.transaction.corrected",
        payload: {
          originalId,
          correctionId: correctionRow.id,
          diff,
          tenantId,
        },
      });
    });

    if (r.isErr()) throw r.error;
    return { ledgerId: resultLedgerId };
  }

  /**
   * Plan 02-07: Returns full correction chain ordered by created_at ASC.
   * Uses recursive CTE to walk backwards to the original, then collects all chain rows.
   */
  async getCorrectionChain(tenantId: string, anchorId: string): Promise<TransactionRow[]> {
    const tid = TenantId(tenantId);
    const uid = UserId(tenantId);

    const r = await withTenantTx(tid, uid, async (tx) => {
      const drizzleTx = tx as { execute: (q: unknown) => Promise<{ rows: Record<string, unknown>[] }> };

      // Walk backwards to the original root
      const rootResult = await drizzleTx.execute(
        sql`WITH RECURSIVE ancestors AS (
              SELECT id, corrects_id FROM budgeting.expense_ledger
              WHERE id = ${anchorId}::uuid AND tenant_id = ${tenantId}::uuid
              UNION ALL
              SELECT e.id, e.corrects_id FROM budgeting.expense_ledger e
              JOIN ancestors a ON e.id = a.corrects_id
              WHERE e.tenant_id = ${tenantId}::uuid
            )
            SELECT id FROM ancestors WHERE corrects_id IS NULL LIMIT 1`,
      );

      const rootId = rootResult.rows[0]?.id as string | undefined;
      if (!rootId) return [];

      // Walk forward from root using recursive CTE
      const chainResult = await drizzleTx.execute(
        sql`WITH RECURSIVE chain AS (
              SELECT id, tenant_id, kind, amount_orig, currency_orig, amount_default,
                     currency_default, fx_rate, fx_rate_date::text, fx_provider,
                     transaction_date::text, note, account_id, category_id,
                     transfer_group_id, corrects_id, created_at
              FROM budgeting.expense_ledger
              WHERE id = ${rootId}::uuid AND tenant_id = ${tenantId}::uuid
              UNION ALL
              SELECT e.id, e.tenant_id, e.kind, e.amount_orig, e.currency_orig, e.amount_default,
                     e.currency_default, e.fx_rate, e.fx_rate_date::text, e.fx_provider,
                     e.transaction_date::text, e.note, e.account_id, e.category_id,
                     e.transfer_group_id, e.corrects_id, e.created_at
              FROM budgeting.expense_ledger e
              JOIN chain c ON e.corrects_id = c.id
              WHERE e.tenant_id = ${tenantId}::uuid
            )
            SELECT * FROM chain ORDER BY created_at ASC`,
      );

      return chainResult.rows;
    });

    if (r.isErr()) throw r.error;
    return r.value.map(dbRowToTransactionRow);
  }
}
