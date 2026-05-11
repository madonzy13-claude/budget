"use client";

/**
 * transaction-row-edit.tsx — Client island per row exposing an Edit button that
 * opens a Sheet wrapping `<TransactionEditForm />`. Plan 02-07 wired the edit
 * use case + form, but the surface in the list was missing.
 */
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { TransactionEditForm } from "./transaction-edit-form";

interface TransactionRowEditProps {
  transaction: {
    id: string;
    kind: string;
    amountOrig: string;
    currencyOrig: string;
    amountDefault: string;
    currencyDefault: string;
    fxRate: string;
    fxRateDate: string;
    fxProvider: string;
    transactionDate: string;
    note: string | null;
    accountId: string;
    categoryId: string | null;
    transferGroupId: string | null;
    correctsId?: string | null;
  };
  ariaLabel: string;
  sheetTitle: string;
}

export function TransactionRowEdit({
  transaction,
  ariaLabel,
  sheetTitle,
}: TransactionRowEditProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        aria-label={ariaLabel}
        onClick={() => setOpen(true)}
        className="flex h-8 w-8 items-center justify-center rounded-[var(--radius-sm)] text-[var(--muted-foreground)] transition-colors hover:bg-[color-mix(in_oklab,var(--primary)_10%,transparent)] hover:text-[var(--primary)]"
      >
        <Pencil className="h-3.5 w-3.5" />
      </button>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent
          side="right"
          className="w-full bg-[var(--canvas-dark)] sm:max-w-lg overflow-y-auto"
        >
          <SheetHeader className="mb-6">
            <SheetTitle className="text-[var(--on-dark)]">{sheetTitle}</SheetTitle>
          </SheetHeader>
          <TransactionEditForm
            transaction={{
              id: transaction.id,
              kind: transaction.kind,
              amountOrig: transaction.amountOrig,
              currencyOrig: transaction.currencyOrig,
              amountDefault: transaction.amountDefault,
              currencyDefault: transaction.currencyDefault,
              fxRate: transaction.fxRate,
              fxRateDate: transaction.fxRateDate,
              fxProvider: transaction.fxProvider,
              transactionDate: transaction.transactionDate,
              note: transaction.note,
              accountId: transaction.accountId,
              categoryId: transaction.categoryId,
              transferGroupId: transaction.transferGroupId,
              correctsId: transaction.correctsId ?? null,
            }}
            onSuccess={() => {
              setOpen(false);
              router.refresh();
            }}
            onCancel={() => setOpen(false)}
          />
        </SheetContent>
      </Sheet>
    </>
  );
}
