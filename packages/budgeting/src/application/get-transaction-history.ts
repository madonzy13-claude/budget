/**
 * get-transaction-history.ts — Application use case: return full correction chain for a transaction.
 *
 * Given any id in the chain (original or any correction), returns all rows in the chain
 * ordered by created_at ASC (original first, latest correction last).
 *
 * D-01-a, T-2-07-04 (RLS scopes recursive CTE — cross-tenant SELECT returns empty).
 */
import { ok, err, type Result } from "@budget/shared-kernel";
import type { TransactionRepo, TransactionRow } from "../ports/transaction-repo";

export interface GetTransactionHistoryInput {
  tenantId: string;
  transactionId: string;
}

export interface GetTransactionHistoryDeps {
  transactionRepo: TransactionRepo;
}

export function getTransactionHistory(deps: GetTransactionHistoryDeps) {
  return async (
    input: GetTransactionHistoryInput,
  ): Promise<Result<TransactionRow[], Error>> => {
    try {
      const chain = await deps.transactionRepo.getCorrectionChain(
        input.tenantId,
        input.transactionId,
      );
      return ok(chain);
    } catch (e) {
      return err(e as Error);
    }
  };
}
