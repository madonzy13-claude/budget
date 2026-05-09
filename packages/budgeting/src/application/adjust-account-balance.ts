/**
 * adjust-account-balance.ts — Application use case: manual balance adjustment
 * Records to account_balance_adjustments (NOT the ledger) per D-05-e.
 */
import { ok, err, type Result } from "@budget/shared-kernel";
import { Money } from "@budget/shared-kernel";
import type { AccountRepo } from "../ports/account-repo";
import type { AdjustBalanceInput } from "../contracts/api";

export interface AdjustAccountBalanceDeps {
  repo: AccountRepo;
}

export interface AdjustAccountBalanceFullInput extends AdjustBalanceInput {
  tenantId: string;
  accountId: string;
  actorUserId: string;
}

export function adjustAccountBalance(deps: AdjustAccountBalanceDeps) {
  return async (
    input: AdjustAccountBalanceFullInput,
  ): Promise<
    Result<
      { accountId: string; deltaAmount: string; newBalance: string; currency: string },
      Error
    >
  > => {
    try {
      const account = await deps.repo.findById(input.tenantId, input.accountId);
      if (!account) {
        return err(new Error(`Account ${input.accountId} not found`));
      }

      // Validate currency match via domain method
      const delta = Money.of(input.amount, input.currency as any);
      const domainResult = account.applyAdjustment(delta);
      if (domainResult.isErr()) return err(domainResult.error);

      // Persist the adjustment + balance update
      await deps.repo.recordAdjustment(
        input.tenantId,
        input.accountId,
        { amount: input.amount, currency: input.currency },
        input.reason,
        input.actorUserId,
      );

      return ok({
        accountId: input.accountId,
        deltaAmount: input.amount,
        newBalance: account.currentBalance.amount.toFixed(4),
        currency: input.currency,
      });
    } catch (e) {
      return err(e as Error);
    }
  };
}
