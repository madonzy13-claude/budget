/**
 * transaction.ts — Transaction domain entity v1.1 (immutable after minting).
 * No Drizzle imports — pure domain. TXN-01..08 / D-PH2-08 / D-PH2-09.
 *
 * v1.1 changes:
 *   - kind: narrowed from v1.0 (3 values) → "SPENDING"|"INCOME" only
 *   - amount fields: bigint-as-string per CLAUDE.md "Money at adapter boundary"
 *   - removed: accountId, transferGroupId, correctsId, hasCorrections, fxProvider
 *   - added: budgetId, recurringRuleId, confirmedAt, deletedAt, updatedAt
 */

export type TransactionKind = "SPENDING" | "INCOME";

export class Transaction {
  constructor(
    readonly id: string,
    readonly tenantId: string,
    readonly budgetId: string,
    readonly categoryId: string,
    /** Transaction date — ISO date string 'YYYY-MM-DD' */
    readonly date: string,
    /** Original (user-entered) amount — bigint as string (cents) */
    readonly amountOriginalCents: string,
    /** Original currency ISO-4217 code */
    readonly currencyOriginal: string,
    /** Converted to budget default currency — bigint as string (cents) */
    readonly amountConvertedCents: string,
    /** FX rate applied: amountConvertedCents = amountOriginalCents * fxRate */
    readonly fxRate: string,
    /** Date for which fxRate was retrieved — ISO date string 'YYYY-MM-DD' */
    readonly fxAsOf: string,
    /** Optional freetext note */
    readonly note: string | null,
    /** ID of the recurring rule that spawned this transaction (null = manual) */
    readonly recurringRuleId: string | null,
    /** NULL = draft; Date = confirmed (quick-entry sets confirmed_at = now()) */
    readonly confirmedAt: Date | null,
    readonly kind: TransactionKind,
    readonly createdAt: Date,
    readonly updatedAt: Date,
    readonly deletedAt: Date | null,
  ) {}

  /**
   * isStale() — FX rate is stale when fxAsOf < transaction date.
   * Occurs on weekends/holidays when markets are closed: the FX rate is from
   * the last trading day, which precedes the transaction date.
   * Returns false when fxAsOf === date (same-day rate is always fresh).
   */
  isStale(): boolean {
    return this.fxAsOf < this.date;
  }
}
