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
}
