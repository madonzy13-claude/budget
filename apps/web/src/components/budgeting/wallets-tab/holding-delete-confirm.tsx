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
  /** i18n namespace for the confirm strings — possessions override the default. */
  namespace?: string;
}

export function HoldingDeleteConfirm({
  name,
  open,
  onOpenChange,
  onConfirm,
  namespace = "budget.investments.confirm.delete",
}: HoldingDeleteConfirmProps) {
  const t = useTranslations(namespace);

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
          <AlertDialogCancel>{t("cancel")}</AlertDialogCancel>
          <AlertDialogAction
            data-testid="holding-delete-confirm-action"
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
