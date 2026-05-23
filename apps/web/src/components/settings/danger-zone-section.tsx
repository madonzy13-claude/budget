"use client";

/**
 * danger-zone-section.tsx — D-09..D-13 (SETT-08)
 *
 * Owner sees: Archive + Delete.
 * Non-owner sees: Leave only.
 * Delete requires typed-name confirmation — confirm button disabled until match.
 * Last-owner Leave button is disabled + tooltip.
 */
import { useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { api } from "@/lib/api-client";

export interface DangerZoneSectionProps {
  budgetId: string;
  budgetName: string;
  isOwner: boolean;
  isLastOwner: boolean;
}

export function DangerZoneSection({
  budgetId,
  budgetName,
  isOwner,
  isLastOwner,
}: DangerZoneSectionProps) {
  const t = useTranslations("settings");
  const router = useRouter();
  const [confirmName, setConfirmName] = useState("");
  const [deleteError, setDeleteError] = useState<string | null>(null);

  /**
   * Delete-as-archive: the typed-name confirmation is preserved (so we keep
   * the same "are you sure" gate) but on confirm we soft-delete via the
   * archive endpoint, not hard-delete. The budget disappears from the home
   * grid + switcher and the user can no longer interact with it, but every
   * row (categories, ledger, members, history) stays in the DB so the data
   * is recoverable if it is ever needed again. The typed-name check still
   * runs client-side so the gate is meaningful; the server-side name-match
   * gate only ran for the hard-delete route, which we no longer call.
   */
  const handleDelete = async () => {
    setDeleteError(null);
    if (confirmName !== budgetName) {
      setDeleteError(t("danger.name_mismatch_error"));
      return;
    }
    try {
      const res = await api.budgets[":id"].archive.$post({
        param: { id: budgetId },
      });
      if (!res.ok) throw new Error("Failed to archive budget");
      toast.success(t("danger.deleted_toast"));
      router.push("/");
    } catch {
      if (!deleteError) {
        toast.error(t("danger.delete_error"));
      }
    }
  };

  const handleLeave = async () => {
    try {
      const res = await api.budgets[":id"].leave.$post({
        param: { id: budgetId },
      });
      if (res.status === 409) {
        // last_owner — cannot leave; surface friendly message instead of generic error
        toast.error(t("danger.last_owner_tooltip"));
        return;
      }
      if (!res.ok) throw new Error("Failed to leave budget");
      toast.success(t("danger.left_toast"));
      router.push("/");
    } catch {
      toast.error(t("danger.leave_error"));
    }
  };

  return (
    <div className="space-y-4">
      {/* Section title omitted — already shown by the accordion trigger.
          The previous duplicate caused "Danger Zone" to appear twice
          when the section is expanded. */}
      {isOwner ? (
        <div className="flex flex-wrap gap-3">
          {/* Delete with typed-name confirm. Per product decision the
              destructive action archives instead of hard-deleting, so the
              data stays recoverable in the DB even though the button still
              reads "Delete budget" (it matches the user's mental model and
              the typed-name gate retains its weight). */}
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                variant="destructive"
                className="bg-[var(--trading-down)] hover:bg-[var(--trading-down)]/90"
              >
                {t("danger.delete_button")}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>
                  {t("danger.delete_dialog_title")}
                </AlertDialogTitle>
                <AlertDialogDescription>
                  {t("danger.delete_dialog_body")}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <div className="py-2">
                <Input
                  value={confirmName}
                  onChange={(e) => {
                    setConfirmName(e.target.value);
                    setDeleteError(null);
                  }}
                  placeholder={t("danger.delete_input_placeholder")}
                  className="bg-[var(--surface-elevated-dark)]"
                  data-testid="delete-confirm-input"
                />
                {deleteError && (
                  <p className="mt-1 text-xs text-[var(--trading-down)]">
                    {deleteError}
                  </p>
                )}
              </div>
              <AlertDialogFooter>
                <AlertDialogCancel onClick={() => setConfirmName("")}>
                  {t("danger.delete_cancel")}
                </AlertDialogCancel>
                <AlertDialogAction
                  disabled={confirmName !== budgetName}
                  className="bg-[var(--trading-down)] text-white hover:bg-[var(--trading-down)]/90 disabled:opacity-50"
                  onClick={handleDelete}
                >
                  {t("danger.delete_confirm")}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      ) : (
        /* Non-owner: Leave only */
        <div>
          {isLastOwner ? (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span>
                    <Button
                      variant="outline"
                      disabled
                      className="border-[var(--trading-down)] text-[var(--trading-down)] opacity-50"
                    >
                      {t("danger.leave_button")}
                    </Button>
                  </span>
                </TooltipTrigger>
                <TooltipContent>
                  <p>{t("danger.last_owner_tooltip")}</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          ) : (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  variant="outline"
                  className="border-[var(--trading-down)] text-[var(--trading-down)] hover:bg-[var(--trading-down)]/10"
                >
                  {t("danger.leave_button")}
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>
                    {t("danger.leave_dialog_title", { name: budgetName })}
                  </AlertDialogTitle>
                  <AlertDialogDescription>
                    {t("danger.leave_dialog_body")}
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>
                    {t("danger.leave_cancel")}
                  </AlertDialogCancel>
                  <AlertDialogAction
                    className="bg-[var(--trading-down)] text-white hover:bg-[var(--trading-down)]/90"
                    onClick={handleLeave}
                  >
                    {t("danger.leave_confirm")}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </div>
      )}
    </div>
  );
}
