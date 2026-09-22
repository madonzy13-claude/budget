/**
 * Confirming a scheduled payment refreshes the RESERVE_TOPUP task.
 *
 * It did not. A confirm flips `confirmed_at`, which turns the row into COUNTED
 * SPEND — that can overspend a category, which draws that category's reserve,
 * which moves the surplus the task reports. Every other mutation that can do
 * that already refreshes the task: create-transaction, set-wallet-balance,
 * adjust-category-reserve, and the sibling `confirm-scheduled-draft`.
 *
 * `confirm-draft` is the one the app actually runs — the scheduled-payments
 * route calls it, and `confirm-scheduled-draft` is wired to no route at all —
 * and it only resolved the CONFIRM_DRAFT row. So the reserves pill kept
 * whatever amount it last had while the Overview, which recomputes on read,
 * moved on. Reported live (260921): Overview said withdraw 3,535.10 zł and the
 * task still said 63.10 zł, the exact figure it had been emitted with two days
 * earlier — the 3,471.90 zł difference being the reserve the confirmed car
 * insurance had just drawn.
 *
 * What the amount should BE is recompute-reserve-topup-task's business, and is
 * tested there. This file is only about whether a confirm asks for it at all.
 */
import { describe, it, expect } from "bun:test";
import { confirmDraft } from "../../src/application/confirm-draft";

const TENANT = "11111111-1111-4111-8111-111111111111";
const DRAFT = "22222222-2222-4222-8222-222222222222";
const ACTOR = "33333333-3333-4333-8333-333333333333";

type Outcome = "ok" | "not_found" | "already_confirmed" | "already_dismissed";

function makeDeps(outcome: Outcome) {
  const refreshes: {
    tenantId: string;
    budgetId: string;
    actorUserId: string;
  }[] = [];
  const resolvedDrafts: string[] = [];

  return {
    refreshes,
    resolvedDrafts,
    deps: {
      repo: { confirm: async () => outcome },
      taskRepo: {
        resolveConfirmDraftByDraftId: async (_t: string, draftId: string) => {
          resolvedDrafts.push(draftId);
        },
      },
      recomputeReserveTopup: async (i: {
        tenantId: string;
        budgetId: string;
        actorUserId: string;
      }) => {
        refreshes.push(i);
      },
    },
  };
}

const run = (deps: unknown) =>
  confirmDraft(deps as never)({
    tenantId: TENANT,
    draftId: DRAFT,
    actorUserId: ACTOR,
  });

describe("confirmDraft — the reserve task follows the confirm", () => {
  it("refreshes RESERVE_TOPUP after a confirm that stuck", async () => {
    const h = makeDeps("ok");
    const r = await run(h.deps);

    expect(r.isOk()).toBe(true);
    expect(h.refreshes).toEqual([
      // v1.1 invariant: the budget IS the tenant. Passing the draft id here,
      // or omitting the budget, would recompute the wrong budget's reserve.
      { tenantId: TENANT, budgetId: TENANT, actorUserId: ACTOR },
    ]);
  });

  // The CONFIRM_DRAFT resolve itself is NOT asserted here. It runs inside
  // `withTenantTx`, which returns a Result rather than throwing, so with no
  // Postgres behind it the call is a silent no-op and `resolvedDrafts` can
  // never fill — the assertion would be testing the absence of a database.
  // Its home is the real-Postgres suite, next to dismiss-draft's own
  // same-tx resolve test. What IS observable without a database is that the
  // refresh is ADDITIONAL: the confirm still reports success, and a rejected
  // confirm still touches nothing.

  for (const outcome of [
    "not_found",
    "already_confirmed",
    "already_dismissed",
  ] as const) {
    it(`touches no reserve task when the confirm was rejected (${outcome})`, async () => {
      const h = makeDeps(outcome);
      const r = await run(h.deps);

      expect(r.isErr()).toBe(true);
      // Nothing was confirmed, so no spend moved and no reserve moved.
      expect(h.refreshes).toEqual([]);
    });
  }

  it("a confirm still succeeds when the reserve refresh throws", async () => {
    const h = makeDeps("ok");
    const deps = {
      ...h.deps,
      recomputeReserveTopup: async () => {
        throw new Error("engine unavailable");
      },
    };
    // Best-effort, like every other caller of the recompute: the payment IS
    // recorded, the hourly sweep reconverges the task, and failing the confirm
    // over a task refresh would lose someone their payment.
    expect((await run(deps)).isOk()).toBe(true);
  });

  it("without the dep wired it behaves exactly as before", async () => {
    const h = makeDeps("ok");
    const { recomputeReserveTopup, ...rest } = h.deps;
    void recomputeReserveTopup;

    expect((await run(rest)).isOk()).toBe(true);
    expect(h.refreshes).toEqual([]);
  });
});
