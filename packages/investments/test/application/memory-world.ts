/**
 * memory-world.ts — stateful in-memory HoldingRepo + HistoryRepo for Phase 13
 * use-case tests. commit() applies a BookingPlan the way the Drizzle adapter
 * does (patches, new holding, entries, soft deletes, hard deletes), so a test
 * can sell, undo and re-sell and then assert the resulting state.
 */
import Big from "big.js";
import { Holding, holdingShape } from "../../src/domain/holding";
import { newestEntry } from "../../src/domain/asset-ledger";
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
  inst?: string | null;
  archived?: boolean;
  uom?: string;
}

export function hold(h: H): Holding {
  return new Holding(
    h.id,
    T,
    h.name ?? h.id,
    (h.holdingType ?? "other") as never,
    h.inst ?? null,
    h.buy,
    h.buyCcy ?? "PLN",
    h.qty ?? "1",
    h.current,
    h.curCcy ?? h.buyCcy ?? "PLN",
    0,
    h.archived ? new Date("2024-06-01T00:00:00Z") : null,
    new Date("2024-01-10T00:00:00Z"),
    h.uiType,
    null,
    null,
    h.uom ?? null,
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

export interface MemWallet {
  id: string;
  name: string;
  walletType: string;
  currency: string;
  /** Major units, decimal string. */
  balance: string;
}

export class MemoryWorld {
  holdings = new Map<string, Holding>();
  rows: Row[] = [];
  plans: BookingPlan[] = [];
  typeOrder: string[] = [];
  wallets = new Map<string, MemWallet>();
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
    const rest: StoredEntry & { deleted?: boolean } = { ...r };
    delete rest.deleted;
    return {
      ...rest,
      counterpartyName: partner
        ? (this.holdings.get(partner.holdingId)?.name ?? null)
        : null,
      counterpartyHoldingId: partner?.holdingId ?? null,
      walletName: r.walletId
        ? (this.wallets.get(r.walletId)?.name ?? null)
        : null,
    };
  }

  /** Newest live entry of a holding — the domain rule (D-14). */
  newest(holdingId: string): Row | null {
    const own = this.live().filter((r) => r.holdingId === holdingId);
    const top = newestEntry(own);
    return top ? (own.find((r) => r.id === top.id) ?? null) : null;
  }

  holdingRepo: HoldingRepo = {
    listForBudget: async () =>
      [...this.holdings.values()].filter((h) => !h.archivedAt),
    findById: async (_t: string, _u: string, id: string) =>
      this.holdings.get(id) ?? null,
    listNames: async (_t: string, _b: string, uiType: string) =>
      [...this.holdings.values()]
        .filter((h) => h.uiType === uiType)
        .map((h) => ({
          id: h.id,
          name: h.name,
          archived: h.archivedAt !== null,
          instrumentId: h.instrumentId,
          quantity: h.quantity,
          currentPriceCents:
            h.currentPriceCents === null ? null : String(h.currentPriceCents),
          currentPriceCurrency: h.currentPriceCurrency,
          buyCurrency: h.buyCurrency,
          symbol: h.symbol,
          instrumentName: h.instrumentName,
          holdingType: h.holdingType,
          unitOfMeasure: h.unitOfMeasure,
        })),
  } as unknown as HoldingRepo;

  historyRepo: HistoryRepo = {
    commit: async (_t, _u, plan) => {
      this.plans.push(plan);
      // Preconditions re-checked "under the lock" (lockHoldingIds is a no-op here).
      for (const x of plan.expectedNewestEntryId ?? [])
        if ((this.newest(x.holdingId)?.id ?? null) !== x.entryId)
          throw new Error("stale");
      for (const x of plan.minEffectiveDate ?? []) {
        const top = this.newest(x.holdingId);
        if (top && x.date < top.effectiveDate)
          throw new Error("before_latest_entry");
      }
      let walletId: string | null = null;
      let walletType: string | null = null;
      if (plan.walletCredit) {
        const c = plan.walletCredit;
        let w: MemWallet | undefined;
        if ("create" in c.target) {
          w = {
            id: `w-${++this.seq}`,
            name: c.target.create.name,
            walletType: c.target.create.walletType,
            currency: c.target.create.currency,
            balance: "0",
          };
          this.wallets.set(w.id, w);
        } else {
          w = this.wallets.get(c.target.walletId);
          if (!w && !c.reverse) throw new Error("not_found");
        }
        if (w) {
          if (w.currency !== c.currency)
            throw new Error("wallet_currency_mismatch");
          const sign = c.reverse ? -1 : 1;
          w.balance = (
            Number(w.balance) +
            sign * Number(c.amountMajor)
          ).toFixed(4);
          walletId = w.id;
          walletType = w.walletType;
        }
      }
      if (plan.renameHolding)
        this.get(plan.renameHolding.id).name = plan.renameHolding.name.trim();
      if (plan.restorePrice) {
        const h = this.get(plan.restorePrice.id);
        h.currentPriceCents = plan.restorePrice.priceCents;
        h.currentPriceCurrency = plan.restorePrice.currency;
      }
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
        if (p.currentPriceCurrency !== undefined)
          h.currentPriceCurrency = p.currentPriceCurrency;
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
          costCurrency: e.costCurrency,
          assetAmountCents: e.assetAmountCents ?? null,
          valueDeltaCents: e.valueDeltaCents,
          flowCents: e.flowCents,
          realizedBudgetCents: e.realizedBudgetCents,
          soldCostBudgetCents: e.soldCostBudgetCents,
          budgetCurrency: e.budgetCurrency,
          priorPrincipalCents: e.priorPrincipalCents,
          priorStartDate: e.priorStartDate,
          transferId: e.transfer ? transferId : null,
          createdAt: String(this.seq).padStart(6, "0"),
          counterpartyName: null,
          counterpartyHoldingId: null,
          walletName: null,
          walletId: e.walletId === "$newWallet" ? walletId : e.walletId,
          walletDeltaNumeric: e.walletDeltaNumeric,
          walletCreated: e.walletCreated,
          priorPriceCents: e.priorPriceCents,
          priorPriceCurrency: e.priorPriceCurrency,
          backfilled: e.backfilled,
          note: e.note ?? plan.note ?? null,
          deleted: false,
        });
      }
      for (const id of plan.deleteHoldingIds ?? []) {
        this.holdings.delete(id);
        this.rows = this.rows.filter((r) => r.holdingId !== id);
      }
      return { newHoldingId, transferId, walletId, walletType };
    },
    newestFor: async (_t, _u, holdingIds) => {
      const out = new Map<string, StoredEntry | null>();
      for (const id of holdingIds) {
        const r = this.newest(id);
        out.set(id, r ? this.stored(r) : null);
      }
      return out;
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
    editEntries: async (_t, _u, ids, patch) => {
      for (const r of this.live())
        if (ids.includes(r.id)) {
          if (patch.note !== undefined) r.note = patch.note;
          if (patch.effectiveDate) r.effectiveDate = patch.effectiveDate;
        }
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
        const k = `${t}\u0000${row.holdingId}`;
        const cur = by.get(k) ?? { r: 0n, s: 0n };
        cur.r += row.realizedBudgetCents ?? 0n;
        cur.s += row.soldCostBudgetCents ?? 0n;
        by.set(k, cur);
      }
      return [...by].map(([k, v]) => ({
        uiType: k.split("\u0000")[0]!,
        holdingId: k.split("\u0000")[1]!,
        budgetCurrency: "PLN",
        realizedBudgetCents: v.r,
        soldCostBudgetCents: v.s,
      }));
    },
    contributionsByType: async () => [],
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

