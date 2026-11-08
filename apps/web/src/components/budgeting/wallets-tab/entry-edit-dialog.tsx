"use client";
/**
 * entry-edit-dialog.tsx — Edit a transaction (13.1 round 6, user): its note,
 * and its date between the entry before it and the one after it. 261108
 * (user): the amount and currency of money put in, while no later entry
 * relied on it — otherwise the amount shows locked, saying why.
 */
import { useEffect, useState } from "react";
import { useTranslations, useLocale } from "next-intl";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DateInput } from "@/components/budgeting/fields/date-input";
import { CurrencyPicker } from "@/components/common/currency-picker";
import type { EntryDto } from "@/hooks/use-asset-entries";
import type { EntryEditBody } from "@/hooks/use-edit-entry";
import { formatShortDate } from "@/lib/format-date";
import { ErrorLine, today } from "./swap-shared";
import { NumericInput } from "./holding-sheet";

const MONEY_IN = ["start", "buy", "add"];
const bare = (c: string | null | undefined) =>
  c == null ? "" : String(Number(c) / 100);
const toCents = (v: string) =>
  String(Math.round(Number(v.replace(/\s/g, "").replace(/,/g, ".")) * 100));

export function EntryEditDialog({
  entry,
  onOpenChange,
  onSave,
}: {
  entry: EntryDto | null;
  onOpenChange: (open: boolean) => void;
  onSave: (body: EntryEditBody) => void;
}) {
  const t = useTranslations("budget.investments");
  const locale = useLocale();
  const [date, setDate] = useState("");
  const [note, setNote] = useState("");
  const [amount, setAmount] = useState("");
  const [ccy, setCcy] = useState("");
  useEffect(() => {
    if (!entry) return;
    setDate(entry.effectiveDate);
    setNote(entry.note ?? "");
    setAmount(bare(entry.amountCents));
    setCcy(entry.amountCurrency ?? "");
  }, [entry]);

  const editable = entry?.dateEditable !== false;
  const max = [entry?.dateMax, today()]
    .filter((d): d is string => !!d)
    .sort()[0];
  const min = entry?.dateMin ?? undefined;
  const outOfRange =
    date === "" || (!!min && date < min) || (!!max && date > max);
  const moneyIn = !!entry && MONEY_IN.includes(entry.kind) && entry.amountCents != null;
  const amountEditable = moneyIn && entry?.amountEditable === true;
  const badAmount = amountEditable && !(Number(toCents(amount)) > 0);
  const body: EntryEditBody = {
    ...(note.trim() !== (entry?.note ?? "") ? { note: note.trim() } : {}),
    ...(amountEditable && !badAmount && toCents(amount) !== entry?.amountCents
      ? { amountCents: toCents(amount) }
      : {}),
    ...(amountEditable && ccy !== (entry?.amountCurrency ?? "")
      ? { currency: ccy }
      : {}),
    ...(editable && date !== entry?.effectiveDate
      ? { effectiveDate: date }
      : {}),
  };
  const fmt = (d: string | undefined) => (d ? formatShortDate(d, locale) : "…");

  return (
    <Dialog open={!!entry} onOpenChange={onOpenChange}>
      <DialogContent
        data-testid="entry-edit-dialog"
        // R6 (user): focusing the date on open pops a phone's calendar.
        onOpenAutoFocus={(ev) => {
          ev.preventDefault();
          (ev.currentTarget as HTMLElement).focus();
        }}
      >
        <DialogHeader>
          <DialogTitle>{t("ledger.edit.title")}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          {moneyIn && (
            <div className="space-y-1">
              <span className="text-caption text-[var(--muted-foreground)]">
                {t("ledger.edit.amount")}
              </span>
              <div className="flex gap-2">
                <div className="min-w-0 flex-1">
                  <NumericInput
                    testId="entry-edit-amount"
                    value={amount}
                    readOnly={!amountEditable}
                    onChange={setAmount}
                  />
                </div>
                {amountEditable ? (
                  <div data-testid="entry-edit-currency" className="w-28 shrink-0">
                    <CurrencyPicker
                      variant="field"
                      value={ccy}
                      onSelect={setCcy}
                      aria-label={t("ledger.edit.currency")}
                    />
                  </div>
                ) : (
                  <span className="self-center text-[var(--muted-foreground)]">
                    {entry?.amountCurrency}
                  </span>
                )}
              </div>
              {!amountEditable && (
                <p className="text-caption text-[var(--muted-foreground)]">
                  {t("ledger.edit.amountLocked")}
                </p>
              )}
            </div>
          )}
          <label className="block space-y-1">
            <span className="text-caption text-[var(--muted-foreground)]">
              {t("sell.date")}
            </span>
            <DateInput
              data-testid="entry-edit-date"
              value={date}
              min={min}
              max={max}
              disabled={!editable}
              onChange={setDate}
            />
          </label>
          {!editable && (
            <p className="text-caption text-[var(--muted-foreground)]">
              {t("ledger.edit.dateLocked")}
            </p>
          )}
          {editable && outOfRange && date !== "" && (
            <ErrorLine>
              {t("ledger.edit.range", { min: fmt(min), max: fmt(max) })}
            </ErrorLine>
          )}
          <label className="block space-y-1">
            <span className="text-caption text-[var(--muted-foreground)]">
              {t("swap.sell.note")}
            </span>
            <Input
              data-testid="entry-edit-note"
              value={note}
              maxLength={200}
              placeholder={t("swap.sell.notePlaceholder")}
              onChange={(e) => setNote(e.target.value)}
            />
          </label>
        </div>
        <DialogFooter className="gap-2">
          <Button
            type="button"
            variant="ghost"
            data-testid="entry-edit-cancel"
            onClick={() => onOpenChange(false)}
          >
            {t("sheet.cancel")}
          </Button>
          <Button
            type="button"
            variant="primary"
            data-testid="entry-edit-save"
            disabled={
              (editable && outOfRange) ||
              badAmount ||
              Object.keys(body).length === 0
            }
            onClick={() => onSave(body)}
          >
            {t("sheet.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
