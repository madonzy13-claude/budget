/**
 * AccountsPage — /[locale]/(app)/accounts
 * RSC: heading + AccountsList + "Add account" button (opens Sheet).
 */
import { getTranslations } from "next-intl/server";
import { AccountsList } from "@/components/budgeting/accounts-list";
import { AccountFormSheet } from "@/components/budgeting/account-form-sheet";

interface AccountsPageProps {
  params: Promise<{ locale: string }>;
}

export default async function AccountsPage({ params }: AccountsPageProps) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "budgeting.accounts" });

  return (
    <main className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-[16px] font-semibold text-[var(--on-dark)]">
          {t("title")}
        </h1>
        <AccountFormSheet locale={locale} addButtonLabel={t("addButton")} />
      </div>
      <AccountsList locale={locale} />
    </main>
  );
}
