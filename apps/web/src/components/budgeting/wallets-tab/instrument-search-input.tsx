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
import { Loader2, PlusCircle } from "lucide-react";
import { Input } from "@/components/ui/input";
import { clientApiFetch } from "@/lib/budget-fetch";

/** Short, human label for a suggestion's listing venue. Manual instruments carry
 *  the exchange MIC in the provider (`manual:XWAR`); US is Finnhub; crypto/metals
 *  have no meaningful exchange (the currency alone disambiguates). */
function exchangeLabel(provider?: string): string {
  if (!provider) return "";
  if (provider.startsWith("manual:")) return provider.slice("manual:".length);
  if (provider === "finnhub") return "US";
  return "";
}

export interface InstrumentSuggestion {
  id: string;
  symbol: string;
  displayName: string;
  assetClass: string;
  quoteCurrency?: string;
  /** Price provider; 'manual' = user-priced (no free server-side source). */
  provider?: string;
  refreshCadence?: "hourly" | "daily";
  rank?: number;
}

interface InstrumentSearchInputProps {
  budgetId: string;
  name: string;
  onNameChange: (name: string) => void;
  onSelectInstrument: (instrument: InstrumentSuggestion) => void;
  onSelectCustom: () => void;
  /** asset_class filter so the autocomplete only suggests the selected type. */
  assetClass?: string;
  /** Hide the always-present "Custom" row (type-first form: custom is a separate type). */
  hideCustom?: boolean;
  /** When the search returns nothing, offer an "enter manually" row (→ onSelectCustom)
   *  so a ticker missing from the catalog can still be added by hand. */
  allowManualEntry?: boolean;
  autoFocus?: boolean;
  disabled?: boolean;
}

const DEBOUNCE_MS = 400;
const MIN_CHARS = 2;

