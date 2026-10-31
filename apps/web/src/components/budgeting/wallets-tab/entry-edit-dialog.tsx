"use client";
/**
 * entry-edit-dialog.tsx — Edit a transaction (13.1 round 6, user): its note,
 * and its date between the entry before it and the one after it. Amounts are
 * not editable here — delete and re-add for that.
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
import type { EntryDto } from "@/hooks/use-asset-entries";
import { formatShortDate } from "@/lib/format-date";
import { ErrorLine, today } from "./swap-shared";

export function EntryEditDialog({
  entry,
  onOpenChange,
  onSave,
}: {
  entry: EntryDto | null;
  onOpenChange: (open: boolean) => void;
  onSave: (body: { note?: string; effectiveDate?: string }) => void;
}) {
  const t = useTranslations("budget.investments");
  const locale = useLocale();
  const [date, setDate] = useState("");
  const [note, setNote] = useState("");
  useEffect(() => {
    if (!entry) return;
    setDate(entry.effectiveDate);
    setNote(entry.note ?? "");
  }, [entry]);

  const editable = entry?.dateEditable !== false;
  const max = [entry?.dateMax, today()]
    .filter((d): d is string => !!d)
    .sort()[0];
  const min = entry?.dateMin ?? undefined;
  const outOfRange =
    date === "" || (!!min && date < min) || (!!max && date > max);
  const body = {
    ...(note.trim() !== (entry?.note ?? "") ? { note: note.trim() } : {}),
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
              (editable && outOfRange) || Object.keys(body).length === 0
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
