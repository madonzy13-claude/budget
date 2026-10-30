"use client";
/**
 * ledger-row.tsx — one L3 ledger line (13.1 D-13).
 *
 * Left: date · kind (+ the other asset for linked legs). Right: ±qty @ price
 * for quantity entries, then the signed amount in the asset's display
 * currency (convert legs: the stored amount + currency, 13.1 UAT 14); sales
 * add "realized ±X". No per-entry live P/L. Not draggable — the ledger is a
 * fixed, dated record.
 *
 * Delete (13.1 UAT 12): swipe left like every other row (useSwipeReveal);
 * desktop shows the button at the row end. Red when this entry can go; grey
 * (aria-disabled, still tappable) otherwise — tapping it explains why.
 */
import { useRef } from "react";
import { useLocale, useTranslations } from "next-intl";
import {
  ArrowDownLeft,
  ArrowUpRight,
  Link2,
  Percent,
  Trash2,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useSwipeReveal } from "@/hooks/use-swipe-reveal";
import { centsToShort } from "@/lib/cents-format";
import { stripYearMark } from "@/lib/format-date";
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

/** Round 4: money into the asset (green) or out of it (red), at a glance.
 *  Interest is a percent, value / price updates a trend, the rest in / out
 *  arrows; the colour follows the sign of the row's amount. */
function DirectionIcon({ entry }: { entry: EntryDto }) {
  const n = Number(entry.displayAmountCents ?? entry.amountCents ?? 0);
  const dir = n > 0 ? "in" : n < 0 ? "out" : "flat";
  const color =
    dir === "in"
      ? "var(--trading-up)"
      : dir === "out"
        ? "var(--trading-down)"
        : "var(--muted-strong)";
  const Icon =
    entry.kind === "interest"
      ? Percent
      : entry.kind === "value_change" || entry.kind === "price_change"
        ? dir === "out"
          ? TrendingDown
          : TrendingUp
        : dir === "out"
          ? ArrowUpRight
          : ArrowDownLeft;
  return (
    <span
      data-ledger-icon
      data-direction={dir}
      aria-hidden="true"
      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full"
      style={{
        color,
        backgroundColor: `color-mix(in srgb, ${color} 16%, transparent)`,
      }}
    >
      <Icon className="h-3.5 w-3.5" />
    </span>
  );
}

/** "12 Oct 2026" in ONE Intl call so uk/pl get the genitive month. */
export function ledgerDate(iso: string, locale: string): string {
  return stripYearMark(
    new Intl.DateTimeFormat(locale, {
      day: "numeric",
      month: "short",
      year: "numeric",
      timeZone: "UTC",
    }).format(new Date(`${iso}T00:00:00Z`)),
  );
}

interface LedgerRowProps {
  entry: EntryDto;
  rowKey: string;
  first: boolean;
  onDelete: () => void;
  /** Round 4: open the partner entry in the other asset (visible partner only). */
  onOpenLinked?: () => void;
  /** Briefly highlighted after a jump from its partner. */
  flash?: boolean;
}

const ACTION_W = 56;

