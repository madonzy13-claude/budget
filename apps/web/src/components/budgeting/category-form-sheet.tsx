"use client";

/**
 * category-form-sheet.tsx — Sheet wrapper for the "+ Add category" CTA.
 * Wraps the unified CategoryEditForm in mode=create.
 */
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { CategoryEditForm } from "@/components/budgeting/category-edit-form";

interface CategoryFormSheetProps {
  addButtonLabel: string;
  /**
   * Phase 6 onboarding rewrite: pass through to CategoryEditForm so the
   * cushion-amount field disappears when the master cushion flag is off.
   */
  cushionEnabled?: boolean;
}

export function CategoryFormSheet({
  addButtonLabel,
  cushionEnabled = true,
}: CategoryFormSheetProps) {
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
        <CategoryEditForm
          mode={{ kind: "create" }}
          onSuccess={handleSuccess}
          onCancel={() => setOpen(false)}
          cushionEnabled={cushionEnabled}
        />
      </SheetContent>
    </Sheet>
  );
}
