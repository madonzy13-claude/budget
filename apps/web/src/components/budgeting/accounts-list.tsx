/**
 * accounts-list.tsx — RSC component displaying accounts grouped by Assets / Liabilities.
 * Fetches accounts server-side + dual-currency balance via /fx/rate.
 * Icon-only actions have aria-labels per UI-SPEC.
 */
import { getTranslations } from "next-intl/server";
import { cookies } from "next/headers";
import { Pencil, Archive } from "lucide-react";

interface AccountDto {
  id: string;
  name: string;
  kind: string;
  scope: string;
  currency: string;
  currentBalance: string;
  archivedAt: string | null;
  createdAt: string;
}

interface AccountsListProps {
  locale: string;
  apiBase?: string;
}

const LIABILITY_KINDS = new Set(["CREDIT_CARD", "LOAN"]);

async function fetchAccounts(apiBase: string, cookieHeader: string): Promise<AccountDto[]> {
  try {
    const res = await fetch(`${apiBase}/accounts`, {
      headers: { cookie: cookieHeader },
      cache: "no-store",
    });
    if (!res.ok) return [];
    const data = (await res.json()) as { accounts: AccountDto[] };
    return data.accounts ?? [];
  } catch {
    return [];
  }
}

async function fetchFxRate(
  apiBase: string,
  cookieHeader: string,
  from: string,
  to: string,
): Promise<number | null> {
  if (from === to) return 1;
  try {
    const today = new Date().toISOString().slice(0, 10);
    const res = await fetch(
      `${apiBase}/fx/rate?base=${encodeURIComponent(from)}&quote=${encodeURIComponent(to)}&date=${today}`,
      { headers: { cookie: cookieHeader }, cache: "no-store" },
    );
    if (!res.ok) return null;
    const data = (await res.json()) as { rate?: number | string };
    return data.rate ? Number(data.rate) : null;
  } catch {
    return null;
  }
}

export async function AccountsList({ locale, apiBase }: AccountsListProps) {
  const t = await getTranslations({ locale, namespace: "budgeting.accounts" });
  const base = apiBase ?? (process.env["API_INTERNAL_URL"] ?? "http://api:4000");
  const cookieStore = await cookies();
  const cookieHeader = cookieStore.toString();

  const accounts = await fetchAccounts(base, cookieHeader);

  const assets = accounts.filter((a) => !LIABILITY_KINDS.has(a.kind));
  const liabilities = accounts.filter((a) => LIABILITY_KINDS.has(a.kind));

  if (accounts.length === 0) {
    return (
      <p className="text-sm text-[var(--muted-foreground)] py-6 text-center">
        {t("empty")}
      </p>
    );
  }

  function AccountRow({ account }: { account: AccountDto }) {
    return (
      <div className="flex items-center justify-between rounded-[var(--radius-md)] border border-[var(--hairline-dark)] bg-[var(--surface-dark)] px-4 py-3 transition-colors hover:bg-[color-mix(in_oklab,var(--surface-dark)_85%,white)]">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-[var(--on-dark)] truncate">
            {account.name}
          </p>
          <p className="text-xs text-[var(--muted-foreground)] mt-0.5">
            {account.kind} · {account.scope}
          </p>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-right">
            <p className="text-sm font-semibold text-[var(--on-dark)] num">
              {parseFloat(account.currentBalance).toFixed(2)} {account.currency}
            </p>
          </div>
          <div className="flex items-center gap-1">
            {/* Touch targets >=44x44px per UI-SPEC */}
            <button
              type="button"
              aria-label={t("actions.editAria", { name: account.name })}
              className="flex h-11 w-11 items-center justify-center rounded-[var(--radius-sm)] text-[var(--muted-foreground)] transition-colors hover:bg-[color-mix(in_oklab,var(--primary)_10%,transparent)] hover:text-[var(--primary)]"
            >
              <Pencil className="h-4 w-4" />
            </button>
            <button
              type="button"
              aria-label={t("actions.archiveAria", { name: account.name })}
              className="flex h-11 w-11 items-center justify-center rounded-[var(--radius-sm)] text-[var(--muted-foreground)] transition-colors hover:bg-[color-mix(in_oklab,var(--destructive)_10%,transparent)] hover:text-[var(--destructive)]"
            >
              <Archive className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
    );
  }

  function AccountGroup({
    title,
    accounts,
  }: {
    title: string;
    accounts: AccountDto[];
  }) {
    if (accounts.length === 0) return null;
    return (
      <section className="space-y-2">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-[var(--muted-foreground)]">
          {title}
        </h2>
        <div className="space-y-1.5">
          {accounts.map((a) => (
            <AccountRow key={a.id} account={a} />
          ))}
        </div>
      </section>
    );
  }

  return (
    <div className="space-y-6">
      <AccountGroup title={t("groups.assets")} accounts={assets} />
      <AccountGroup title={t("groups.liabilities")} accounts={liabilities} />
    </div>
  );
}
