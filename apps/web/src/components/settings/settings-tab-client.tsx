"use client";
/**
 * settings-tab-client.tsx — client-data wrapper for the Settings tab (SPA
 * refactor 260616).
 *
 * The page is now a static shell; this island fetches the budget meta via
 * useBudget (GET /budgets/:id) and maps it to SettingsBudget, so returning to
 * Settings renders instantly from the warm/persisted React Query cache instead
 * of flashing loading.tsx on a per-soft-nav server fetch. SettingsAccordion
 * keeps its plain prop API (and its tests) unchanged.
 */
import { useBudget } from "@/hooks/use-budget-data";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { isRestoreComplete } from "@/lib/query-persist";
import {
  SettingsAccordion,
  type SettingsBudget,
} from "@/components/settings/settings-accordion";

interface BudgetApiShape {
  id?: string;
  name?: string;
  kind?: "SHARED" | "PRIVATE";
  defaultCurrency?: string;
  default_currency?: string;
  cushionModeEnabled?: boolean;
  cushion_mode_enabled?: boolean;
  cushionEnabled?: boolean;
  cushion_enabled?: boolean;
  cushionTargetMonths?: number;
  cushion_target_months?: number;
  investmentsEnabled?: boolean;
  investments_enabled?: boolean;
  hasTransactions?: boolean;
  has_transactions?: boolean;
  currentUserRole?: "owner" | "member";
  current_user_role?: "owner" | "member";
}

function mapBudget(budgetId: string, raw: BudgetApiShape): SettingsBudget {
  return {
    id: budgetId,
    name: raw.name ?? "",
    kind: raw.kind ?? "PRIVATE",
    defaultCurrency: raw.defaultCurrency ?? raw.default_currency ?? "USD",
    cushionModeEnabled:
      raw.cushionModeEnabled ?? raw.cushion_mode_enabled ?? false,
    cushionEnabled: raw.cushionEnabled ?? raw.cushion_enabled ?? true,
    cushionTargetMonths:
      raw.cushionTargetMonths ?? raw.cushion_target_months ?? 6,
    investmentsEnabled:
      raw.investmentsEnabled ?? raw.investments_enabled ?? false,
    hasTransactions: raw.hasTransactions ?? raw.has_transactions ?? false,
    currentUserRole: raw.currentUserRole ?? raw.current_user_role ?? "member",
  };
}

function SettingsSkeleton() {
  return (
    // reveal-delayed: whole skeleton invisible 200ms so a cache restore replaces
    // it first — no skeleton-scaffold flash on warm/offline nav (260617). Only
    // while the one-shot IDB restore is bridging (260620): after it's done, a
    // cold list = network wait, so render at once (no blank pane under the band).
    <div
      className={cn(
        "overflow-hidden rounded-xl border border-[var(--hairline-on-dark)] bg-[var(--surface-card-dark)]",
        !isRestoreComplete() && "reveal-delayed",
      )}
    >
      {Array.from({ length: 5 }).map((_, i) => (
        <div
          key={i}
          className="flex items-center justify-between border-b border-[var(--hairline-on-dark)] px-6 py-5 last:border-b-0"
        >
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-4 w-4 rounded" />
        </div>
      ))}
    </div>
  );
}

export function SettingsTabClient({ budgetId }: { budgetId: string }) {
  const q = useBudget(budgetId);
  const raw = q.data as BudgetApiShape | undefined;

  if (q.isPending) return <SettingsSkeleton />;
  if (!raw) return <SettingsSkeleton />;

  return <SettingsAccordion budget={mapBudget(budgetId, raw)} />;
}
