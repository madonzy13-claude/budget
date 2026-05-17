/**
 * update-wallet.ts — Application use case: partial PATCH of a wallet.
 *
 * Enforces the reserve-currency invariant (D-PH5-R3, Pitfall 4) on EVERY PATCH
 * where the EFFECTIVE wallet type ends up RESERVE — regardless of which field the
 * caller actually changed (type, currency, or both). The domain layer (Wallet) does
 * not enforce this because it needs budgetCurrencyOf(tenantId) — a tenancy lookup
 * that must stay outside the domain aggregate.
 *
 * Plan 05-03 / WALT-01..03.
 */
import { ok, err, type Result } from "@budget/shared-kernel";
import { Money } from "@budget/shared-kernel";
import type { Currency } from "@budget/shared-kernel";
import type { WalletRepo } from "../ports/wallet-repo";
import type { WalletType } from "../domain/wallet";

export interface UpdateWalletDeps {
  repo: WalletRepo;
  /** Resolves the budget's default_currency from tenancy.budgets. */
  budgetCurrencyOf: (tenantId: string) => Promise<string>;
}

export interface UpdateWalletInput {
  tenantId: string;
  walletId: string;
  actorUserId: string;
  name?: string;
  /** Numeric decimal string from Zod (updateWalletSchema). */
  amount?: string;
  currency?: string;
  walletType?: WalletType;
}

export interface UpdateWalletResult {
  wallet: {
    id: string;
    name: string;
    walletType: WalletType;
    currency: string;
    currentBalanceCents: string;
  };
}

export function updateWallet(deps: UpdateWalletDeps) {
  return async (
    input: UpdateWalletInput,
  ): Promise<Result<UpdateWalletResult, Error>> => {
    try {
      const wallet = await deps.repo.findById(input.tenantId, input.walletId);
      if (!wallet) return err(new Error("not_found"));

      // Compute effective type + currency AFTER the patch is applied (Pitfall 4).
      // This fires the check even if the user only changed `amount` on an already-RESERVE
      // wallet that has a mismatched currency from a previous state inconsistency.
      const effectiveType: WalletType = input.walletType ?? wallet.walletType;
      const effectiveCurrency: string = input.currency ?? wallet.currency;

      if (effectiveType === "RESERVE") {
        const budgetCcy = await deps.budgetCurrencyOf(input.tenantId);
        if (effectiveCurrency.toUpperCase() !== budgetCcy.toUpperCase()) {
          return err(new Error("reserve_currency_mismatch"));
        }
      }

      // Apply domain mutators in defined order: name → walletType → currency → amount.
      // Abort on first domain error (domain invariants are strict).
      if (input.name !== undefined) {
        const r = wallet.rename(input.name);
        if (r.isErr()) return err(r.error);
      }
      if (input.walletType !== undefined) {
        const r = wallet.changeType(input.walletType);
        if (r.isErr()) return err(r.error);
      }
      if (input.currency !== undefined) {
        const r = wallet.changeCurrency(input.currency);
        if (r.isErr()) return err(r.error);
      }
      if (input.amount !== undefined) {
        // Amount uses wallet.currency AFTER any currency change (post-changeCurrency state).
        const amt = Money.of(input.amount, wallet.currency as Currency);
        const r = wallet.setAmount(amt);
        if (r.isErr()) return err(r.error);
      }

      const patch: {
        name?: string;
        amount?: string;
        currency?: string;
        walletType?: WalletType;
      } = {};
      if (input.name !== undefined) patch.name = input.name;
      if (input.amount !== undefined) patch.amount = input.amount;
      if (input.currency !== undefined)
        patch.currency = input.currency.toUpperCase();
      if (input.walletType !== undefined) patch.walletType = input.walletType;

      await deps.repo.update(
        input.tenantId,
        input.walletId,
        patch,
        input.actorUserId,
      );

      // Derive currentBalanceCents from domain object (post-mutation state).
      const balanceCentsStr = wallet.currentBalance.amount
        .times("100")
        .toFixed(0);

      return ok({
        wallet: {
          id: wallet.id,
          name: wallet.name,
          walletType: wallet.walletType,
          currency: wallet.currency,
          currentBalanceCents: balanceCentsStr,
        },
      });
    } catch (e) {
      return err(e as Error);
    }
  };
}