export function InstrumentSearchInput({
  budgetId,
  name,
  onNameChange,
  onSelectInstrument,
  onSelectCustom,
  assetClass,
  hideCustom,
  allowManualEntry,
  autoFocus,
  disabled,
}: InstrumentSearchInputProps) {
  const t = useTranslations("budget.investments.search");
  const [results, setResults] = useState<InstrumentSuggestion[]>([]);
  const [loading, setLoading] = useState(false);
  // `pending` = a search is queued/running for the current query (covers the
  // debounce window too) → drives the inline spinner so typing shows feedback
  // immediately, before the request even fires.
  const [pending, setPending] = useState(false);
  const [open, setOpen] = useState(false);
  const [searched, setSearched] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  // True when `name` last changed because the user PICKED a suggestion (not
  // typed). Selecting sets the name to the instrument's display name, which would
  // otherwise re-trigger the debounced search and re-open the dropdown. Suppress
  // that one reopen; a real keystroke clears the flag.
  //
  // 260626: seed it from a PRE-FILLED name too. In edit mode the sheet opens with
  // the holding's asset name already set — that is the already-selected
  // instrument, so the debounced mount effect must NOT fire a search and "activate"
  // the field (open the dropdown / show the spinner) before the user changes
  // anything. The first real keystroke clears the flag and search resumes.
  const justSelectedRef = useRef(name.trim().length > 0);

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
      const typeParam = assetClass
        ? `&type=${encodeURIComponent(assetClass)}`
        : "";
      const res = await clientApiFetch(
        `/budgets/${budgetId}/investments/search?q=${encodeURIComponent(query)}${typeParam}`,
        { signal: AbortSignal.timeout(7000) },
      );
      if (!res.ok) throw new Error(await res.text());
      const json = await res.json();
      setResults((json.results ?? []) as InstrumentSuggestion[]);
    } catch {
      setResults([]);
    } finally {
      setLoading(false);
      setPending(false);
      setSearched(true);
    }
  }

  // Idle debounce. `pending` flips true the moment a valid query is typed so the
  // spinner shows during the debounce wait, not only once the fetch starts.
  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (justSelectedRef.current) {
      // Name was set by a selection → keep the dropdown closed, don't re-search.
      setOpen(false);
      setPending(false);
      return;
    }
    const q = name.trim();
    if (q.length < MIN_CHARS) {
      setOpen(false);
      setResults([]);
      setPending(false);
      return;
    }
    setPending(true);
    timerRef.current = setTimeout(() => runSearch(q), DEBOUNCE_MS);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [name]);

  return (
    <div className="relative">
      <Input
        data-testid="holding-sheet-name"
        autoFocus={autoFocus}
        disabled={disabled}
        value={name}
        placeholder={t("placeholder")}
        onChange={(e) => {
          justSelectedRef.current = false; // a real keystroke → search again
          onNameChange(e.target.value);
        }}
        onBlur={() => {
          // Close on blur so the absolute suggestion overlay never covers the
          // fields below it (Type / Group). A short delay lets an option's
          // onMouseDown fire first. The 2s idle debounce is the open trigger;
          // blur no longer re-runs a search (that re-opened the overlay and
          // swallowed clicks on the Type dropdown).
          if (timerRef.current) clearTimeout(timerRef.current);
          window.setTimeout(() => setOpen(false), 120);
        }}
        aria-expanded={open}
        aria-autocomplete="list"
      />
      {(pending || loading) && name.trim().length >= MIN_CHARS && (
        <Loader2
          data-testid="instrument-search-spinner"
          aria-label={t("loading")}
          className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-[var(--muted-foreground)]"
        />
      )}
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
                    justSelectedRef.current = true; // suppress the reopen-search
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
                  {/* Exchange + currency so cross-listings of the same ticker
                      (e.g. SPCX on NASDAQ/SIX/TSX) are distinguishable. Crypto
                      has no meaningful venue and one global quote, so the
                      currency just adds noise — omit it (UAT). */}
                  <span className="shrink-0 whitespace-nowrap text-num-sm text-[var(--muted-foreground)]">
                    {[
                      exchangeLabel(r.provider),
                      r.assetClass === "crypto" ? "" : r.quoteCurrency,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                </button>
              </li>
            ))}
          {!loading &&
            searched &&
            results.length === 0 &&
            !allowManualEntry && (
              <li className="px-3 py-2 text-body-md text-[var(--muted-foreground)]">
                {t("noResults")}
              </li>
            )}
          {/* "Enter manually" — ALWAYS the last item (even with suggestions), set
              off by a divider + accent so it reads as a distinct action (add a
              ticker the catalog doesn't list), not just another suggestion. */}
          {!loading && searched && allowManualEntry && (
            <li
              role="option"
              className="mt-1 border-t border-[var(--hairline-dark)]"
            >
              <button
                type="button"
                data-testid="instrument-manual-entry-option"
                className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-[var(--primary)] hover:bg-[var(--surface-elevated-dark)]"
                onMouseDown={(e) => {
                  e.preventDefault();
                  justSelectedRef.current = true;
                  onSelectCustom();
                  setOpen(false);
                }}
              >
                <PlusCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span className="flex min-w-0 flex-col">
                  <span className="text-body-md font-medium">
                    {t("enterManually")}
                  </span>
                  <span className="truncate text-caption text-[var(--muted-foreground)]">
                    {results.length === 0
                      ? t("noResults")
                      : t("enterManuallyHint")}
                  </span>
                </span>
              </button>
            </li>
          )}
          {/* Custom entry — final row (hidden in the type-first form where custom
              types are picked from the Type dropdown instead). */}
          {!hideCustom && (
            <li role="option">
              <button
                type="button"
                data-testid="instrument-custom-option"
                className="flex w-full items-center px-3 py-2 text-left text-body-md text-[var(--body-on-dark)] hover:bg-[var(--surface-elevated-dark)]"
                onMouseDown={(e) => {
                  e.preventDefault();
                  justSelectedRef.current = true;
                  onSelectCustom();
                  setOpen(false);
                }}
              >
                {t("custom")}
              </button>
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
