/**
 * wallet.ts — Wallet aggregate root (renamed from account.ts in Plan 01-02)
 * Domain entity: no Drizzle imports (dep-cruiser enforced).
 *
 * Phase 5 Plan 02: D-PH5-W12 rescinds WALT-04 currency immutability.
 * Four new mutators added: rename, changeType, changeCurrency, setAmount.
 * Reserve-currency invariant moves to the use-case layer (Plan 03).
 */
import { ok, err, type Result } from "@budget/shared-kernel";
import type { Money } from "@budget/shared-kernel";

export type WalletType = "SPENDINGS" | "CUSHION" | "RESERVE";

export class Wallet {
  // UAT-PH5-T3-1x: presentation-only customization (color + icon) and
  // intra-section ordering (sortOrder). Hydrated by the repo from the new
  // columns added in drizzle/0021_phase05_uat_wallet_polish.sql.
  public color: string | null = null;
  public icon: string | null = null;
  public sortOrder: number = 0;

  constructor(
    public readonly id: string,
    public readonly tenantId: string,
    public name: string,
    public walletType: WalletType, // mutable per D-PH5-W12 (was readonly)
    public currency: string, // mutable per D-PH5-W12 (was readonly, WALT-04 rescinded)
    public currentBalance: Money,
    public archivedAt: Date | null,
    public readonly createdAt: Date,
    public readonly actorUserId: string,
  ) {}

  isArchived(): boolean {
    return this.archivedAt !== null;
  }

  /**
   * D-PH5-W12: WALT-04 rescinded for Phase 5.
   * Reserve-currency invariant moved to use-case layer (Plan 03) so it can
   * call budgetCurrencyOf(tenantId) without the domain coupling to tenancy.
   * Returns ok(undefined) unconditionally.
   */
  canChangeCurrency(): Result<void, Error> {
    return ok(undefined);
  }

  /**
   * rename — update wallet display name.
   * Trims whitespace. Rejects empty or over-120-char names.
   */
  rename(newName: string): Result<void, Error> {
    const trimmed = newName.trim();
    if (trimmed.length < 1)
      return err(new Error("Wallet name must not be empty"));
    if (trimmed.length > 120)
      return err(new Error("Wallet name must be 120 characters or fewer"));
    this.name = trimmed;
    return ok(undefined);
  }

  /**
   * changeType — change wallet classification (SPENDINGS / CUSHION / RESERVE).
   * Reserve-currency invariant enforced in use case (needs budgetCurrencyOf lookup)
   * — domain stays decoupled from tenancy lookups.
   */
  changeType(newType: WalletType): Result<void, Error> {
    this.walletType = newType;
    return ok(undefined);
  }

  /**
   * changeCurrency — update wallet currency code.
   * Validates 3-5 uppercase alphanumeric code (covers fiat + crypto).
   * Note: currentBalance numeric amount unchanged per D-PH5-W12. The Money
   * object's currency tag is updated by the adapter on the next read
   * (rowToWallet reconstructs from row).
   */
  changeCurrency(newCurrency: string): Result<void, Error> {
    const ccy = newCurrency.trim().toUpperCase();
    if (!/^[A-Z0-9]{3,5}$/.test(ccy)) {
      return err(new Error(`Invalid currency code: ${newCurrency}`));
    }
    this.currency = ccy;
    return ok(undefined);
  }

  /**
   * setAmount — overwrite currentBalance to a new absolute value.
   * Rejects if newAmount.currency !== this.currency (amount edit must use
   * wallet's current currency; currency change is a separate operation).
   */
  setAmount(newAmount: Money): Result<void, Error> {
    if (newAmount.currency !== (this.currency as any)) {
      return err(
        new Error(
          `Amount currency ${newAmount.currency} != wallet currency ${this.currency}`,
        ),
      );
    }
    this.currentBalance = newAmount;
    return ok(undefined);
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
