"use client";
/**
 * aggregate-budgets-tasks.tsx — per-budget task banner for the all-budgets page.
 * Lists every budget; clicking a budget opens its overview. Under each budget its
 * pending tasks render as draft-styled rows (sunken bg + dashed accent, like the
 * spendings drafts) showing the FULL task message (via useTaskTitle) with every
 * money amount masked as a tap-to-reveal SlotAmount; clicking a task jumps to the
 * BDP pill it belongs to (pillFor(kind)). Task lists share BdpTabs' query key.
 */
import { type ReactNode, useEffect, useState } from "react";
import { useTranslations, useLocale } from "next-intl";
import { CushionModeChip } from "@/components/budgeting/cushion-mode-chip";
import { Loader2 } from "lucide-react";
import Link, { useLinkStatus } from "next/link";
import { useRouter } from "next/navigation";
import { ChevronRight } from "lucide-react";
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

// Recessed task lane — same soft inset shadow the settings accordion sections
// use (top only, gentle; bottom shadow essentially absent).
const LANE =
  "bg-[var(--surface-sunken-dark)] px-4 py-2.5 shadow-[inset_0_4px_8px_-2px_rgba(0,0,0,0.22)]";

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
        className="mt-[0.5em] size-1.5 shrink-0 rounded-full bg-[var(--trading-down)]"
        aria-hidden="true"
      />
      {/* Wrap (no truncate) so the full task message shows. */}
      <span className="num min-w-0 flex-1 whitespace-normal break-words">
        {maskAmounts(title, amounts)}
      </span>
    </div>
  );
}

/**
 * The row's trailing mark: a chevron at rest, a spinner while the row's own
 * navigation is in flight.
 *
 * Leaving this page goes to the server, and until the new route commits nothing
 * on screen moved — the row sat there and the app read as frozen (user,
 * 260905). The feedback belongs on the row the finger landed on, in the place
 * the chevron already occupies, so the row's contents do not shift at the very
 * moment it should look settled.
 *
 * `useLinkStatus` is Next's own per-link pending flag and only works INSIDE the
 * Link, which is why this is a child component rather than state in BudgetRow —
 * and why there is no click handler, timer or cleanup to get wrong.
 */
function RowTrailing({
  cushionMode,
  taskCount,
  tapped,
}: {
  cushionMode: boolean;
  taskCount: number;
  /** The row was tapped — see BudgetRow for why the tap, and not only the
   *  router's own pending flag, drives this. */
  tapped: boolean;
}) {
  const { pending } = useLinkStatus();
  const busy = pending || tapped;
  return (
    <span
      data-testid="aggregate-bt-trailing"
      // The cluster, not the icon: an aria-hidden spinner cannot carry it, and
      // the Link itself is outside this component — useLinkStatus only reports
      // from within.
      aria-busy={busy || undefined}
      className="flex shrink-0 items-center gap-2"
    >
      {/* Right-aligned, ahead of the task count — the same slot and the same
          order the switcher's dropdown puts it in, so the two lists of
          budgets read identically (user, 260905). */}
      {cushionMode && <CushionModeChip />}
      {taskCount > 0 && (
        <span className="num rounded-[var(--radius-pill)] bg-[var(--trading-down)] px-1.5 text-[11px] font-semibold text-white">
          {taskCount}
        </span>
      )}
      <RowTrailingMark pending={busy} />
    </span>
  );
}

function RowTrailingMark({ pending }: { pending: boolean }) {
  return pending ? (
    <Loader2
      data-testid="aggregate-bt-spinner"
      aria-hidden="true"
      // Reduced motion gets the gentler pulse rather than nothing: the row still
      // has to say it is working.
      className="size-4 animate-spin text-[var(--primary)] motion-reduce:animate-pulse"
    />
  ) : (
    <ChevronRight
      data-testid="aggregate-bt-chevron"
      aria-hidden="true"
      className="size-4 text-[var(--muted-foreground)]"
    />
  );
}

function BudgetRow({
  id,
  name,
  cushionMode,
  locale,
}: {
  id: string;
  name: string;
  /** Running on its cushion limits — the totals above this list count its
   *  cushion wallets, so the row says which budget that was (user, 260904l). */
  cushionMode: boolean;
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

  /**
   * The tap starts the spinner, not just the router's `pending`.
   *
   * On this app the destination is usually served by the SERVICE WORKER, so the
   * router transition finishes in milliseconds and `pending` may never be seen
   * — measured on the dev stack, where the RSC request never reached the
   * network at all. What a member actually waits through is tap → the
   * destination's first paint, which is wider than the transition.
   *
   * It ends when this row unmounts, which is what leaving the page does. The
   * timer is only for a navigation that never happens — a cancelled one, or a
   * modified click that opened a new tab — so the row cannot spin for ever.
   */
  const [tapped, setTapped] = useState(false);
  useEffect(() => {
    if (!tapped) return;
    const id = setTimeout(() => setTapped(false), 8000);
    return () => clearTimeout(id);
  }, [tapped]);

  return (
    <div>
      {/* Budget header band (card surface) — name vertically centered. */}
      <Link
        href={`/${locale}/budgets/${id}/overview`}
        className={HEADER}
        data-testid={`aggregate-bt-budget-${id}`}
        onClick={() => setTapped(true)}
      >
        <span className="min-w-0 flex-1 truncate text-sm font-semibold text-[var(--body)]">
          {name}
        </span>
        {/* The row has always been a link and read as a plain section label —
            nothing on it said it could be tapped (user, 260902). The chevron is
            the cue, and it sits on EVERY budget, with or without a badge: on
            the one budget that has no tasks it would otherwise look like part
            of the badge rather than part of the row. Decorative — the link
            already announces the budget's name, and an icon with its own
            accessible name would have it read twice. */}
        <RowTrailing
          cushionMode={cushionMode}
          taskCount={list.length}
          tapped={tapped}
        />
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
        <div
          className={`flex items-center gap-2 text-caption text-[var(--muted-foreground)] ${LANE}`}
        >
          <span
            className="size-1.5 shrink-0 rounded-full bg-[var(--trading-up)]"
            aria-hidden="true"
          />
          {t("no_tasks")}
        </div>
      )}
    </div>
  );
}

export function AggregateBudgetsTasks({
  budgets,
}: {
  budgets: { id: string; name: string; cushionMode?: boolean }[];
}) {
  const locale = useLocale();
  if (budgets.length === 0) return null;
  return (
    <section className={CARD} data-testid="aggregate-budgets-tasks">
      {budgets.map((b) => (
        <BudgetRow
          key={b.id}
          id={b.id}
          name={b.name}
          cushionMode={b.cushionMode ?? false}
          locale={locale}
        />
      ))}
    </section>
  );
}
