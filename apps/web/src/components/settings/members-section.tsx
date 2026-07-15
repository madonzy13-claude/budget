"use client";

/**
 * members-section.tsx — D-14, D-16 (SETT-05..07)
 *
 * Lists members with avatar + name + role badge + Revoke button.
 * Generate share link reveals ephemeral ShareUrlField.
 * Revoke requires AlertDialog confirm before firing POST.
 */
import { useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { MoreHorizontal } from "lucide-react";
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
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ShareUrlField } from "@/components/settings/share-url-field";
import { api } from "@/lib/api-client";
import { initialsOf } from "@/lib/initials";

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
  // Single controlled remove-confirm (opened from a member's ⋯ menu) — cleaner
  // than an AlertDialog per row and avoids nesting a dialog inside the dropdown.
  const [removeTarget, setRemoveTarget] = useState<Member | null>(null);

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
      if (res.status === 409) {
        toast.error(t("members.last_owner_error"));
        return;
      }
      if (!res.ok) throw new Error("Failed to revoke member");
      await queryClient.invalidateQueries({
        queryKey: ["budget-members", budgetId],
      });
      toast.success(t("members.revoked_toast"));
    } catch {
      toast.error(t("members.revoke_error"));
    }
  };

  // Promote a member to owner, or demote an owner to member. Any owner may do
  // this to anyone; the server protects the last owner (409 → friendly toast).
  const handleRoleChange = async (
    memberId: string,
    role: "owner" | "member",
  ) => {
    try {
      const res = await api.budgets[":id"].members[":memberId"].role.$post({
        param: { id: budgetId, memberId },
        json: { role },
      });
      if (res.status === 409) {
        toast.error(t("members.last_owner_error"));
        return;
      }
      if (!res.ok) throw new Error("Failed to change role");
      await queryClient.invalidateQueries({
        queryKey: ["budget-members", budgetId],
      });
      toast.success(t("members.role_changed_toast"));
    } catch {
      toast.error(t("members.role_change_error"));
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

  const getDisplayName = (member: Member) =>
    member.name ?? member.email ?? member.userId;

  return (
    <div className="space-y-4">
      {sortedMembers.length === 0 ? (
        <p className="text-sm text-[var(--muted-foreground)]">
          {t("members.empty")}
        </p>
      ) : (
        <ul className="divide-y divide-[var(--hairline-on-dark)] overflow-hidden rounded-xl border border-[var(--hairline-on-dark)] bg-[var(--surface-elevated-dark)]">
          {sortedMembers.map((member) => {
            const isOwnerRow = member.role === "owner";
            const displayName = getDisplayName(member);
            // Show the email as a secondary line only when there's a distinct name
            // above it (otherwise the name row already IS the email).
            const subline =
              member.name && member.email ? member.email : null;
            return (
              <li
                key={member.userId}
                className="flex items-center gap-3 px-4 py-3.5"
              >
                {/* Avatar matches the header profile icon (surface-card bg so the
                    circle contrasts against the elevated list, hairline ring,
                    shared word-based initials). */}
                <Avatar className="size-9 shrink-0 ring-1 ring-[var(--hairline-on-dark)]">
                  <AvatarFallback className="bg-[var(--surface-card-dark)] text-xs font-semibold text-[var(--body-on-dark)]">
                    {initialsOf(member.name, member.email)}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-[var(--body-on-dark)]">
                    {displayName}
                  </p>
                  {subline && (
                    <p className="truncate text-xs text-[var(--muted-foreground)]">
                      {subline}
                    </p>
                  )}
                </div>
                {/* Owner pill = primary-tinted (authority); member pill = neutral
                    grey. */}
                <Badge
                  variant="secondary"
                  className={
                    isOwnerRow
                      ? "shrink-0 border border-[var(--primary)]/40 bg-[color-mix(in_oklab,var(--primary)_14%,transparent)] text-[var(--primary)] text-xs"
                      : "shrink-0 border border-[var(--muted-foreground)]/40 bg-[color-mix(in_oklab,var(--muted-foreground)_14%,transparent)] text-[var(--muted-foreground)] text-xs"
                  }
                >
                  {isOwnerRow
                    ? t("members.role_owner")
                    : t("members.role_member")}
                </Badge>
                {/* Owner-only management in a compact ⋯ menu (promote/demote +
                    remove). Any owner may act on anyone; the server protects the
                    LAST owner (409 → friendly toast). */}
                {isOwner && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        data-testid={`member-menu-${member.userId}`}
                        aria-label={t("members.manage_aria", {
                          name: displayName,
                        })}
                        className="size-8 shrink-0 text-[var(--muted-foreground)] hover:text-[var(--body-on-dark)]"
                      >
                        <MoreHorizontal className="size-4" aria-hidden="true" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="min-w-44">
                      <DropdownMenuItem
                        data-testid={`role-toggle-${member.userId}`}
                        onClick={() =>
                          handleRoleChange(
                            member.userId,
                            isOwnerRow ? "member" : "owner",
                          )
                        }
                      >
                        {isOwnerRow
                          ? t("members.make_member")
                          : t("members.make_owner")}
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        data-testid={`member-remove-${member.userId}`}
                        className="text-[var(--trading-down)] focus:bg-[var(--trading-down)]/10 focus:text-[var(--trading-down)]"
                        onClick={() => setRemoveTarget(member)}
                      >
                        {t("members.revoke_button")}
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {/* One controlled remove-confirm for the whole list. */}
      <AlertDialog
        open={removeTarget !== null}
        onOpenChange={(o) => !o && setRemoveTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("members.revoke_dialog_title", {
                name: removeTarget ? getDisplayName(removeTarget) : "",
              })}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("members.revoke_dialog_body", {
                name: removeTarget ? getDisplayName(removeTarget) : "",
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("members.revoke_cancel")}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-[var(--trading-down)] text-white hover:bg-[var(--trading-down)]/90"
              onClick={() => {
                if (removeTarget) void handleRevoke(removeTarget.userId);
                setRemoveTarget(null);
              }}
            >
              {t("members.revoke_confirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

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
