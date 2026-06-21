"use client";
/**
 * instrument-search-input.tsx — Debounced instrument search (Phase 9, no-analog).
 *
 * Text input with a debounced (2s idle OR blur) suggestion dropdown. Suggestion
 * rows show symbol + name + asset-class chip. A "Custom" entry is always the
 * final row. Search hits the LOCAL Postgres instruments table
 * (GET /investments/search) — it NEVER calls a price provider (D-04). Min 2
 * chars. The input itself is the name field (testid holding-sheet-name); typing
 * a name without selecting a suggestion means a custom holding.
 */
import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Input } from "@/components/ui/input";
import { clientApiFetch } from "@/lib/budget-fetch";
import { AssetClassChip } from "./asset-class-chip";

export interface InstrumentSuggestion {
  id: string;
  symbol: string;
  displayName: string;
  assetClass: string;
  quoteCurrency?: string;
}

interface InstrumentSearchInputProps {
  name: string;
  onNameChange: (name: string) => void;
  onSelectInstrument: (instrument: InstrumentSuggestion) => void;
  onSelectCustom: () => void;
  autoFocus?: boolean;
  disabled?: boolean;
}

const DEBOUNCE_MS = 2000;
const MIN_CHARS = 2;

export function InstrumentSearchInput({
  name,
  onNameChange,
  onSelectInstrument,
  onSelectCustom,
  autoFocus,
  disabled,
}: InstrumentSearchInputProps) {
  const t = useTranslations("budget.investments.search");
  const [results, setResults] = useState<InstrumentSuggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [searched, setSearched] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  async function runSearch(q: string) {
    const query = q.trim();
    if (query.length < MIN_CHARS) {
      setResults([]);
      setOpen(false);
      return;
    }
    setLoading(true);
    setOpen(true);
    try {
      const res = await clientApiFetch(
        `/investments/search?q=${encodeURIComponent(query)}`,
        { signal: AbortSignal.timeout(7000) },
      );
      if (!res.ok) throw new Error(await res.text());
      const json = await res.json();
      setResults((json.results ?? []) as InstrumentSuggestion[]);
    } catch {
      setResults([]);
    } finally {
      setLoading(false);
      setSearched(true);
    }
  }

  // 2s idle debounce.
  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    const q = name.trim();
    if (q.length < MIN_CHARS) {
      setOpen(false);
      setResults([]);
      return;
    }
    timerRef.current = setTimeout(() => runSearch(q), DEBOUNCE_MS);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name]);

  return (
    <div className="relative">
      <Input
        data-testid="holding-sheet-name"
        autoFocus={autoFocus}
        disabled={disabled}
        value={name}
        placeholder={t("placeholder")}
        onChange={(e) => onNameChange(e.target.value)}
        onBlur={() => {
          // Blur triggers an immediate search (the 2s timer may not have fired).
          if (timerRef.current) clearTimeout(timerRef.current);
          if (name.trim().length >= MIN_CHARS) void runSearch(name);
        }}
        aria-expanded={open}
        aria-autocomplete="list"
      />
      {open && (
        <ul
          role="listbox"
          data-testid="instrument-suggestions"
          className="absolute z-50 mt-1 max-h-[240px] w-full overflow-y-auto rounded-[var(--radius-md)] border border-[var(--hairline-dark)] bg-[var(--surface-card-dark)] py-1 shadow-lg"
        >
          {loading && (
            <li className="px-3 py-2 text-body-md text-[var(--muted-foreground)]">
              {t("loading")}
            </li>
          )}
          {!loading &&
            results.map((r) => (
              <li key={r.id} role="option">
                <button
                  type="button"
                  className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-[var(--surface-elevated-dark)]"
                  onMouseDown={(e) => {
                    // mousedown (not click) so it fires before the input blur.
                    e.preventDefault();
                    onSelectInstrument(r);
                    setOpen(false);
                  }}
                >
                  <span className="text-num-sm text-[var(--muted-foreground)]">
                    {r.symbol}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-body-md text-[var(--body-on-dark)]">
                    {r.displayName}
                  </span>
                  <AssetClassChip label={r.assetClass} />
                </button>
              </li>
            ))}
          {!loading && searched && results.length === 0 && (
            <li className="px-3 py-2 text-body-md text-[var(--muted-foreground)]">
              {t("noResults")}
            </li>
          )}
          {/* Custom entry — always the final row. */}
          <li role="option">
            <button
              type="button"
              data-testid="instrument-custom-option"
              className="flex w-full items-center px-3 py-2 text-left text-body-md text-[var(--body-on-dark)] hover:bg-[var(--surface-elevated-dark)]"
              onMouseDown={(e) => {
                e.preventDefault();
                onSelectCustom();
                setOpen(false);
              }}
            >
              {t("custom")}
            </button>
          </li>
        </ul>
      )}
    </div>
  );
}
