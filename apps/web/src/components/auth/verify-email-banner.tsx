"use client";

import { useState, useEffect, useCallback } from "react";
import { useTranslations } from "next-intl";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth-client";

const COOLDOWN_SECONDS = 60;

interface VerifyEmailBannerProps {
  email: string;
}

/**
 * Verify-email banner. Edge-to-edge ribbon at the top of the (app) layout.
 *
 * Avoids the side-stripe pattern (DESIGN.md absolute ban). Instead the whole
 * row carries a brand-yellow tint with a single hairline-yellow bottom border —
 * full-width semantic warning instead of a decorative left edge.
 */
export function VerifyEmailBanner({ email }: VerifyEmailBannerProps) {
  const t = useTranslations("auth.verify.banner");
  const [cooldown, setCooldown] = useState(0);
  const [isSending, setIsSending] = useState(false);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  const handleResend = useCallback(async () => {
    if (cooldown > 0 || isSending) return;
    setIsSending(true);
    try {
      await authClient.sendVerificationEmail({ email });
      setCooldown(COOLDOWN_SECONDS);
    } finally {
      setIsSending(false);
    }
  }, [cooldown, isSending, email]);

  return (
    <div
      role="region"
      aria-label={t("heading")}
      className="border-b border-[color-mix(in_oklab,var(--primary)_45%,transparent)] bg-[color-mix(in_oklab,var(--primary)_8%,var(--canvas-dark))]"
    >
      <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <div className="flex items-start gap-3 text-sm text-[var(--on-dark)]">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-[var(--primary)]" />
          <div className="space-y-0.5">
            <p className="font-semibold leading-tight">{t("heading")}</p>
            <p className="text-[var(--muted-foreground)]">
              {t("body", { email })}
            </p>
          </div>
        </div>
        <div className="shrink-0 sm:pl-7">
          {cooldown > 0 ? (
            <span className="text-sm font-medium text-[var(--muted-foreground)]">
              {t("cooldown", { seconds: cooldown })}
            </span>
          ) : (
            <Button
              variant="outline"
              size="sm"
              onClick={handleResend}
              disabled={isSending}
            >
              {t("resend")}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
