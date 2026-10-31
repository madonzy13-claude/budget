/**
 * investment-type-groups.ts — Phase 13 type groups (D-12..D-16).
 *
 * Groups are the holding's TYPE (fixed keys, never user-named). A header shows
 * value · total P/L (unrealized + realized) and P/L % over LIFETIME cost — the
 * cost still held plus the cost of every sold part — so a sale never moves the
 * %. Never ÷ cost still held (the inflated-% bug of the reverted ledger).
 *
 * ponytail: Number math on cents — display only, nothing here is persisted.
 */
import type { HoldingDto } from "@/hooks/use-investments";
import {
  UI_TYPE_ORDER,
  deriveUiType,
  type UiType,
} from "@/lib/investment-types";

/** GET /budgets/:id/investments/type-summary (served by 13-08). */
export interface TypeSummaryDto {
  currency: string;
  /** Saved per-budget type order (D-12); may be empty. */
  order: string[];
  /** Keyed by ui_type; includes types with no holdings left (D-14). */
  types: Record<
    string,
    {
      realizedBudgetCents: string;
      soldCostBudgetCents: string;
      /** R6: money put into the type from outside it (the % base). */
      contributedBudgetCents?: string;
    }
  >;
  /** R6-6: the same sums per asset; optional while an older api answers. */
  holdings?: Record<
    string,
    { realizedBudgetCents: string; soldCostBudgetCents: string }
  >;
}

export const TYPE_KEYS: UiType[] = UI_TYPE_ORDER;

export interface TypeBlock {
  uiType: UiType;
  holdings: HoldingDto[];
}

export function typeOf(h: HoldingDto): UiType {
  return deriveUiType(h.uiType, h.holdingType, h.isCustom);
}

/** One block per type WITH holdings (D-13/D-14). Saved order first (unknown
 *  keys ignored), then the remaining types in picker order. */
export function buildTypeBlocks(
  holdings: HoldingDto[],
  order: string[],
): TypeBlock[] {
  const byType = new Map<UiType, HoldingDto[]>();
  for (const h of holdings) {
    const t = typeOf(h);
    byType.set(t, [...(byType.get(t) ?? []), h]);
  }
  const keys = [
    ...order.filter((k): k is UiType => (TYPE_KEYS as string[]).includes(k)),
    ...TYPE_KEYS,
  ];
  return [...new Set(keys)]
    .filter((t) => byType.has(t))
    .map((uiType) => ({
      uiType,
      holdings: [...byType.get(uiType)!].sort(
        (a, b) => a.sortOrder - b.sortOrder,
      ),
    }));
}

export interface TypeGroupPL {
  valueBudgetCents: number;
  unrealizedCents: number;
  realizedCents: number;
  totalPLCents: number;
  lifetimeCostCents: number;
  pct: number | null;
}

/** Held cost in budget cents: the server's figure, else derived from value and
 *  P/L % (optimistic rows), null when the holding has no basis. */
function heldCost(h: HoldingDto): number | null {
  if (h.costInBudgetCents != null && h.profitLossPct != null)
    return Number(h.costInBudgetCents);
  if (h.profitLossPct != null)
    return Number(h.valueInBudgetCents || 0) / (1 + h.profitLossPct / 100);
  return null;
}

export function typeGroupPL(
  holdings: HoldingDto[],
  summary?: {
    realizedBudgetCents: string;
    soldCostBudgetCents: string;
    contributedBudgetCents?: string;
  },
): TypeGroupPL {
  let valueBudgetCents = 0;
  let unrealizedCents = 0;
  let heldCostCents = 0;
  for (const h of holdings) {
    const v = Number(h.valueInBudgetCents || 0);
    valueBudgetCents += v;
    const c = heldCost(h);
    if (c === null) continue;
    unrealizedCents += v - c;
    heldCostCents += c;
  }
  const realizedCents = Number(summary?.realizedBudgetCents ?? 0);
  const lifetimeCostCents =
    heldCostCents + Number(summary?.soldCostBudgetCents ?? 0);
  const totalPLCents = unrealizedCents + realizedCents;
  // R6 (user): over the money put in from outside when known — held + sold
  // cost counts a swap inside the type twice.
  const base = summary?.contributedBudgetCents
    ? Number(summary.contributedBudgetCents)
    : lifetimeCostCents;
  return {
    valueBudgetCents,
    unrealizedCents,
    realizedCents,
    totalPLCents,
    lifetimeCostCents,
    pct: base > 0 ? (totalPLCents / base) * 100 : null,
  };
}

/** Portfolio total over EVERY type in the summary, including types with no
 *  holdings left (D-14) — their realized is reported as hiddenRealizedCents. */
export function portfolioPL(
  holdings: HoldingDto[],
  summary: TypeSummaryDto | undefined,
): TypeGroupPL & { hiddenRealizedCents: number } {
  const held = new Set(holdings.map(typeOf));
  let realized = 0n;
  let sold = 0n;
  let hidden = 0n;
  for (const [t, s] of Object.entries(summary?.types ?? {})) {
    realized += BigInt(s.realizedBudgetCents);
    sold += BigInt(s.soldCostBudgetCents);
    if (!held.has(t as UiType)) hidden += BigInt(s.realizedBudgetCents);
  }
  return {
    ...typeGroupPL(holdings, {
      realizedBudgetCents: String(realized),
      soldCostBudgetCents: String(sold),
    }),
    hiddenRealizedCents: Number(hidden),
  };
}

export function moveTypeBlock(
  order: UiType[],
  active: UiType,
  over: UiType,
): UiType[] {
  const from = order.indexOf(active);
  const to = order.indexOf(over);
  if (from < 0 || to < 0 || from === to) return order;
  const next = [...order];
  next.splice(to, 0, ...next.splice(from, 1));
  return next;
}
