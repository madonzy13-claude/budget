"use client";
/**
 * ledger-delete-confirm.tsx — confirm before undoing a ledger entry (13.1 D-14).
 *
 * The copy says what the delete will do: wipe the asset (last entry, D-17),
 * take money back out of a wallet (D-21/D-24), remove both linked legs (D-16),
 * or plainly undo the entry. Strings via next-intl + JSX escaping only.
 * Round 3: when calculated interest follows the entry (deposits), the confirm
 * adds that it is recalculated — the interest goes with it.
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
import { buttonVariants } from "@/components/ui/button";
import { useTranslations } from "next-intl";
import type { EntryDto } from "@/hooks/use-asset-entries";

export type ConfirmVariant = "last" | "wallet" | "linked" | "entry";

export function confirmVariant(e: EntryDto): ConfirmVariant {
  if (e.isLastEntry) return "last";
  if (e.kind === "withdraw" && e.walletName) return "wallet";
  if (e.linked) return "linked";
  return "entry";
}

interface Props {
  entry: EntryDto | null;
  assetName: string;
  kind: string;
  date: string;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  /** Calculated interest rows follow this entry (they get recalculated). */
  interestAfter?: boolean;
}

export function LedgerDeleteConfirm({
  entry,
  assetName,
  kind,
  date,
  onOpenChange,
  onConfirm,
  interestAfter,
}: Props) {
  const t = useTranslations("budget.investments");
  const v = entry ? confirmVariant(entry) : "entry";
  const p = {
    name: assetName,
    kind,
    date,
    amount: entry?.walletDelta ?? "",
    wallet: entry?.walletName ?? "",
    other: entry?.counterpartyName ?? "",
  };
  return (
    <AlertDialog open={entry !== null} onOpenChange={onOpenChange}>
      <AlertDialogContent
        // Radix refocuses the trigger on close, which trips :focus-visible on a
        // row that just vanished — keep focus where the user is.
        onCloseAutoFocus={(e) => e.preventDefault()}
      >
        <AlertDialogHeader>
          <AlertDialogTitle>
            {t(`ledger.confirm.${v}.title`, p)}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {t(`ledger.confirm.${v}.body`, p)}
          </AlertDialogDescription>
          {interestAfter && (
            <p
              data-testid="ledger-delete-interest-note"
              className="text-[14px]"
              style={{ color: "var(--muted-foreground)" }}
            >
              {t("ledger.confirm.interestNote")}
            </p>
          )}
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>
            {t(`ledger.confirm.${v}.cancel`)}
          </AlertDialogCancel>
          <AlertDialogAction
            data-testid="ledger-delete-confirm-action"
            // Red fill, light text — a delete reads as one (13.1 UAT 12).
            className={buttonVariants({ variant: "destructive" })}
            onClick={onConfirm}
          >
            {t(`ledger.confirm.${v}.confirm`)}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
