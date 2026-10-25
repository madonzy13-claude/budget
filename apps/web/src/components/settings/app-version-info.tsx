"use client";

/**
 * app-version-info.tsx — which build this device runs, whether it is the
 * latest, and "Update now" only when it isn't (user, 261023). AppUpdater keeps
 * the latest-build answer fresh; opening Settings asks once more.
 */
import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { CheckCircle2, Loader2, Smartphone, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  APP_VERSION,
  RUNNING_BUILD,
  fetchLatestBuild,
  formatBuild,
  setLatestBuild,
  updateNow,
  useLatestBuild,
} from "@/lib/app-update";

export function AppVersionInfo() {
  const t = useTranslations("settings");
  const locale = useLocale();
  const latest = useLatestBuild();
  const [updating, setUpdating] = useState(false);

  useEffect(() => {
    void fetchLatestBuild().then((id) => id && setLatestBuild(id));
  }, []);

  const stale = latest !== null && latest !== RUNNING_BUILD;
  const status =
    latest === null ? "version.checking" : stale ? "version.stale" : "version.latest";
  // Colour inline: twMerge drops var() colour classes (feedback memory).
  const tone = stale
    ? "var(--primary)"
    : latest === null
      ? "var(--muted-foreground)"
      : "var(--trading-up)";
  const StatusIcon = latest === null ? Loader2 : stale ? Sparkles : CheckCircle2;

  return (
    <section
      data-testid="app-version-card"
      className="mt-6 flex flex-col gap-4 rounded-xl border border-[var(--hairline-on-dark)] bg-[var(--surface-card-dark)] px-5 py-4"
    >
      <div className="flex items-center gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--surface-sunken-dark)]">
          <Smartphone
            className="h-5 w-5 text-[var(--muted-foreground)]"
            aria-hidden="true"
          />
        </span>
        <div className="flex min-w-0 flex-1 flex-col">
          <span
            data-testid="app-version"
            className="text-body-md text-[var(--body-on-dark)] tabular-nums"
          >
            {t("version.label", { version: APP_VERSION })}
          </span>
          <span
            data-testid="app-version-build"
            className="text-caption text-[var(--muted-foreground)] tabular-nums"
          >
            {t("version.build", { date: formatBuild(RUNNING_BUILD, locale) })}
          </span>
        </div>
        <span
          data-testid="app-version-status"
          className="flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-caption"
          style={{
            color: tone,
            background: `color-mix(in srgb, ${tone} 14%, transparent)`,
          }}
        >
          <StatusIcon
            className={`h-3.5 w-3.5 ${latest === null ? "animate-spin" : ""}`}
            aria-hidden="true"
          />
          {t(status)}
        </span>
      </div>
      {stale && (
        <Button
          data-testid="app-update-now"
          className="w-full sm:w-auto sm:self-end"
          disabled={updating}
          onClick={() => {
            setUpdating(true);
            void updateNow(latest);
          }}
        >
          {updating && (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          )}
          {t("version.updateNow")}
        </Button>
      )}
    </section>
  );
}
