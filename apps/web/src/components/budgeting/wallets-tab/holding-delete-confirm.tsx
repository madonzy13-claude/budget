"use client";
/**
 * holding-delete-confirm.tsx — AlertDialog wrapper for holding archive (Phase 9).
 *
 * Soft-archive, no restore. Body literally says "This can't be undone here."
 * per D-03 — identical wording to the wallet delete confirm. All strings via
 * next-intl + JSX auto-escape (T-9-19: no raw HTML).
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
  const t = useTranslations("budget.investments.confirm.delete");

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t("title", { name })}</AlertDialogTitle>
          <AlertDialogDescription>{t("body")}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{t("cancel")}</AlertDialogCancel>
          <AlertDialogAction
            className="bg-[var(--destructive)] text-[var(--on-primary)]"
            onClick={onConfirm}
          >
            {t("cta")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
