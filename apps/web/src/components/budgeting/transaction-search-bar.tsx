"use client";

/**
 * transaction-search-bar.tsx — debounced text search input (Plan 02-09 EXPN-09).
 * Submits to parent via onChange; parent owns the URL query-param round-trip.
 * Per UI-SPEC: Inter input + Search icon prefix; placeholder + result-count caption.
 */
import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";

export interface TransactionSearchBarProps {
  /** Initial query (e.g. from URL state). */
  initialQuery?: string;
  /** Result count for caption — null/undefined hides the caption. */
  resultCount?: number;
  /** Called with the debounced trimmed query. Empty string when cleared. */
  onChange: (query: string) => void;
  /** Debounce delay in ms (default 300). Tests override to 0 for instant. */
  debounceMs?: number;
}

export function TransactionSearchBar({
  initialQuery = "",
  resultCount,
  onChange,
  debounceMs = 300,
}: TransactionSearchBarProps) {
  const t = useTranslations("budgeting.transactions.search");
  const [value, setValue] = useState(initialQuery);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      onChange(value.trim());
    }, debounceMs);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [value, debounceMs]);

  return (
    <div className="flex flex-col gap-1" data-testid="transaction-search-bar">
      <div className="relative">
        <Search
          aria-hidden
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--muted-foreground)]"
        />
        <Input
          type="search"
          aria-label={t("placeholder")}
          placeholder={t("placeholder")}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className="pl-9"
          data-testid="transaction-search-input"
        />
      </div>
      {typeof resultCount === "number" &&
        (value.trim().length > 0 || initialQuery.trim().length > 0) && (
          <p
            className="text-xs text-[var(--muted-foreground)]"
            data-testid="transaction-search-results-count"
          >
            {t("resultsCount", {
              count: resultCount,
              query: (value.trim() || initialQuery.trim()),
            })}
          </p>
        )}
    </div>
  );
}
