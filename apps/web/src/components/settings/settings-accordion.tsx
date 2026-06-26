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
import { CushionSection } from "@/components/settings/cushion-section";
import { InvestmentsSection } from "@/components/settings/investments-section";
import { RecurringSection } from "@/components/settings/recurring-section";
import { MembersSection } from "@/components/settings/members-section";
import { DangerZoneSection } from "@/components/settings/danger-zone-section";
import { PushPrefsSection } from "@/components/settings/push-prefs-section";

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
      type="multiple"
      defaultValue={["budget-identity"]}
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
        <AccordionContent className="bg-[#141920] px-6 py-5 shadow-[inset_0_4px_8px_-2px_rgba(0,0,0,0.45)]">
          <BudgetIdentitySection
            budgetId={budget.id}
            name={budget.name}
            defaultCurrency={budget.defaultCurrency}
            hasTransactions={budget.hasTransactions}
          />
        </AccordionContent>
      </AccordionItem>

      {/* 2. Cushion (master flag + per-month mode sub-toggle) */}
      <AccordionItem value="cushion">
        <AccordionTrigger className="px-6">
          {t("sections.cushion")}
        </AccordionTrigger>
        <AccordionContent className="bg-[#141920] px-6 py-5 shadow-[inset_0_4px_8px_-2px_rgba(0,0,0,0.45)]">
          <CushionSection
            budgetId={budget.id}
            cushionEnabled={budget.cushionEnabled}
            cushionModeEnabled={budget.cushionModeEnabled}
            cushionTargetMonths={budget.cushionTargetMonths}
            budgetCurrency={budget.defaultCurrency}
          />
        </AccordionContent>
      </AccordionItem>

      {/* 3. Investments (feature flag toggle — Phase 9) */}
      <AccordionItem value="investments">
        <AccordionTrigger className="px-6">
          {t("sections.investments")}
        </AccordionTrigger>
        <AccordionContent className="bg-[#141920] px-6 py-5 shadow-[inset_0_4px_8px_-2px_rgba(0,0,0,0.45)]">
          <InvestmentsSection
            budgetId={budget.id}
            investmentsEnabled={budget.investmentsEnabled ?? false}
          />
        </AccordionContent>
      </AccordionItem>

      {/* 4. Recurring Rules */}
      <AccordionItem value="recurring-rules">
        <AccordionTrigger className="px-6">
          {t("sections.recurring")}
        </AccordionTrigger>
        <AccordionContent className="bg-[#141920] px-6 py-5 shadow-[inset_0_4px_8px_-2px_rgba(0,0,0,0.45)]">
          <RecurringSection
            budgetId={budget.id}
            defaultCurrency={budget.defaultCurrency}
          />
        </AccordionContent>
      </AccordionItem>

      {/* 4. Members (SHARED only) */}
      {budget.kind === "SHARED" && (
        <AccordionItem value="members">
          <AccordionTrigger className="px-6">
            {t("sections.members")}
          </AccordionTrigger>
          <AccordionContent className="bg-[#141920] px-6 py-5 shadow-[inset_0_4px_8px_-2px_rgba(0,0,0,0.45)]">
            <MembersSection
              budgetId={budget.id}
              currentUserRole={budget.currentUserRole}
            />
          </AccordionContent>
        </AccordionItem>
      )}

      {/* 5. Notifications (push prefs) */}
      <AccordionItem value="notifications">
        <AccordionTrigger className="px-6">
          {t("push.sectionTitle")}
        </AccordionTrigger>
        <AccordionContent className="bg-[#141920] px-6 py-5 shadow-[inset_0_4px_8px_-2px_rgba(0,0,0,0.45)]">
          <PushPrefsSection budgetId={budget.id} />
        </AccordionContent>
      </AccordionItem>

      {/* 6. Danger Zone */}
      <AccordionItem value="danger-zone">
        <AccordionTrigger className="px-6 text-[var(--trading-down)]">
          {t("sections.danger")}
        </AccordionTrigger>
        <AccordionContent className="bg-[#141920] px-6 py-5 shadow-[inset_0_4px_8px_-2px_rgba(0,0,0,0.45)]">
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
    </Accordion>
  );
}
