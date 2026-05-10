/**
 * get-latest-transactions.ts — Application use case: list latest non-corrected transactions.
 * D-05-a derived-latest pattern: excludes rows that have been corrected.
 */
import { ok, err, type Result } from "@budget/shared-kernel";
import type { TransactionRepo } from "../ports/transaction-repo";
import type { Transaction } from "../domain/transaction";

export interface GetLatestTransactionsInput {
  tenantId: string;
  limit?: number;
  before?: { transactionDate: string; id: string };
}

export interface GetLatestTransactionsDeps {
  transactionRepo: TransactionRepo;
}

export function getLatestTransactions(deps: GetLatestTransactionsDeps) {
  return async (
    input: GetLatestTransactionsInput,
  ): Promise<Result<Transaction[], Error>> => {
    try {
      const rows = await deps.transactionRepo.listLatest(input.tenantId, {
        limit: input.limit ?? 50,
        before: input.before,
      });
      return ok(rows);
    } catch (e) {
      return err(e as Error);
    }
  };
}
