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
      // listLatest is provided by the Drizzle adapter via a method not on the
      // port interface (legacy). Use a structural cast until the port is widened.
      const repo = deps.transactionRepo as unknown as {
        listLatest: (
          tenantId: string,
          opts: {
            limit: number;
            before?: { transactionDate: string; id: string };
          },
        ) => Promise<Transaction[]>;
      };
      const rows = await repo.listLatest(input.tenantId, {
        limit: input.limit ?? 50,
        before: input.before,
      });
      return ok(rows);
    } catch (e) {
      return err(e as Error);
    }
  };
}
