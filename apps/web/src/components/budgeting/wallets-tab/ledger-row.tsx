"use client";
/**
 * ledger-row.tsx — one L3 ledger line (13.1 D-13).
 *
 * Left: date · kind (+ the other asset for linked legs). Right: ±qty @ price
 * for quantity entries, then the signed amount in the asset's display
 * currency; sales add "realized ±X". No per-entry live P/L. The row is not
 * draggable and not a dnd-kit target — the ledger is a fixed, dated record.
 */
import { useLocale, useTranslations } from "next-intl";
import { Link2, Trash2 } from "lucide-react";
import { centsToBare } from "@/lib/cents-format";
import type { EntryDto } from "@/hooks/use-asset-entries";

/** budget.investments key for an entry kind (UI-SPEC §6). */
export function kindKey(e: EntryDto): string {
  switch (e.kind) {
    case "start":
      return e.qtyDelta != null ? "ledger.kind.bought" : "ledger.kind.added";
    case "buy":
      return "ledger.kind.bought";
    case "add":
      return "ledger.kind.added";
    case "withdraw":
      return "ledger.kind.sold";
    case "convert_out":
      return "ledger.kind.convertedOut";
    case "convert_in":
      return "ledger.kind.convertedIn";
    case "transfer_out":
      return "ledger.kind.transferOut";
    case "transfer_in":
      return "ledger.kind.transferIn";
    case "value_change":
      return "ledger.kind.valueUpdated";
    case "price_change":
      return "ledger.kind.priceUpdated";
    case "interest":
      return "ledger.kind.interest";
  }
}

const MINUS = "−";
const signColor = (n: number) =>
  n > 0
    ? "var(--trading-up)"
    : n < 0
      ? "var(--trading-down)"
      : "var(--muted-strong)";
const trimQty = (q: string) =>
  q.includes(".") ? q.replace(/0+$/, "").replace(/\.$/, "") : q;

/** "12 Oct" in ONE Intl call so uk/pl get the genitive month. */
export function ledgerDate(iso: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  }).format(new Date(`${iso}T00:00:00Z`));
}

interface LedgerRowProps {
  entry: EntryDto;
  rowKey: string;
  first: boolean;
  revealed: boolean;
  onTap: () => void;
  onDelete: () => void;
}

export function LedgerRow({
  entry,
  rowKey,
  first,
  revealed,
  onTap,
  onDelete,
}: LedgerRowProps) {
  const t = useTranslations("budget.investments");
  const locale = useLocale();
  const signed = (cents: string) => {
    const n = Number(cents);
    const abs = centsToBare(cents.replace(/^-/, ""), locale);
    return `${n > 0 ? "+" : n < 0 ? MINUS : ""}${abs}`;
  };
  const date = ledgerDate(entry.effectiveDate, locale);
  const kind = t(kindKey(entry));
  const interest = entry.kind === "interest";
  const linkedOut = ["convert_out", "transfer_out"].includes(entry.kind);
  const amount = entry.displayAmountCents ?? entry.amountCents;
  const ccy = entry.displayCurrency ?? entry.amountCurrency ?? "";
  const qty = entry.qtyDelta;
  const helper =
    revealed && !entry.deletable && !interest
      ? entry.blockedReason === "linked_not_newest"
        ? t("ledger.removeLaterIn", { name: entry.counterpartyName ?? "" })
        : t("ledger.onlyLatest")
      : null;

  return (
    <div
      role="row"
      tabIndex={-1}
      data-ledger-row
      data-testid={`ledger-row-${rowKey}`}
      onClick={onTap}
      style={{
        boxShadow: first ? "inset 0 6px 8px -6px rgba(0,0,0,0.7)" : undefined,
        borderTop: first ? undefined : "1px solid var(--hairline-dark)",
      }}
      className={[
        "flex items-center gap-2 px-2 py-1",
        entry.deletable ? "min-h-[44px]" : "min-h-[40px]",
      ].join(" ")}
    >
      <div className="flex min-w-0 flex-1 flex-col text-[12px] leading-[1.4]">
        <span className="min-w-0 break-words">
          {date} · {kind}
        </span>
        {interest ? (
          <span>{t("ledger.auto")}</span>
        ) : entry.linked && entry.counterpartyName ? (
          <span className="flex min-w-0 items-center gap-1">
            <Link2 className="h-3 w-3 shrink-0" aria-hidden="true" />
            <span className="truncate">
              {t(linkedOut ? "ledger.toAsset" : "ledger.fromAsset", {
                name: entry.counterpartyName,
              })}
            </span>
          </span>
        ) : null}
        {helper && (
          <span data-testid={`ledger-helper-${rowKey}`}>{helper}</span>
        )}
      </div>
      <div className="num flex shrink-0 flex-col items-end text-right tabular-nums">
        {qty != null && (
          <span className="text-[12px] leading-[1.4]">
            {`${Number(qty) > 0 ? "+" : Number(qty) < 0 ? MINUS : ""}${trimQty(qty.replace(/^-/, ""))}`}
            {entry.priceCents != null &&
              ` @ ${centsToBare(entry.priceCents, locale)}`}
          </span>
        )}
        {amount != null && (
          <span
            className="text-[14px] leading-[1.4]"
            style={{
              color: interest
                ? "var(--muted-foreground)"
                : "var(--body-on-dark)",
            }}
          >
            {signed(amount)} {ccy}
          </span>
        )}
        {entry.realizedBudgetCents != null && (
          <span
            className="text-[12px] leading-[1.4]"
            style={{ color: signColor(Number(entry.realizedBudgetCents)) }}
          >
            {t("ledger.realized", {
              amount: signed(entry.realizedBudgetCents),
            })}
          </span>
        )}
      </div>
      {entry.deletable && revealed && (
        <button
          type="button"
          data-testid={`ledger-delete-${rowKey}`}
          aria-label={t("ledger.deleteAria", { kind, date })}
          onClick={(ev) => {
            ev.stopPropagation();
            onDelete();
          }}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded"
          style={{ color: "var(--destructive)" }}
        >
          <Trash2 className="h-4 w-4" aria-hidden="true" />
        </button>
      )}
    </div>
  );
}
