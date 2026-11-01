"use client";

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
  return (
    <div
      data-testid="fx-preview-line"
      className="text-num-sm text-[var(--muted-foreground)]"
    >
      {original.amount} {original.currency} · ~{converted.amount}{" "}
      {converted.currency} @ {rate} ({asOf})
    </div>
  );
}
