/**
 * wallet.ts — Wallet aggregate root (renamed from account.ts in Plan 01-02)
 * Domain entity: no Drizzle imports (dep-cruiser enforced).
 * Currency immutable per WALT-04 (formerly ACCT-04).
 */
import { ok, err, type Result } from "@budget/shared-kernel";
import type { Money } from "@budget/shared-kernel";

export type WalletType = "SPENDINGS" | "CUSHION" | "RESERVE";

export class Wallet {
  constructor(
    public readonly id: string,
    public readonly tenantId: string,
    public name: string,
    public readonly walletType: WalletType,
    public readonly currency: string, // immutable per WALT-04
    public currentBalance: Money,
    public archivedAt: Date | null,
    public readonly createdAt: Date,
    public readonly actorUserId: string,
  ) {}

  isArchived(): boolean {
    return this.archivedAt !== null;
  }

  /** Currency is immutable per WALT-04 — always returns err. */
  canChangeCurrency(): Result<void, Error> {
    return err(
      new Error(
        "Wallet currency is immutable per WALT-04. Create a new wallet instead.",
      ),
    );
  }

  archive(): Result<void, Error> {
    if (this.isArchived()) {
      return err(new Error("Wallet already archived"));
    }
    this.archivedAt = new Date();
    return ok(undefined);
  }

  /**
   * Apply a balance adjustment delta.
   * Rejects if delta.currency !== this.currency.
   */
  applyAdjustment(delta: Money): Result<void, Error> {
    if (delta.currency !== (this.currency as any)) {
      return err(
        new Error(
          `Adjustment currency ${delta.currency} != account currency ${this.currency}`,
        ),
      );
    }
    this.currentBalance = this.currentBalance.add(delta);
    return ok(undefined);
  }
}
