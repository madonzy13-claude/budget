"use client";
/**
 * swap-shared.tsx — pieces every Swap tab uses (13.1 UI-SPEC §2): the date
 * field with the latest-entry minimum (D-15), the stacked footer (sum-up card ·
 * primary · Discard) and small parsing helpers. Previews are display-only
 * Number math; the server books in BigInt.
 */
import { useLocale, useTranslations } from "next-intl";
import { Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DateInput } from "@/components/budgeting/fields/date-input";
import { Input } from "@/components/ui/input";
import type { HoldingDto } from "@/hooks/use-investments";
import { useMinEntryDate } from "@/hooks/use-asset-entries";
import { instrumentLabel } from "@/lib/instrument-label";
import type { SwapSummary } from "@/lib/swap-summary";
import { formatShortDate } from "@/lib/format-date";
import { SwapSummaryCard } from "./swap-summary-card";

export const num = (s: string) =>
  Number(s.replace(/\s/g, "").replace(/,/g, "."));
export const toCents = (s: string) => Math.round(num(s) * 100);
export const today = () => new Date().toLocaleDateString("en-CA");
export const trimQty = (q: string) =>
  q.includes(".") ? q.replace(/0+$/, "").replace(/\.$/, "") : q;
/** R5-5: a held quantity with its unit — "1 BTC", "3 унції", or bare. */
export const heldQty = (
  t: (k: string, v: Record<string, string | number>) => string,
  h: Pick<
    HoldingDto,
    | "quantity"
    | "symbol"
    | "unitOfMeasure"
    | "instrumentName"
    | "name"
    | "holdingType"
  >,
) => {
  const qty = trimQty(h.quantity);
  if (h.unitOfMeasure)
    return t(`heldUnit.${h.unitOfMeasure}`, { qty, n: Number(h.quantity) });
  const { ticker } = instrumentLabel({
    symbol: h.symbol,
    name: h.instrumentName ?? h.name,
    holdingType: h.holdingType,
  });
  return ticker ? `${qty} ${ticker}` : qty;
};
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

/** The held amount under a Sell / Transfer field — tap it to fill the field
 *  with everything (round 3; replaces the "everything" toggles). 44px hit
 *  area, caption-sized text. */
export function HeldButton({
  testId,
  onClick,
  children,
}: {
  testId: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      data-testid={testId}
      onClick={onClick}
      className={`${caption} -my-3 flex min-h-11 items-center text-left underline decoration-dotted underline-offset-2`}
      style={{ color: "var(--muted-foreground)" }}
    >
      {children}
    </button>
  );
}

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
  const locale = useLocale();
  return (
    <section className="space-y-1">
      <label className="block space-y-1">
        <span className="text-caption text-[var(--muted-foreground)]">
          {t("sell.date")}
        </span>
        {/* R5-10: shows the date in the app's locale, not the browser's. */}
        <DateInput
          data-testid="swap-date"
          value={value}
          min={min ?? undefined}
          max={today()}
          onChange={onChange}
        />
      </label>
      {min && (
        <p className={caption} style={{ color: "var(--muted-foreground)" }}>
          {t("swap.dateMin", { date: formatShortDate(min, locale) })}
        </p>
      )}
      {value > today() && <ErrorLine>{t("swap.err.futureDate")}</ErrorLine>}
      {min && value < min && (
        <ErrorLine>
          {t("swap.err.beforeLatest", { date: formatShortDate(min, locale) })}
        </ErrorLine>
      )}
      {error && <ErrorLine>{error}</ErrorLine>}
    </section>
  );
}

/** R6 (user): the ledger only appends — the OTHER asset a booking touches
 *  (destination, transfer target, money source) bounds the date too; the
 *  server refuses before its newest entry. `min` merges both bounds; `error`
 *  names that asset; `beforeMsg` is the before_latest_entry text. */
export function useOtherAssetDate(
  budgetId: string,
  minDate: string | null,
  other: { id: string; name: string } | null | undefined,
  date: string,
) {
  const t = useTranslations("budget.investments");
  const otherMin = useMinEntryDate(budgetId, other?.id ?? "", !!other);
  const binds = !!other && !!otherMin && (!minDate || otherMin > minDate);
  const beforeMsg = binds
    ? t("swap.err.beforeDest", { date: otherMin!, name: other!.name })
    : t("swap.err.beforeLatest", { date: minDate ?? "" });
  return {
    min: binds ? otherMin : minDate,
    error: binds && date !== "" && date < otherMin! ? beforeMsg : null,
    beforeMsg,
  };
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
      className="flex flex-col gap-2 border-t pt-4"
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

/** Radio cards (Sell destination, Buy source, wallet kind). */
export function RadioCards<K extends string>({
  value,
  options,
  onChange,
  label,
  testPrefix,
  center,
}: {
  value: K | null;
  options: { k: K; title: string; desc?: string }[];
  onChange: (k: K) => void;
  label: string;
  testPrefix: string;
  /** Title-only cards: centre the label (13.1 UAT 9). */
  center?: boolean;
}) {
  const keys = options.map((o) => o.k);
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className="space-y-2"
      onKeyDown={(e) => {
        const i = value ? keys.indexOf(value) : -1;
        if (e.key === "ArrowDown" || e.key === "ArrowRight")
          onChange(keys[(i + 1) % keys.length]!);
        else if (e.key === "ArrowUp" || e.key === "ArrowLeft")
          onChange(keys[(i + keys.length - 1) % keys.length]!);
        else return;
        e.preventDefault();
      }}
    >
      {options.map((o) => (
        <button
          key={o.k}
          type="button"
          role="radio"
          aria-checked={value === o.k}
          tabIndex={value === o.k || (!value && o.k === keys[0]) ? 0 : -1}
          data-testid={`${testPrefix}${o.k}`}
          onClick={() => onChange(o.k)}
          className={[
            "flex min-h-11 w-full flex-col rounded-[var(--radius-md)] border px-4 py-2",
            center
              ? "items-center justify-center text-center"
              : "items-start text-left",
          ].join(" ")}
          style={{
            background: "var(--surface-card-dark)",
            borderColor:
              value === o.k ? "var(--primary)" : "var(--hairline-dark)",
          }}
        >
          <span
            className="text-[14px] font-semibold"
            style={{ color: "var(--body-on-dark)" }}
          >
            {o.title}
          </span>
          {o.desc && (
            <span
              className={caption}
              style={{ color: "var(--muted-foreground)" }}
            >
              {o.desc}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}
