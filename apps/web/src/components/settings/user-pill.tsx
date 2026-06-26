"use client";

/**
 * user-pill.tsx — "User" pill of the user-settings carousel (CONTEXT decision 2).
 *
 * Mirrors the BDP settings-accordion.tsx shell: a multi-open Accordion whose items
 * are Profile / Security / Danger Zone, default-open Profile. The section BODIES
 * are slot components — placeholders in 10-02 (ProfileSection / SecuritySection /
 * AccountDangerZone), replaced with the real bodies by plans 10-03 / 10-04 / 10-06.
 */
import { useTranslations } from "next-intl";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  ProfileSection,
  type ProfileSectionProps,
} from "@/components/settings/profile-section";
import { SecuritySection } from "@/components/settings/security-section";
import { AccountDangerZone } from "@/components/settings/account-danger-zone";

export function UserPill({ profile }: { profile: ProfileSectionProps }) {
  const t = useTranslations("settings.user.sections");

  return (
    <Accordion
      type="multiple"
      defaultValue={["profile"]}
      className="overflow-hidden rounded-xl border border-[var(--hairline-on-dark)] bg-[var(--surface-card-dark)]"
    >
      {/* 1. Profile (default open) */}
      <AccordionItem value="profile">
        <AccordionTrigger className="px-6">{t("profile")}</AccordionTrigger>
        <AccordionContent className="bg-[#141920] px-6 py-5 shadow-[inset_0_4px_8px_-2px_rgba(0,0,0,0.45)]">
          <ProfileSection {...profile} />
        </AccordionContent>
      </AccordionItem>

      {/* 2. Security */}
      <AccordionItem value="security">
        <AccordionTrigger className="px-6">{t("security")}</AccordionTrigger>
        <AccordionContent className="bg-[#141920] px-6 py-5 shadow-[inset_0_4px_8px_-2px_rgba(0,0,0,0.45)]">
          <SecuritySection />
        </AccordionContent>
      </AccordionItem>

      {/* 3. Danger Zone */}
      <AccordionItem value="danger">
        <AccordionTrigger className="px-6 text-[var(--trading-down)]">
          {t("danger")}
        </AccordionTrigger>
        <AccordionContent className="bg-[#141920] px-6 py-5 shadow-[inset_0_4px_8px_-2px_rgba(0,0,0,0.45)]">
          <AccountDangerZone />
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
}
