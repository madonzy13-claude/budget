"use client";

/**
 * settings-accordion.tsx — SETT-01
 *
 * 5-section accordion shell (4 for PRIVATE budgets — Members hidden).
 * Default open: budget-identity.
 */
import { useState } from "react";
import { useTranslations } from "next-intl";
import { useQuery } from "@tanstack/react-query";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { useBdpUiStore } from "@/components/budgeting/bdp-ui-state";
import { useWallets } from "@/hooks/use-wallets";
import { useInvestments } from "@/hooks/use-investments";
import { useCategories } from "@/hooks/use-budget-data";
import { useActiveBudgets } from "@/hooks/use-active-budgets";
import { SettingsConfigProgress } from "@/components/settings/settings-config-progress";
import { computeSettingsProgress } from "@/lib/settings-progress";
import { BudgetIdentitySection } from "@/components/settings/budget-identity-section";
import { CushionSection } from "@/components/settings/cushion-section";
import { InvestmentsSection } from "@/components/settings/investments-section";
import { ReservesSection } from "@/components/settings/reserves-section";
import { RecurringSection } from "@/components/settings/recurring-section";
import { IncomeSection } from "@/components/settings/income-section";
import { MembersSection } from "@/components/settings/members-section";
import { DangerZoneSection } from "@/components/settings/danger-zone-section";
import { PushPrefsSection } from "@/components/settings/push-prefs-section";
import { OwnerGate } from "@/components/settings/owner-gate";
import { AggregationSection } from "@/components/settings/aggregation-section";

export interface SettingsBudget {
  id: string;
  name: string;
  kind: "SHARED" | "PRIVATE";
  defaultCurrency: string;
  cushionModeEnabled: boolean;
  /** Master cushion feature flag — gates the lane everywhere. */
  cushionEnabled: boolean;
  /** Phase 7-09: desired cushion runway in months. Default 6 server-side. */
  cushionTargetMonths?: number;
  /** Phase 9: gates the Investments section on the wallets page. Default off. */
  investmentsEnabled?: boolean;
  /** D-PH5-R11: gates the Reserves tab + every reserves item on the Overview. */
  reservesEnabled?: boolean;
  /** r36: amount-privacy flag; ON = Overview hides amounts by default. Default true. */
  amountPrivacyEnabled?: boolean;
  /** Task 11: caller's self-toggle — count this budget in the all-budgets aggregate. Default true. */
  includeInAggregation?: boolean;
  hasTransactions: boolean;
  currentUserRole: "owner" | "member";
}

export interface SettingsAccordionProps {
  budget: SettingsBudget;
}

