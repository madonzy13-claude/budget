"use client";

/**
 * reset-password/page.tsx — consume-token set-new-password page (USET-07, 10-05).
 *
 * Reads ?token=, enforces minPasswordLength 10 client-side, calls
 * authClient.resetPassword({ newPassword, token }) and redirects to sign-in on
 * success. Better Auth re-validates the token server-side (single-use, 1800s TTL);
 * a missing/expired/used token shows the error + a link to request a fresh one
 * (T-10-08). Backs BOTH the logged-out reset and the in-app password change (10-04).
 */
import { useState } from "react";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import { useTranslations, useLocale } from "next-intl";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth-client";

// Mirrors emailAndPassword.minPasswordLength in packages/identity better-auth.ts.
const MIN_PASSWORD = 10;

// Module-scoped so it is NOT re-created each render (a nested component identity
// would remount the form subtree on every keystroke and drop input focus).
function Shell({
  locale,
  children,
}: {
  locale: string;
  children: React.ReactNode;
}) {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-[var(--canvas-dark)] px-4 py-10">
      <Link
        href={`/${locale}`}
        className="mb-6 inline-flex items-center text-[17px] font-bold uppercase tracking-[0.04em] text-[var(--primary)]"
      >
        Budget
      </Link>
      <div className="w-full max-w-md">{children}</div>
    </main>
  );
}

export default function ResetPasswordPage() {
  const t = useTranslations("auth");
  const locale = useLocale();
  const router = useRouter();
  const token = useSearchParams().get("token");
  const [pw, setPw] = useState("");
  const [minErr, setMinErr] = useState(false);
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(false);

  if (!token) {
    return (
      <Shell locale={locale}>
        <Card>
          <CardHeader className="gap-2">
            <CardTitle className="text-display-sm">
              {t("reset.consume.heading")}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p
              data-testid="reset-error"
              className="text-sm text-[var(--trading-down)]"
            >
              {t("reset.expired")}
            </p>
            <Link
              href={`/${locale}/forgot-password`}
              data-testid="reset-request-new"
              className="block text-sm font-medium text-[var(--primary)] hover:text-[var(--primary-active)]"
            >
              {t("reset.request_new_link")}
            </Link>
          </CardContent>
        </Card>
      </Shell>
    );
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (pw.length < MIN_PASSWORD) {
      setMinErr(true);
      return;
    }
    setMinErr(false);
    setError(false);
    setBusy(true);
    try {
      const res = await authClient.resetPassword({
        newPassword: pw,
        token: token as string,
      });
      if ((res as { error?: unknown } | undefined)?.error) {
        setError(true);
        return;
      }
      router.push(`/${locale}/sign-in`);
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Shell locale={locale}>
      <Card>
        <CardHeader className="gap-2">
          <CardTitle className="text-display-sm">
            {t("reset.consume.heading")}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="space-y-2">
              <label
                htmlFor="reset-pw"
                className="block text-sm font-medium text-[var(--on-dark)]"
              >
                {t("password.new_label")}
              </label>
              <Input
                id="reset-pw"
                data-testid="reset-password-input"
                type="password"
                autoComplete="new-password"
                value={pw}
                onChange={(e) => setPw(e.target.value)}
              />
              {minErr && (
                <p
                  data-testid="reset-minlen"
                  className="text-sm text-[var(--trading-down)]"
                >
                  {t("reset.min_length")}
                </p>
              )}
              {error && (
                <p
                  data-testid="reset-error"
                  className="text-sm text-[var(--trading-down)]"
                >
                  {t("reset.expired")}
                </p>
              )}
            </div>
            <Button
              type="submit"
              data-testid="reset-submit"
              disabled={busy}
              className="w-full"
            >
              {busy ? t("reset_loading") : t("reset.consume.cta")}
            </Button>
          </form>
          <Link
            href={`/${locale}/forgot-password`}
            data-testid="reset-request-new"
            className="block text-sm font-medium text-[var(--primary)] hover:text-[var(--primary-active)]"
          >
            {t("reset.request_new_link")}
          </Link>
        </CardContent>
      </Card>
    </Shell>
  );
}
