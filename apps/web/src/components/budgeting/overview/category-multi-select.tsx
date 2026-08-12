"use client";
/**
 * category-multi-select.tsx — the planned timeline's category picker (260802).
 *
 * A single-choice dropdown could only ever narrow the chart to ONE category; a
 * member who just wants Rent out of the way had no way to say so. This picks any
 * set: everything ticked — or nothing — means the whole chart.
 *
 * Ticks are collected while the panel is open and handed over when it CLOSES, so
 * a burst of changes costs one refetch instead of one per tick.
 */
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Check, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

export interface PickableCategory {
  id: string;
  name: string;
  /** Dot colour, so the list reads like the charts it filters. */
  color?: string;
}

export function CategoryMultiSelect({
  categories,
  selected,
  onCommit,
}: {
  categories: PickableCategory[];
  selected: string[];
  /** Called with the final set when the panel closes (and only if it changed). */
  onCommit: (ids: string[]) => void;
}) {
  const t = useTranslations("bdp.tab.overview");
  const all = categories.map((c) => c.id);
  // "Everything" is stored as an empty set but SHOWN as every box ticked — with
  // them unticked, clicking a row to drop that category selected it instead
  // (user report, 260802). Unticking is now what it looks like.
  const shown = (ids: string[]) => (ids.length ? ids : all);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<string[]>(() => shown(selected));

  // Follow the committed value while the panel is shut (another pane, a reset).
  useEffect(() => {
    if (!open)
      setDraft(selected.length ? selected : categories.map((c) => c.id));
  }, [selected, open, categories]);

  const picked = new Set(draft);
  const isAll = draft.length === 0 || draft.length === categories.length;
  const label = isAll
    ? t("planned.allCategories")
    : draft.length === 1
      ? (categories.find((c) => c.id === draft[0])?.name ??
        t("planned.allCategories"))
      : t("planned.categoriesPicked", { count: draft.length });

  const commit = (next: string[]) => {
    const changed =
      next.length !== selected.length ||
      next.some((id, i) => id !== selected[i]);
    if (changed) onCommit(next);
  };

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        // Closing is the commit — an empty draft means "everything".
        if (!next) commit(draft.length === categories.length ? [] : draft);
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          data-testid="overview-planned-category"
          aria-label={t("planned.category")}
          className="mx-auto flex h-9 w-fit min-w-[10rem] max-w-full items-center gap-2 rounded-full border border-[var(--hairline-dark)] bg-[var(--surface-elevated-dark)] px-3 text-num-sm text-[var(--body-on-dark)]"
        >
          {/* The label is CENTRED in the pill: it sits under a centred chart
              title, and left-aligned text beside a right-hand chevron read as
              off-centre (260802 user request). */}
          <span className="flex-1 truncate text-center">{label}</span>
          <ChevronDown
            className="h-4 w-4 shrink-0 text-[var(--muted-foreground)]"
            aria-hidden="true"
          />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="center"
        className="w-64 border-[var(--hairline-dark)] bg-[var(--surface-card-dark)] p-0"
      >
        <div className="flex items-center justify-between gap-2 border-b border-[var(--hairline-dark)] px-3 py-2 text-caption">
          <button
            type="button"
            data-testid="category-select-all"
            onClick={() => setDraft(all)}
            // Brand yellow as TEXT is unreadable on the pale card, so this
            // takes the ink that flips with the theme (user, 260810).
            className="text-[var(--accent-ink)] hover:underline"
          >
            {t("planned.selectAll")}
          </button>
          <button
            type="button"
            data-testid="category-clear-all"
            onClick={() => setDraft([])}
            className="text-[var(--muted-foreground)] hover:text-[var(--body-on-dark)] hover:underline"
          >
            {t("planned.clearAll")}
          </button>
        </div>
        <ul
          role="listbox"
          aria-multiselectable="true"
          className="max-h-64 overflow-y-auto py-1"
        >
          {categories.map((c) => {
            const on = picked.has(c.id);
            return (
              <li key={c.id}>
                <button
                  type="button"
                  role="option"
                  aria-selected={on}
                  onClick={() =>
                    setDraft((d) =>
                      d.includes(c.id)
                        ? d.filter((id) => id !== c.id)
                        : all.filter((id) => id === c.id || d.includes(id)),
                    )
                  }
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-num-sm hover:bg-[var(--surface-elevated-dark)]"
                >
                  <span
                    aria-hidden="true"
                    className={cn(
                      "flex h-4 w-4 shrink-0 items-center justify-center rounded-[4px] border",
                      on
                        ? "border-[var(--primary)] bg-[var(--primary)] text-[var(--canvas-dark)]"
                        : "border-[var(--hairline-dark)]",
                    )}
                  >
                    {on && <Check className="h-3 w-3" strokeWidth={3} />}
                  </span>
                  {c.color && (
                    <span
                      aria-hidden="true"
                      className="h-2 w-2 shrink-0 rounded-full"
                      style={{ background: c.color }}
                    />
                  )}
                  <span className="truncate text-[var(--body-on-dark)]">
                    {c.name}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </PopoverContent>
    </Popover>
  );
}
