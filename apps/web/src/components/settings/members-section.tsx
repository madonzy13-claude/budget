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
}

export function MembersSection({ budgetId }: MembersSectionProps) {
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
  const nonOwnerMembers = members.filter((m) => m.role !== "owner");

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
      {nonOwnerMembers.length === 0 ? (
        <p className="text-sm text-[var(--muted-foreground)]">
          {t("members.empty")}
        </p>
      ) : (
        <ul className="divide-y divide-[var(--hairline-on-dark)] rounded-xl bg-[var(--surface-elevated-dark)]">
          {nonOwnerMembers.map((member) => (
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
                <Badge variant="secondary" className="text-xs">
                  {member.role === "owner"
                    ? t("members.role_owner")
                    : t("members.role_member")}
                </Badge>
              </div>
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
            </li>
          ))}
        </ul>
      )}

      {/* Generate share link — ShareUrlField owns the button↔URL state so a
          single click on "Generate share link" hits the API and reveals the URL
          field (no intermediate reveal step). */}
      <ShareUrlField budgetId={budgetId} />
    </div>
  );
}
