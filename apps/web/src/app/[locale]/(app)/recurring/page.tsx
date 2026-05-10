/**
 * RecurringPage — /[locale]/(app)/recurring (plan 02-08)
 * RSC: pre-fetches active rules + pending drafts from API and hands them to client widgets.
 */
import { getTranslations } from "next-intl/server";
import { RecurringRulesList } from "@/components/budgeting/recurring-rules-list";
import { PendingDraftsInbox } from "@/components/budgeting/pending-drafts-inbox";
import { RecurringPageClient } from "./recurring-page-client";
import { getRecurringRules, getPendingDrafts } from "./actions";

interface RecurringPageProps {
  params: Promise<{ locale: string }>;
}

export default async function RecurringPage({ params }: RecurringPageProps) {
  const { locale } = await params;
  const [t, rules, drafts] = await Promise.all([
    getTranslations({ locale, namespace: "budgeting.recurring" }),
    getRecurringRules(),
    getPendingDrafts(),
  ]);

  return (
    <main className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-[16px] font-semibold text-[var(--on-dark)]">
          {t("title")}
        </h1>
        <RecurringPageClient />
      </div>

      <section className="space-y-6">
        <div>
          <h2 className="mb-3 text-sm font-medium text-[var(--muted-foreground)]">
            {t("drafts.inboxTitle")}
          </h2>
          <PendingDraftsInbox drafts={drafts} />
        </div>
        <div>
          <h2 className="mb-3 text-sm font-medium text-[var(--muted-foreground)]">
            {t("list.title")}
          </h2>
          <RecurringRulesList rules={rules} />
        </div>
      </section>
    </main>
  );
}
