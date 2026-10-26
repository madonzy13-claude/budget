/**
 * memory-world.ts — stateful in-memory HoldingRepo + HistoryRepo for Phase 13
 * use-case tests. commit() applies a BookingPlan the way the Drizzle adapter
 * does (patches, new holding, entries, soft deletes, hard deletes), so a test
 * can sell, undo and re-sell and then assert the resulting state.
 */
import { Holding } from "../../src/domain/holding";
import type { HoldingRepo, NewHolding } from "../../src/ports/holding-repo";
import type {
  BookingPlan,
  HistoryRepo,
  StoredEntry,
} from "../../src/ports/history-repo";

export const T = "11111111-1111-1111-1111-111111111111";
export const U = "22222222-2222-2222-2222-222222222222";

export interface H {
  id: string;
  name?: string;
  holdingType?: string;
  uiType: string;
  buy: bigint | null;
  buyCcy?: string;
  qty?: string;
  current: bigint | string | null;
  curCcy?: string;
  rateBps?: number;
  start?: string;
  cap?: string;
}

export function hold(h: H): Holding {
  return new Holding(
    h.id,
    T,
    h.name ?? h.id,
    (h.holdingType ?? "other") as never,
    null,
    null,
    h.buy,
    h.buyCcy ?? "PLN",
    h.qty ?? "1",
    h.current,
    h.curCcy ?? h.buyCcy ?? "PLN",
    0,
    null,
    new Date("2024-01-10T00:00:00Z"),
    h.uiType,
    null,
    null,
    null,
    null,
    null,
    null,
    h.curCcy ?? h.buyCcy ?? "PLN",
    null,
    null,
    null,
    h.rateBps ?? null,
    h.start ?? null,
    h.cap ?? null,
    null,
  );
}

interface Row extends StoredEntry {
  deleted: boolean;
}

export class MemoryWorld {
  holdings = new Map<string, Holding>();
  rows: Row[] = [];
  plans: BookingPlan[] = [];
  typeOrder: string[] = [];
  private seq = 0;

  constructor(holdings: Holding[] = []) {
    for (const h of holdings) this.holdings.set(h.id, h);
  }

  get(id: string): Holding {
    const h = this.holdings.get(id);
    if (!h) throw new Error(`no holding ${id}`);
    return h;
  }

  live(): Row[] {
    return this.rows.filter((r) => !r.deleted);
  }

  private stored(r: Row): StoredEntry {
    const partner = r.transferId
      ? this.live().find((x) => x.transferId === r.transferId && x.id !== r.id)
      : undefined;
    const { deleted: _d, ...rest } = r;
    return {
      ...rest,
      counterpartyName: partner
        ? (this.holdings.get(partner.holdingId)?.name ?? null)
        : null,
    };
  }

  holdingRepo: HoldingRepo = {
    listForBudget: async () =>
      [...this.holdings.values()].filter((h) => !h.archivedAt),
    findById: async (_t: string, _u: string, id: string) =>
      this.holdings.get(id) ?? null,
  } as unknown as HoldingRepo;

