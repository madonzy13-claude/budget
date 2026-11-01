"use client";

import { useLocale } from "next-intl";
import { formatInstantDate } from "@/lib/format-date";

interface FxPreviewLineProps {
  original: { amount: string; currency: string };
  converted: { amount: string; currency: string };
  rate: string;
  asOf: string; // ISO date
}

export function FxPreviewLine({
  original,
  converted,
  rate,
  asOf,
}: FxPreviewLineProps) {
  const locale = useLocale();
  // R6 (user): plain words — "@ 4.3691 (15 Oct 2026)", not the stored
  // "4.36910000 (2026-10-15)". A calendar date, built at local midnight.
  const shownRate = Number.isFinite(Number(rate)) ? String(Number(rate)) : rate;
  const day = formatInstantDate(
    new Date(`${asOf}T00:00:00`),
    locale,
    undefined,
    {
      month: "short",
    },
  );
  return (
    <div
      data-testid="fx-preview-line"
      className="text-num-sm text-[var(--muted-foreground)]"
    >
      {original.amount} {original.currency} · ~{converted.amount}{" "}
      {converted.currency} @ {shownRate} ({day || asOf})
    </div>
  );
}
