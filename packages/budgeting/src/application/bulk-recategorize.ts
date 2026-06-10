/**
 * bulk-recategorize.ts — Plan 02-09 bulk re-categorization use case (EXPN-10).
 *
 * v1.1: uses updateInPlace() instead of correction rows (correction chain removed, TXN-08).
 *
 * For each transactionId:
 *   - load original (RLS-scoped findById)
 *   - if row not found → push to failed
 *   - if original.categoryId === newCategoryId → skip
 *   - else updateInPlace({ categoryId: newCategoryId })
 *
 * Each update is independent (not wrapped in a single tx) so a failure on one
 * row does not roll back others — consistent with the UI's partial-success model.
 *
 * Returns Result<{succeeded, skipped, failed}, Error>.
 */
import { ok, err, type Result } from "@budget/shared-kernel";
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

    try {
      for (const id of input.transactionIds) {
        const row = await deps.transactionRepo.findById(input.tenantId, id);
        if (!row) {
          failed.push(id);
          continue;
        }
        if (row.categoryId === input.newCategoryId) {
          skipped.push(id);
          continue;
        }
        try {
          await deps.transactionRepo.updateInPlace(
            id,
            { categoryId: input.newCategoryId },
            input.actorUserId,
            input.tenantId,
          );
          succeeded.push(id);
        } catch {
          failed.push(id);
        }
      }
    } catch (e) {
      return err(e as Error);
    }

    return ok({ succeeded, skipped, failed });
  };
}
