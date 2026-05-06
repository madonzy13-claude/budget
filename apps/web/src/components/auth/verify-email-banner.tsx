"use client";

import { useState, useEffect, useCallback } from "react";
import { useTranslations } from "next-intl";
import { AlertTriangle } from "lucide-react";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth-client";

const COOLDOWN_SECONDS = 60;

interface VerifyEmailBannerProps {
  email: string;
}

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
      className="w-full border-l-2 border-primary"
      role="region"
      aria-label={t("heading")}
    >
      <Alert variant="warning" className="rounded-none border-x-0 border-t-0">
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle>{t("heading")}</AlertTitle>
        <AlertDescription className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <span>{t("body", { email })}</span>
          {cooldown > 0 ? (
            <span className="text-sm font-medium">
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
        </AlertDescription>
      </Alert>
      {/* workspaces.verify_required — used in workspace list when unverified user clicks Create */}
    </div>
  );
}
