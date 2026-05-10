"use client";

/**
 * account-form-sheet.tsx — Sheet wrapper for AccountForm
 * Client component: triggers the Sheet drawer, passes session context to AccountForm.
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
import { AccountForm } from "@/components/budgeting/account-form";
import { Plus } from "lucide-react";

interface AccountFormSheetProps {
  locale: string;
  addButtonLabel: string;
  tenantId?: string;
  userId?: string;
}

export function AccountFormSheet({
  locale: _locale,
  addButtonLabel,
  tenantId = "",
  userId = "",
}: AccountFormSheetProps) {
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
          className="bg-[var(--primary)] text-[var(--primary-foreground)] hover:bg-[color-mix(in_oklab,var(--primary)_85%,black)]"
        >
          <Plus className="mr-1.5 h-4 w-4" />
          {addButtonLabel}
        </Button>
      </SheetTrigger>
      <SheetContent
        side="right"
        className="w-full bg-[var(--canvas-dark)] sm:max-w-lg"
      >
        <SheetHeader className="mb-6">
          <SheetTitle className="text-[var(--on-dark)]">
            {addButtonLabel}
          </SheetTitle>
        </SheetHeader>
        <AccountForm
          tenantId={tenantId}
          userId={userId}
          onSuccess={handleSuccess}
          onCancel={() => setOpen(false)}
        />
      </SheetContent>
    </Sheet>
  );
}
