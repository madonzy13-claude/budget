/**
 * list-accounts.ts — Application use case: list accounts for a tenant
 */
import { ok, err, type Result } from "@budget/shared-kernel";
import type { AccountRepo } from "../ports/account-repo";
import type { AccountDto } from "../contracts/api";

export interface ListAccountsDeps {
  repo: AccountRepo;
}

export function listAccounts(deps: ListAccountsDeps) {
  return async (input: {
    tenantId: string;
    includeArchived?: boolean;
  }): Promise<Result<AccountDto[], Error>> => {
    try {
      const accounts = await deps.repo.list(
        input.tenantId,
        input.includeArchived ?? false,
      );
      return ok(
        accounts.map((a) => ({
          id: a.id,
          name: a.name,
          kind: a.kind,
          scope: a.scope,
          currency: a.currency,
          currentBalance: a.currentBalance.amount.toFixed(4),
          archivedAt: a.archivedAt ? a.archivedAt.toISOString() : null,
          createdAt: a.createdAt.toISOString(),
        })),
      );
    } catch (e) {
      return err(e as Error);
    }
  };
}
