/**
 * transaction.ts — Transaction domain value object (immutable after minting).
 * No Drizzle imports — pure domain. D-05-b / D-05-f / EXPN-01..03.
 */

export type TransactionKind = "EXPENSE" | "INCOME" | "TRANSFER";

export class Transaction {
  constructor(
    readonly id: string,
    readonly tenantId: string,
    readonly kind: TransactionKind,
    /** Original (user-entered) amount — decimal string */
    readonly amountOrig: string,
    /** Original currency ISO code */
    readonly currencyOrig: string,
    /** Converted to workspace default currency — decimal string */
    readonly amountDefault: string,
    /** Workspace default currency ISO code */
    readonly currencyDefault: string,
    /** FX rate applied: amountDefault = amountOrig * fxRate */
    readonly fxRate: string,
    /** Date for which fxRate was retrieved — ISO date string 'YYYY-MM-DD' */
    readonly fxRateDate: string,
    /** FX provider name e.g. 'frankfurter' */
    readonly fxProvider: string,
    /** Date of the transaction — ISO date string 'YYYY-MM-DD' */
    readonly transactionDate: string,
    /** Optional freetext note */
    readonly note: string | null,
    /** Account ID (uuid) */
    readonly accountId: string,
    /** Category ID (uuid) — null for TRANSFER legs */
    readonly categoryId: string | null,
    /** Transfer group ID — shared by both legs of a TRANSFER */
    readonly transferGroupId: string | null,
    /** Corrects an earlier ledger row (uuid) */
    readonly correctsId: string | null,
    readonly createdAt: Date,
    /**
     * Plan 02-07: true when at least one correction row exists that points at this row.
     * Derived via EXISTS(SELECT 1 FROM expense_ledger c WHERE c.corrects_id = this.id).
     * Drives the "edited" badge in the UI.
     */
    readonly hasCorrections: boolean = false,
  ) {}

  /**
   * isStale() — returns true when fxRateDate < transactionDate.
   * Used by UI to show the FX freshness badge.
   */
  isStale(): boolean {
    return this.fxRateDate < this.transactionDate;
  }
}
