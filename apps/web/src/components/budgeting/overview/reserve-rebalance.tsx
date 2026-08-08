"use client";
/**
 * reserve-rebalance.tsx — moving the money the fit chart asked for (260805).
 *
 * The chart next to this button says which buffers are the wrong size; this is
 * where they are put right, without leaving the Overview for the Reserves tab.
 *
 * Shape, mirroring the one-off dialog it sits beside:
 *   - ONE icon button in the chart's top-LEFT corner, opposite the one-offs.
 *   - One row per reserve, carrying what it HOLDS, an arrow, and what it SHOULD
 *     hold. The target starts at the history's answer and is editable, because
 *     the household sometimes knows better than the walk does.
 *   - One button per row, and it is the whole interaction: move the money, or
 *     take the move back. A reserve already on its target has that button
 *     visibly inert — "nothing to do here" has to look different from "not done
 *     yet" (user, 260805).
 *   - The queue is ordered short → fat → settled ONCE, when the dialog opens,
 *     and then holds. It used to re-file itself after every move, which slid
 *     the next row under the finger already going for it and lost the reader
 *     their place in a list they were working down (user, 260805). Open it
 *     again for a fresh queue.
 */
import * as React from "react";
import { useTranslations } from "next-intl";
import { ArrowRight, Scale } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { reserveFitColor } from "@/components/budgeting/charts/diverging-bar-chart";
import { centsToBare } from "@/lib/cents-format";
import {
  parseTargetCents,
  rebalanceBand,
  rebalanceButton,
  rebalanceRowPct,
  sortRebalanceRows,
  type RebalanceRow,
} from "@/lib/reserve-rebalance";

export interface RebalanceCandidate {
  categoryId: string;
  name: string;
  /** What the engine says the category holds right now. */
  heldCents: number;
  /** What its history asked for — the target's starting point. */
  neededCents: number;
}

/** What a move in this dialog did, so it can be taken back. */
interface Applied {
  /** The reserve before the FIRST move — undo returns here, not to the middle
   *  of a series of tries. */
  baselineCents: number;
  /** What the server settled on. Not always the target: a raise that covered
   *  this month's overspend lands below it. */
  currentCents: number;
}

/** The editable field wants a bare decimal, not a grouped one — a thousands
 *  separator is one more thing for the parser to strip and for the member to
 *  fight with when they select-all and retype. */
function toInput(cents: number): string {
  return centsToBare(String(Math.round(cents))).replace(/[^0-9.]/g, "");
}

