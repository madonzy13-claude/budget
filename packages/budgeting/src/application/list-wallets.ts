/**
 * list-wallets.ts — Application use case: list wallets for a tenant (renamed from list-accounts.ts)
 */
import { ok, err, type Result } from "@budget/shared-kernel";
import type { WalletRepo } from "../ports/wallet-repo";
import type { WalletDto } from "../contracts/api";

export interface ListWalletsDeps {
  repo: WalletRepo;
}

export function listWallets(deps: ListWalletsDeps) {
  return async (input: {
    tenantId: string;
    includeArchived?: boolean;
  }): Promise<Result<WalletDto[], Error>> => {
    try {
      const wallets = await deps.repo.list(
        input.tenantId,
        input.includeArchived ?? false,
      );
      return ok(
        wallets.map((w) => ({
          id: w.id,
          name: w.name,
          walletType: w.walletType,
          currency: w.currency,
          currentBalance: w.currentBalance.amount.toFixed(4),
          archivedAt: w.archivedAt ? w.archivedAt.toISOString() : null,
          createdAt: w.createdAt.toISOString(),
        })),
      );
    } catch (e) {
      return err(e as Error);
    }
  };
}
