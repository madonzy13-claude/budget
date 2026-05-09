/**
 * account.ts — Account aggregate root
 * Domain entity: no Drizzle imports (dep-cruiser enforced).
 * Currency immutable per ACCT-04.
 */
import { ok, err, type Result } from "@budget/shared-kernel";
import type { Money } from "@budget/shared-kernel";

export type AccountKind =
  | "CASH"
  | "CHECKING"
  | "SAVINGS"
  | "CREDIT_CARD"
  | "LOAN"
  | "INVESTMENT";

export type AccountScope = "PERSONAL" | "SHARED";

const LIABILITY_KINDS: ReadonlySet<AccountKind> = new Set([
  "CREDIT_CARD",
  "LOAN",
]);

export class Account {
  constructor(
    public readonly id: string,
    public readonly tenantId: string,
    public name: string,
    public readonly kind: AccountKind,
    public readonly scope: AccountScope,
    public readonly currency: string, // immutable per ACCT-04
    public currentBalance: Money,
    public archivedAt: Date | null,
    public readonly createdAt: Date,
    public readonly actorUserId: string,
  ) {}

  isLiability(): boolean {
    return LIABILITY_KINDS.has(this.kind);
  }

  isAsset(): boolean {
    return !this.isLiability();
  }

  isArchived(): boolean {
    return this.archivedAt !== null;
  }

  /** Currency is immutable per ACCT-04 — always returns err. */
  canChangeCurrency(): Result<void, Error> {
    return err(
      new Error(
        "Account currency is immutable per ACCT-04. Create a new account instead.",
      ),
    );
  }

  archive(): Result<void, Error> {
    if (this.isArchived()) {
      return err(new Error("Account already archived"));
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
