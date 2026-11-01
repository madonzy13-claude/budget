"use client";
/**
 * updated-ago.tsx — R6 (user, F9): right under a wallet's / asset's amount,
 * how long ago it last changed — "↻ 5m ago", small and faded. It hangs below
 * the amount (absolute), so the amount stays exactly where it was; the
 * parent amount cell is `relative`. The full sentence is its title.
 */
import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Pencil, RotateCw } from "lucide-react";
import { relativeAgo } from "@/lib/relative-ago";

export function UpdatedAgo({
  at,
  kind = "value",
  className = "",
}: {
  at: string | null | undefined;
  kind?: "value" | "price";
  /** Extra classes, e.g. hiding it where another line takes the spot. */
  className?: string;
}) {
  const t = useTranslations("updatedAgo");
  const locale = useLocale();
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);
  if (!at) return null;
  const date = new Date(at);
  const short = relativeAgo(date, now, locale, true) ?? t("justNow");
  const long = relativeAgo(date, now, locale) ?? t("justNow");
  return (
    <span
      data-testid="updated-ago"
      data-kind={kind}
      data-icon={kind === "price" ? "reload" : "pen"}
      title={t(kind, { when: long })}
      className={`pointer-events-none absolute right-0 top-full mt-[3px] flex items-center gap-[3px] whitespace-nowrap text-[var(--muted-foreground)] ${className}`}
      style={{ fontSize: "9px", lineHeight: 1.15, opacity: 0.5 }}
    >
      {/* R6 (user): ↻ for a price that updates itself, a pen for one typed. */}
      {kind === "price" ? (
        <RotateCw className="h-[8px] w-[8px] shrink-0" aria-hidden="true" />
      ) : (
        <Pencil className="h-[8px] w-[8px] shrink-0" aria-hidden="true" />
      )}
      {short}
    </span>
  );
}
