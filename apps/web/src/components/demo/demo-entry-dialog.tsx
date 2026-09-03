"use client";

/**
 * demo-entry-dialog.tsx — the way into the demo, from the sign-in page.
 *
 * The visitor picks a language HERE and lands directly in the matching demo
 * account. There is one account per language because the demo's data — the
 * category names, the transaction notes, the wallets — is stored in one
 * language; picking a language is therefore picking an account, not a UI
 * setting.
 *
 * Choosing navigates to `/{code}/demo`, which is a server route handler, NOT a
 * page: it signs in server-side and forwards the session cookie, so the shared
 * demo password never reaches the browser bundle. The visitor sees a dialog and
 * then the app; the redirect is not a screen anyone lands on.
 */
import { useState } from "react";
import { useTranslations } from "next-intl";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

const LANGUAGES = [
  { code: "en", label: "English" },
  { code: "pl", label: "Polski" },
  { code: "uk", label: "Українська" },
] as const;

export function DemoEntryDialog() {
  const t = useTranslations("demo");
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const enter = (code: string) => {
    setBusy(code);
    // Remember the choice for the app's own locale routing. The demo ACCOUNT is
    // chosen by the URL below; this cookie only keeps the UI in the same
    // language afterwards.
    try {
      document.cookie = `budget-locale=${code}; path=/; max-age=31536000; samesite=lax`;
    } catch {
      /* cookies blocked — the URL locale still carries the choice */
    }
    window.location.assign(`/${code}/demo`);
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        data-testid="demo-entry-link"
        className="text-sm font-medium text-[var(--on-dark)] underline-offset-4 hover:underline"
      >
        {t("try_link")}
      </button>
      <p className="mt-1 text-xs text-[var(--muted-foreground)]">
        {t("try_hint")}
      </p>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          className="max-w-sm"
          data-testid="demo-entry-dialog"
          // Radix restores focus to the trigger on close, which trips
          // :focus-visible rings.
          onCloseAutoFocus={(e) => e.preventDefault()}
        >
          <DialogHeader>
            <DialogTitle>{t("welcome_title")}</DialogTitle>
            <DialogDescription>{t("welcome_body")}</DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            <p className="text-sm text-[var(--text-secondary)]">
              {t("choose_language")}
            </p>
            <div className="grid gap-2">
              {LANGUAGES.map((l) => (
                <Button
                  key={l.code}
                  variant="outline"
                  disabled={busy !== null}
                  onClick={() => enter(l.code)}
                  data-testid={`demo-lang-${l.code}`}
                >
                  {busy === l.code ? t("entering") : l.label}
                </Button>
              ))}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
