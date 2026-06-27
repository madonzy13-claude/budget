"use client";

/**
 * user-settings-shell.tsx — the User Settings page as a SINGLE stacked accordion
 * (no pills, no carousel). One multi-open Accordion with four sections —
 * General (display language + currency) · Profile · Security · Danger Zone —
 * with General open by default. The section bodies are the existing client
 * components (GeneralPill / ProfileSection / SecuritySection / AccountDangerZone),
 * all server-seeded via props threaded from the catch-all page.
 */
import { useTranslations } from "next-intl";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { GeneralPill } from "@/components/settings/general-pill";
import {
  ProfileSection,
  type ProfileSectionProps,
} from "@/components/settings/profile-section";
import { SecuritySection } from "@/components/settings/security-section";
import { AccountDangerZone } from "@/components/settings/account-danger-zone";

interface UserSettingsShellProps {
  initialLocale: string;
  initialDisplayCurrency?: string;
  initialTimezone?: string;
  initialProfile: ProfileSectionProps;
}

const CONTENT =
  "bg-[#141920] px-6 py-5 shadow-[inset_0_4px_8px_-2px_rgba(0,0,0,0.45)]";

export function UserSettingsShell({
  initialLocale,
  initialDisplayCurrency,
  initialTimezone,
  initialProfile,
}: UserSettingsShellProps) {
  const tRoot = useTranslations("settings");
  const tSec = useTranslations("settings.user.sections");

  return (
    <main className="mx-auto w-full max-w-[1280px] px-4 pt-6 pb-12 sm:px-6 sm:pb-16">
      <header className="mb-6 space-y-2">
        <p className="text-caption uppercase tracking-wide text-[var(--muted-foreground)]">
          {tRoot("eyebrow")}
        </p>
        <h1 className="text-display-sm text-[var(--on-dark)]">
          {tRoot("heading")}
        </h1>
      </header>

      <Accordion
        type="multiple"
        defaultValue={["general"]}
        className="overflow-hidden rounded-xl border border-[var(--hairline-on-dark)] bg-[var(--surface-card-dark)]"
      >
        {/* 1. General (default open) — display language + currency */}
        <AccordionItem value="general">
          <AccordionTrigger className="px-6">
            {tSec("general")}
          </AccordionTrigger>
          <AccordionContent className={CONTENT}>
            <GeneralPill
              initialLocale={initialLocale}
              initialDisplayCurrency={initialDisplayCurrency}
              initialTimezone={initialTimezone}
            />
          </AccordionContent>
        </AccordionItem>

        {/* 2. Profile */}
        <AccordionItem value="profile">
          <AccordionTrigger className="px-6">
            {tSec("profile")}
          </AccordionTrigger>
          <AccordionContent className={CONTENT}>
            <ProfileSection {...initialProfile} />
          </AccordionContent>
        </AccordionItem>

        {/* 3. Security */}
        <AccordionItem value="security">
          <AccordionTrigger className="px-6">
            {tSec("security")}
          </AccordionTrigger>
          <AccordionContent className={CONTENT}>
            <SecuritySection email={initialProfile.email} />
          </AccordionContent>
        </AccordionItem>

        {/* 4. Danger Zone */}
        <AccordionItem value="danger">
          <AccordionTrigger className="px-6 text-[var(--trading-down)]">
            {tSec("danger")}
          </AccordionTrigger>
          <AccordionContent className={CONTENT}>
            <AccountDangerZone />
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </main>
  );
}
