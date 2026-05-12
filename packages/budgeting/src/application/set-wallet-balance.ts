/**
 * set-wallet-balance.ts — Application use case: overwrite wallet balance.
 *
 * D-PH2-09 (amended): wallet balance is fully decoupled from transactions.
 * Only this use case mutates current_balance, and only with an absolute
 * value. Replaces the old delta-based adjustWalletBalance which depended
 * on the dropped budgeting.account_balance_adjustments table.
 */
import { ok, err, type Result } from "@budget/shared-kernel";
import type { WalletRepo } from "../ports/wallet-repo";
import type { SetBalanceInput } from "../contracts/api";

export interface SetWalletBalanceDeps {
  repo: WalletRepo;
}

export interface SetWalletBalanceFullInput extends SetBalanceInput {
  tenantId: string;
  walletId: string;
  actorUserId: string;
}

export interface SetWalletBalanceResult {
  walletId: string;
  currentBalance: string;
  currency: string;
}

export function setWalletBalance(deps: SetWalletBalanceDeps) {
  return async (
    input: SetWalletBalanceFullInput,
  ): Promise<Result<SetWalletBalanceResult, Error>> => {
    try {
      await deps.repo.setBalance(
        input.tenantId,
        input.walletId,
        { amount: input.amount, currency: input.currency },
        input.actorUserId,
      );
    } catch (e) {
      return err(e as Error);
    }

    return ok({
      walletId: input.walletId,
      currentBalance: input.amount,
      currency: input.currency,
    });
  };
}
