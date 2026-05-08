"use client";

import { useState, useCallback } from "react";
import { useTranslations } from "next-intl";
import { History, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { api } from "@/lib/api-client";

export interface ShareMember {
  userId: string;
  name: string;
  email: string;
  sharePercent: number;
}

interface SharesEditorProps {
  workspaceId: string;
  initialMembers: ShareMember[];
}

const SHARE_SUM_TARGET = 100;
const SHARE_SUM_TOLERANCE = 0.005;

export function SharesEditor({
  workspaceId,
  initialMembers,
}: SharesEditorProps) {
  const t = useTranslations("workspace.shares");
  const [members, setMembers] = useState<ShareMember[]>(initialMembers);
  const [isSaving, setIsSaving] = useState(false);
  const [isDirty, setIsDirty] = useState(false);

  const total = members.reduce(
    (sum, m) => sum + (Number(m.sharePercent) || 0),
    0,
  );
  const isValid = Math.abs(total - SHARE_SUM_TARGET) <= SHARE_SUM_TOLERANCE;
  const canSave = isValid && isDirty;

  const handleShareChange = useCallback((userId: string, rawValue: string) => {
    const parsed = parseFloat(rawValue);
    const value = isNaN(parsed) ? 0 : Math.max(0, Math.min(100, parsed));
    setMembers((prev) =>
      prev.map((m) =>
        m.userId === userId ? { ...m, sharePercent: value } : m,
      ),
    );
    setIsDirty(true);
  }, []);

  const handleSave = useCallback(async () => {
    if (!canSave) return;
    setIsSaving(true);
    try {
      const res = await api.workspaces[":id"].shares.$put({
        param: { id: workspaceId },
        json: {
          shares: members.map((m) => ({
            userId: m.userId,
            sharePercent: m.sharePercent,
          })),
        },
      });

      if (!res.ok) {
        throw new Error("Save failed");
      }

      setIsDirty(false);
      toast.success(t("save_success"));
    } catch {
      toast.error(
        t("save_error", { defaultValue: "Failed to save shares. Try again." }),
      );
    } finally {
      setIsSaving(false);
    }
  }, [canSave, workspaceId, members, t]);

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h2 className="text-title-md text-[var(--foreground)]">
          {t("heading")}
        </h2>
        <p className="max-w-prose text-sm text-[var(--muted-foreground)]">
          {t("body")}
        </p>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t("col.member")}</TableHead>
            <TableHead className="w-32 text-right">
              {t("col.percentage")}
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {members.map((member) => (
            <TableRow key={member.userId}>
              <TableCell>
                <div className="space-y-0.5">
                  <p className="font-medium text-[var(--foreground)]">
                    {member.name}
                  </p>
                  <p className="text-xs text-[var(--muted-foreground)]">
                    {member.email}
                  </p>
                </div>
              </TableCell>
              <TableCell className="text-right">
                <div className="flex items-center justify-end gap-1">
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    max="100"
                    inputMode="decimal"
                    value={member.sharePercent}
                    onChange={(e) =>
                      handleShareChange(member.userId, e.target.value)
                    }
                    className="num w-24 text-right"
                    aria-label={`${member.name} share percentage`}
                  />
                  <span className="num text-sm text-[var(--muted-foreground)]">
                    %
                  </span>
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
        <TableFooter>
          <TableRow>
            <TableCell colSpan={1} className="font-medium" />
            <TableCell className="text-right">
              <p
                className={cn(
                  "num text-sm",
                  isValid
                    ? "text-[var(--trading-up)]"
                    : "text-[var(--trading-down)]",
                )}
              >
                {isValid
                  ? t("total.ok")
                  : t("total.error", { percentage: total.toFixed(2) })}
              </p>
            </TableCell>
          </TableRow>
        </TableFooter>
      </Table>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="flex items-center gap-1.5 text-sm text-[var(--muted-foreground)]">
          <History className="h-3.5 w-3.5" />
          {t("audit_hint")}
        </p>
        <Button onClick={handleSave} disabled={!canSave || isSaving}>
          {isSaving ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              {t("saving", { defaultValue: "Saving..." })}
            </>
          ) : (
            t("save")
          )}
        </Button>
      </div>
    </div>
  );
}
