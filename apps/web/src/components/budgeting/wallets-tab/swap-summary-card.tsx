"use client";
/**
 * swap-summary-card.tsx — "What will happen" above the submit button (13.1
 * D-31). Renders buildSwapSummary lines: "label before → after", the after
 * figure 16/600 (24/600 when it is the only resulting figure). Hidden until
 * the form changes something (13.1 UAT 8): derived from the lines themselves.
 */
import { useLocale, useTranslations } from "next-intl";
import { centsToBare } from "@/lib/cents-format";
import type { SumLine, SwapSummary } from "@/lib/swap-summary";

const signColor = (n: number) =>
  n > 0
    ? "var(--trading-up)"
    : n < 0
      ? "var(--trading-down)"
      : "var(--muted-strong)";
/** Any figure that actually moves — a before ≠ after, or a non-zero amount. */
const moves = (s: SwapSummary) =>
  !s.empty &&
  s.lines.some((l) =>
    "before" in l
      ? l.before !== l.after
      : "market" in l
        ? l.market !== 0 || l.deposit !== 0
        : "amount" in l && l.amount !== 0,
  );
const trimQty = (q: string) =>
  q.includes(".") ? q.replace(/0+$/, "").replace(/\.$/, "") : q;

export function SwapSummaryCard({ summary }: { summary: SwapSummary }) {
  const t = useTranslations("budget.investments");
  const locale = useLocale();
  if (summary.empty || !moves(summary)) return null;
  const money = (c: number, ccy: string) =>
    `${centsToBare(String(Math.round(Math.abs(c))), locale)} ${ccy}`;
  const signedMoney = (c: number, ccy: string) =>
    `${c > 0 ? "+" : c < 0 ? "−" : ""}${money(c, ccy)}`;

  const line = (l: SumLine, i: number, display: boolean) => {
    switch (l.key) {
      case "swap.sum.line": {
        const fmt = (n: number) =>
          l.unit === "qty" ? trimQty(n.toFixed(8)) : money(n, l.ccy);
        const label = l.label ?? t(l.labelKey!);
        return (
          <p
            key={i}
            className="flex flex-wrap items-baseline gap-x-1 text-[14px]"
          >
            <span>{label}:</span>
            <span>{fmt(l.before)}</span>
            <span aria-hidden="true">→</span>
            <span
              className={
                display
                  ? "num text-[24px] font-semibold"
                  : "num text-[16px] font-semibold"
              }
              style={{ color: "var(--body-on-dark)" }}
            >
              {fmt(l.after)}
            </span>
          </p>
        );
      }
      case "swap.sum.created":
      case "swap.sum.walletNew":
        return (
          <p key={i} className="text-[14px]">
            {t(l.key, { name: l.name, amount: money(l.amount, l.ccy) })}
          </p>
        );
      case "swap.sum.realized":
        return (
          <p
            key={i}
            className="text-[14px]"
            style={{ color: signColor(l.amount) }}
          >
            {t(l.key, { amount: signedMoney(l.amount, l.ccy) })}
          </p>
        );
      case "swap.buy.split":
        return (
          <p key={i} className="text-[12px]">
            {t(l.key, {
              market: signedMoney(l.market, l.ccy),
              deposit: signedMoney(l.deposit, l.ccy),
            })}
          </p>
        );
      default:
        return (
          <p key={i} className="text-[14px]">
            {t(l.key)}
          </p>
        );
    }
  };

  return (
    <div
      data-testid="swap-summary"
      className="space-y-1 rounded-[var(--radius-md)] p-4"
      style={{
        background: "var(--surface-card-dark)",
        color: "var(--muted-foreground)",
      }}
    >
      <p
        className="text-[16px] font-semibold"
        style={{ color: "var(--body-on-dark)" }}
      >
        {t("swap.sum.title")}
      </p>
      {summary.lines.map((l, i) => line(l, i, summary.display))}
    </div>
  );
}
