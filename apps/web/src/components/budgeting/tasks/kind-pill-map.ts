/**
 * kind-pill-map.ts — single source of truth for the task-kind → BDP-pill
 * relation. Imported by PillBadge, PillTaskSlider, BdpTabs. No React deps.
 *
 * Tasks-Redesign §4 (Architecture): the three current task kinds map 1:1
 * to BDP pills. Settings has no kind today; the badge wiring is generic
 * so a future kind can be added without special-casing.
 */
import type { TaskKind } from "@/components/budgeting/task-banner-row";

export type Pill = "wallets" | "spendings" | "reserves" | "settings";

export const KIND_TO_PILL = {
  RESERVE_TOPUP: "reserves",
  CUSHION_BELOW_TARGET: "wallets",
  CONFIRM_DRAFT: "spendings",
  INCOME_UNDER_PLANNED: "spendings",
} as const satisfies Record<TaskKind, Pill>;

export function pillFor(kind: TaskKind): Pill {
  return KIND_TO_PILL[kind];
}

export function kindsFor(pill: Pill): readonly TaskKind[] {
  return (Object.keys(KIND_TO_PILL) as TaskKind[]).filter(
    (k) => KIND_TO_PILL[k] === pill,
  );
}