export function LedgerRow({
  entry,
  rowKey,
  first,
  onDelete,
  onOpenLinked,
  flash,
}: LedgerRowProps) {
  const t = useTranslations("budget.investments");
  const locale = useLocale();
  const signed = (cents: string) => {
    const n = Number(cents);
    const abs = centsToShort(cents.replace(/^-/, ""), locale);
    return `${n > 0 ? "+" : n < 0 ? MINUS : ""}${abs}`;
  };
  const date = ledgerDate(entry.effectiveDate, locale);
  const kind = t(kindKey(entry));
  const interest = entry.kind === "interest";
  const linkedOut = ["convert_out", "transfer_out"].includes(entry.kind);
  // A conversion keeps what was really paid/received (690 EUR), not its
  // re-conversion into the asset's currency.
  const stored =
    ["convert_in", "convert_out"].includes(entry.kind) &&
    entry.amountCents != null;
  // R5-13: paid / received in another currency → show that first, then
  // what it became in the asset's currency.
  const foreign =
    entry.amountCents != null &&
    entry.displayAmountCents != null &&
    !!entry.amountCurrency &&
    !!entry.displayCurrency &&
    entry.amountCurrency !== entry.displayCurrency;
  const amount = stored
    ? `${linkedOut ? "-" : ""}${entry.amountCents!.replace(/^-/, "")}`
    : foreign
      ? entry.amountCents
      : (entry.displayAmountCents ?? entry.amountCents);
  const ccy =
    stored || foreign
      ? (entry.amountCurrency ?? "")
      : (entry.displayCurrency ?? entry.amountCurrency ?? "");
  // The server signs it (money out is negative) — keep that sign.
  const converted = foreign ? entry.displayAmountCents : null;
  const qty = entry.displayQty ?? entry.qtyDelta;
  const reason = entry.deletable
    ? null
    : interest
      ? t("ledger.kind.interest")
      : entry.blockedReason === "linked_not_newest"
        ? t("ledger.removeLaterIn", { name: entry.counterpartyName ?? "" })
        : t("ledger.onlyLatest");

  const rowRef = useRef<HTMLDivElement>(null);
  const { offset, swiping, close } = useSwipeReveal(rowRef, ACTION_W);
  const swipedOpen = offset <= -ACTION_W / 2;
  const deleteButton = (
    <button
      type="button"
      data-no-swipe
      data-open={swipedOpen}
      data-testid={`ledger-delete-${rowKey}`}
      aria-label={t("ledger.deleteAria", { kind, date })}
      aria-disabled={entry.deletable ? undefined : true}
      style={{ boxShadow: "inset 6px 0 8px -6px rgba(0,0,0,0.7)" }}
      onClick={(ev) => {
        ev.stopPropagation();
        if (!entry.deletable) return;
        close();
        onDelete();
      }}
      className={[
        "absolute bottom-0 right-0 top-0 flex w-12 items-center justify-center",
        // Round 3: square, shadowed on its left as if under the sliding row.
        "text-white transition-opacity",
        "pointer-events-none opacity-0 data-[open=true]:pointer-events-auto data-[open=true]:opacity-100",
        "sm:pointer-events-auto sm:opacity-100",
        entry.deletable
          ? "bg-[var(--destructive)]"
          : "bg-[var(--surface-elevated-dark)] text-[var(--muted-foreground)]",
      ].join(" ")}
    >
      <Trash2 className="h-4 w-4" aria-hidden="true" />
    </button>
  );

  return (
    <div
      ref={rowRef}
      role="row"
      tabIndex={-1}
      data-ledger-row
      data-testid={`ledger-row-${rowKey}`}
      data-transfer-id={entry.transferId ?? undefined}
      data-flash={flash || undefined}
      style={{
        borderTop: first ? undefined : "1px solid var(--hairline-dark)",
      }}
      className="relative"
    >
      {reason ? (
        <Popover>
          <PopoverTrigger asChild>{deleteButton}</PopoverTrigger>
          <PopoverContent
            side="left"
            className="w-auto max-w-[240px] p-3 text-[12px]"
          >
            {reason}
          </PopoverContent>
        </Popover>
      ) : (
        deleteButton
      )}
      {/* Shadow on the element that paints the background: an inset shadow
          is drawn under the element's own children (round-2 gap 4). */}
      <div
        data-ledger-surface
        style={{
          // Round 4: a jumped-to row lights up briefly.
          backgroundColor: flash
            ? "var(--surface-elevated-dark)"
            : "var(--surface-ledger-dark)",
          boxShadow: first ? "inset 0 6px 8px -6px rgba(0,0,0,0.7)" : undefined,
          transform: `translateX(${offset}px)`,
          transition: swiping ? "none" : "transform 200ms ease-out",
        }}
        className={[
          "relative flex items-center gap-2 px-2 py-1 sm:mr-12",
          entry.deletable ? "min-h-[44px]" : "min-h-[40px]",
        ].join(" ")}
      >
        <DirectionIcon entry={entry} />
        <div className="flex min-w-0 flex-1 flex-col text-[12px] leading-[1.4]">
          <span className="min-w-0 break-words">
            {date} · {kind}
          </span>
          {entry.linked && entry.counterpartyName
            ? (() => {
                const content = (
                  <>
                    <Link2
                      className="h-2.5 w-2.5 shrink-0"
                      aria-hidden="true"
                    />
                    <span
                      className="truncate"
                      style={{ fontSize: "11px", lineHeight: 1.4 }}
                    >
                      {t(linkedOut ? "ledger.toAsset" : "ledger.fromAsset", {
                        name: entry.counterpartyName,
                      })}
                    </span>
                  </>
                );
                // Round 4: a visible partner is one tap away.
                return onOpenLinked ? (
                  <button
                    type="button"
                    data-no-swipe
                    data-testid={`ledger-link-${rowKey}`}
                    aria-label={t("ledger.openLinked", {
                      name: entry.counterpartyName,
                    })}
                    onClick={(ev) => {
                      ev.stopPropagation();
                      onOpenLinked();
                    }}
                    className="flex min-w-0 items-center gap-1 self-start text-left underline decoration-dotted underline-offset-2"
                  >
                    {content}
                  </button>
                ) : (
                  <span className="flex min-w-0 items-center gap-1">
                    {content}
                  </span>
                );
              })()
            : null}
        </div>
        <div className="num flex shrink-0 flex-col items-end text-right tabular-nums">
          {qty != null && (
            <span style={{ fontSize: "11px", lineHeight: 1.4 }}>
              {`${Number(qty) > 0 ? "+" : Number(qty) < 0 ? MINUS : ""}${trimQty(qty.replace(/^-/, ""))}`}
              {entry.priceCents != null &&
                ` × ${centsToShort(entry.priceCents, locale)}`}
            </span>
          )}
          {amount != null && (
            <span
              className="text-[14px] leading-[1.4]"
              style={{ color: "var(--muted-foreground)" }}
            >
              {signed(amount)} {ccy}
            </span>
          )}
          {converted != null && (
            <span
              data-converted
              className="text-[11px] leading-[1.4]"
              style={{ color: "var(--muted-foreground)" }}
            >
              {`= ${signed(converted)} ${entry.displayCurrency}`}
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
      </div>
      {/* Round 3: a swiped row slides under the strip's left edge — shade it so
          the cut reads as hidden, not broken. */}
      <span
        aria-hidden="true"
        data-ledger-swipe-shade
        className="pointer-events-none absolute inset-y-0 left-0 w-3 transition-opacity"
        style={{
          opacity: offset < 0 ? 1 : 0,
          background:
            "linear-gradient(to right, rgba(0,0,0,0.55), transparent)",
        }}
      />
    </div>
  );
}
