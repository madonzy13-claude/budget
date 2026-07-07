"use client";

/**
 * recurring-section.tsx — D-03 + UAT-Phase6-Test7 retest
 *
 * Renders RecurringRulesList inline. Add CTA opens the recurring-rule
 * right-side slider. Edit + delete wired here:
 *   - Edit opens the slider with the rule prepopulated. The form is
 *     keyed by `editRuleId` so React remounts it for each rule —
 *     useState defaults re-evaluate cleanly and stale field values
 *     can't leak between rows.
 *   - Delete fires DELETE /api/budgets/:id/recurring-rules/:id behind
 *     a red-tinted trash confirmation dialog.
 *
 * Category picker:
 *   The form's category dropdown is sourced from the budget's
 *   categories endpoint. Fetched once on mount; passed straight to the
 *   form. A null categoryId on the rule renders as "(no category)".
 *
 * List reload:
 *   useQuery uses `refetchOnMount: 'always'` + `staleTime: 0` so a
 *   hard reload (cold React Query cache) actually pulls the list — the
 *   prior `initialData: []` path silently skipped the refetch and the
 *   list looked empty until the user added another rule.
 */
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  RecurringRulesList,
  type RecurringRuleListItem,
} from "@/components/budgeting/recurring-rules-list";
import { RecurringRuleForm } from "@/components/budgeting/recurring-rule-form";
import { clientApiWrite, isOfflineWriteError } from "@/lib/offline-write";
import { useOfflineWriteToast } from "@/hooks/use-offline-write-toast";

export interface RecurringSectionProps {
  budgetId?: string;
  defaultCurrency?: string;
  rules?: RecurringRuleListItem[];
}

interface CategoryLite {
  id: string;
  name: string;
}

export function RecurringSection({
  budgetId,
  defaultCurrency,
  rules: initialRules,
}: RecurringSectionProps) {
  const t = useTranslations("settings");
  const tRec = useTranslations("budgeting.recurring");
  const qc = useQueryClient();
  const offlineToast = useOfflineWriteToast();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editRuleId, setEditRuleId] = useState<string | null>(null);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const { data: fetchedRules } = useQuery<RecurringRuleListItem[]>({
    queryKey: ["recurring-rules", budgetId],
    queryFn: async () => {
      if (!budgetId) return [];
      const res = await fetch(`/api/budgets/${budgetId}/recurring-rules`, {
        credentials: "include",
        headers: { "X-Budget-ID": budgetId },
      });
      if (!res.ok) return [];
      const data = (await res.json()) as { rules?: RecurringRuleListItem[] };
      return data.rules ?? [];
    },
    enabled: !!budgetId,
    // initialData kept ONLY for SSR pre-rendering; refetchOnMount:'always'
    // + staleTime:0 force a real fetch on every page open. Without these,
    // RQ skips the queryFn when initialData is present and the list looks
    // perma-empty after a hard reload.
    initialData: initialRules,
    staleTime: 0,
  });

  const { data: categories = [] } = useQuery<CategoryLite[]>({
    queryKey: ["categories-lite", budgetId],
    queryFn: async () => {
      if (!budgetId) return [];
      const res = await fetch(`/api/budgets/${budgetId}/categories`, {
        credentials: "include",
        headers: { "X-Budget-ID": budgetId },
      });
      if (!res.ok) return [];
      const data = (await res.json()) as {
        categories?: Array<{ id: string; name: string }>;
      };
      return data.categories ?? [];
    },
    enabled: !!budgetId,
    staleTime: 30_000,
  });

  const rules = fetchedRules ?? initialRules ?? [];

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
    qc.invalidateQueries({ queryKey: ["recurring-rules", budgetId] });
    // Cash-flow projection inputs changed — refresh the banner.
    qc.invalidateQueries({ queryKey: ["budget", budgetId, "projection"] });
  };

  const handleArchive = (id: string) => {
    setPendingDeleteId(id);
  };

  const confirmDelete = async () => {
    if (!pendingDeleteId || !budgetId) return;
    setDeleting(true);
    try {
      const res = await clientApiWrite(
        `/budgets/${budgetId}/recurring-rules/${pendingDeleteId}`,
        {
          method: "DELETE",
          credentials: "include",
          headers: { "X-Budget-ID": budgetId },
        },
      );
      if (!res.ok) {
        toast.error(tRec("errors.delete"));
        return;
      }
      qc.invalidateQueries({ queryKey: ["recurring-rules", budgetId] });
      // Cash-flow projection inputs changed — refresh the banner.
      qc.invalidateQueries({ queryKey: ["budget", budgetId, "projection"] });
      setPendingDeleteId(null);
    } catch (err) {
      // Honest-offline: device offline / unreachable / hung / 5xx → shared toast.
      // The finally below resets `deleting` so the dialog button never sticks.
      if (isOfflineWriteError(err)) {
        offlineToast();
        return;
      }
      toast.error(tRec("errors.delete"));
    } finally {
      setDeleting(false);
    }
  };

  const editRule = editRuleId
    ? rules.find((r) => r.id === editRuleId)
    : undefined;

  return (
    <div className="space-y-4">
      {rules.length > 0 && (
        <RecurringRulesList
          rules={rules}
          defaultCurrency={defaultCurrency}
          onEdit={handleEdit}
          onArchive={handleArchive}
        />
      )}

      <Button
        type="button"
        variant="outline"
        className="w-full border-dashed border-[var(--hairline-on-dark)] text-[var(--muted-foreground)] hover:bg-[var(--surface-elevated-dark)] hover:text-[var(--body)]"
        onClick={handleAdd}
      >
        <Plus className="mr-2 h-4 w-4" />
        {t("recurring.add_rule")}
      </Button>

      {/* `key` remounts the form per rule (and once for the "create" slot)
          so useState defaults re-evaluate against the new initialValues —
          fixes the "amount not prefilled on edit" regression where state
          set on first mount stuck around as the user clicked different
          rows. */}
      <RecurringRuleForm
        key={editRuleId ?? "create"}
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        mode={editRuleId ? "edit" : "create"}
        budgetId={budgetId}
        defaultCurrency={defaultCurrency}
        categories={categories}
        initialValues={
          editRule
            ? {
                ruleId: editRule.id,
                amount: editRule.amount,
                currency: editRule.currency,
                cadence: editRule.cadence,
                cadenceAnchor: editRule.cadenceAnchor,
                weeklyDow: editRule.weeklyDow,
                yearlyMonth: editRule.yearlyMonth ?? null,
                note: editRule.note,
                firstDueDate: editRule.nextDueDate,
                categoryId: editRule.categoryId ?? null,
              }
            : undefined
        }
        onSaved={handleSaved}
      />

      <AlertDialog
        open={pendingDeleteId !== null}
        onOpenChange={(o) => {
          if (!o) setPendingDeleteId(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{tRec("delete.title")}</AlertDialogTitle>
            <AlertDialogDescription>
              {tRec("delete.body")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>
              {tRec("delete.cancel")}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                void confirmDelete();
              }}
              disabled={deleting}
              className="bg-[var(--destructive)] text-white hover:bg-[var(--destructive)]/90"
            >
              {tRec("delete.confirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
