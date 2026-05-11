"use server";

/**
 * actions.ts — RSC server actions for the transactions page.
 *
 * Workspace context is passed explicitly (wsId param) and forwarded to the
 * API server via the X-Budget-ID header. The /api/currencies endpoint is
 * workspace-agnostic so it stays without a wsId.
 */
import type { CurrencyOption } from "@/components/common/currency-picker";
import { serverApiFetch } from "@/lib/budget-fetch.server";

export async function getSupportedCurrencies(): Promise<CurrencyOption[]> {
  try {
    const res = await serverApiFetch(null, "/currencies", {
      next: { revalidate: 300 } as RequestInit["next"],
    } as RequestInit);
    if (!res.ok) return getDefaultCurrencies();
    const data = (await res.json()) as { currencies: CurrencyOption[] };
    return data.currencies ?? getDefaultCurrencies();
  } catch {
    return getDefaultCurrencies();
  }
}

export interface AccountOption {
  id: string;
  name: string;
  currency: string;
}

export interface CategoryOption {
  id: string;
  name: string;
}

export async function getAccountsForForm(wsId: string): Promise<AccountOption[]> {
  try {
    const res = await serverApiFetch(wsId, "/wallets");
    if (!res.ok) return [];
    const data = (await res.json()) as {
      accounts: Array<{ id: string; name: string; currency: string; archivedAt: string | null }>;
    };
    return (data.accounts ?? [])
      .filter((a) => !a.archivedAt)
      .map((a) => ({ id: a.id, name: a.name, currency: a.currency }));
  } catch {
    return [];
  }
}

export async function getCategoriesForForm(wsId: string): Promise<CategoryOption[]> {
  try {
    const res = await serverApiFetch(wsId, "/categories");
    if (!res.ok) return [];
    const data = (await res.json()) as {
      categories: Array<{ id: string; name: string; archivedAt: string | null }>;
    };
    return (data.categories ?? [])
      .filter((c) => !c.archivedAt)
      .map((c) => ({ id: c.id, name: c.name }));
  } catch {
    return [];
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
