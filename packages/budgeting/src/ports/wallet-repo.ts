/**
 * wallet-repo.ts — Port interface for Wallet persistence (renamed from account-repo.ts)
 * Domain layer: no Drizzle imports.
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
  recordAdjustment(
    tenantId: string,
    walletId: string,
    delta: { amount: string; currency: string },
    reason: string,
    actorUserId: string,
  ): Promise<void>;
  /**
   * applyDelta — updates current_balance in-place inside an existing tx.
   * Used by ledger writer (plan 02-06) to update balance synchronously (D-05-e).
   * Does NOT open its own transaction.
   */
  applyDelta(
    tx: unknown,
    walletId: string,
    deltaAmountStr: string,
  ): Promise<void>;
}
