"use client";
/**
 * settings-config-progress.tsx — "budget configuration completeness" header at the
 * top of the Settings accordion (r34). The whole card is the popup trigger: tap
 * anywhere on it to open the checklist (done / to-do). Presentational — the parent
 * computes percent + items from live data.
 */
import { useTranslations } from "next-intl";
import { CircleCheck, Circle } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogTrigger,
} from "@/components/ui/dialog";
import type { SettingsChecklistItem } from "@/lib/settings-progress";

export interface SettingsConfigProgressProps {
  percent: number;
  items: SettingsChecklistItem[];
}

export function SettingsConfigProgress({
  percent,
  items,
}: SettingsConfigProgressProps) {
  const t = useTranslations("settings.progress");
  const done = percent >= 100;
  const todo = items.filter((i) => !i.done);
  const complete = items.filter((i) => i.done);

  return (
    <Dialog>
      {/* The entire banner is the trigger — tap anywhere to open the checklist. */}
      <DialogTrigger asChild>
        <button
          type="button"
          data-testid="settings-config-progress"
          data-percent={percent}
          aria-label={t("title")}
          className="mb-4 block w-full cursor-pointer rounded-xl border border-[var(--hairline-on-dark)] bg-[var(--surface-card-dark)] px-5 py-3 text-left transition-colors hover:bg-[var(--surface-elevated-dark)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--info)]"
        >
          {/* items-center + leading-none so the title isn't pushed low by the
              taller percent line-box — keeps the visual top/bottom padding equal. */}
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm font-semibold leading-none text-[var(--body-on-dark)]">
              {t("title")}
            </span>
            <span
              className={cn(
                "num text-lg font-bold leading-none tabular-nums",
                done ? "text-[var(--trading-up)]" : "text-[var(--primary)]",
              )}
            >
              {percent}%
            </span>
          </div>
          {/* Track + fill. Fill colour flips to trading-green at 100%. */}
          <div
            className="mt-2 h-2 w-full overflow-hidden rounded-full bg-[var(--surface-sunken-dark)]"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={percent}
          >
            <div
              className={cn(
                "h-full rounded-full transition-[width] duration-500 ease-out",
                done ? "bg-[var(--trading-up)]" : "bg-[var(--primary)]",
              )}
              style={{ width: `${percent}%` }}
            />
          </div>
        </button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t("checklistTitle")}</DialogTitle>
          <DialogDescription>
            {t("checklistSubtitle", {
              done: complete.length,
              total: items.length,
            })}
          </DialogDescription>
        </DialogHeader>
        <ul className="flex flex-col gap-1" data-testid="settings-checklist">
          {/* To-do first (what's left), then the completed items. */}
          {[...todo, ...complete].map((item) => (
            <li
              key={item.key}
              data-item={item.key}
              data-done={item.done ? "true" : "false"}
              className="flex items-center gap-3 py-1.5"
            >
              {item.done ? (
                <CircleCheck className="size-5 shrink-0 text-[var(--trading-up)]" />
              ) : (
                <Circle className="size-5 shrink-0 text-[var(--muted-strong)]" />
              )}
              <span
                className={cn(
                  "text-sm",
                  item.done
                    ? "text-[var(--muted-foreground)] line-through"
                    : "text-[var(--body-on-dark)]",
                )}
              >
                {t(`items.${item.key}`)}
              </span>
            </li>
          ))}
        </ul>
      </DialogContent>
    </Dialog>
  );
}
