/**
 * scheduled-payment-repo.ts — Port interface for ScheduledPayment persistence.
 * Domain layer: no Drizzle imports.
 *
 * v1.1 (Phase 2, Plan 02-02):
 *   - accountId dropped: categorical-only per TXN-02
 *   - kind dropped: all rules produce SPENDING drafts per D-PH2-09
 *   - yearlyMonth added for YEARLY cadence
 *   - Cadence extended to DAILY|WEEKLY|MONTHLY|YEARLY
 */
export interface ScheduledPaymentEdits {
  amount?: string;
  currency?: string;
  categoryId?: string | null;
  note?: string | null;
  active?: boolean;
  // Cadence fields — editing the "day" (cadenceAnchor) and the other
  // cadence discriminators must persist AND recompute next_due_date so the
  // rule fires on the new schedule. Mirror the insert path above.
  cadence?: "ONCE" | "DAILY" | "WEEKLY" | "MONTHLY" | "YEARLY";
  cadenceAnchor?: number | null;
  weeklyDow?: number | null;
  yearlyMonth?: number | null;
  /** Optional "last date" (ISO YYYY-MM-DD). null clears the deadline. */
  endDate?: string | null;
  /** The date of a ONE-TIME payment — it has no pattern to derive one from. */
  nextDueDate?: string;
}

export interface ScheduledPaymentRow {
  id: string;
  tenantId: string;
  categoryId: string | null;
  amount: string;
  currency: string;
  cadence: "ONCE" | "DAILY" | "WEEKLY" | "MONTHLY" | "YEARLY";
  cadenceAnchor: number | null;
  weeklyDow: number | null;
  yearlyMonth: number | null;
  note: string | null;
  active: boolean;
  nextDueDate: string; // ISO date YYYY-MM-DD
  endDate: string | null; // ISO date YYYY-MM-DD or null (no deadline)
  createdAt: Date;
  actorUserId: string;
  /** Set when a person deleted it. active=false alone only means "not running",
   *  which is also true of a payment that has simply happened. */
  deletedAt?: Date | null;
  /** True when at least one of its drafts has been confirmed — money moved, so
   *  a one-time payment can no longer be edited, only removed. */
  hasConfirmedDraft?: boolean;
}

export interface ScheduledPaymentRepo {
  /** Insert a new rule; returns the created id. */
  insert(rule: {
    tenantId: string;
    categoryId: string | null;
    amount: string;
    currency: string;
    cadence: "ONCE" | "DAILY" | "WEEKLY" | "MONTHLY" | "YEARLY";
    cadenceAnchor: number | null;
    weeklyDow: number | null;
    yearlyMonth: number | null;
    note: string | null;
    nextDueDate: string;
    actorUserId: string;
  }): Promise<{ id: string }>;

  /** Find by id (RLS-scoped). Returns null if not found. */
  findById(tenantId: string, ruleId: string): Promise<ScheduledPaymentRow | null>;

  /** Everything the household should still SEE: active payments and ones that
   *  have run their course, but never the ones they deleted. */
  listVisible(tenantId: string): Promise<ScheduledPaymentRow[]>;

  /**
   * Update mutable fields of a rule.
   * Caller owns the tx (tx-bound so update-scheduled-payment can batch with draft regeneration).
   */
  update(
    tx: unknown,
    ruleId: string,
    tenantId: string,
    edits: ScheduledPaymentEdits,
  ): Promise<void>;

  /** Advance next_due_date on a rule (used by engine after draft generation). */
  advanceNextDueDate(
    tx: unknown,
    ruleId: string,
    nextDueDate: string,
  ): Promise<void>;

  /** Soft-delete (set active=false). */
  softDelete(
    tenantId: string,
    ruleId: string,
    actorUserId: string,
  ): Promise<void>;
}
