/**
 * find-wallet-by-id.ts — Application use case: find a single wallet (renamed from find-account-by-id.ts)
 */
import { ok, err, type Result } from "@budget/shared-kernel";
import type { WalletRepo } from "../ports/wallet-repo";
import type { WalletDto } from "../contracts/api";

export interface FindWalletByIdDeps {
  repo: WalletRepo;
}

export function findWalletById(deps: FindWalletByIdDeps) {
  return async (input: {
    tenantId: string;
    walletId: string;
  }): Promise<Result<WalletDto | null, Error>> => {
    try {
      const wallet = await deps.repo.findById(input.tenantId, input.walletId);
      if (!wallet) return ok(null);
      return ok({
        id: wallet.id,
        name: wallet.name,
        walletType: wallet.walletType,
        currency: wallet.currency,
        currentBalance: wallet.currentBalance.amount.toFixed(4),
        archivedAt: wallet.archivedAt ? wallet.archivedAt.toISOString() : null,
        createdAt: wallet.createdAt.toISOString(),
      });
    } catch (e) {
      return err(e as Error);
    }
  };
}
