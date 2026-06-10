"use client";

/**
 * members-section.tsx — D-14, D-16 (SETT-05..07)
 *
 * Lists members with avatar + name + role badge + Revoke button.
 * Generate share link reveals ephemeral ShareUrlField.
 * Revoke requires AlertDialog confirm before firing POST.
 */
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
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
import { ShareUrlField } from "@/components/settings/share-url-field";
import { api } from "@/lib/api-client";

interface Member {
  userId: string;
  role: "owner" | "member";
  name?: string;
  email?: string;
}

export interface MembersSectionProps {
  budgetId: string;
  /**
   * Caller's role on this budget. Drives owner-only affordances:
   *   * Generate share link  — owner only.
   *   * Revoke member        — owner only (server returns 403 otherwise,
   *                            but hiding the CTA avoids the failure
   *                            toast from a non-owner click).
   * Defaults to "member" so a missing prop fails safe (no power).
   */
  currentUserRole?: "owner" | "member";
}

export function MembersSection({
  budgetId,
  currentUserRole = "member",
}: MembersSectionProps) {
  const t = useTranslations("settings");
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["budget-members", budgetId],
    queryFn: async () => {
      const res = await api.budgets[":id"].members.$get({
        param: { id: budgetId },
      });
      if (!res.ok) throw new Error("Failed to load members");
      return res.json() as Promise<{ members: Member[] }>;
    },
  });

  const members: Member[] = data?.members ?? [];
  // Sort: owner first, then alphabetical by display name. The owner row
  // is informational (cannot be revoked, no power affordances) but
  // shows where authority sits in the budget — particularly useful for
  // SHARED budgets where a member needs to know who to ask.
  const sortedMembers = [...members].sort((a, b) => {
    if (a.role === "owner" && b.role !== "owner") return -1;
    if (a.role !== "owner" && b.role === "owner") return 1;
    const an = (a.name ?? a.email ?? a.userId).toLowerCase();
    const bn = (b.name ?? b.email ?? b.userId).toLowerCase();
    return an.localeCompare(bn);
  });
  const isOwner = currentUserRole === "owner";

  const handleRevoke = async (memberId: string) => {
    try {
      const res = await api.budgets[":id"].members[":memberId"].revoke.$post({
        param: { id: budgetId, memberId },
      });
      if (!res.ok) throw new Error("Failed to revoke member");
      await queryClient.invalidateQueries({
        queryKey: ["budget-members", budgetId],
      });
      toast.success(t("members.revoked_toast"));
    } catch {
      toast.error(t("members.revoke_error"));
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-12 w-full" />
      </div>
    );
  }

  const getInitials = (member: Member) => {
    const displayName = member.name ?? member.email ?? member.userId;
    return displayName.slice(0, 2).toUpperCase();
  };

  const getDisplayName = (member: Member) =>
    member.name ?? member.email ?? member.userId;

  return (
    <div className="space-y-4">
      {sortedMembers.length === 0 ? (
        <p className="text-sm text-[var(--muted-foreground)]">
          {t("members.empty")}
        </p>
      ) : (
        <ul className="divide-y divide-[var(--hairline-on-dark)] rounded-xl bg-[var(--surface-elevated-dark)]">
          {sortedMembers.map((member) => {
            const isOwnerRow = member.role === "owner";
            return (
              <li
                key={member.userId}
                className="flex items-center justify-between px-4 py-3"
              >
                <div className="flex items-center gap-3">
                  <Avatar className="h-8 w-8">
                    <AvatarFallback className="bg-[var(--surface-card-dark)] text-xs text-[var(--body)]">
                      {getInitials(member)}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <p className="text-sm text-[var(--body)]">
                      {getDisplayName(member)}
                    </p>
                  </div>
                  {/* Owner badge is primary-tinted to read as authority,
                      member badge stays neutral. Both inline next to the
                      name rather than in a trailing column — the list is
                      flat enough that a single horizontal row reads
                      easier than a two-column table. */}
                  <Badge
                    variant="secondary"
                    className={
                      isOwnerRow
                        ? "border border-[var(--primary)]/40 bg-[color-mix(in_oklab,var(--primary)_14%,transparent)] text-[var(--primary)] text-xs"
                        : "text-xs"
                    }
                  >
                    {isOwnerRow
                      ? t("members.role_owner")
                      : t("members.role_member")}
                  </Badge>
                </div>
                {/* Revoke is owner-only AND row-not-owner. The owner row
                    is informational — there is no "demote owner" action
                    here; transferring ownership is its own future flow. */}
                {isOwner && !isOwnerRow && (
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="min-h-[44px] text-[var(--trading-down)] hover:bg-[var(--trading-down)]/10 hover:text-[var(--trading-down)]"
                      >
                        {t("members.revoke_button")}
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>
                          {t("members.revoke_dialog_title", {
                            name: getDisplayName(member),
                          })}
                        </AlertDialogTitle>
                        <AlertDialogDescription>
                          {t("members.revoke_dialog_body", {
                            name: getDisplayName(member),
                          })}
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>
                          {t("members.revoke_cancel")}
                        </AlertDialogCancel>
                        <AlertDialogAction
                          className="bg-[var(--trading-down)] text-white hover:bg-[var(--trading-down)]/90"
                          onClick={() => handleRevoke(member.userId)}
                        >
                          {t("members.revoke_confirm")}
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {/* Generate share link — owner only. ShareUrlField owns the
          button↔URL state so a single click on "Generate share link"
          hits the API and reveals the URL field (no intermediate reveal
          step). Non-owners do not see this control; the backend also
          enforces a 403 on the underlying POST so the gate is
          defense-in-depth. */}
      {isOwner && <ShareUrlField budgetId={budgetId} />}
    </div>
  );
}
