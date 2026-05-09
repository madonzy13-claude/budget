/**
 * find-account-by-id.ts — Application use case: find a single account
 */
import { ok, err, type Result } from "@budget/shared-kernel";
import type { AccountRepo } from "../ports/account-repo";
import type { AccountDto } from "../contracts/api";

export interface FindAccountByIdDeps {
  repo: AccountRepo;
}

export function findAccountById(deps: FindAccountByIdDeps) {
  return async (input: {
    tenantId: string;
    accountId: string;
  }): Promise<Result<AccountDto | null, Error>> => {
    try {
      const account = await deps.repo.findById(input.tenantId, input.accountId);
      if (!account) return ok(null);
      return ok({
        id: account.id,
        name: account.name,
        kind: account.kind,
        scope: account.scope,
        currency: account.currency,
        currentBalance: account.currentBalance.amount.toFixed(4),
        archivedAt: account.archivedAt ? account.archivedAt.toISOString() : null,
        createdAt: account.createdAt.toISOString(),
      });
    } catch (e) {
      return err(e as Error);
    }
  };
}
