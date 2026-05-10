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
    }
  | {
      type: "budgeting.transaction.created";
      ledgerId: string;
      tenantId: string;
      kind: "EXPENSE" | "INCOME" | "TRANSFER";
      accountId: string;
      categoryId: string | null;
      amountDefault: string;
      currencyDefault: string;
      transactionDate: string;
      transferGroupId: string | null;
    }
  | {
      type: "budgeting.transaction.transfer.created";
      transferGroupId: string;
      tenantId: string;
      legIds: [string, string];
    }
  | {
      type: "budgeting.recurring.rule.created";
      ruleId: string;
      tenantId: string;
      cadence: string;
    }
  | {
      type: "budgeting.recurring.rule.updated";
      ruleId: string;
      tenantId: string;
      appliedToFuture: boolean;
      affectedPendingDraftIds: string[];
    }
  | {
      type: "budgeting.recurring.draft.generated";
      draftId: string;
      ruleId: string;
      tenantId: string;
      dueDate: string;
    }
  | {
      type: "budgeting.recurring.confirmed";
      draftId: string;
      ledgerId: string;
      tenantId: string;
    }
  | {
      type: "budgeting.recurring.skipped";
      draftId: string;
      tenantId: string;
    };
