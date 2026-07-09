"use client";

/**
 * forgot-password/page.tsx — logged-out request-reset page (USET-07, Plan 10-05).
 *
 * Fires authClient.requestPasswordReset (reuses the wired sendResetPassword +
 * 1800s token) and ALWAYS renders the same neutral success — registered or not —
 * so the form can't be used to enumerate accounts (T-10-07). Self-contained card
 * (UI primitives only, no NavLink chrome) so it stays simple + testable.
 */
import { useState } from "react";
import Link from "next/link";
import { useTranslations, useLocale } from "next-intl";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { AuthCardShell } from "@/components/auth/auth-card-shell";
import { authClient } from "@/lib/auth-client";

export default function ForgotPasswordPage() {
  const t = useTranslations("auth");
  const locale = useLocale();
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await authClient.requestPasswordReset({
        email,
        redirectTo: `/${locale}/reset-password`,
      });
    } catch {
      // Neutral result regardless of outcome — never reveal whether the email
      // is registered (no account enumeration).
    } finally {
      setSent(true);
      setBusy(false);
    }
  }

  return (
    <AuthCardShell locale={locale}>
      <Card>
        <CardHeader className="gap-2">
          <CardTitle className="text-display-sm">
            {t("reset.request.heading")}
          </CardTitle>
          <CardDescription>{t("reset.request.body")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {sent ? (
            <p
              data-testid="forgot-success"
              className="text-sm text-[var(--body-on-dark)]"
            >
              {t("reset.request.success")}
            </p>
          ) : (
            <form onSubmit={onSubmit} className="space-y-4">
              <div className="space-y-2">
                <label
                  htmlFor="forgot-email"
                  className="block text-sm font-medium text-[var(--on-dark)]"
                >
                  {t("email.label")}
                </label>
                <Input
                  id="forgot-email"
                  data-testid="forgot-email"
                  type="email"
                  autoComplete="email"
                  placeholder={t("email.placeholder")}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>
              <Button
                type="submit"
                data-testid="forgot-submit"
                disabled={busy || email.trim().length === 0}
                className="w-full"
              >
                {busy ? t("reset_loading") : t("reset.request.cta")}
              </Button>
            </form>
          )}
          <Link
            href={`/${locale}/sign-in`}
            className="block text-sm font-medium text-[var(--primary)] hover:text-[var(--primary-active)]"
          >
            {t("reset.back_to_signin")}
          </Link>
        </CardContent>
      </Card>
    </AuthCardShell>
  );
}
