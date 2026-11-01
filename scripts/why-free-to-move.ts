/**
 * why-free-to-move.ts — print the Free-to-move figure and the day that sets it.
 *
 * "Free to move" on the Overview is `safe_to_withdraw`: the LOWEST point the
 * worst-case forecast line reaches inside the member's window. This runs the
 * same loader the API route runs, so the number here is the number on the card.
 *
 * `today` comes from the process clock (Temporal.Now.plainDateISO()), so
 * running this under a TZ whose local date is still yesterday reproduces
 * yesterday's answer — which is how a day-over-day change gets attributed
 * instead of guessed.
 *
 *   infisical run --env=dev -- bun scripts/why-free-to-move.ts <budgetId> [days]
 *   TZ=America/Los_Angeles infisical run --env=dev -- bun scripts/...   # yesterday
 */
import { workerPool } from "@budget/platform";
import { createBudgetingModule } from "@budget/budgeting/src/contracts/factory";
import { DrizzleFxRateCacheRepo } from "@budget/budgeting/src/adapters/persistence/fx-rate-cache-repo";
import { computeCashflowProjection } from "@budget/budgeting/src/application/compute-cashflow-projection";

const budgetId = process.argv[2];
const windowDays = Number(process.argv[3] ?? 100);
if (!budgetId) throw new Error("usage: why-free-to-move.ts <budgetId> [days]");

const base = createBudgetingModule({ fxCache: new DrizzleFxRateCacheRepo(workerPool()) });
const run = computeCashflowProjection({
  fxProvider: base.fxProvider,
  reservePositions: base.reservePositions,
});

const p = await run({ tenantId: budgetId, budgetId, windowDays });

const zl = (c: bigint) => (Number(c) / 100).toFixed(2);
console.log(`local today      : ${new Date().toLocaleDateString("sv")}  (TZ=${process.env["TZ"] ?? "system"})`);
console.log(`window           : ${windowDays} days, ${p.days[0]?.date} → ${p.days[p.days.length - 1]?.date}`);
console.log(`FREE TO MOVE     : ${zl(p.safeToWithdraw.cents)} ${p.currency}`);
console.log(`thinnest day     : ${p.safeToWithdraw.thinnestDate}`);

const d0 = p.days[0];
if (d0) {
  console.log(
    `day 1 opening    : ${zl(d0.openingCents)}  burn ${zl(d0.plannedBurnCents)}  pending ${zl(d0.pendingCents)}  bills ${zl(d0.billCents)}  income ${zl(d0.incomeCents)}`,
  );
}
const thin = p.days.find((d) => d.date === p.safeToWithdraw.thinnestDate);
if (thin) {
  console.log(
    `thinnest day row : available ${zl(thin.availableCents)}  burn ${zl(thin.plannedBurnCents)}  bills ${zl(thin.billCents)}  reserveCovered ${zl(thin.reserveCoveredCents)}`,
  );
}
console.log(
  `bills in window  : ${p.billPoints.length} totalling ${zl(p.billPoints.reduce((s, b) => s + b.amountCents, 0n))}`,
);
console.log(
  `income in window : ${p.incomePoints.length} totalling ${zl(p.incomePoints.reduce((s, b) => s + b.amountCents, 0n))}`,
);
console.log(
  `pending (unconfirmed, past due): ${p.pendingPoints.length} totalling ${zl(p.pendingPoints.reduce((s, b) => s + b.amountCents, 0n))}`,
);

process.exit(0);
