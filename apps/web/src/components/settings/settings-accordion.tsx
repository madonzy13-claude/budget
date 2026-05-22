"use client";

/**
 * settings-accordion.tsx — SETT-01
 *
 * 5-section accordion shell (4 for PRIVATE budgets — Members hidden).
 * Default open: budget-identity.
 */
import { useTranslations } from "next-intl";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { BudgetIdentitySection } from "@/components/settings/budget-identity-section";
import { CushionModeSection } from "@/components/settings/cushion-mode-section";
import { RecurringSection } from "@/components/settings/recurring-section";
import { MembersSection } from "@/components/settings/members-section";
import { DangerZoneSection } from "@/components/settings/danger-zone-section";

export interface SettingsBudget {
  id: string;
  name: string;
  kind: "SHARED" | "PRIVATE";
  defaultCurrency: string;
  cushionModeEnabled: boolean;
  hasTransactions: boolean;
  currentUserRole: "owner" | "member";
}

export interface SettingsAccordionProps {
  budget: SettingsBudget;
}

export function SettingsAccordion({ budget }: SettingsAccordionProps) {
  const t = useTranslations("settings");
  const isOwner = budget.currentUserRole === "owner";

  return (
    <Accordion
      type="single"
      defaultValue="budget-identity"
      collapsible
      className="rounded-xl border border-[var(--hairline-on-dark)] bg-[var(--surface-card-dark)]"
    >
      {/* 1. Budget Identity */}
      <AccordionItem value="budget-identity">
        <AccordionTrigger className="px-6">
          {t("sections.identity")}
        </AccordionTrigger>
        <AccordionContent className="px-6 pb-6">
          <BudgetIdentitySection
            budgetId={budget.id}
            name={budget.name}
            defaultCurrency={budget.defaultCurrency}
            hasTransactions={budget.hasTransactions}
          />
        </AccordionContent>
      </AccordionItem>

      {/* 2. Cushion Mode */}
      <AccordionItem value="cushion-mode">
        <AccordionTrigger className="px-6">
          {t("sections.cushion")}
        </AccordionTrigger>
        <AccordionContent className="px-6 pb-6">
          <CushionModeSection
            budgetId={budget.id}
            cushionModeEnabled={budget.cushionModeEnabled}
          />
        </AccordionContent>
      </AccordionItem>

      {/* 3. Recurring Rules */}
      <AccordionItem value="recurring-rules">
        <AccordionTrigger className="px-6">
          {t("sections.recurring")}
        </AccordionTrigger>
        <AccordionContent className="px-6 pb-6">
          <RecurringSection budgetId={budget.id} />
        </AccordionContent>
      </AccordionItem>

      {/* 4. Members (SHARED only) */}
      {budget.kind === "SHARED" && (
        <AccordionItem value="members">
          <AccordionTrigger className="px-6">
            {t("sections.members")}
          </AccordionTrigger>
          <AccordionContent className="px-6 pb-6">
            <MembersSection budgetId={budget.id} />
          </AccordionContent>
        </AccordionItem>
      )}

      {/* 5. Danger Zone */}
      <AccordionItem value="danger-zone">
        <AccordionTrigger className="px-6 text-[var(--trading-down)]">
          {t("sections.danger")}
        </AccordionTrigger>
        <AccordionContent className="px-6 pb-6">
          <DangerZoneSection
            budgetId={budget.id}
            budgetName={budget.name}
            isOwner={isOwner}
            // WR-06: PRIVATE budgets always have exactly one owner; SHARED budgets
            // may also have a single owner. We conservatively mark any owner as
            // potential last-owner — the server's 409 is the authoritative guard.
            // handleLeave in DangerZoneSection catches the 409 and shows the tooltip msg.
            isLastOwner={
              isOwner && (budget.kind === "PRIVATE" || budget.memberCount <= 1)
            }
          />
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
}
