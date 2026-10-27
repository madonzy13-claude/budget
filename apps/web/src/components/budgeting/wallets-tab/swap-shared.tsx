"use client";
/**
 * swap-shared.tsx — pieces every Swap tab uses (13.1 UI-SPEC §2): the date
 * field with the latest-entry minimum (D-15), the stacked footer (sum-up card ·
 * primary · Discard) and small parsing helpers. Previews are display-only
 * Number math; the server books in BigInt.
 */
import { useTranslations } from "next-intl";
import { Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { HoldingDto } from "@/hooks/use-investments";
import type { SwapSummary } from "@/lib/swap-summary";
import { SwapSummaryCard } from "./swap-summary-card";

export const num = (s: string) =>
  Number(s.replace(/\s/g, "").replace(/,/g, "."));
export const toCents = (s: string) => Math.round(num(s) * 100);
export const today = () => new Date().toLocaleDateString("en-CA");
export const trimQty = (q: string) =>
  q.includes(".") ? q.replace(/0+$/, "").replace(/\.$/, "") : q;
/** Plain decimal string for the API (no exponent, ≤ 8 dp). */
export const qtyString = (n: number) => trimQty(n.toFixed(8));
/** WR-04: fall back to the budget currency, never a hardcoded one. */
export const ccyOf = (h: HoldingDto, budgetCurrency: string) =>
  h.currentPriceCurrency ?? h.buyCurrency ?? budgetCurrency;
export const signColor = (n: number) =>
  n > 0
    ? "var(--trading-up)"
    : n < 0
      ? "var(--trading-down)"
      : "var(--muted-strong)";

export const caption = "text-[12px] leading-[1.4]";
export const heading = "text-[16px] font-semibold leading-[1.4]";

export function ErrorLine({ children }: { children: React.ReactNode }) {
  return (
    <p
      role="alert"
      className={caption}
      style={{ color: "var(--trading-down)" }}
    >
      {children}
    </p>
  );
}

export function LockedField({
  label,
  value,
  testId,
}: {
  label: string;
  value: string;
  testId: string;
}) {
  return (
    <label className="block space-y-1">
      <span className="text-caption text-[var(--muted-foreground)]">
        {label}
      </span>
      <span className="relative block">
        <Input
          readOnly
          aria-readonly="true"
          data-testid={testId}
          value={value}
          className="pr-9"
          style={{
            background: "var(--surface-sunken-dark)",
            color: "var(--muted-foreground)",
          }}
        />
        <Lock
          className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2"
          style={{ color: "var(--muted-foreground)" }}
          aria-label={undefined}
          aria-hidden="true"
        />
      </span>
    </label>
  );
}

export function SwapDateField({
  value,
  onChange,
  min,
  error,
}: {
  value: string;
  onChange: (v: string) => void;
  min: string | null;
  error?: string | null;
}) {
  const t = useTranslations("budget.investments");
  return (
    <section className="space-y-1">
      <label className="block space-y-1">
        <span className="text-caption text-[var(--muted-foreground)]">
          {t("sell.date")}
        </span>
        <Input
          type="date"
          data-testid="swap-date"
          value={value}
          min={min ?? undefined}
          max={today()}
          onChange={(e) => onChange(e.target.value)}
        />
      </label>
      {min && (
        <p className={caption} style={{ color: "var(--muted-foreground)" }}>
          {t("swap.dateMin", { date: min })}
        </p>
      )}
      {value > today() && <ErrorLine>{t("swap.err.futureDate")}</ErrorLine>}
      {min && value < min && (
        <ErrorLine>{t("swap.err.beforeLatest", { date: min })}</ErrorLine>
      )}
      {error && <ErrorLine>{error}</ErrorLine>}
    </section>
  );
}

/** Date valid for a new entry: not future, not before the latest entry. */
export const dateOk = (d: string, min: string | null) =>
  !!d && d <= today() && (!min || d >= min);

export function SwapFooter({
  summary,
  label,
  disabled,
  pending,
  onSubmit,
  onDiscard,
}: {
  summary: SwapSummary;
  label: string;
  disabled: boolean;
  pending: boolean;
  onSubmit: () => void;
  onDiscard: () => void;
}) {
  const t = useTranslations("budget.investments");
  return (
    <div
      data-testid="swap-footer"
      className="sticky bottom-0 flex flex-col gap-2 border-t pt-4"
      style={{
        borderColor: "var(--hairline-dark)",
        background: "var(--canvas-dark)",
      }}
    >
      <SwapSummaryCard summary={summary} />
      <Button
        type="button"
        variant="primary"
        data-testid="swap-submit"
        disabled={disabled || pending}
        onClick={onSubmit}
        className="h-auto min-h-11 w-full whitespace-normal break-words"
      >
        {pending ? t("swap.saving") : label}
      </Button>
      <Button
        type="button"
        variant="ghost"
        onClick={onDiscard}
        className="h-auto min-h-11 w-full whitespace-normal break-words"
      >
        {t("swap.discard")}
      </Button>
    </div>
  );
}
