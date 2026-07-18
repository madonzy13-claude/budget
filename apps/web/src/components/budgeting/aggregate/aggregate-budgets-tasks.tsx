"use client";
/**
 * aggregate-budgets-tasks.tsx — per-budget task banner for the all-budgets page.
 * Lists every budget; clicking a budget opens its overview. Under each budget its
 * pending tasks render as draft-styled rows (sunken bg + dashed accent, like the
 * spendings drafts) showing the FULL task message (via useTaskTitle) with every
 * money amount masked as a tap-to-reveal SlotAmount; clicking a task jumps to the
 * BDP pill it belongs to (pillFor(kind)). Task lists share BdpTabs' query key.
 */
import { type ReactNode } from "react";
import { useTranslations, useLocale } from "next-intl";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { clientApiFetch } from "@/lib/budget-fetch";
import { pillFor } from "@/components/budgeting/tasks/kind-pill-map";
import {
  useTaskTitle,
  type TaskSummary,
} from "@/components/budgeting/task-banner-row";
import { SlotAmount } from "@/components/budgeting/overview/slot-amount";

const CARD =
  "rounded-[var(--radius-xl)] bg-[var(--surface-card-dark)] border border-[var(--hairline-dark)] p-4 min-w-0";

/** Split a title on its money substrings, rendering each as a maskable
 *  SlotAmount so amounts hide until revealed while the words stay readable. */
function maskAmounts(title: string, amounts: string[]): ReactNode {
  const uniq = [...new Set(amounts.filter(Boolean))].sort(
    (a, b) => b.length - a.length,
  );
  if (uniq.length === 0) return title;
  const escaped = uniq.map((a) => a.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const parts = title.split(new RegExp(`(${escaped.join("|")})`, "g"));
  return parts.map((part, i) =>
    part && uniq.includes(part) ? (
      <SlotAmount key={i} value={part} />
    ) : (
      <span key={i}>{part}</span>
    ),
  );
}

function TaskLine({
  task,
  budgetId,
  locale,
}: {
  task: TaskSummary;
  budgetId: string;
  locale: string;
}) {
  const { title, amounts } = useTaskTitle(task, budgetId);
  return (
    <Link
      href={`/${locale}/budgets/${budgetId}/${pillFor(task.kind)}`}
      data-testid={`aggregate-bt-task-${task.id}`}
      className="flex min-h-9 items-center rounded-[var(--radius-lg)] border-l-[3px] border-dashed border-[var(--primary)] bg-[var(--surface-sunken-dark)] px-3 py-1.5 text-sm text-[var(--body-on-dark)] shadow-[0_1px_2px_rgba(0,0,0,0.35)] hover:bg-[var(--surface-elevated-dark)]"
    >
      <span className="num truncate">{maskAmounts(title, amounts)}</span>
    </Link>
  );
}

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
        <div className="mt-2 flex flex-col gap-1.5">
          {list.map((task) => (
            <TaskLine key={task.id} task={task} budgetId={id} locale={locale} />
          ))}
        </div>
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
  const locale = useLocale();
  if (budgets.length === 0) return null;
  return (
    <section className={CARD} data-testid="aggregate-budgets-tasks">
      <div>
        {budgets.map((b) => (
          <BudgetRow key={b.id} id={b.id} name={b.name} locale={locale} />
        ))}
      </div>
    </section>
  );
}
