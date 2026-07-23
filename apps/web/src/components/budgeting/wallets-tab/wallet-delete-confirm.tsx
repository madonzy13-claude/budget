"use client";
/**
 * wallet-delete-confirm.tsx — AlertDialog wrapper for wallet archive action.
 *
 * D-PH5-W10: Confirmation body literally says "This can't be undone here."
 * T-05-10: No raw HTML injection — all strings via next-intl + JSX auto-escape.
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

interface WalletDeleteConfirmProps {
  name: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}

export function WalletDeleteConfirm({
  name,
  open,
  onOpenChange,
  onConfirm,
}: WalletDeleteConfirmProps) {
  const t = useTranslations("bdp.tab.wallets.confirm.delete");

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent
        // 260723-4: focus the destructive action on open so a single Enter
        // confirms the delete (Radix otherwise parks focus on Cancel).
        onOpenAutoFocus={(e) => {
          e.preventDefault();
          (e.currentTarget as HTMLElement)
            .querySelector<HTMLButtonElement>(
              '[data-testid="wallet-delete-confirm-action"]',
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
            data-testid="wallet-delete-confirm-action"
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
