"use server";

/**
 * actions.ts — RSC server actions for the transactions page.
 *
 * getSupportedCurrencies() fetches the allowlist from /api/currencies (API-level server action).
 * Result is passed as a prop to <TransactionCaptureForm currencies={...} />
 * so the currency picker has its options at render time (no client-side fetch race).
 *
 * We use fetch() rather than direct DB access here because the web app does not
 * depend on @budget/budgeting packages directly (that would bundle DB client code
 * into the Next.js build). The /api/currencies endpoint calls listSupportedCurrencies()
 * via the booted budgeting module.
 */
import type { CurrencyOption } from "@/components/common/currency-picker";

export async function getSupportedCurrencies(): Promise<CurrencyOption[]> {
  try {
    // API_URL is set in Docker deployments; falls back to localhost for local dev.
    const apiBase =
      process.env.INTERNAL_API_URL ??
      process.env.NEXT_PUBLIC_API_URL ??
      "http://localhost:3001";
    const res = await fetch(`${apiBase}/api/currencies`, {
      next: { revalidate: 300 }, // cache for 5 minutes
    });
    if (!res.ok) return getDefaultCurrencies();
    const data = (await res.json()) as { currencies: CurrencyOption[] };
    return data.currencies ?? getDefaultCurrencies();
  } catch {
    return getDefaultCurrencies();
  }
}

/** Fallback list when API is unavailable (avoids empty picker on server errors). */
function getDefaultCurrencies(): CurrencyOption[] {
  return [
    { value: "USD", label: "US Dollar", symbol: "$", kind: "FIAT" },
    { value: "EUR", label: "Euro", symbol: "€", kind: "FIAT" },
    { value: "PLN", label: "Polish Złoty", symbol: "zł", kind: "FIAT" },
    { value: "GBP", label: "British Pound", symbol: "£", kind: "FIAT" },
    { value: "UAH", label: "Ukrainian Hryvnia", symbol: "₴", kind: "FIAT" },
    { value: "CHF", label: "Swiss Franc", symbol: "Fr", kind: "FIAT" },
    { value: "JPY", label: "Japanese Yen", symbol: "¥", kind: "FIAT" },
    { value: "NOK", label: "Norwegian Krone", symbol: "kr", kind: "FIAT" },
  ];
}
