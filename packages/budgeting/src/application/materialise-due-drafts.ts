/**
 * materialise-due-drafts.ts — turn a scheduled payment's DUE occurrences into
 * drafts, right now, inside the caller's transaction.
 *
 * The nightly engine (0 6 * * * UTC) does this for every budget. On its own
 * that means a payment dated today, saved at any time after 06:00, does not
 * appear until tomorrow morning — with nothing on screen to say so. Creating a
 * rule has carried an inline catch-up for exactly that reason since it was
 * written; editing one to a due date had no such path, so moving a payment to
 * today did nothing until the cron came round (user, 260902).
 *
 * Extracted here so both write paths and the engine agree by construction
 * rather than by three copies staying in step.
 *
 * Idempotent twice over, which is what lets the cron and the write path both
 * run over the same rule: the ledger INSERT is ON CONFLICT DO NOTHING against
 * the unique (scheduled_payment_id, transaction_date), and emitConfirmDraft is
 * unique on draft_id. A second pass inserts nothing and emits nothing.
 *
 * Does NOT advance next_due_date — the callers own the rule row and each has
 * its own rule about where the pointer lands (create fast-forwards through the
 * cadence, update recomputes from the merged spec, the engine retires an
 * exhausted rule). Returning the first date AFTER today lets them decide.
 */
import { sql } from "drizzle-orm";
import { Temporal } from "temporal-polyfill";
import { TenantId } from "@budget/shared-kernel";
import { writeOutbox } from "@budget/platform";
import { nextOccurrence, type Cadence } from "../domain/cadence";
import { isRuleExhausted } from "../domain/scheduled-payment-end-date";
import { computeScheduledFx, type FxProviderLike } from "./scheduled-payment-engine-fx";

/** The minimal tx shape both the API and the worker hand in. */
type TxLike = {
  execute: (q: unknown) => Promise<{ rows: Record<string, unknown>[] }>;
};

/** The slice of TaskRepo this needs — kept narrow so callers can pass theirs. */
export interface ConfirmDraftEmitter {
  emitConfirmDraft: (
    tenantId: string,
    budgetId: string,
    payload: {
      draft_id: string;
      rule_name: string;
      amount_cents: string;
      currency: string;
      transaction_date: string;
      category_id: string;
    },
    tx: never,
  ) => Promise<void>;
}

export interface MaterialiseDueDraftsInput {
  tenantId: string;
  ruleId: string;
  /** Where the walk starts — the rule's next_due_date. */
  fromDate: string;
  /** Inclusive deadline, or null when the rule has none. */
  endDate: string | null;
  cadence: string;
  cadenceAnchor?: number | null;
  weeklyDow?: number | null;
  yearlyMonth?: number | null;
  categoryId?: string | null;
  note?: string | null;
  /** Decimal string, as stored on the rule. */
  amount: string;
  currency: string;
  /** The budget's currency; drafts are locked to it. */
  budgetCurrency: string;
  /** Defaults to today (UTC). Injectable so tests need no clock. */
  today?: string;
}

export interface MaterialiseDueDraftsDeps {
  fxProvider: FxProviderLike;
  taskRepo: ConfirmDraftEmitter;
}

export interface MaterialiseDueDraftsResult {
  draftsGenerated: number;
  /** The first occurrence strictly after today — where the pointer should go. */
  nextDueDate: string;
}

export async function materialiseDueDrafts(
  tx: unknown,
  input: MaterialiseDueDraftsInput,
  deps: MaterialiseDueDraftsDeps,
): Promise<MaterialiseDueDraftsResult> {
  const drizzleTx = tx as TxLike;
  const today = Temporal.PlainDate.from(
    input.today ?? Temporal.Now.plainDateISO().toString(),
  );
  const amountCents = String(Math.round(Number(input.amount) * 100));
  const spec = {
    cadence: input.cadence as Cadence,
    anchorDay: input.cadenceAnchor ?? undefined,
    weeklyDow: input.weeklyDow ?? undefined,
    yearlyMonth: input.yearlyMonth ?? undefined,
  };

  let dueDate = Temporal.PlainDate.from(input.fromDate.slice(0, 10));
  let draftsGenerated = 0;

  while (
    Temporal.PlainDate.compare(dueDate, today) <= 0 &&
    !isRuleExhausted(dueDate.toString(), input.endDate)
  ) {
    const dueStr = dueDate.toString();
    const fx = await computeScheduledFx({
      ruleCurrency: input.currency,
      budgetCurrency: input.budgetCurrency,
      amountOriginalCents: amountCents,
      dueDateStr: dueStr,
      fxProvider: deps.fxProvider,
    });

    // The draft is locked to the BUDGET currency: original and converted are
    // the same figure at rate 1, so a later FX move cannot restate a payment
    // the household has already been shown.
    const inserted = await drizzleTx.execute(sql`
      INSERT INTO budgeting.expense_ledger
        (id, tenant_id, budget_id, category_id, transaction_date,
         amount_original_cents, currency_original,
         amount_converted_cents, fx_rate, fx_as_of,
         note, scheduled_payment_id, confirmed_at, kind, created_at, updated_at)
      VALUES
        (gen_random_uuid(), ${input.tenantId}::uuid, ${input.tenantId}::uuid,
         ${input.categoryId ?? null}::uuid, ${dueStr}::date,
         ${fx.amountConvertedCents}::bigint, ${input.budgetCurrency},
         ${fx.amountConvertedCents}::bigint,
         1::numeric, ${fx.fxAsOf}::date,
         ${input.note ?? null}, ${input.ruleId}::uuid,
         NULL, 'SPENDING', now(), now())
      ON CONFLICT (scheduled_payment_id, transaction_date)
        WHERE scheduled_payment_id IS NOT NULL AND deleted_at IS NULL
        DO NOTHING
      RETURNING id
    `);

    // Empty means the draft was already there — the cron beat us to it, or
    // this is a second save. Nothing to announce.
    if (inserted.rows.length > 0) {
      const draftId = inserted.rows[0]!.id as string;
      await writeOutbox(tx as never, {
        tenantId: TenantId(input.tenantId),
        aggregateType: "scheduled_rule",
        aggregateId: input.ruleId,
        eventType: "budgeting.scheduled.draft.generated",
        payload: {
          draftId,
          ruleId: input.ruleId,
          tenantId: input.tenantId,
          dueDate: dueStr,
        },
      });
      await deps.taskRepo.emitConfirmDraft(
        input.tenantId,
        input.tenantId,
        {
          draft_id: draftId,
          rule_name: input.note ?? "",
          amount_cents: fx.amountConvertedCents,
          currency: input.budgetCurrency,
          transaction_date: dueStr,
          category_id: input.categoryId ?? "",
        },
        tx as never,
      );
      draftsGenerated += 1;
    }

    dueDate = nextOccurrence(spec, dueDate);
  }

  return { draftsGenerated, nextDueDate: dueDate.toString() };
}
