"use client";

/**
 * recurring-section.tsx — D-03
 *
 * Renders RecurringRulesList inline. "+Add rule" dashed button (NOT yellow)
 * opens a Sheet containing RecurringRuleForm.
 * Reuses Phase 4 components verbatim — not forked.
 */
import { useState } from "react";
import { useTranslations } from "next-intl";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  RecurringRulesList,
  type RecurringRuleListItem,
} from "@/components/budgeting/recurring-rules-list";
import { RecurringRuleForm } from "@/components/budgeting/recurring-rule-form";

export interface RecurringSectionProps {
  budgetId?: string;
  rules?: RecurringRuleListItem[];
}

export function RecurringSection({ rules = [] }: RecurringSectionProps) {
  const t = useTranslations("settings");
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editRuleId, setEditRuleId] = useState<string | null>(null);

  const handleEdit = (id: string) => {
    setEditRuleId(id);
    setSheetOpen(true);
  };

  const handleAdd = () => {
    setEditRuleId(null);
    setSheetOpen(true);
  };

  const handleSaved = () => {
    setSheetOpen(false);
    setEditRuleId(null);
  };

  const editRule = editRuleId
    ? rules.find((r) => r.id === editRuleId)
    : undefined;

  return (
    <div className="space-y-4">
      <RecurringRulesList
        rules={rules}
        onEdit={handleEdit}
        onArchive={() => {}}
      />

      {/* +Add rule — neutral dashed button, NOT yellow */}
      <Button
        type="button"
        variant="outline"
        className="w-full border-dashed border-[var(--hairline-on-dark)] text-[var(--muted-foreground)] hover:bg-[var(--surface-elevated-dark)] hover:text-[var(--body)]"
        onClick={handleAdd}
      >
        <Plus className="mr-2 h-4 w-4" />
        {t("recurring.add_rule")}
      </Button>

      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent side="right" className="w-full max-w-md">
          <SheetHeader>
            <SheetTitle>
              {editRuleId
                ? t("recurring.edit_rule_title")
                : t("recurring.add_rule_title")}
            </SheetTitle>
          </SheetHeader>
          <div className="mt-4">
            <RecurringRuleForm
              open={sheetOpen}
              onOpenChange={setSheetOpen}
              mode={editRuleId ? "edit" : "create"}
              initialValues={
                editRule
                  ? {
                      ruleId: editRule.id,
                      amount: editRule.amount,
                      currency: editRule.currency,
                      cadence: editRule.cadence,
                      cadenceAnchor: editRule.cadenceAnchor,
                      weeklyDow: editRule.weeklyDow,
                      note: editRule.note,
                      kind: editRule.kind as "EXPENSE" | "INCOME" | "TRANSFER",
                      firstDueDate: editRule.nextDueDate,
                      accountId: "",
                    }
                  : undefined
              }
              onSaved={handleSaved}
            />
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
