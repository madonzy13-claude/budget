/**
 * archive-wallet.ts — Application use case: archive a wallet (renamed from archive-account.ts)
 */
import { ok, err, type Result } from "@budget/shared-kernel";
import type { WalletRepo } from "../ports/wallet-repo";

export interface ArchiveWalletDeps {
  repo: WalletRepo;
}

export function archiveWallet(deps: ArchiveWalletDeps) {
  return async (input: {
    tenantId: string;
    walletId: string;
    actorUserId: string;
  }): Promise<Result<{ id: string; archivedAt: string }, Error>> => {
    try {
      const wallet = await deps.repo.findById(input.tenantId, input.walletId);
      if (!wallet) {
        return err(new Error(`Wallet ${input.walletId} not found`));
      }

      const result = wallet.archive();
      if (result.isErr()) return err(result.error);

      await deps.repo.archive(
        input.tenantId,
        input.walletId,
        input.actorUserId,
      );

      return ok({
        id: input.walletId,
        archivedAt: wallet.archivedAt!.toISOString(),
      });
    } catch (e) {
      return err(e as Error);
    }
  };
}
