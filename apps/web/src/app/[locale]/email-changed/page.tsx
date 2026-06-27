"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { authClient } from "@/lib/auth-client";
import { AuthCardShell } from "@/components/auth/auth-card-shell";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

/**
 * /email-changed — landing for BOTH steps of Better Auth's two-step change-email
 * flow, which reuse the same callbackURL:
 *
 *   1. CONFIRM (link to the OLD address): Better Auth changes nothing yet — it
 *      emails a verification link to the NEW address. The browser is still signed
 *      in as the OLD email. We tell the user to open the link in their new inbox.
 *   2. VERIFY (link to the NEW address): Better Auth applies the change, marks the
 *      new address verified, and re-issues a session cookie (auto-login as the new
 *      email). We confirm success and send them into the app.
 *
 * The two landings are indistinguishable by URL, so we pass the target address as
 * `?to=` (set on the changeEmail callbackURL, which Better Auth carries into the
 * second link too) and compare it to the LIVE session email: equal ⇒ the change
 * landed (step 2); not equal / signed out ⇒ still pending (step 1). No sign-out —
 * the library keeps the user authenticated as the new address.
 */
export default function EmailChangedPage() {
  const router = useRouter();
  const locale = useLocale();
  const searchParams = useSearchParams();
  const t = useTranslations("auth.emailChanged");
  const to = searchParams.get("to") ?? "";

  const [stage, setStage] = useState<"checking" | "pending" | "done">(
    "checking",
  );

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      let currentEmail = "";
      try {
        const res = await authClient.getSession();
        currentEmail =
          (res as { data?: { user?: { email?: string } } })?.data?.user
            ?.email ?? "";
      } catch {
        // Treat an unreadable session as "not yet the new address" → pending.
      }
      if (cancelled) return;
      const changed =
        to.length > 0 && currentEmail.toLowerCase() === to.toLowerCase();
      setStage(changed ? "done" : "pending");
    })();
    return () => {
      cancelled = true;
    };
  }, [to]);

  return (
    <AuthCardShell locale={locale}>
      {stage === "checking" && (
        <p className="text-sm text-[var(--muted-foreground)]">
          {t("checking")}
        </p>
      )}

      {stage === "pending" && (
        <div className="space-y-4" data-testid="email-changed-pending">
          <Alert variant="warning">
            <AlertTitle>{t("pending_title")}</AlertTitle>
            <AlertDescription>
              {t("pending_body", { email: to })}
            </AlertDescription>
          </Alert>
          <Button
            className="w-full"
            variant="secondary"
            onClick={() => router.push(`/${locale}/settings`)}
          >
            {t("back_to_settings")}
          </Button>
        </div>
      )}

      {stage === "done" && (
        <div className="space-y-4" data-testid="email-changed-done">
          <Alert variant="default">
            <AlertTitle>{t("done_title")}</AlertTitle>
            <AlertDescription>{t("done_body", { email: to })}</AlertDescription>
          </Alert>
          <Button className="w-full" onClick={() => router.push(`/${locale}`)}>
            {t("continue")}
          </Button>
        </div>
      )}
    </AuthCardShell>
  );
}
