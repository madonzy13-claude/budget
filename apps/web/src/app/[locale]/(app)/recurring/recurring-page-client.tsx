"use client";

/**
 * recurring-page-client.tsx — client wrapper for the "Add recurring rule" CTA.
 * Manages dialog open state for the form.
 */
import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { RecurringRuleForm } from "@/components/budgeting/recurring-rule-form";

export function RecurringPageClient() {
  const t = useTranslations("budgeting.recurring");
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button onClick={() => setOpen(true)}>{t("addRuleButton")}</Button>
      <RecurringRuleForm
        open={open}
        onOpenChange={setOpen}
        mode="create"
        onSaved={() => {
          // Server action result is fresh on next nav — for now, reload.
          if (typeof window !== "undefined") window.location.reload();
        }}
      />
    </>
  );
}
