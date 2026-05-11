/**
 * accounts-list.tsx — RSC component displaying accounts grouped by Assets / Liabilities.
 * Fetches accounts server-side + dual-currency balance via /fx/rate.
 * Icon-only actions have aria-labels per UI-SPEC.
 */
import { getTranslations } from "next-intl/server";
import { AccountActions } from "./account-actions";
import { serverApiFetch } from "@/lib/budget-fetch.server";

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
  wsId: string;
}

const LIABILITY_KINDS = new Set(["CREDIT_CARD", "LOAN"]);

async function fetchAccounts(wsId: string): Promise<AccountDto[]> {
  try {
    const res = await serverApiFetch(wsId, "/wallets");
    if (!res.ok) return [];
    const data = (await res.json()) as { accounts: AccountDto[] };
    return data.accounts ?? [];
  } catch {
    return [];
  }
}


export async function AccountsList({ locale, wsId }: AccountsListProps) {
  const t = await getTranslations({ locale, namespace: "budgeting.wallets" });
  const accounts = await fetchAccounts(wsId);

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
    const kindLabel = t(`kinds.${account.kind}` as never) || account.kind;
    return (
      <div className="group flex items-center justify-between rounded-lg border border-[var(--hairline-dark)] bg-[var(--surface-card-dark)] px-4 py-3.5 transition-all hover:border-[var(--primary)]/30 hover:bg-[var(--surface-elevated-dark)]">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-[var(--on-dark)] truncate">
            {account.name}
          </p>
          <p className="text-xs text-[var(--muted-foreground)] mt-1">
            {kindLabel}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right">
            <p className="text-base font-semibold text-[var(--on-dark)] num">
              {parseFloat(account.currentBalance).toFixed(2)}
            </p>
            <p className="text-xs text-[var(--muted-foreground)] num mt-0.5">
              {account.currency}
            </p>
          </div>
          <AccountActions
            accountId={account.id}
            accountName={account.name}
            editAriaLabel={t("actions.editAria", { name: account.name })}
            archiveAriaLabel={t("actions.archiveAria", { name: account.name })}
          />
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
