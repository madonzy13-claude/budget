/**
 * bulk-recategorize.ts — Plan 02-09 bulk re-categorization use case (EXPN-10).
 *
 * For each transactionId:
 *   - load original (RLS-scoped findById)
 *   - if original.categoryId === newCategoryId → skip (no correction row)
 *   - else insert correction row via insertCorrectionInTx (same withTenantTx)
 *
 * Atomicity: a single withTenantTx wraps all corrections. If any single insert
 * throws, the entire tx rolls back (atomic-all-or-none — T-2-09-03). Failures
 * caused by RLS-empty findById are treated as "row in `failed`" rather than
 * a tx-aborting error so the call still commits the rest.
 *
 * Returns Result<{succeeded, skipped, failed}, Error>.
 */
import { ok, err, type Result } from "@budget/shared-kernel";
import { withTenantTx } from "@budget/platform";
import { TenantId, UserId } from "@budget/shared-kernel";
import { sql } from "drizzle-orm";
import type { TransactionRepo } from "../ports/transaction-repo";

export interface BulkRecategorizeInput {
  tenantId: string;
  transactionIds: string[];
  newCategoryId: string;
  actorUserId: string;
}

export interface BulkRecategorizeResult {
  succeeded: string[];
  skipped: string[];
  failed: string[];
}

export interface BulkRecategorizeDeps {
  transactionRepo: TransactionRepo;
}

export function bulkRecategorize(deps: BulkRecategorizeDeps) {
  return async (
    input: BulkRecategorizeInput,
  ): Promise<Result<BulkRecategorizeResult, Error>> => {
    const succeeded: string[] = [];
    const skipped: string[] = [];
    const failed: string[] = [];

    const r = await withTenantTx(
      TenantId(input.tenantId),
      UserId(input.actorUserId),
      async (tx) => {
        const drizzleTx = tx as {
          execute: (q: unknown) => Promise<{ rows: Record<string, unknown>[] }>;
        };

        for (const id of input.transactionIds) {
          // findById within current tx context (RLS-scoped)
          const lookup = await drizzleTx.execute(
            sql`SELECT id, category_id FROM budgeting.expense_ledger
                 WHERE id = ${id}::uuid AND tenant_id = ${input.tenantId}::uuid
                 LIMIT 1`,
          );
          const row = lookup.rows[0];
          if (!row) {
            failed.push(id);
            continue;
          }
          const currentCategoryId = (row.category_id as string | null) ?? null;
          if (currentCategoryId === input.newCategoryId) {
            skipped.push(id);
            continue;
          }

          // Compute diff for audit (categoryId only)
          const diff = {
            categoryId: { before: currentCategoryId, after: input.newCategoryId },
          };

          await deps.transactionRepo.insertCorrectionInTx(
            tx,
            id,
            { categoryId: input.newCategoryId },
            input.actorUserId,
            input.tenantId,
            diff,
          );
          succeeded.push(id);
        }
      },
    );

    if (r.isErr()) return err(r.error);
    return ok({ succeeded, skipped, failed });
  };
}
