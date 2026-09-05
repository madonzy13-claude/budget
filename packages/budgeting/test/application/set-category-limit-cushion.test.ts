/**
 * The cushion amount is DERIVED from the category's cushion mode, wherever the
 * limit is written from.
 *
 * It was derived in one place only — the category edit form, which computes
 * needs/wants → cushion before it PUTs. Every other writer had to remember to
 * send a matching cushion, and the Overview's limit-rebalance popup did not: it
 * sent the NEW normal split with the OLD cushion carried forward
 * (planned-section.tsx). Rebalancing therefore left the two out of step, and
 * because cushion mode judges every category against its cushion amount, the
 * budget quietly ran on stale numbers — a category whose limit had been lowered
 * from 234 to 74 still had a 234 cushion, so cushion mode made it LOOSER than
 * normal mode (user, 260905, from a live budget where all four `needs_wants`
 * categories had drifted).
 *
 * Deriving it here — at the one place every writer already goes through —
 * means no caller can get it wrong, and none of them has to know the rule.
 */
import { describe, test, expect } from "bun:test";
import { ok } from "@budget/shared-kernel";
import { setCategoryLimit } from "../../src/application/set-category-limit";

const TENANT = "t1";
const CATEGORY = "c1";

/** Captures what actually reached the repo. */
function makeDeps(cushionMode: string | null) {
  const written: Record<string, unknown>[] = [];
  const deps = {
    limitRepo: {
      setLimitForMonth: async (row: Record<string, unknown>) => {
        written.push(row);
      },
      getEffectiveLimit: async () => ({
        categoryId: CATEGORY,
        normalAmount: "0",
        normalCurrency: "PLN",
        cushionAmount: "0",
        cushionCurrency: "PLN",
        needsAmount: null,
        wantsAmount: null,
        noLimit: false,
        effectiveFrom: "2026-09-01",
        effectiveTo: null,
        createdAt: new Date("2026-09-01T00:00:00Z"),
      }),
    },
    cushionModeOf: async () => ok(cushionMode),
  };
  return { deps, written };
}

const call = (
  deps: unknown,
  over: Partial<Record<string, unknown>> = {},
): Promise<unknown> =>
  setCategoryLimit(deps as never)({
    tenantId: TENANT,
    categoryId: CATEGORY,
    actorUserId: "u1",
    normalAmount: "74",
    normalCurrency: "PLN",
    // What the rebalance popup sends: the category's PREVIOUS cushion, which is
    // exactly the value that must not survive.
    cushionAmount: "234",
    cushionCurrency: "PLN",
    needsAmount: "74",
    wantsAmount: "0",
    noLimit: false,
    ...over,
  } as never);

describe("setCategoryLimit — the cushion follows the category's mode", () => {
  test("needs_wants: the cushion IS the new planned total", async () => {
    const { deps, written } = makeDeps("needs_wants");
    await call(deps);
    expect(written[0]!.cushionAmount).toBe("74");
  });

  test("needs_only: the cushion is the needs half", async () => {
    const { deps, written } = makeDeps("needs_only");
    await call(deps, {
      normalAmount: "100",
      needsAmount: "60",
      wantsAmount: "40",
    });
    expect(written[0]!.cushionAmount).toBe("60");
  });

  test("none: no cushion at all", async () => {
    const { deps, written } = makeDeps("none");
    await call(deps);
    expect(written[0]!.cushionAmount).toBe("0");
  });

  test("custom: the caller's amount is the whole point, so it stands", async () => {
    const { deps, written } = makeDeps("custom");
    await call(deps);
    expect(written[0]!.cushionAmount).toBe("234");
  });

  test("no stored mode: the caller's amount stands", async () => {
    // Categories predating the mode column, and the Investments category, carry
    // no mode. Deriving from nothing would silently zero their cushion.
    const { deps, written } = makeDeps(null);
    await call(deps);
    expect(written[0]!.cushionAmount).toBe("234");
  });

  test("without the dep wired, nothing is derived", async () => {
    const written: Record<string, unknown>[] = [];
    await call({
      limitRepo: {
        setLimitForMonth: async (row: Record<string, unknown>) => {
          written.push(row);
        },
        getEffectiveLimit: async () => null,
      },
    });
    expect(written[0]!.cushionAmount).toBe("234");
  });

  test("a needs_only category with no needs recorded keeps the caller's amount", async () => {
    // needsAmount is nullable on the row. Deriving 0 from a missing split would
    // wipe a real cushion; there is nothing to derive FROM, so don't.
    const { deps, written } = makeDeps("needs_only");
    await call(deps, { needsAmount: null });
    expect(written[0]!.cushionAmount).toBe("234");
  });
});
