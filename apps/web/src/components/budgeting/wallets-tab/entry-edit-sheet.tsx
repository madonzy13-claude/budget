"use client";
/**
 * entry-edit-sheet.tsx — Edit a transaction (13.1 round 6, user): its note,
 * and its date between the entry before it and the one after it. 261108
 * (user): the amount and currency of money put in, while no later entry
 * relied on it — otherwise the amount shows locked, saying why. 261109
 * (user): opened from the row's dotted amount, in a side sheet laid out like
 * the asset's Edit — not a popup in the middle of the screen.
 */
import { useEffect, useState } from "react";
import { useTranslations, useLocale } from "next-intl";
import { Lock } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DateInput } from "@/components/budgeting/fields/date-input";
import { CurrencyPicker } from "@/components/common/currency-picker";
import type { EntryDto } from "@/hooks/use-asset-entries";
import type { EntryEditBody } from "@/hooks/use-edit-entry";
import { formatShortDate } from "@/lib/format-date";
import { ErrorLine, today } from "./swap-shared";
import { Field, NumericInput } from "./holding-sheet";
import { kindKey, ledgerDate } from "./ledger-row";

// 261109 (user): a value update offers its value and currency too.
const MONEY_IN = ["start", "buy", "add", "value_change"];
const bare = (c: string | null | undefined) =>
  c == null ? "" : String(Number(c) / 100);
const toCents = (v: string) =>
  String(Math.round(Number(v.replace(/\s/g, "").replace(/,/g, ".")) * 100));
/** What the entry said: the money put in, or the value an update set. */
const said = (e: EntryDto) =>
  e.kind === "value_change" ? (e.valueCents ?? null) : e.amountCents;
const caption = "text-caption text-[var(--muted-foreground)]";
const lock = (
  <Lock
    aria-hidden="true"
    className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2"
    style={{ color: "var(--muted-foreground)" }}
  />
);

export function EntryEditSheet({
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
    setAmount(bare(said(entry)));
    setCcy(entry.amountCurrency ?? "");
  }, [entry]);

  const editable = entry?.dateEditable !== false;
  const max = [entry?.dateMax, today()]
    .filter((d): d is string => !!d)
    .sort()[0];
  const min = entry?.dateMin ?? undefined;
  const outOfRange =
    date === "" || (!!min && date < min) || (!!max && date > max);
  const moneyIn =
    !!entry && MONEY_IN.includes(entry.kind) && said(entry) != null;
  const amountEditable = moneyIn && entry?.amountEditable === true;
  const badAmount = amountEditable && !(Number(toCents(amount)) > 0);
  const body: EntryEditBody = {
    ...(note.trim() !== (entry?.note ?? "") ? { note: note.trim() } : {}),
    ...(amountEditable && !badAmount && toCents(amount) !== (entry && said(entry))
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
  const canSave =
    !(editable && outOfRange) && !badAmount && Object.keys(body).length > 0;

  return (
    <Sheet open={!!entry} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        data-testid="entry-edit-sheet"
        className="!pointer-events-auto flex w-full flex-col overflow-y-auto bg-[var(--canvas-dark)] pb-8 sm:max-w-[480px]"
        // R6 (user): focusing the date on open pops a phone's calendar.
        onOpenAutoFocus={(ev) => {
          ev.preventDefault();
          (ev.currentTarget as HTMLElement).focus();
        }}
        onCloseAutoFocus={(ev) => ev.preventDefault()}
      >
        <SheetHeader className="mb-2">
          <SheetTitle
            className="break-words"
            style={{ color: "var(--body-on-dark)" }}
          >
            {t("ledger.edit.title")}
          </SheetTitle>
          {entry && (
            <p className={caption}>
              {ledgerDate(entry.effectiveDate, locale)} · {t(kindKey(entry))}
            </p>
          )}
        </SheetHeader>
        <div className="space-y-4 px-1">
          {moneyIn && (
            <Field label={t("ledger.edit.amount")}>
              <div className="relative">
                <NumericInput
                  testId="entry-edit-amount"
                  value={amount}
                  readOnly={!amountEditable}
                  onChange={setAmount}
                />
                {!amountEditable && lock}
              </div>
            </Field>
          )}
          {moneyIn &&
            (amountEditable ? (
              <div data-testid="entry-edit-currency">
                <Field label={t("ledger.edit.currency")}>
                  <CurrencyPicker
                    variant="field"
                    value={ccy}
                    onSelect={setCcy}
                    aria-label={t("ledger.edit.currency")}
                  />
                </Field>
              </div>
            ) : (
              <>
                <Field label={t("ledger.edit.currency")}>
                  <div className="relative">
                    <Input
                      value={entry?.amountCurrency ?? ""}
                      readOnly
                      aria-readonly="true"
                      tabIndex={-1}
                      className="pr-9"
                      style={{ color: "var(--muted-foreground)" }}
                    />
                    {lock}
                  </div>
                </Field>
                <p className={caption}>{t("ledger.edit.amountLocked")}</p>
              </>
            ))}
          <Field label={t("sell.date")}>
            <DateInput
              data-testid="entry-edit-date"
              value={date}
              min={min}
              max={max}
              disabled={!editable}
              onChange={setDate}
            />
          </Field>
          {!editable && <p className={caption}>{t("ledger.edit.dateLocked")}</p>}
          {editable && outOfRange && date !== "" && (
            <ErrorLine>
              {t("ledger.edit.range", { min: fmt(min), max: fmt(max) })}
            </ErrorLine>
          )}
          <Field label={t("swap.sell.note")}>
            <Input
              data-testid="entry-edit-note"
              value={note}
              maxLength={200}
              placeholder={t("swap.sell.notePlaceholder")}
              onChange={(e) => setNote(e.target.value)}
            />
          </Field>
          <div
            className="flex flex-col gap-2 border-t pt-4"
            style={{ borderColor: "var(--hairline-dark)" }}
          >
            <Button
              type="button"
              variant="primary"
              data-testid="entry-edit-save"
              disabled={!canSave}
              onClick={() => onSave(body)}
              className="h-auto min-h-11 w-full whitespace-normal break-words"
            >
              {t("sheet.save")}
            </Button>
            <Button
              type="button"
              variant="ghost"
              data-testid="entry-edit-cancel"
              onClick={() => onOpenChange(false)}
              className="h-auto min-h-11 w-full whitespace-normal break-words"
            >
              {t("sheet.cancel")}
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
