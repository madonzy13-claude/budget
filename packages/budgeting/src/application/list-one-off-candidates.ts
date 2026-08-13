/**
 * list-one-off-candidates.ts — "which spend won't happen again", a page at a
 * time (user, 260813).
 *
 * The dialog used to be handed a shortlist: five per category, and only those
 * above half that category's average limit. It hid most of a household's
 * spending from a decision they are entitled to make — "why don't I see the
 * 108 and the 127?". Now every spend in the range is offered, biggest first,
 * ten at a time, and the size bar is gone.
 *
 * A charge linked to a repeating rule is still no candidate: it will happen
 * again by construction (the repo filters it). A ONCE payment is a single
 * planned purchase and stays.
 */
import { ok, type Result } from "@budget/shared-kernel";
import type {
  OneOffPage,
  ReserveFitRepo,
} from "../adapters/persistence/reserve-fit-repo";

export interface ListOneOffCandidatesDeps {
  reserveFitRepo: Pick<ReserveFitRepo, "oneOffPage">;
}

export interface OneOffCandidateDTO {
  ledger_id: string;
  category_id: string;
  transaction_date: string;
  note: string | null;
  amount_cents: string;
  scheduled_cadence: string | null;
  excluded: boolean;
}

export interface OneOffPageDTO {
  items: OneOffCandidateDTO[];
  next_cursor: string | null;
}

/** Page size the dialog scrolls through. */
export const ONE_OFF_PAGE_SIZE = 10;

export function listOneOffCandidates(deps: ListOneOffCandidatesDeps) {
  return async (input: {
    budgetId: string;
    from: string;
    to: string;
    categoryId?: string | null;
    cursor?: string | null;
    limit?: number;
  }): Promise<Result<OneOffPageDTO, Error>> => {
    const page: OneOffPage = await deps.reserveFitRepo.oneOffPage({
      budgetId: input.budgetId,
      from: input.from,
      to: input.to,
      categoryId: input.categoryId ?? null,
      cursor: input.cursor ?? null,
      // Capped: the page size is the dialog's business, not the caller's.
      limit: Math.min(Math.max(input.limit ?? ONE_OFF_PAGE_SIZE, 1), 50),
    });
    return ok({
      items: page.items.map((i) => ({
        ...i,
        amount_cents: i.amount_cents.toString(),
      })),
      next_cursor: page.next_cursor,
    });
  };
}
