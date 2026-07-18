"use client";
/**
 * aggregate-budgets-tasks.tsx — per-budget task banner for the all-budgets page.
 * Lists every budget; clicking a budget opens its overview. Under each budget its
 * pending tasks render as draft-styled rows (sunken bg + dashed accent, like the
 * spendings drafts) showing the FULL task message (via useTaskTitle) with every
 * money amount masked as a tap-to-reveal SlotAmount; clicking a task jumps to the
 * BDP pill it belongs to (pillFor(kind)). Task lists share BdpTabs' query key.
 */
import { type ReactNode, useEffect } from "react";
import { useTranslations, useLocale } from "next-intl";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { clientApiFetch } from "@/lib/budget-fetch";
import { pillFor } from "@/components/budgeting/tasks/kind-pill-map";
import {
  useTaskTitle,
  type TaskSummary,
} from "@/components/budgeting/task-banner-row";
import { SlotAmount } from "@/components/budgeting/overview/slot-amount";

// The whole banner is edge-to-edge alternating bands (NO card padding, so no
// extra top padding above the first header and no grey strip below the last
// lane). overflow-hidden clips the bands to the rounded corners.
const CARD =
  "overflow-hidden rounded-[var(--radius-xl)] bg-[var(--surface-card-dark)] border border-[var(--hairline-dark)] min-w-0";

// Budget header band — its own py so the name is vertically centered/aligned.
const HEADER = "flex items-center justify-between gap-2 px-4 py-3";

// Recessed task lane (full banner width, own padding) with an inset top+bottom
// shadow so it reads as sunk beneath the header bands.
const LANE =
  "bg-[var(--surface-sunken-dark)] px-4 py-2.5 shadow-[inset_0_3px_5px_-3px_rgba(0,0,0,0.6),inset_0_-3px_5px_-3px_rgba(0,0,0,0.6)]";

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
  const router = useRouter();
  const { title, amounts } = useTaskTitle(task, budgetId);
  const href = `/${locale}/budgets/${budgetId}/${pillFor(task.kind)}`;
  // Warm the destination so the tap navigates instantly (a <Link> would prefetch
  // for us, but we can't use one here — see below).
  useEffect(() => {
    router.prefetch(href);
  }, [href, router]);
  // NOT an <a>: a native anchor navigates on any child click, so tapping a
  // blurred amount jumped to the budget instead of revealing it. A div + router
  // lets the amount's SlotAmount (which stopPropagation()s) reveal in place,
  // while a tap anywhere else on the row navigates to the task's pill.
  return (
    <div
      role="link"
      tabIndex={0}
      data-testid={`aggregate-bt-task-${task.id}`}
      onClick={() => router.push(href)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          router.push(href);
        }
      }}
      className="flex min-h-7 cursor-pointer items-start gap-2 text-sm text-[var(--muted-foreground)] hover:text-[var(--primary)]"
    >
      <span
        className="mt-[0.5em] size-1 shrink-0 rounded-full bg-[var(--primary)]"
        aria-hidden="true"
      />
      {/* Wrap (no truncate) so the full task message shows. */}
      <span className="num min-w-0 flex-1 whitespace-normal break-words">
        {maskAmounts(title, amounts)}
      </span>
    </div>
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
    <div>
      {/* Budget header band (card surface) — name vertically centered. */}
      <Link
        href={`/${locale}/budgets/${id}/overview`}
        className={HEADER}
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
      {/* Both the task list AND the empty "no tasks" note drop to the recessed
          full-width lane, flush under the header. */}
      {list.length > 0 ? (
        <div className={`flex flex-col gap-2 ${LANE}`}>
          {list.map((task) => (
            <TaskLine key={task.id} task={task} budgetId={id} locale={locale} />
          ))}
        </div>
      ) : (
        <p className={`text-caption text-[var(--muted-foreground)] ${LANE}`}>
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
      {budgets.map((b) => (
        <BudgetRow key={b.id} id={b.id} name={b.name} locale={locale} />
      ))}
    </section>
  );
}