/**
 * UAT 13.1 test 12: an asset row must equal the sum of its live ledger
 * entries. Quantity holdings: Σ qty_delta == quantity and Σ cost_delta ≈
 * quantity × per-unit buy price (per-unit rounding, ≤ ½ cent a unit). Amount
 * holdings carry qty 1 and the total cost, so only cost is compared.
 */
export function expectRowMatchesEntries(w: MemoryWorld, holdingId: string) {
  const h = w.get(holdingId);
  const own = w.live().filter((r) => r.holdingId === holdingId);
  const qty = own.reduce((a, r) => a.plus(r.qtyDelta ?? "0"), Big(0));
  const cost = own.reduce((a, r) => a + r.costDeltaCents, 0n);
  const buy = h.buyPriceCents ?? 0n;
  if (holdingShape(h) === "quantity") {
    if (!qty.eq(h.quantity))
      throw new Error(`${holdingId}: row qty ${h.quantity} ≠ Σ entries ${qty}`);
    const rowCost = Big(h.quantity).times(buy.toString());
    const slack = Big(h.quantity).div(2).plus(1);
    if (rowCost.minus(cost.toString()).abs().gt(slack))
      throw new Error(`${holdingId}: row cost ${rowCost} ≠ Σ entries ${cost}`);
  } else if (buy !== cost) {
    throw new Error(`${holdingId}: row cost ${buy} ≠ Σ entries ${cost}`);
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
    inst: n.instrumentId,
  });
  h.depositStartDate = n.depositStartDate;
  return h;
}

export const rates1 = {
  rateAsOf: async () => ({ rate: "1", provider: "stub", isStale: false }),
} as never;
