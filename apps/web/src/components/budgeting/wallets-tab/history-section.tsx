"use client";
/**
 * history-section.tsx — a holding's History inside the edit sheet (D-05).
 *
 * Collapsed by default ("History (n)"), newest first. Entries are read-only;
 * a mistake is deleted and re-entered (D-06). Delete = FULL undo: the holding
 * goes back to before the entry, a conversion's other side loses what it
 * received, realized + contributions recompute — the confirm says exactly that.
 */
import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Trash2 } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { centsToBare } from "@/lib/cents-format";
import {
  useDeleteHistoryEntry,
  useHoldingHistory,
  type HistoryEntryDto,
} from "@/hooks/use-holding-history";

const OUTFLOW = new Set(["withdraw", "convert_out"]);

const signColor = (n: number) =>
  n > 0
    ? "var(--trading-up)"
    : n < 0
      ? "var(--trading-down)"
      : "var(--muted-strong)";

export function HistorySection({
  budgetId,
  holdingId,
}: {
  budgetId: string;
  holdingId: string;
}) {
  const t = useTranslations("budget.investments");
  const locale = useLocale();
  const { data: entries = [] } = useHoldingHistory(budgetId, holdingId);
  const del = useDeleteHistoryEntry(budgetId);
  const [pending, setPending] = useState<HistoryEntryDto | null>(null);

  // Day, month AND year in ONE Intl call (genitive month in pl/uk).
  const fmtDate = (iso: string) => {
    const [y, m, d] = iso.split("-").map(Number);
    return new Intl.DateTimeFormat(locale, {
      day: "numeric",
      month: "short",
      year: "numeric",
      timeZone: "UTC",
    }).format(new Date(Date.UTC(y!, m! - 1, d!)));
  };
  const money = (c: string) => centsToBare(c.replace("-", ""), locale);
  const signed = (c: string) => {
    const n = Number(c);
    return `${n > 0 ? "+" : n < 0 ? "−" : ""}${money(c)}`;
  };

  return (
    <details
      data-testid="history-section"
      className="rounded-[var(--radius-md)]"
      style={{ background: "var(--surface-card-dark)" }}
    >
      <summary
        className="flex min-h-11 cursor-pointer items-center px-4 text-[16px] font-semibold"
        style={{ color: "var(--body-on-dark)" }}
      >
        {t("history.title", { count: entries.length })}
      </summary>

      {entries.length === 0 ? (
        <div className="space-y-1 px-4 pb-4">
          <p className="text-[14px]" style={{ color: "var(--body-on-dark)" }}>
            {t("history.emptyTitle")}
          </p>
          <p
            className="text-[12px] leading-[1.4]"
            style={{ color: "var(--muted-foreground)" }}
          >
            {t("history.emptyBody")}
          </p>
        </div>
      ) : (
        <ul>
          {entries.map((e) => (
            <li
              key={e.id}
              data-history-kind={e.kind}
              className="flex min-h-14 items-center gap-2 border-t px-4 py-2"
              style={{ borderColor: "var(--hairline-dark)" }}
            >
              <div className="min-w-0 flex-1">
                <p
                  className="flex flex-wrap items-baseline gap-x-2 text-[14px] font-semibold"
                  style={{ color: "var(--body-on-dark)" }}
                >
                  {t(`history.${e.kind}`)}
                  {e.kind === "start" && (
                    <span
                      className="text-[12px] font-normal"
                      style={{ color: "var(--muted-foreground)" }}
                    >
                      {t("history.automatic")}
                    </span>
                  )}
                  {e.counterpartyName && (
                    <span
                      className="min-w-0 break-words text-[12px] font-normal"
                      style={{ color: "var(--muted-foreground)" }}
                    >
                      {t(
                        e.kind === "convert_in"
                          ? "history.fromHolding"
                          : "history.toHolding",
                        { name: e.counterpartyName },
                      )}
                    </span>
                  )}
                </p>
                <p
                  className="text-[12px] leading-[1.4]"
                  style={{ color: "var(--muted-foreground)" }}
                >
                  {fmtDate(e.effectiveDate)}
                </p>
                {e.realizedBudgetCents && (
                  <p
                    data-testid={`history-realized-${e.id}`}
                    className="num text-[12px] leading-[1.4]"
                    style={{ color: signColor(Number(e.realizedBudgetCents)) }}
                  >
                    {t("history.realizedNote", {
                      amount: signed(e.realizedBudgetCents),
                    })}
                  </p>
                )}
              </div>
              {e.amountCents && (
                <span
                  className="num shrink-0 text-right text-[14px] tabular-nums"
                  style={{ color: "var(--body-on-dark)" }}
                >
                  {e.kind === "value_change"
                    ? money(e.amountCents)
                    : `${OUTFLOW.has(e.kind) ? "−" : "+"}${money(e.amountCents)}`}{" "}
                  {e.amountCurrency}
                </span>
              )}
              <button
                type="button"
                data-testid={`history-delete-${e.id}`}
                aria-label={t("history.deleteAria", {
                  kind: t(`history.${e.kind}`),
                  date: fmtDate(e.effectiveDate),
                })}
                onClick={() => setPending(e)}
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded"
                style={{ color: "var(--trading-down)" }}
              >
                <Trash2 className="h-4 w-4" aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <AlertDialog
        open={pending !== null}
        onOpenChange={(o) => !o && setPending(null)}
      >
        <AlertDialogContent>
          {pending && (
            <>
              <AlertDialogHeader>
                <AlertDialogTitle>
                  {pending.transferId
                    ? t("history.deleteConvTitle")
                    : t("history.deleteTitle")}
                </AlertDialogTitle>
                <AlertDialogDescription>
                  {pending.transferId
                    ? t("history.deleteConvBody", {
                        other: pending.counterpartyName ?? "",
                      })
                    : t("history.deleteBody", {
                        kind: t(`history.${pending.kind}`),
                        date: fmtDate(pending.effectiveDate),
                      })}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>
                  {pending.transferId
                    ? t("history.deleteConvKeep")
                    : t("history.deleteKeep")}
                </AlertDialogCancel>
                <AlertDialogAction
                  data-testid="history-delete-confirm"
                  className="bg-[var(--destructive)] text-[var(--on-primary)]"
                  onClick={() => {
                    del.mutate(pending.id);
                    setPending(null);
                  }}
                >
                  {pending.transferId
                    ? t("history.deleteConvConfirm")
                    : t("history.deleteConfirm")}
                </AlertDialogAction>
              </AlertDialogFooter>
            </>
          )}
        </AlertDialogContent>
      </AlertDialog>
    </details>
  );
}
