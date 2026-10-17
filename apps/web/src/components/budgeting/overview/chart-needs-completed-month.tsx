"use client";
/**
 * chart-needs-completed-month.tsx — what stands in for a chart that cannot
 * answer the range it was given (260804).
 *
 * Two charts judge months against their whole budget and leave the month still
 * running out of the reckoning. Pick a range holding nothing else and there is
 * nothing to draw — better to say why than to draw a bar from half a month and
 * let someone act on it.
 *
 * The shell itself lives in chart-stood-down.tsx, shared with the scheduled-
 * payments chart, which stands down for its own reason.
 */
import { useTranslations } from "next-intl";
import { CalendarClock } from "lucide-react";
import { ChartStoodDown } from "./chart-stood-down";

export function ChartNeedsCompletedMonth({
  title,
  testId,
}: {
  title: string;
  testId: string;
}) {
  const t = useTranslations("bdp.tab.overview");
  return (
    <ChartStoodDown
      title={title}
      testId={testId}
      icon={
        <CalendarClock
          aria-hidden
          className="size-5 text-[var(--muted-foreground)]"
        />
      }
      headline={t("needsCompletedMonth.title")}
      body={t("needsCompletedMonth.body")}
    />
  );
}
