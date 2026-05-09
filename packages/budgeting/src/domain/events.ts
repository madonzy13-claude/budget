/**
 * events.ts — Budgeting domain event types
 */
import type { AccountKind } from "./account";

export type BudgetingEvent =
  | {
      type: "budgeting.account.created";
      accountId: string;
      tenantId: string;
      kind: AccountKind;
      currency: string;
    }
  | {
      type: "budgeting.account.archived";
      accountId: string;
      tenantId: string;
    }
  | {
      type: "budgeting.account.balance_adjusted";
      accountId: string;
      tenantId: string;
      delta: string;
      currency: string;
    };
