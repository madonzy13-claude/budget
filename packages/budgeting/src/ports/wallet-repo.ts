/**
 * wallet-repo.ts — Port interface for Wallet persistence (renamed from account-repo.ts)
 * Domain layer: no Drizzle imports.
 *
 * D-PH2-09 (amended in Phase 2 gap-closure): wallet balance is fully
 * decoupled from transactions. Only setBalance (full absolute value)
 * mutates current_balance. The old delta-based recordAdjustment +
 * applyDelta paths were removed when budgeting.account_balance_adjustments
 * was dropped by migration 0013.
 */
import type { Wallet } from "../domain/wallet";

export interface WalletRepo {
  create(wallet: Wallet): Promise<void>;
  findById(tenantId: string, id: string): Promise<Wallet | null>;
  list(tenantId: string, includeArchived: boolean): Promise<Wallet[]>;
  archive(
    tenantId: string,
    walletId: string,
    actorUserId: string,
  ): Promise<void>;
  /**
   * setBalance — overwrites current_balance to an absolute value.
   * Throws if `amount.currency !== wallet.currency` (WALT-04 immutable).
   * Writes an audit row but NOT a separate adjustments-table row.
   */
  setBalance(
    tenantId: string,
    walletId: string,
    amount: { amount: string; currency: string },
    actorUserId: string,
  ): Promise<void>;

  /**
   * update — partial PATCH of name / amount / walletType / currency in a single transaction.
   * Each provided field is mutated; absent fields are untouched.
   * Writes ONE audit row covering the whole patch + ONE outbox event "budgeting.wallet.updated".
   * Throws if walletId not found for tenant.
   */
  update(
    tenantId: string,
    walletId: string,
    patch: {
      name?: string;
      amount?: string;
      currency?: string;
      walletType?: import("../domain/wallet").WalletType;
      // UAT-PH5-T3-1x: presentation customization (null clears).
      color?: string | null;
      icon?: string | null;
    },
    actorUserId: string,
  ): Promise<void>;

  /**
   * UAT-PH5-T3-1x — reorderWithinType.
   * Sets sort_order on each id in orderedIds to its 1-based position. Caller
   * must ensure every id belongs to the same wallet_type and tenant. Writes
   * one outbox event "budgeting.wallets.reordered".
   */
  reorderWithinType?(
    tenantId: string,
    actorUserId: string,
    orderedIds: string[],
  ): Promise<void>;
}
