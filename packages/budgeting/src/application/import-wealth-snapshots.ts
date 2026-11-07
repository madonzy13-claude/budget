/**
 * import-wealth-snapshots.ts — 15-21 (decision b2): a dated wallet-balance
 * history becomes one wealth snapshot per date, so the Overview growth chart
 * starts from the user's first day instead of the day they joined.
 *
 * capitalization = Σ that date's wallet balances, each converted to the budget
 * currency at that date, + the investments of the nearest snapshot at or
 * before it (0 when there is none — investments are not part of the import).
 * Ports only: the repo and the FX provider.
 */
import { ok, err, type FxProvider, type Result } from "@budget/shared-kernel";
import { sumWalletsToCurrency } from "./compute-budget-wealth-now";
import type { WealthSnapshotRow } from "./get-overview-wealth";

/** One past point, in the budget currency, as the repo stores it. */
export interface ImportedSnapshot {
  date: string;
  capturedAt: Date;
  capitalizationCents: bigint;
  investmentValueCents: bigint;
  investmentCostBasisCents: bigint | null;
  currency: string;
}

export interface ImportWealthSnapshotsDeps {
  repo: {
    openingBefore(budgetId: string, from: string): Promise<WealthSnapshotRow | null>;
    insertImported(
      budgetId: string,
      rows: ImportedSnapshot[],
    ): Promise<{ created: { id: string; date: string }[]; skippedExisting: string[] }>;
  };
  fx: FxProvider;
  currencyOf(budgetId: string): Promise<string>;
}

export interface ImportWealthSnapshotsInput {
  budgetId: string;
  points: Array<{ date: string; wallets: Array<{ amountCents: bigint; currency: string }> }>;
}

const nextDay = (date: string) =>
  new Date(Date.parse(`${date}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);

export function importWealthSnapshots(deps: ImportWealthSnapshotsDeps) {
  return async (
    input: ImportWealthSnapshotsInput,
  ): Promise<Result<{ created: { id: string; date: string }[]; skipped_existing: string[] }, Error>> => {
    try {
      const currency = await deps.currencyOf(input.budgetId);
      const rows: ImportedSnapshot[] = [];
      for (const p of [...input.points].sort((a, b) => a.date.localeCompare(b.date))) {
        // Late evening, so the day's own worker point (if any) is never beaten.
        const capturedAt = new Date(`${p.date}T23:00:00Z`);
        const wallets = await sumWalletsToCurrency(
          p.wallets.map((w) => ({ amount_cents: w.amountCents, currency: w.currency })),
          currency,
          deps.fx,
          capturedAt,
        );
        const carried = await deps.repo.openingBefore(input.budgetId, nextDay(p.date));
        const investments = carried?.investment_value_cents ?? 0n;
        rows.push({
          date: p.date,
          capturedAt,
          capitalizationCents: wallets + investments,
          investmentValueCents: investments,
          investmentCostBasisCents: carried?.investment_cost_basis_cents ?? null,
          currency,
        });
      }
      const r = await deps.repo.insertImported(input.budgetId, rows);
      return ok({ created: r.created, skipped_existing: r.skippedExisting });
    } catch (e) {
      return err(e as Error);
    }
  };
}
