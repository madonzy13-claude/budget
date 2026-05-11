"use client";

/**
 * transaction-capture-sheet.tsx — Sheet wrapper for TransactionCaptureForm.
 * Client component: triggers the Sheet drawer, receives currencies from RSC parent.
 */
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { TransactionCaptureForm } from "@/components/budgeting/transaction-capture-form";
import type { CurrencyOption } from "@/components/common/currency-picker";
import { Plus } from "lucide-react";

interface AccountOption {
  id: string;
  name: string;
  currency: string;
}

interface CategoryOption {
  id: string;
  name: string;
}

interface TransactionCaptureSheetProps {
  locale: string;
  addButtonLabel: string;
  currencies: CurrencyOption[];
  accounts?: AccountOption[];
  categories?: CategoryOption[];
  defaultCurrency?: string;
}

export function TransactionCaptureSheet({
  locale: _locale,
  addButtonLabel,
  currencies,
  accounts,
  categories,
  defaultCurrency = "EUR",
}: TransactionCaptureSheetProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  function handleSuccess() {
    setOpen(false);
    router.refresh();
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button
          size="sm"
          className="bg-[var(--primary)] text-[var(--on-primary)] hover:bg-[var(--primary-active)]"
          data-testid="add-transaction-button"
        >
          <Plus className="mr-1.5 h-4 w-4" />
          {addButtonLabel}
        </Button>
      </SheetTrigger>
      <SheetContent
        side="right"
        className="w-full bg-[var(--canvas-dark)] sm:max-w-lg overflow-y-auto"
      >
        <SheetHeader className="mb-6">
          <SheetTitle className="text-[var(--on-dark)]">
            {addButtonLabel}
          </SheetTitle>
        </SheetHeader>
        <TransactionCaptureForm
          currencies={currencies}
          {...(accounts ? { accounts } : {})}
          {...(categories ? { categories } : {})}
          defaultCurrency={defaultCurrency}
          onSuccess={handleSuccess}
          onCancel={() => setOpen(false)}
        />
      </SheetContent>
    </Sheet>
  );
}
