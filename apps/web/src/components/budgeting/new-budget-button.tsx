"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";

interface NewBudgetButtonProps {
  locale: string;
}

/**
 * NewBudgetButton — icon-only top-nav sibling of the BudgetSwitcher (NAV-03).
 * Ghost variant, size=icon (40x40). lucide Plus glyph 20px.
 * Click → router.push(`/${locale}/budgets/new`).
 *
 * Hover styling is delegated to the Button ghost variant — no extra state
 * needed (navigation is instant; no loading spinner).
 */
export function NewBudgetButton({ locale }: NewBudgetButtonProps) {
  const t = useTranslations();
  const router = useRouter();
  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label={t("nav.newBudget")}
      title={t("nav.newBudgetTooltip")}
      onClick={() => router.push(`/${locale}/budgets/new`)}
      data-testid="new-budget-button"
    >
      <Plus className="h-5 w-5" aria-hidden="true" />
    </Button>
  );
}
