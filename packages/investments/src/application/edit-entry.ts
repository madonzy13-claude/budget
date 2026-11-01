/**
 * edit-entry.ts — R6 (user): Edit a transaction's note and date.
 *
 * Amounts stay as booked; only the label and the day move. The day stays
 * between the entry's neighbours in EVERY asset it touches (a linked pair
 * moves together), so the append-only order never changes. A deposit's dates
 * drive its interest, so they do not move. FX figures stay those of the
 * original booking.
 */
import { ok, err, type Result } from "neverthrow";
import { entryDateRange, type LedgerKey } from "../domain/asset-ledger";
import type { HoldingRepo } from "../ports/holding-repo";
import type { HistoryRepo, StoredEntry } from "../ports/history-repo";

const key = (e: StoredEntry): LedgerKey => ({
  id: e.id,
  effectiveDate: e.effectiveDate,
  createdAt: e.createdAt,
  transferId: e.transferId,
  holdingId: e.holdingId,
});

export class DateOutOfRange extends Error {
  constructor(
    readonly min: string | null,
    readonly max: string | null,
  ) {
    super("date_out_of_range");
  }
}

export function editEntry(deps: {
  historyRepo: HistoryRepo;
  holdingRepo: HoldingRepo;
}) {
  return async (input: {
    tenantId: string;
    actorUserId: string;
    entryId: string;
    note?: string;
    effectiveDate?: string;
  }): Promise<Result<{ ok: true }, Error>> => {
    try {
      const { tenantId: t, actorUserId: u } = input;
      const legs = await deps.historyRepo.findLegs(t, u, input.entryId);
      if (legs.length === 0) return err(new Error("not_found"));
      const date = input.effectiveDate;
      if (date !== undefined && date !== legs[0]!.effectiveDate) {
        let min: string | null = null;
        let max: string | null = null;
        for (const leg of legs) {
          const h = await deps.holdingRepo.findById(t, u, leg.holdingId);
          if (h?.holdingType === "deposit" || h?.uiType === "deposit")
            return err(new Error("date_locked"));
          const others = (
            await deps.historyRepo.listForHolding(t, u, leg.holdingId)
          ).filter((x) => !legs.some((l) => l.id === x.id));
          const r = entryDateRange(others.map(key), key(leg));
          if (r.min !== null && (min === null || r.min > min)) min = r.min;
          if (r.max !== null && (max === null || r.max < max)) max = r.max;
        }
        if ((min !== null && date < min) || (max !== null && date > max))
          return err(new DateOutOfRange(min, max));
      }
      await deps.historyRepo.editEntries(
        t,
        u,
        legs.map((l) => l.id),
        {
          ...(input.note !== undefined ? { note: input.note || null } : {}),
          ...(date !== undefined ? { effectiveDate: date } : {}),
        },
      );
      return ok({ ok: true });
    } catch (e) {
      return err(e as Error);
    }
  };
}
