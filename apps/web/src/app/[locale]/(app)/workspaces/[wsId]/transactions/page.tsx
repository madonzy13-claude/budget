import { Suspense } from "react";
import { getTranslations } from "next-intl/server";
import { TransactionList } from "@/components/budgeting/transaction-list";
import { TransactionCaptureSheet } from "@/components/budgeting/transaction-capture-sheet";
import {
  getSupportedCurrencies,
  getAccountsForForm,
  getCategoriesForForm,
} from "../../../transactions/actions";

interface TransactionsPageProps {
  params: Promise<{ locale: string; wsId: string }>;
}

export default async function TransactionsPage({ params }: TransactionsPageProps) {
  const { locale, wsId } = await params;
  const [t, currencies, accounts, categories] = await Promise.all([
    getTranslations({ locale, namespace: "budgeting.transactions" }),
    getSupportedCurrencies(),
    getAccountsForForm(wsId),
    getCategoriesForForm(wsId),
  ]);

  return (
    <main className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-[16px] font-semibold text-[var(--on-dark)]">
          {t("title")}
        </h1>
        <TransactionCaptureSheet
          currencies={currencies}
          accounts={accounts}
          categories={categories}
          addButtonLabel={t("addButton")}
          locale={locale}
        />
      </div>

      <Suspense
        fallback={
          <div className="rounded-xl bg-[var(--surface-card-dark)] px-6 py-10 text-center">
            <p className="text-sm text-[var(--muted-foreground)]">Loading…</p>
          </div>
        }
      >
        <TransactionList locale={locale} wsId={wsId} />
      </Suspense>
    </main>
  );
}
