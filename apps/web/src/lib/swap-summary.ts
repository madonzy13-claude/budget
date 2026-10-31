/**
 * swap-summary.ts — the pre-submit "What will happen" lines (13.1 D-31,
 * UI-SPEC 2d). Pure: numbers in (cents, or units for quantity lines), line
 * descriptors out; the card formats them. Display-only Number math — the
 * server books in BigInt and is authoritative.
 */

export type MoveLine = {
  key: "swap.sum.line";
  /** Asset / wallet name, or an i18n key for a generic label. */
  label?: string;
  labelKey?: string;
  before: number;
  after: number;
  ccy: string;
  unit?: "qty";
  /** Sold everything: "gone from your list" instead of the after figure. */
  gone?: boolean;
};

export type SumLine =
  | MoveLine
  | {
      key: "swap.sum.created" | "swap.sum.walletNew";
      name: string;
      amount: number;
      ccy: string;
    }
  | { key: "swap.sum.realized"; amount: number; ccy: string }
  | { key: "swap.buy.split"; market: number; deposit: number; ccy: string }
  | {
      key:
        | "swap.sum.plUnchanged"
        | "swap.sum.leaves"
        | "swap.sum.realizedUnchanged";
    };

export type SwapSummary =
  { empty: true } | { empty: false; lines: SumLine[]; display: boolean };

interface Source {
  name: string;
  v0: number;
  v1: number;
  ccy: string;
}

/** Buy from another asset: what leaves the source (R6, user). */
type BuyFrom = { from?: Source | null };

export type SwapCase =
  | ({
      tab: "buy";
      shape: "quantity";
      name: string;
      qty0: number;
      qty1: number;
      v0: number;
      v1: number;
      ccy: string;
    } & BuyFrom)
  | ({
      tab: "buy";
      shape: "amount";
      name: string;
      v0: number;
      v1: number;
      ccy: string;
    } & BuyFrom)
  | ({
      tab: "buy";
      shape: "broker";
      marketCents: number;
      depositCents: number;
    } & Source &
      BuyFrom)
  | ({
      tab: "sell";
      /** null = cash-like source: no realized line (R6, user). */
      realized: number | null;
      realizedCcy: string;
      dest:
        | { kind: "new"; name: string; amount: number; ccy: string }
        | {
            kind: "existing";
            name: string;
            d0: number;
            d1: number;
            ccy: string;
          }
        | { kind: "wallet"; name: string; b0: number; b1: number; ccy: string }
        | { kind: "newWallet"; name: string; amount: number; ccy: string }
        | { kind: "nowhere" };
    } & Source)
  | ({
      tab: "transfer";
      dest:
        | {
            kind: "existing";
            name: string;
            t0: number;
            t1: number;
            ccy: string;
          }
        | { kind: "new"; name: string; amount: number; ccy: string };
    } & Source);

const move = (
  label: string,
  before: number,
  after: number,
  ccy: string,
): MoveLine => ({
  key: "swap.sum.line",
  label,
  before,
  after,
  ccy,
});

const drained = (s: Source): MoveLine => ({
  ...move(s.name, s.v0, s.v1, s.ccy),
  ...(s.v1 === 0 ? { gone: true } : {}),
});

function lines(c: SwapCase): SumLine[] {
  if (c.tab === "buy")
    return [...(c.from ? [drained(c.from)] : []), ...bought(c)];
  return moved(c);
}

function bought(c: Extract<SwapCase, { tab: "buy" }>): SumLine[] {
  if (c.shape === "quantity")
    return [
      { ...move(c.name, c.qty0, c.qty1, c.ccy), unit: "qty" },
      {
        key: "swap.sum.line",
        labelKey: "edit.currentValue",
        before: c.v0,
        after: c.v1,
        ccy: c.ccy,
      },
    ];
  if (c.shape === "amount")
    return [move(c.name, c.v0, c.v1, c.ccy), { key: "swap.sum.plUnchanged" }];
  return [
    move(c.name, c.v0, c.v1, c.ccy),
    {
      key: "swap.buy.split",
      market: c.marketCents,
      deposit: c.depositCents,
      ccy: c.ccy,
    },
  ];
}

function moved(c: Exclude<SwapCase, { tab: "buy" }>): SumLine[] {
  const src: SumLine = drained(c);
  if (c.tab === "transfer") {
    const d = c.dest;
    return d.kind === "existing"
      ? [
          src,
          move(d.name, d.t0, d.t1, d.ccy),
          { key: "swap.sum.realizedUnchanged" },
        ]
      : [
          src,
          {
            key: "swap.sum.created",
            name: d.name,
            amount: d.amount,
            ccy: d.ccy,
          },
        ];
  }
  const d = c.dest;
  const realized: SumLine[] =
    c.realized === null
      ? []
      : [{ key: "swap.sum.realized", amount: c.realized, ccy: c.realizedCcy }];
  switch (d.kind) {
    case "new":
      return [
        src,
        { key: "swap.sum.created", name: d.name, amount: d.amount, ccy: d.ccy },
        ...realized,
      ];
    case "existing":
      return [src, move(d.name, d.d0, d.d1, d.ccy), ...realized];
    case "wallet":
      return [src, move(d.name, d.b0, d.b1, d.ccy), ...realized];
    case "newWallet":
      return [
        src,
        {
          key: "swap.sum.walletNew",
          name: d.name,
          amount: d.amount,
          ccy: d.ccy,
        },
        ...realized,
      ];
    case "nowhere":
      return [src, { key: "swap.sum.leaves" }, ...realized];
  }
}

const numbersOf = (l: SumLine): number[] =>
  "before" in l
    ? [l.before, l.after]
    : "market" in l
      ? [l.market, l.deposit]
      : "amount" in l
        ? [l.amount]
        : [];

export function buildSwapSummary(c: SwapCase | null): SwapSummary {
  if (!c) return { empty: true };
  const out = lines(c);
  if (out.some((l) => numbersOf(l).some((n) => !Number.isFinite(n))))
    return { empty: true };
  // The 24/600 display figure only when exactly one resulting figure exists.
  const results = out.filter(
    (l) =>
      l.key === "swap.sum.line" ||
      l.key === "swap.sum.created" ||
      l.key === "swap.sum.walletNew",
  ).length;
  return { empty: false, lines: out, display: results === 1 };
}
