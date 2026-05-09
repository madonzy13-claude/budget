/**
 * account-repo.ts — Port interface for Account persistence
 * Domain layer: no Drizzle imports.
 */
import type { Account } from "../domain/account";

export interface AccountRepo {
  create(account: Account): Promise<void>;
  findById(tenantId: string, id: string): Promise<Account | null>;
  list(tenantId: string, includeArchived: boolean): Promise<Account[]>;
  archive(
    tenantId: string,
    accountId: string,
    actorUserId: string,
  ): Promise<void>;
  recordAdjustment(
    tenantId: string,
    accountId: string,
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
    accountId: string,
    deltaAmountStr: string,
  ): Promise<void>;
}