  historyRepo: HistoryRepo = {
    commit: async (_t, _u, plan) => {
      this.plans.push(plan);
      let newHoldingId: string | null = null;
      if (plan.newHolding) {
        newHoldingId = `new-${++this.seq}`;
        this.holdings.set(newHoldingId, fromNew(newHoldingId, plan.newHolding));
      }
      for (const p of plan.patches) {
        const h = this.holdings.get(p.id);
        if (!h) throw new Error("not_found");
        if (p.quantity !== undefined) h.quantity = p.quantity;
        if (p.buyPriceCents !== undefined) h.buyPriceCents = p.buyPriceCents;
        if (p.currentPriceCents !== undefined)
          h.currentPriceCents = p.currentPriceCents;
        if (p.depositStartDate !== undefined)
          h.depositStartDate = p.depositStartDate;
        if (p.archive) h.archivedAt = new Date();
        if (p.unarchive) h.archivedAt = null;
      }
      for (const id of plan.softDeleteEntryIds ?? []) {
        const r = this.rows.find((x) => x.id === id);
        if (r) r.deleted = true;
      }
      const transferId = plan.entries.some((e) => e.transfer)
        ? `tx-${++this.seq}`
        : null;
      for (const e of plan.entries) {
        const holdingId =
          e.holdingRef === "$new" ? newHoldingId! : e.holdingRef;
        this.rows.push({
          id: `e-${++this.seq}`,
          holdingId,
          kind: e.kind,
          effectiveDate: e.effectiveDate,
          amountCents: e.amountCents,
          amountCurrency: e.amountCurrency,
          qtyDelta: e.qtyDelta,
          costDeltaCents: e.costDeltaCents,
          valueDeltaCents: e.valueDeltaCents,
          flowCents: e.flowCents,
          realizedBudgetCents: e.realizedBudgetCents,
          budgetCurrency: e.budgetCurrency,
          priorPrincipalCents: e.priorPrincipalCents,
          priorStartDate: e.priorStartDate,
          transferId: e.transfer ? transferId : null,
          createdAt: String(this.seq).padStart(6, "0"),
          counterpartyName: null,
          deleted: false,
        });
      }
      for (const id of plan.deleteHoldingIds ?? []) {
        this.holdings.delete(id);
        this.rows = this.rows.filter((r) => r.holdingId !== id);
      }
      return { newHoldingId, transferId };
    },
    listFlows: async () =>
      this.live().map((r) => ({
        effectiveDate: r.effectiveDate,
        flowCents: r.flowCents,
        flowCurrency: "PLN",
      })),
    findLegs: async (_t, _u, entryId) => {
      const r = this.live().find((x) => x.id === entryId);
      if (!r) return [];
      const legs = r.transferId
        ? this.live().filter((x) => x.transferId === r.transferId)
        : [r];
      return legs.map((x) => this.stored(x));
    },
    listForHolding: async (_t, _u, holdingId) =>
      this.live()
        .filter((r) => r.holdingId === holdingId)
        .sort((a, b) =>
          a.effectiveDate === b.effectiveDate
            ? a.createdAt.localeCompare(b.createdAt)
            : a.effectiveDate.localeCompare(b.effectiveDate),
        )
        .map((r) => this.stored(r)),
    realizedByType: async () => {
      const by = new Map<string, { r: bigint; s: bigint }>();
      for (const row of this.live()) {
        if (row.kind !== "withdraw" && row.kind !== "convert_out") continue;
        const t = this.holdings.get(row.holdingId)?.uiType ?? "other";
        const cur = by.get(t) ?? { r: 0n, s: 0n };
        cur.r += row.realizedBudgetCents ?? 0n;
        by.set(t, cur);
      }
      return [...by].map(([uiType, v]) => ({
        uiType,
        budgetCurrency: "PLN",
        realizedBudgetCents: v.r,
        soldCostBudgetCents: v.s,
      }));
    },
    getTypeOrder: async () => this.typeOrder,
    setTypeOrder: async (_t, _u, _b, order) => {
      this.typeOrder = order;
    },
  };

  /** Σ realized and Σ flow over live rows — what Overview / headers read. */
  totals() {
    const live = this.live();
    return {
      realized: live.reduce((a, r) => a + (r.realizedBudgetCents ?? 0n), 0n),
      flow: live.reduce((a, r) => a + r.flowCents, 0n),
    };
  }
}

function fromNew(id: string, n: NewHolding): Holding {
  const h = hold({
    id,
    name: n.name,
    holdingType: n.holdingType,
    uiType: n.uiType ?? "other",
    buy: n.buyPriceCents,
    buyCcy: n.buyCurrency ?? "PLN",
    qty: n.quantity,
    current: n.currentPriceCents,
    curCcy: n.currentPriceCurrency ?? n.buyCurrency ?? "PLN",
  });
  h.depositStartDate = n.depositStartDate;
  return h;
}

export const rates1 = {
  rateAsOf: async () => ({ rate: "1", provider: "stub", isStale: false }),
} as never;
