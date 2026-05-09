/**
 * archive-account.ts — Application use case: archive an account
 */
import { ok, err, type Result } from "@budget/shared-kernel";
import type { AccountRepo } from "../ports/account-repo";

export interface ArchiveAccountDeps {
  repo: AccountRepo;
}

export function archiveAccount(deps: ArchiveAccountDeps) {
  return async (input: {
    tenantId: string;
    accountId: string;
    actorUserId: string;
  }): Promise<Result<{ id: string; archivedAt: string }, Error>> => {
    try {
      const account = await deps.repo.findById(input.tenantId, input.accountId);
      if (!account) {
        return err(new Error(`Account ${input.accountId} not found`));
      }

      const result = account.archive();
      if (result.isErr()) return err(result.error);

      await deps.repo.archive(input.tenantId, input.accountId, input.actorUserId);

      return ok({
        id: input.accountId,
        archivedAt: account.archivedAt!.toISOString(),
      });
    } catch (e) {
      return err(e as Error);
    }
  };
}
