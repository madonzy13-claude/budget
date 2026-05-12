/**
 * recurring-rule.ts — RecurringRule aggregate root
 * Domain entity: no Drizzle imports (dep-cruiser enforced).
 * Cadence math via nextOccurrence.
 *
 * v1.1 changes (Phase 2, Plan 02-02):
 *   - RuleKind dropped: all rules produce SPENDING drafts per D-PH2-09
 *   - accountId / walletId dropped: categorical-only per TXN-02
 *   - yearlyMonth added for YEARLY cadence
 */
import { ok, type Result } from "@budget/shared-kernel";
import { Temporal } from "temporal-polyfill";
import { nextOccurrence, type Cadence } from "./cadence";

export class RecurringRule {
  constructor(
    public readonly id: string,
    public readonly tenantId: string,
    public readonly categoryId: string | null,
    public amount: string,
    public currency: string,
    public readonly cadence: Cadence,
    /** Required for MONTHLY (day-of-month 1-31) and YEARLY (day-of-month within yearlyMonth); null for DAILY/WEEKLY */
    public readonly cadenceAnchor: number | null,
    /** Required for WEEKLY cadence (0=Sun, 1=Mon, ..., 6=Sat); null otherwise */
    public readonly weeklyDow: number | null,
    /** Required for YEARLY cadence (1=Jan, ..., 12=Dec); null otherwise */
    public readonly yearlyMonth: number | null,
    public note: string | null,
    public active: boolean,
    public nextDueDate: Temporal.PlainDate,
    public readonly createdAt: Date,
    public readonly actorUserId: string,
  ) {
    // Validate cadence spec invariants
    if (cadence === "MONTHLY" && typeof cadenceAnchor !== "number") {
      throw new Error("MONTHLY cadence requires cadenceAnchor (day-of-month 1-31)");
    }
    if (cadence === "WEEKLY" && typeof weeklyDow !== "number") {
      throw new Error("WEEKLY cadence requires weeklyDow (0=Sun..6=Sat)");
    }
    if (cadence === "YEARLY") {
      if (yearlyMonth == null) {
        throw new Error("YEARLY cadence requires yearlyMonth (1-12)");
      }
      if (cadenceAnchor == null) {
        throw new Error("YEARLY cadence requires cadenceAnchor (day-of-month 1-31)");
      }
    }
  }

  /**
   * Compute the next due date after prevDueDate using the rule's cadence.
   * Preserves month-end anchor (Pitfall 6): Jan 31 → Feb 28 → Mar 31.
   */
  computeNextDueDate(prevDueDate: Temporal.PlainDate): Temporal.PlainDate {
    return nextOccurrence(
      {
        cadence: this.cadence,
        anchorDay: this.cadenceAnchor ?? undefined,
        weeklyDow: this.weeklyDow ?? undefined,
        yearlyMonth: this.yearlyMonth ?? undefined,
      },
      prevDueDate,
    );
  }

  /** Can always edit (deactivation sets active=false; hard delete not supported). */
  canEdit(): Result<void, Error> {
    return ok(undefined);
  }
}
