"use client";
/**
 * price-blocked-banner.tsx — Inline on-add price-fetch failure banner (Phase 9, A2).
 *
 * Rendered inside HoldingSheet when an on-add instant price fetch fails. NOT a
 * modal. role="alert" so it is announced. Left border --destructive (4px), body
 * copy + an inline Retry link that re-triggers the fetch.
 */
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";

interface PriceBlockedBannerProps {
  onRetry: () => void;
  retrying?: boolean;
}

export function PriceBlockedBanner({
  onRetry,
  retrying,
}: PriceBlockedBannerProps) {
  const t = useTranslations("budget.investments.priceBlocked");
  return (
    <div
      role="alert"
      data-testid="price-blocked-banner"
      className="flex items-center justify-between gap-3 rounded-[var(--radius-md)] border-l-4 border-[var(--destructive)] bg-[var(--surface-elevated-dark)] px-3 py-2"
    >
      <p className="text-body-md text-[var(--body-on-dark)]">{t("body")}</p>
      <Button
        type="button"
        variant="link"
        onClick={onRetry}
        disabled={retrying}
        className="h-auto shrink-0 p-0 text-[var(--primary)]"
      >
        {t("retry")}
      </Button>
    </div>
  );
}