export function SettingsAccordion({ budget }: SettingsAccordionProps) {
  const t = useTranslations("settings");
  const isOwner = budget.currentUserRole === "owner";
  // Open sections persist across pill navigation for the BDP's lifetime (round 18
  // item 2); controlled so a remount restores. Outside the BDP (standalone
  // /settings) the store is null → falls back to the default open section.
  const store = useBdpUiStore();
  const [open, setOpen] = useState<string[]>(
    () => store?.settings.openSections ?? ["budget-identity"],
  );
  // Task 11: the all-budgets aggregation self-toggle only makes sense once the
  // user actually has ≥2 budgets to combine.
  const budgetCount = useActiveBudgets().data?.length ?? 0;
  const onOpenChange = (v: string[]) => {
    if (store) store.settings.openSections = v;
    setOpen(v);
  };

  // r34: budget-configuration checklist. Enable-flags come from the live `budget`
  // prop (SettingsTabClient's useBudget → invalidated on each toggle); the counts
  // share the existing per-entity query keys so the header + popup stay live as the
  // user adds wallets / investments / categories / rules / incomes.
  const walletsQ = useWallets(budget.id);
  const investmentsQ = useInvestments(budget.id);
  const categoriesQ = useCategories(budget.id);
  const recurringQ = useQuery({
    queryKey: ["recurring-rules", budget.id],
    queryFn: async () => {
      const res = await fetch(`/api/budgets/${budget.id}/recurring-rules`, {
        credentials: "include",
        headers: { "X-Budget-ID": budget.id },
      });
      if (!res.ok) return [] as unknown[];
      const d = (await res.json()) as { rules?: unknown[] };
      return d.rules ?? [];
    },
    select: (rows) => rows.length > 0,
    staleTime: 0,
  });
  const incomeQ = useQuery({
    queryKey: ["incomes", budget.id],
    queryFn: async () => {
      const res = await fetch(`/api/budgets/${budget.id}/incomes`, {
        credentials: "include",
        headers: { "X-Budget-ID": budget.id },
      });
      if (!res.ok) return [] as unknown[];
      const d = (await res.json()) as { incomes?: unknown[] };
      return d.incomes ?? [];
    },
    select: (rows) => rows.length > 0,
    staleTime: 0,
  });

  const wallets = walletsQ.data ?? [];
  const hasCushionWallet = wallets.some((w) => w.walletType === "CUSHION");
  const hasReserveWallet = wallets.some((w) => w.walletType === "RESERVE");
  const hasInvestment = (investmentsQ.data ?? []).length > 0;
  const hasCategory = (categoriesQ.data ?? []).some(
    (c) => !(c as { isInvestment?: boolean }).isInvestment,
  );
  const hasRecurring = (recurringQ.data ?? false) as boolean;
  const hasIncome = (incomeQ.data ?? false) as boolean;

  // r34 flicker fix: only trust `progress.percent` once every count it reads has
  // loaded. On a cold open the `?? []` / `?? false` empties compute a <100%
  // percent that briefly renders the "not fully configured" banner before the
  // queries resolve to the real (often 100%) value and it hides. Gate on
  // isLoading (a disabled/cached query is not loading → doesn't block).
  const progressReady =
    !walletsQ.isLoading &&
    !investmentsQ.isLoading &&
    !categoriesQ.isLoading &&
    !recurringQ.isLoading &&
    !incomeQ.isLoading;

  const progress = computeSettingsProgress({
    hasTransaction: budget.hasTransactions,
    cushionEnabled: budget.cushionEnabled,
    hasCushionWallet,
    reservesEnabled: budget.reservesEnabled ?? true,
    hasReserveWallet,
    investmentsEnabled: budget.investmentsEnabled ?? false,
    hasInvestment,
    hasRecurring,
    hasIncome,
    hasCategory,
  });

  return (
    <>
      {/* Hidden once fully configured (100%) — no need to nag a complete setup.
          Also hidden until the counts have loaded, so an incomplete percent from
          the cold-load empties never flashes before resolving (r34 flicker). */}
      {progressReady && progress.percent < 100 && (
        <SettingsConfigProgress
          percent={progress.percent}
          items={progress.items}
        />
      )}
      <Accordion
        type="multiple"
        value={open}
        onValueChange={onOpenChange}
        className="overflow-hidden rounded-xl border border-[var(--hairline-on-dark)] bg-[var(--surface-card-dark)]"
      >
        {/* When an item is open we lift it to the elevated surface so the
          trigger row and its content read as a single grouped section,
          visually distinct from the still-closed siblings. The Accordion
          animation utilities (animate-accordion-down/up) live on the
          AccordionContent primitive — see ui/accordion.tsx — and the
          @theme block in global.css defines their keyframes. */}
        {/* 1. Budget Identity */}
        <AccordionItem value="budget-identity">
          <AccordionTrigger className="px-6">
            {t("sections.identity")}
          </AccordionTrigger>
          <AccordionContent className="bg-[var(--surface-sunken-dark)] px-6 py-5 shadow-[inset_0_4px_8px_-2px_rgba(0,0,0,0.22)]">
            <OwnerGate isOwner={isOwner}>
              <BudgetIdentitySection
                budgetId={budget.id}
                name={budget.name}
                defaultCurrency={budget.defaultCurrency}
                hasTransactions={budget.hasTransactions}
                amountPrivacyEnabled={budget.amountPrivacyEnabled ?? true}
                isOwner={isOwner}
              />
            </OwnerGate>
            {/* Task 11: self-service, NOT owner-gated — any member may include/exclude
                their own budget from their personal all-budgets aggregate. Only shown
                once the user has ≥2 budgets (nothing to aggregate with just one). */}
            {budgetCount >= 2 && (
              <div className="mt-4 border-t border-[var(--hairline-on-dark)] pt-4">
                <AggregationSection
                  budgetId={budget.id}
                  includeInAggregation={budget.includeInAggregation ?? true}
                />
              </div>
            )}
          </AccordionContent>
        </AccordionItem>

        {/* 2. Cushion (master flag + per-month mode sub-toggle) */}
        <AccordionItem value="cushion">
          <AccordionTrigger className="px-6">
            {t("sections.cushion")}
          </AccordionTrigger>
          <AccordionContent className="bg-[var(--surface-sunken-dark)] px-6 py-5 shadow-[inset_0_4px_8px_-2px_rgba(0,0,0,0.22)]">
            <OwnerGate isOwner={isOwner}>
              <CushionSection
                budgetId={budget.id}
                cushionEnabled={budget.cushionEnabled}
                cushionModeEnabled={budget.cushionModeEnabled}
                cushionTargetMonths={budget.cushionTargetMonths}
                budgetCurrency={budget.defaultCurrency}
              />
            </OwnerGate>
          </AccordionContent>
        </AccordionItem>

        {/* 3. Reserves (feature flag toggle — D-PH5-R11) */}
        <AccordionItem value="reserves">
          <AccordionTrigger className="px-6">
            {t("sections.reserves")}
          </AccordionTrigger>
          <AccordionContent className="bg-[var(--surface-sunken-dark)] px-6 py-5 shadow-[inset_0_4px_8px_-2px_rgba(0,0,0,0.22)]">
            <OwnerGate isOwner={isOwner}>
              <ReservesSection
                budgetId={budget.id}
                reservesEnabled={budget.reservesEnabled ?? true}
              />
            </OwnerGate>
          </AccordionContent>
        </AccordionItem>

        {/* 4. Investments (feature flag toggle — Phase 9) */}
        <AccordionItem value="investments">
          <AccordionTrigger className="px-6">
            {t("sections.investments")}
          </AccordionTrigger>
          <AccordionContent className="bg-[var(--surface-sunken-dark)] px-6 py-5 shadow-[inset_0_4px_8px_-2px_rgba(0,0,0,0.22)]">
            <OwnerGate isOwner={isOwner}>
              <InvestmentsSection
                budgetId={budget.id}
                investmentsEnabled={budget.investmentsEnabled ?? false}
              />
            </OwnerGate>
          </AccordionContent>
        </AccordionItem>

        {/* 4. Recurring Rules */}
        <AccordionItem value="recurring-rules">
          <AccordionTrigger className="px-6">
            {t("sections.recurring")}
          </AccordionTrigger>
          <AccordionContent className="bg-[var(--surface-sunken-dark)] px-6 py-5 shadow-[inset_0_4px_8px_-2px_rgba(0,0,0,0.22)]">
            <OwnerGate isOwner={isOwner}>
              <RecurringSection
                budgetId={budget.id}
                defaultCurrency={budget.defaultCurrency}
              />
            </OwnerGate>
          </AccordionContent>
        </AccordionItem>

        {/* 5. Income (r32) */}
        <AccordionItem value="income">
          <AccordionTrigger className="px-6">
            {t("sections.income")}
          </AccordionTrigger>
          <AccordionContent className="bg-[var(--surface-sunken-dark)] px-6 py-5 shadow-[inset_0_4px_8px_-2px_rgba(0,0,0,0.22)]">
            <OwnerGate isOwner={isOwner}>
              <IncomeSection
                budgetId={budget.id}
                defaultCurrency={budget.defaultCurrency}
              />
            </OwnerGate>
          </AccordionContent>
        </AccordionItem>

        {/* 4. Members — kind-removal: always available; any budget can invite. */}
        <AccordionItem value="members">
          <AccordionTrigger className="px-6">
            {t("sections.members")}
          </AccordionTrigger>
          <AccordionContent className="bg-[var(--surface-sunken-dark)] px-6 py-5 shadow-[inset_0_4px_8px_-2px_rgba(0,0,0,0.22)]">
            <MembersSection
              budgetId={budget.id}
              currentUserRole={budget.currentUserRole}
            />
            {/* Bug #1: members have no Danger Zone, so their "Leave budget"
                action lives here. Reuses DangerZoneSection's non-owner branch
                (the Leave button + confirm dialog + 409 last-owner handling)
                rather than duplicating that logic. */}
            {!isOwner && (
              <div className="mt-4 border-t border-[var(--hairline-on-dark)] pt-4">
                <DangerZoneSection
                  budgetId={budget.id}
                  budgetName={budget.name}
                  isOwner={false}
                  isLastOwner={false}
                />
              </div>
            )}
          </AccordionContent>
        </AccordionItem>

        {/* 5. Notifications (push prefs) */}
        <AccordionItem value="notifications">
          <AccordionTrigger className="px-6">
            {t("push.sectionTitle")}
          </AccordionTrigger>
          <AccordionContent className="bg-[var(--surface-sunken-dark)] px-6 py-5 shadow-[inset_0_4px_8px_-2px_rgba(0,0,0,0.22)]">
            <PushPrefsSection budgetId={budget.id} />
          </AccordionContent>
        </AccordionItem>

        {/* 6. Danger Zone — owners only (bug #1). Members leave via the button
            in the Members section, not here. */}
        {isOwner && (
          <AccordionItem value="danger-zone">
            <AccordionTrigger className="px-6 text-[var(--trading-down)]">
              {t("sections.danger")}
            </AccordionTrigger>
            <AccordionContent className="bg-[var(--surface-sunken-dark)] px-6 py-5 shadow-[inset_0_4px_8px_-2px_rgba(0,0,0,0.22)]">
              <DangerZoneSection
                budgetId={budget.id}
                budgetName={budget.name}
                isOwner={isOwner}
                // WR-06: client cannot reliably know the owner count without an
                // extra fetch. We conservatively mark any owner as potential
                // last-owner — the server's 409 is the authoritative guard, and
                // handleLeave in DangerZoneSection catches the 409 and shows the
                // tooltip message.
                isLastOwner={isOwner}
              />
            </AccordionContent>
          </AccordionItem>
        )}
      </Accordion>
    </>
  );
}
