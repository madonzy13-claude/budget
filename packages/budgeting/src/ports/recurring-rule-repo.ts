/**
 * recurring-rule-repo.ts — Port interface for RecurringRule persistence.
 * Domain layer: no Drizzle imports.
 */
import type { RecurringRule } from "../domain/recurring-rule";

export interface RecurringRuleEdits {
  amount?: string;
  currency?: string;
  categoryId?: string | null;
  accountId?: string;
  note?: string | null;
  active?: boolean;
}

export interface RecurringRuleRow {
  id: string;
  tenantId: string;
  accountId: string;
  categoryId: string | null;
  amount: string;
  currency: string;
  kind: "EXPENSE" | "INCOME" | "TRANSFER";
  cadence: "MONTHLY" | "WEEKLY";
  cadenceAnchor: number | null;
  weeklyDow: number | null;
  note: string | null;
  active: boolean;
  nextDueDate: string; // ISO date YYYY-MM-DD
  createdAt: Date;
  actorUserId: string;
}

export interface RecurringRuleRepo {
  /** Insert a new rule; returns the created id. */
  insert(rule: {
    tenantId: string;
    accountId: string;
    categoryId: string | null;
    amount: string;
    currency: string;
    kind: "EXPENSE" | "INCOME" | "TRANSFER";
    cadence: "MONTHLY" | "WEEKLY";
    cadenceAnchor: number | null;
    weeklyDow: number | null;
    note: string | null;
    nextDueDate: string;
    actorUserId: string;
  }): Promise<{ id: string }>;

  /** Find by id (RLS-scoped). Returns null if not found. */
  findById(tenantId: string, ruleId: string): Promise<RecurringRuleRow | null>;

  /** List active rules for tenant. */
  listActive(tenantId: string): Promise<RecurringRuleRow[]>;

  /**
   * Update mutable fields of a rule.
   * Caller owns the tx (tx-bound so update-recurring-rule can batch with draft regeneration).
   */
  update(tx: unknown, ruleId: string, tenantId: string, edits: RecurringRuleEdits): Promise<void>;

  /** Advance next_due_date on a rule (used by engine after draft generation). */
  advanceNextDueDate(tx: unknown, ruleId: string, nextDueDate: string): Promise<void>;

  /** Soft-delete (set active=false). */
  deactivate(tenantId: string, ruleId: string, actorUserId: string): Promise<void>;
}
