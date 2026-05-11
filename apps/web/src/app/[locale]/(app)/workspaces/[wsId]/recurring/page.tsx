import { getTranslations } from "next-intl/server";
import { RecurringRulesList } from "@/components/budgeting/recurring-rules-list";
import { PendingDraftsInbox } from "@/components/budgeting/pending-drafts-inbox";
import { RecurringPageClient } from "../../../recurring/recurring-page-client";
import { getRecurringRules, getPendingDrafts } from "../../../recurring/actions";

interface RecurringPageProps {
  params: Promise<{ locale: string; wsId: string }>;
}

export default async function RecurringPage({ params }: RecurringPageProps) {
  const { locale, wsId } = await params;
  const [t, rules, drafts] = await Promise.all([
    getTranslations({ locale, namespace: "budgeting.recurring" }),
    getRecurringRules(wsId),
    getPendingDrafts(wsId),
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
