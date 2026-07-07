"use client";

/**
 * income-section.tsx — Settings → Income (r32).
 *
 * A per-budget list of expected incomes (name + amount + currency + frequency).
 * Mirrors recurring-section: inline list, an "Add income" CTA that opens the
 * right-side form slider (keyed per row so edit prefill is clean), and a
 * red-tinted delete confirmation. Config only for now.
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
  IncomeList,
  type IncomeListItem,
} from "@/components/budgeting/income-list";
import { IncomeForm } from "@/components/budgeting/income-form";
import { clientApiWrite, isOfflineWriteError } from "@/lib/offline-write";
import { useOfflineWriteToast } from "@/hooks/use-offline-write-toast";

export interface IncomeSectionProps {
  budgetId?: string;
  defaultCurrency?: string;
  incomes?: IncomeListItem[];
}

export function IncomeSection({
  budgetId,
  defaultCurrency,
  incomes: initialIncomes,
}: IncomeSectionProps) {
  const tInc = useTranslations("budgeting.income");
  const qc = useQueryClient();
  const offlineToast = useOfflineWriteToast();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const { data: fetched } = useQuery<IncomeListItem[]>({
    queryKey: ["incomes", budgetId],
    queryFn: async () => {
      if (!budgetId) return [];
      const res = await fetch(`/api/budgets/${budgetId}/incomes`, {
        credentials: "include",
        headers: { "X-Budget-ID": budgetId },
      });
      if (!res.ok) return [];
      const data = (await res.json()) as { incomes?: IncomeListItem[] };
      return data.incomes ?? [];
    },
    enabled: !!budgetId,
    initialData: initialIncomes,
    staleTime: 0,
  });

  const incomes = fetched ?? initialIncomes ?? [];

  const handleEdit = (id: string) => {
    setEditId(id);
    setSheetOpen(true);
  };
  const handleAdd = () => {
    setEditId(null);
    setSheetOpen(true);
  };
  const handleSaved = () => {
    setSheetOpen(false);
    setEditId(null);
    qc.invalidateQueries({ queryKey: ["incomes", budgetId] });
    // r33: income drives the INCOME_UNDER_PLANNED task + the smart Investments
    // limit — refresh both so the task badge + grid update without a reload.
    qc.invalidateQueries({ queryKey: ["tasks", budgetId, "pending"] });
    qc.invalidateQueries({ queryKey: ["spendings-summary", budgetId] });
    // Cash-flow projection inputs changed — refresh the banner.
    qc.invalidateQueries({ queryKey: ["budget", budgetId, "projection"] });
  };

  const confirmDelete = async () => {
    if (!pendingDeleteId || !budgetId) return;
    setDeleting(true);
    try {
      const res = await clientApiWrite(
        `/budgets/${budgetId}/incomes/${pendingDeleteId}`,
        {
          method: "DELETE",
          credentials: "include",
          headers: { "X-Budget-ID": budgetId },
        },
      );
      if (!res.ok) {
        toast.error(tInc("errors.delete"));
        return;
      }
      qc.invalidateQueries({ queryKey: ["incomes", budgetId] });
      qc.invalidateQueries({ queryKey: ["tasks", budgetId, "pending"] });
      qc.invalidateQueries({ queryKey: ["spendings-summary", budgetId] });
      // Cash-flow projection inputs changed — refresh the banner.
      qc.invalidateQueries({ queryKey: ["budget", budgetId, "projection"] });
      setPendingDeleteId(null);
    } catch (err) {
      if (isOfflineWriteError(err)) {
        offlineToast();
        return;
      }
      toast.error(tInc("errors.delete"));
    } finally {
      setDeleting(false);
    }
  };

  const editIncome = editId ? incomes.find((r) => r.id === editId) : undefined;

  return (
    <div className="space-y-4">
      {incomes.length > 0 && (
        <IncomeList
          incomes={incomes}
          onEdit={handleEdit}
          onArchive={(id) => setPendingDeleteId(id)}
        />
      )}

      <Button
        type="button"
        variant="outline"
        className="w-full border-dashed border-[var(--hairline-on-dark)] text-[var(--muted-foreground)] hover:bg-[var(--surface-elevated-dark)] hover:text-[var(--body)]"
        onClick={handleAdd}
        data-testid="income-add"
      >
        <Plus className="mr-2 h-4 w-4" />
        {tInc("addButton")}
      </Button>

      <IncomeForm
        key={editId ?? "create"}
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        mode={editId ? "edit" : "create"}
        budgetId={budgetId}
        defaultCurrency={defaultCurrency}
        initialValues={
          editIncome
            ? {
                incomeId: editIncome.id,
                name: editIncome.name,
                amount: editIncome.amount,
                currency: editIncome.currency,
                cadence: editIncome.cadence,
                cadenceAnchor: editIncome.cadenceAnchor,
                weeklyDow: editIncome.weeklyDow,
                yearlyMonth: editIncome.yearlyMonth ?? null,
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
            <AlertDialogTitle>{tInc("delete.title")}</AlertDialogTitle>
            <AlertDialogDescription>
              {tInc("delete.body")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>
              {tInc("delete.cancel")}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                void confirmDelete();
              }}
              disabled={deleting}
              className="bg-[var(--destructive)] text-white hover:bg-[var(--destructive)]/90"
            >
              {tInc("delete.confirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