export function ReserveRebalance({
  rows,
  onRebalance,
  format,
}: {
  rows: RebalanceCandidate[];
  /** Sets one category's reserve to `targetCents`; resolves with the reserve
   *  the server actually settled on. */
  onRebalance: (categoryId: string, targetCents: number) => Promise<number>;
  format: (cents: number) => string;
}) {
  const t = useTranslations("bdp.tab.overview");
  const [open, setOpen] = React.useState(false);
  const [drafts, setDrafts] = React.useState<Record<string, string>>({});
  const [targets, setTargets] = React.useState<Record<string, number>>({});
  const [applied, setApplied] = React.useState<Record<string, Applied>>({});
  /** How much of a move the engine spent covering outstanding overspend rather
   *  than putting in the buffer — see the note under the row. */
  const [covered, setCovered] = React.useState<Record<string, number>>({});
  const [busy, setBusy] = React.useState<string | null>(null);
  /** The queue as it stood when the dialog opened. Null until first opened. */
  const [order, setOrder] = React.useState<string[] | null>(null);

  const state: RebalanceRow[] = rows.map((r) => ({
    categoryId: r.categoryId,
    name: r.name,
    currentCents: applied[r.categoryId]?.currentCents ?? r.heldCents,
    targetCents: targets[r.categoryId] ?? r.neededCents,
    baselineCents: applied[r.categoryId]?.baselineCents ?? null,
  }));

  // The queue is settled ONCE, when the dialog opens, and then holds. Re-filing
  // a row the moment it is acted on slides the next one under the finger that
  // is already going for it, and the reader loses their place in a list they
  // were working down (user, 260805). Open it again for a fresh queue.
  // A category that arrived since (a refetch) is appended rather than dropped.
  const byId = new Map(state.map((r) => [r.categoryId, r]));
  const shown: RebalanceRow[] = order
    ? [
        ...order
          .map((id) => byId.get(id))
          .filter((r): r is RebalanceRow => r !== undefined),
        ...state.filter((r) => !order.includes(r.categoryId)),
      ]
    : sortRebalanceRows(state);

  if (rows.length === 0) return null;

  const run = async (row: RebalanceRow) => {
    const { kind } = rebalanceButton(row);
    setBusy(row.categoryId);
    try {
      if (kind === "undo") {
        const back = row.baselineCents ?? row.currentCents;
        await onRebalance(row.categoryId, back);
        setApplied((a) => {
          const next = { ...a };
          delete next[row.categoryId];
          return next;
        });
        setCovered((c) => {
          const next = { ...c };
          delete next[row.categoryId];
          return next;
        });
      } else {
        const settled = await onRebalance(row.categoryId, row.targetCents);
        setApplied((a) => ({
          ...a,
          [row.categoryId]: {
            baselineCents:
              a[row.categoryId]?.baselineCents ?? row.currentCents,
            currentCents: settled,
          },
        }));
        // A raise pays off outstanding overspend before it builds the buffer,
        // so the reserve can land BELOW what was asked for. Without saying so
        // the press looks like it did nothing at all — the bar is still short,
        // and nothing on the row explains why (260805).
        const shortfall = row.targetCents - settled;
        setCovered((c) => {
          const next = { ...c };
          if (shortfall > 0) next[row.categoryId] = shortfall;
          else delete next[row.categoryId];
          return next;
        });
      }
    } catch {
      // The mutation owns the message. Leaving the row as it was keeps the
      // button offering the same move rather than claiming one happened.
    } finally {
      setBusy(null);
    }
  };

  // Every row's "what it holds now" gets ONE width, sized to the widest of them
  // — the arrows and the fields then land on a single line down the dialog
  // without any row carrying more empty space than the widest figure needs. A
  // 1fr column did align them, but it handed the short rows a hundred px of
  // indent and the numbers read as adrift from the name above (user, 260805).
  // `num` is tabular, so a character really is a `ch`.
  const currentCh =
    Math.max(5, ...shown.map((r) => format(r.currentCents).length)) + 0.5;

  // A plain function, NOT a nested component: a component declared inside this
  // one gets a fresh identity every render, so React tears the row down and
  // builds it again — and the target field being typed into goes with it, one
  // keystroke in (260805).
  const renderRow = (row: RebalanceRow) => {
    const band = rebalanceBand(row.currentCents, row.targetCents);
    const color = reserveFitColor(rebalanceRowPct(row));
    const { kind, disabled } = rebalanceButton(row);
    return (
      <li
        key={row.categoryId}
        data-testid={`reserve-rebalance-row-${row.categoryId}`}
        data-category={row.categoryId}
        data-band={band}
        data-color={color}
        // The same 2px accent the category rows carry elsewhere, in the colour
        // this reserve's own bar is drawn in (user, 260805).
        style={{ borderLeftColor: color }}
        className="flex flex-col gap-1.5 rounded-[var(--radius-md)] border-l-2 bg-[var(--surface-card-dark)] px-3 py-2.5"
      >
        {/* The name shares its line with the BUTTON, and the line below ends
            with the field: both run flush to the card's right edge, so the two
            lines read as one block (user, 260808). One line for all three does
            not fit a 390px phone — the widest figure alone is a third of it —
            and "Збалансувати" is twice the width of "Rebalance". */}
        <div className="flex items-center justify-between gap-2">
          <span className="truncate text-num-sm">{row.name}</span>
          <Button
            type="button"
            size="sm"
            // Both states are BUTTONS. Undo was a ghost, which on a dark card
            // is bare text and read as a link — it undoes a money move and has
            // to look as pressable as what it replaced (user, 260805).
            variant={kind === "undo" ? "outline" : "secondary"}
            data-testid={`reserve-rebalance-action-${row.categoryId}`}
            data-kind={kind}
            disabled={disabled || busy === row.categoryId}
            title={disabled ? t("reserveFit.nothingToMove") : undefined}
            aria-label={t(
              kind === "undo"
                ? "reserveFit.undoAria"
                : "reserveFit.rebalanceAria",
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
        {/* What it holds and what it should hold. The move figure that used to
            close this line is gone: it restated the difference between the two
            figures already on it. */}
        <div className="flex items-center gap-2">
          <span
            data-testid={`reserve-rebalance-current-${row.categoryId}`}
            style={{ width: `${currentCh}ch` }}
            className="num shrink-0 truncate text-num-sm text-[var(--muted-foreground)]"
          >
            {format(row.currentCents)}
          </span>
          <ArrowRight
            aria-hidden
            className="size-3 shrink-0 text-[var(--muted-foreground)]"
          />
          <Input
            data-testid={`reserve-rebalance-target-${row.categoryId}`}
            type="text"
            inputMode="decimal"
            aria-label={t("reserveFit.targetAria", { name: row.name })}
            value={drafts[row.categoryId] ?? toInput(row.targetCents)}
            onChange={(e) => {
              const text = e.target.value;
              setDrafts((d) => ({ ...d, [row.categoryId]: text }));
              const cents = parseTargetCents(text);
              // Half-typed text ("12.") keeps the last good target rather than
              // reading as a different amount for a keystroke.
              if (cents !== null)
                setTargets((g) => ({ ...g, [row.categoryId]: cents }));
            }}
            // A fixed field pushed to the right edge, under the button that
            // acts on it. flex-1 swallowed the row instead.
            className="ml-auto h-8 w-[7.5rem] shrink-0 text-right text-num-sm"
          />
        </div>
        {covered[row.categoryId] !== undefined && (
          <p
            data-testid={`reserve-rebalance-covered-${row.categoryId}`}
            className="text-caption text-[var(--muted-foreground)]"
          >
            {t("reserveFit.coveredOverspend", {
              amount: format(covered[row.categoryId]!),
            })}
          </p>
        )}
      </li>
    );
  };

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        data-testid="reserve-rebalance-open"
        aria-label={t("reserveFit.openRebalance")}
        onClick={() => {
          setOrder(sortRebalanceRows(state).map((r) => r.categoryId));
          setOpen(true);
        }}
      >
        <Scale aria-hidden className="size-4" />
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          data-testid="reserve-rebalance-dialog"
          // Radix would focus the first target field, and a focused decimal
          // input throws the keyboard up the moment the dialog opens on iOS.
          onOpenAutoFocus={(e) => e.preventDefault()}
          className="flex max-h-[85vh] flex-col gap-4 overflow-y-auto sm:max-w-lg"
        >
          <DialogHeader>
            <DialogTitle>{t("reserveFit.rebalanceTitle")}</DialogTitle>
            <DialogDescription>{t("reserveFit.rebalanceExplainer")}</DialogDescription>
          </DialogHeader>
          <ul className="flex flex-col gap-1.5">{shown.map(renderRow)}</ul>
        </DialogContent>
      </Dialog>
    </>
  );
}
