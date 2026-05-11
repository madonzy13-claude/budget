/**
 * adjust-wallet-balance.ts — Application use case: manual balance adjustment (renamed from adjust-account-balance.ts)
 * Records to account_balance_adjustments (NOT the ledger) per D-05-e.
 */
import { ok, err, type Result } from "@budget/shared-kernel";
import { Money } from "@budget/shared-kernel";
import type { WalletRepo } from "../ports/wallet-repo";
import type { AdjustBalanceInput } from "../contracts/api";

export interface AdjustWalletBalanceDeps {
  repo: WalletRepo;
}

export interface AdjustWalletBalanceFullInput extends AdjustBalanceInput {
  tenantId: string;
  walletId: string;
  actorUserId: string;
}

export function adjustWalletBalance(deps: AdjustWalletBalanceDeps) {
  return async (
    input: AdjustWalletBalanceFullInput,
  ): Promise<
    Result<
      {
        walletId: string;
        deltaAmount: string;
        newBalance: string;
        currency: string;
      },
      Error
    >
  > => {
    try {
      const wallet = await deps.repo.findById(input.tenantId, input.walletId);
      if (!wallet) {
        return err(new Error(`Wallet ${input.walletId} not found`));
      }

      // Validate currency match via domain method
      const delta = Money.of(input.amount, input.currency as any);
      const domainResult = wallet.applyAdjustment(delta);
      if (domainResult.isErr()) return err(domainResult.error);

      // Persist the adjustment + balance update
      await deps.repo.recordAdjustment(
        input.tenantId,
        input.walletId,
        { amount: input.amount, currency: input.currency },
        input.reason,
        input.actorUserId,
      );

      return ok({
        walletId: input.walletId,
        deltaAmount: input.amount,
        newBalance: wallet.currentBalance.amount.toFixed(4),
        currency: input.currency,
      });
    } catch (e) {
      return err(e as Error);
    }
  };
}
