"use client";
/**
 * aggregate-budgets-tasks.tsx — "Budgets & tasks" banner for the all-budgets
 * page. Lists every budget; clicking a budget opens its overview. Under each
 * budget its pending tasks are listed; clicking a task jumps straight to the
 * BDP pill that task belongs to (pillFor(kind)). Task lists are fetched per
 * budget with the SAME query key BdpTabs uses, so the cache is shared.
 */
import { useTranslations, useLocale } from "next-intl";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { clientApiFetch } from "@/lib/budget-fetch";
import { pillFor } from "@/components/budgeting/tasks/kind-pill-map";
import type { TaskSummary } from "@/components/budgeting/task-banner-row";

const CARD =
  "rounded-[var(--radius-xl)] bg-[var(--surface-card-dark)] border border-[var(--hairline-dark)] p-4 min-w-0";

function BudgetRow({
  id,
  name,
  locale,
}: {
  id: string;
  name: string;
  locale: string;
}) {
  const t = useTranslations("aggregate");
  const { data: tasks } = useQuery({
    queryKey: ["tasks", id, "pending"],
    queryFn: async (): Promise<TaskSummary[]> => {
      // On the all-budgets page the pathname carries no budget id, so
      // clientApiFetch can't auto-set X-Budget-ID (the tenant guard needs it) —
      // set it explicitly to THIS budget or the tasks route 404s → empty.
      const res = await clientApiFetch(`/budgets/${id}/tasks?status=pending`, {
        headers: { "X-Budget-ID": id },
      });
      if (!res.ok) return [];
      const body = (await res.json()) as { tasks?: TaskSummary[] };
      return body.tasks ?? [];
    },
  });
  const list = tasks ?? [];

  return (
    <div className="border-b border-[var(--hairline-dark)] py-2.5 last:border-0">
      <Link
        href={`/${locale}/budgets/${id}/overview`}
        className="flex items-center justify-between gap-2"
        data-testid={`aggregate-bt-budget-${id}`}
      >
        <span className="truncate text-sm font-semibold text-[var(--body)]">
          {name}
        </span>
        {list.length > 0 && (
          <span className="num shrink-0 rounded-[var(--radius-pill)] bg-[var(--primary)] px-1.5 text-[11px] font-semibold text-[var(--on-primary)]">
            {list.length}
          </span>
        )}
      </Link>
      {list.length > 0 ? (
        <ul className="mt-1.5 space-y-1">
          {list.map((task) => (
            <li key={task.id}>
              <Link
                href={`/${locale}/budgets/${id}/${pillFor(task.kind)}`}
                className="flex items-center gap-2 text-caption text-[var(--muted-foreground)] hover:text-[var(--body)]"
                data-testid={`aggregate-bt-task-${task.id}`}
              >
                <span
                  className="size-1.5 shrink-0 rounded-full bg-[var(--primary)]"
                  aria-hidden="true"
                />
                <span className="truncate">{t(`task_kind.${task.kind}`)}</span>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-0.5 text-caption text-[var(--muted-foreground)]">
          {t("no_tasks")}
        </p>
      )}
    </div>
  );
}

export function AggregateBudgetsTasks({
  budgets,
}: {
  budgets: { id: string; name: string }[];
}) {
  const t = useTranslations("aggregate");
  const locale = useLocale();
  if (budgets.length === 0) return null;
  return (
    <section className={CARD} data-testid="aggregate-budgets-tasks">
      <p className="mb-1 text-sm font-semibold text-[var(--body)]">
        {t("budgets_tasks_title")}
      </p>
      <div>
        {budgets.map((b) => (
          <BudgetRow key={b.id} id={b.id} name={b.name} locale={locale} />
        ))}
      </div>
    </section>
  );
}
