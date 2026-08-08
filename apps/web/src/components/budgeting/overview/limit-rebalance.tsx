"use client";
/**
 * limit-rebalance.tsx — writing the limit the Future chart asked for (260808).
 *
 * Sibling of reserve-rebalance.tsx, and deliberately the same shape: one icon
 * button in the chart's corner, one row per category, one button per row that
 * either makes the move or takes it back, and a row already where it should be
 * whose button is visibly inert.
 *
 * What differs is that a limit is two numbers. The chart's walk knows what the
 * limit has to TOTAL; it does not know which half of it is a need. So each row
 * shows what the two sides are today — figures, not fields — beside the split
 * the dialog proposes, which the member can move before committing.
 */
import * as React from "react";
import { useTranslations } from "next-intl";
import { SlidersHorizontal } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { centsToBare } from "@/lib/cents-format";
import { parseTargetCents } from "@/lib/reserve-rebalance";
import {
  limitRebalanceButton,
  proposeSplit,
  sortLimitRows,
  type LimitRow,
  type LimitSplit,
} from "@/lib/limit-rebalance";

export interface LimitCandidate {
  categoryId: string;
  name: string;
  /** What the limit is split into today. */
  needsCents: number;
  wantsCents: number;
  /** What the Future reading says the limit should total. */
  suggestedLimitCents: number;
}

/** The field wants a bare decimal — a thousands separator is one more thing to
 *  strip, and one more thing to fight when selecting all and retyping. */
function toInput(cents: number): string {
  return centsToBare(String(Math.round(cents))).replace(/[^0-9.]/g, "");
}

