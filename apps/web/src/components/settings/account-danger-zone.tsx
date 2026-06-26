"use client";

/**
 * account-danger-zone.tsx — User-pill "Danger Zone" (USET-06, Plan 10-06).
 *
 * Email-gated account deletion (checkpoint decision): typing the exact word
 * DELETE enables a confirm that calls authClient.deleteUser({ callbackURL }) —
 * Better Auth emails a confirmation link, and the application cascade
 * (purgeUserData) runs only when that link is consumed. A typed-DELETE gate plus
 * the email second factor means a hijacked cookie alone can't delete the account
 * (T-10-11). The cascade purges solely-owned budgets + crypto-shreds the DEK;
 * sole-owner-of-SHARED-with-members is blocked server-side.
 */
import { useState } from "react";
import { useTranslations, useLocale } from "next-intl";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
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
import { authClient } from "@/lib/auth-client";

const CONFIRM_WORD = "DELETE";

export function AccountDangerZone() {
  const t = useTranslations("settings.accountDanger");
  const locale = useLocale();
  const [open, setOpen] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [busy, setBusy] = useState(false);

  const canDelete = confirmText === CONFIRM_WORD;

  const reset = () => {
    setOpen(false);
    setConfirmText("");
  };

  async function onConfirm() {
    if (!canDelete) return;
    setBusy(true);
    try {
      const res = await authClient.deleteUser({
        callbackURL: `/${locale}/sign-in`,
      });
      if ((res as { error?: unknown } | undefined)?.error) throw new Error();
      toast.success(t("sent"));
      reset();
    } catch {
      toast.error(t("error"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4 rounded-lg border border-[color-mix(in_oklab,var(--trading-down)_40%,transparent)] bg-[color-mix(in_oklab,var(--trading-down)_6%,transparent)] p-4">
      <div className="space-y-1">
        <h3 className="text-sm font-medium text-[var(--trading-down)]">
          {t("title")}
        </h3>
        <p className="text-sm text-[var(--muted-foreground)]">{t("warning")}</p>
      </div>
      <Button
        data-testid="delete-account-open"
        onClick={() => setOpen(true)}
        className="bg-[var(--trading-down)] text-[var(--on-dark)] hover:bg-[color-mix(in_oklab,var(--trading-down)_85%,black)]"
      >
        {t("delete_button")}
      </Button>

      <AlertDialog
        open={open}
        onOpenChange={(o) => {
          if (!o) reset();
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("confirm.title")}</AlertDialogTitle>
            <AlertDialogDescription>{t("confirm.body")}</AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-2">
            <label
              htmlFor="delete-confirm"
              className="block text-sm text-[var(--on-dark)]"
            >
              {t("confirm.type_label", { word: CONFIRM_WORD })}
            </label>
            <Input
              id="delete-confirm"
              data-testid="delete-confirm-input"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              autoComplete="off"
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("confirm.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              data-testid="delete-account-confirm"
              disabled={!canDelete || busy}
              className="bg-[var(--trading-down)] text-[var(--on-dark)] hover:bg-[color-mix(in_oklab,var(--trading-down)_85%,black)]"
              onClick={(e) => {
                e.preventDefault();
                void onConfirm();
              }}
            >
              {t("confirm.cta")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
