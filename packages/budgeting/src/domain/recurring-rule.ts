/**
 * recurring-rule.ts — RecurringRule aggregate root
 * Domain entity: no Drizzle imports (dep-cruiser enforced).
 * Cadence math via nextOccurrence from plan 02-01.
 */
import { ok, type Result } from "@budget/shared-kernel";
import { Temporal } from "temporal-polyfill";
import { nextOccurrence, type Cadence } from "./cadence";

export type RuleKind = "EXPENSE" | "INCOME" | "TRANSFER";

export class RecurringRule {
  constructor(
    public readonly id: string,
    public readonly tenantId: string,
    public readonly accountId: string,
    public readonly categoryId: string | null,
    public amount: string,
    public currency: string,
    public readonly kind: RuleKind,
    public readonly cadence: Cadence,
    /** Required for MONTHLY cadence; null for WEEKLY */
    public readonly cadenceAnchor: number | null,
    /** Required for WEEKLY cadence (0=Sun, 1=Mon, ..., 6=Sat); null for MONTHLY */
    public readonly weeklyDow: number | null,
    public note: string | null,
    public active: boolean,
    public nextDueDate: Temporal.PlainDate,
    public readonly createdAt: Date,
    public readonly actorUserId: string,
  ) {
    // Validate cadence spec invariant
    if (cadence === "MONTHLY" && typeof cadenceAnchor !== "number") {
      throw new Error("MONTHLY cadence requires cadenceAnchor (day-of-month 1-31)");
    }
    if (cadence === "WEEKLY" && typeof weeklyDow !== "number") {
      throw new Error("WEEKLY cadence requires weeklyDow (0=Sun..6=Sat)");
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
      },
      prevDueDate,
    );
  }

  /** Can always edit (deactivation sets active=false; hard delete not supported). */
  canEdit(): Result<void, Error> {
    return ok(undefined);
  }
}
