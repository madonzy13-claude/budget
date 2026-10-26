"use client";
/**
 * holding-delete-confirm.tsx — AlertDialog before erasing a holding (Phase 13).
 *
 * Delete erases the holding and its entire history (realized + contributions
 * recompute), so the copy says exactly that. All strings via next-intl + JSX
 * auto-escape (T-9-19: no raw HTML).
 */
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
import { useTranslations } from "next-intl";

interface HoldingDeleteConfirmProps {
  name: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}

export function HoldingDeleteConfirm({
  name,
  open,
  onOpenChange,
  onConfirm,
}: HoldingDeleteConfirmProps) {
  const t = useTranslations("budget.investments.deleteHolding");

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent
        // 260723-4: focus the destructive action on open so Enter confirms.
        onOpenAutoFocus={(e) => {
          e.preventDefault();
          (e.currentTarget as HTMLElement)
            .querySelector<HTMLButtonElement>(
              '[data-testid="holding-delete-confirm-action"]',
            )
            ?.focus();
        }}
      >
        <AlertDialogHeader>
          <AlertDialogTitle>{t("title", { name })}</AlertDialogTitle>
          <AlertDialogDescription>{t("body")}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{t("keep", { name })}</AlertDialogCancel>
          <AlertDialogAction
            data-testid="holding-delete-confirm-action"
            className="bg-[var(--destructive)] text-[var(--on-primary)]"
            onClick={onConfirm}
          >
            {t("confirm")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
