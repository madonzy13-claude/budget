"use client";
/**
 * chart-needs-completed-month.tsx — what stands in for a chart that cannot
 * answer the range it was given (260804).
 *
 * Two charts judge months against their whole budget and leave the month still
 * running out of the reckoning. Pick a range holding nothing else and there is
 * nothing to draw — better to say why than to draw a bar from half a month and
 * let someone act on it.
 */
import { useTranslations } from "next-intl";
import { CalendarClock } from "lucide-react";

export function ChartNeedsCompletedMonth({
  title,
  testId,
}: {
  title: string;
  testId: string;
}) {
  const t = useTranslations("bdp.tab.overview");
  return (
    <div className="flex flex-col gap-2">
      <p className="text-center text-caption text-[var(--muted-foreground)]">
        {title}
      </p>
      <div
        data-testid={testId}
        className="flex flex-col items-center gap-2 rounded-[var(--radius-lg)] border border-dashed border-[var(--hairline-dark)] px-4 py-6 text-center"
      >
        <CalendarClock
          aria-hidden
          className="size-5 text-[var(--muted-foreground)]"
        />
        <p className="text-num-sm">{t("needsCompletedMonth.title")}</p>
        <p className="text-caption text-[var(--muted-foreground)]">
          {t("needsCompletedMonth.body")}
        </p>
      </div>
    </div>
  );
}
