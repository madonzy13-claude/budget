"use client";
/**
 * updated-ago.tsx — R6 (user): under every wallet and asset name, when its
 * amount last changed ("updated 5 minutes ago"; a fetched price says "price
 * updated …"). Small and faded — information, not a control.
 */
import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { relativeAgo } from "@/lib/relative-ago";

export function UpdatedAgo({
  at,
  kind = "value",
}: {
  at: string | null | undefined;
  kind?: "value" | "price";
}) {
  const t = useTranslations("updatedAgo");
  const locale = useLocale();
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);
  if (!at) return null;
  const when = relativeAgo(new Date(at), now, locale) ?? t("justNow");
  return (
    <span
      data-testid="updated-ago"
      data-kind={kind}
      className="block text-[var(--muted-foreground)]"
      style={{ fontSize: "10px", lineHeight: 1.3, opacity: 0.5 }}
    >
      {t(kind, { when })}
    </span>
  );
}