export function LimitRebalance({
  rows,
  onApply,
  format,
}: {
  rows: LimitCandidate[];
  /** Writes one category's new split. */
  onApply: (categoryId: string, split: LimitSplit) => Promise<void>;
  format: (cents: number) => string;
}) {
  const t = useTranslations("bdp.tab.overview");
  const [open, setOpen] = React.useState(false);
  const [drafts, setDrafts] = React.useState<
    Record<string, { needs?: string; wants?: string }>
  >({});
  const [targets, setTargets] = React.useState<Record<string, LimitSplit>>({});
  const [applied, setApplied] = React.useState<Record<string, LimitSplit>>({});
  const [busy, setBusy] = React.useState<string | null>(null);
  const [order, setOrder] = React.useState<string[] | null>(null);

  const state: LimitRow[] = rows.map((r) => {
    const proposed = proposeSplit(
      r.needsCents,
      r.wantsCents,
      r.suggestedLimitCents,
    );
    const current = applied[r.categoryId] ?? {
      needsCents: r.needsCents,
      wantsCents: r.wantsCents,
    };
    const target = targets[r.categoryId] ?? proposed;
    return {
      categoryId: r.categoryId,
      name: r.name,
      needsCents: current.needsCents,
      wantsCents: current.wantsCents,
      targetNeedsCents: target.needsCents,
      targetWantsCents: target.wantsCents,
      baseline:
        applied[r.categoryId] === undefined
          ? null
          : { needsCents: r.needsCents, wantsCents: r.wantsCents },
    };
  });

  // The queue settles ONCE, when the dialog opens, and then holds: re-filing a
  // row the moment it is acted on slides the next one under the finger already
  // going for it (the lesson from the reserve dialog, user 260805).
  const byId = new Map(state.map((r) => [r.categoryId, r]));
  const shown: LimitRow[] = order
    ? [
        ...order
          .map((id) => byId.get(id))
          .filter((r): r is LimitRow => r !== undefined),
        ...state.filter((r) => !order.includes(r.categoryId)),
      ]
    : sortLimitRows(state);

  if (rows.length === 0) return null;

  const run = async (row: LimitRow) => {
    const { kind } = limitRebalanceButton(row);
    setBusy(row.categoryId);
    try {
      if (kind === "undo") {
        const back = row.baseline ?? {
          needsCents: row.needsCents,
          wantsCents: row.wantsCents,
        };
        await onApply(row.categoryId, back);
        setApplied((a) => {
          const next = { ...a };
          delete next[row.categoryId];
          return next;
        });
      } else {
        const split = {
          needsCents: row.targetNeedsCents,
          wantsCents: row.targetWantsCents,
        };
        await onApply(row.categoryId, split);
        setApplied((a) => ({ ...a, [row.categoryId]: split }));
      }
    } catch {
      // The mutation owns the message. Leaving the row as it was keeps the
      // button offering the same move rather than claiming one happened.
    } finally {
      setBusy(null);
    }
  };

  const edit = (row: LimitRow, side: "needs" | "wants", text: string) => {
    setDrafts((d) => ({
      ...d,
      [row.categoryId]: { ...d[row.categoryId], [side]: text },
    }));
    const cents = parseTargetCents(text);
    // Half-typed text ("12.") keeps the last good figure rather than reading as
    // a different amount for one keystroke.
    if (cents === null) return;
    setTargets((g) => ({
      ...g,
      [row.categoryId]: {
        needsCents: side === "needs" ? cents : row.targetNeedsCents,
        wantsCents: side === "wants" ? cents : row.targetWantsCents,
      },
    }));
  };

  // A plain function, NOT a nested component: a component declared inside this
  // one gets a fresh identity every render, so the field being typed into is
  // torn down one keystroke in (the lesson from the reserve dialog, 260805).
  const renderRow = (row: LimitRow) => {
    const { kind, disabled } = limitRebalanceButton(row);
    const side = (
      s: "needs" | "wants",
      prevCents: number,
      targetCents: number,
    ) => (
      <div className="flex items-center gap-2">
        <span className="w-11 shrink-0 text-caption text-[var(--muted-foreground)]">
          {t(s === "needs" ? "planned.needs" : "planned.wants")}
        </span>
        <span
          data-testid={`limit-rebalance-prev-${s}-${row.categoryId}`}
          className="num truncate text-num-sm text-[var(--muted-foreground)]"
        >
          {format(prevCents)}
        </span>
        <Input
          data-testid={`limit-rebalance-${s}-${row.categoryId}`}
          type="text"
          inputMode="decimal"
          aria-label={t(
            s === "needs"
              ? "planned.rebalanceNeedsAria"
              : "planned.rebalanceWantsAria",
            { name: row.name },
          )}
          value={drafts[row.categoryId]?.[s] ?? toInput(targetCents)}
          onChange={(e) => edit(row, s, e.target.value)}
          className="ml-auto h-8 w-[7.5rem] shrink-0 text-right text-num-sm"
        />
      </div>
    );
    return (
      <li
        key={row.categoryId}
        data-testid={`limit-rebalance-row-${row.categoryId}`}
        data-category={row.categoryId}
        className="flex flex-col gap-1.5 rounded-[var(--radius-md)] bg-[var(--surface-card-dark)] px-3 py-2.5"
      >
        <div className="flex items-center justify-between gap-2">
          <span className="truncate text-num-sm">{row.name}</span>
          <Button
            type="button"
            size="sm"
            variant={kind === "undo" ? "outline" : "secondary"}
            data-testid={`limit-rebalance-action-${row.categoryId}`}
            data-kind={kind}
            disabled={disabled || busy === row.categoryId}
            title={disabled ? t("planned.nothingToChange") : undefined}
            aria-label={t(
              kind === "undo"
                ? "planned.undoLimitAria"
                : "planned.rebalanceLimitAria",
              { name: row.name },
            )}
            onClick={() => void run(row)}
            className="h-7 shrink-0 px-2.5 text-caption"
          >
            {t(
              kind === "undo"
                ? "reserveFit.undoAction"
                : "reserveFit.rebalanceAction",
            )}
          </Button>
        </div>
        {side("needs", row.needsCents, row.targetNeedsCents)}
        {side("wants", row.wantsCents, row.targetWantsCents)}
      </li>
    );
  };

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        data-testid="limit-rebalance-open"
        aria-label={t("planned.openLimitRebalance")}
        onClick={() => {
          setOrder(sortLimitRows(state).map((r) => r.categoryId));
          setOpen(true);
        }}
      >
        <SlidersHorizontal aria-hidden className="size-4" />
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          data-testid="limit-rebalance-dialog"
          // Radix would focus the first field, and a focused decimal input
          // throws the keyboard up the moment the dialog opens on iOS.
          onOpenAutoFocus={(e) => e.preventDefault()}
          className="flex max-h-[85vh] flex-col gap-4 overflow-y-auto sm:max-w-lg"
        >
          <DialogHeader>
            <DialogTitle>{t("planned.limitRebalanceTitle")}</DialogTitle>
            <DialogDescription>
              {t("planned.limitRebalanceExplainer")}
            </DialogDescription>
          </DialogHeader>
          <ul className="flex flex-col gap-1.5">{shown.map(renderRow)}</ul>
        </DialogContent>
      </Dialog>
    </>
  );
}
