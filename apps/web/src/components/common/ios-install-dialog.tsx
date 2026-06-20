"use client";

/**
 * ios-install-dialog.tsx — Add-to-Home-Screen instructions for iOS.
 *
 * iOS has no beforeinstallprompt; this dialog is the install path there.
 * Opened from InstallBanner's CTA and the profile-menu "Install app" entry.
 */

import { useTranslations } from "next-intl";
import { Share, SquarePlus, Check } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogClose,
} from "@/components/ui/dialog";

interface IosInstallDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function IosInstallDialog({
  open,
  onOpenChange,
}: IosInstallDialogProps) {
  const t = useTranslations("pwa.install.ios");

  const steps = [
    { icon: Share, label: t("step1") },
    { icon: SquarePlus, label: t("step2") },
    { icon: Check, label: t("step3") },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-testid="ios-install-dialog">
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
        </DialogHeader>
        <ol className="space-y-3 py-2">
          {steps.map(({ icon: Icon, label }, i) => (
            <li
              key={label}
              className="flex items-start gap-3 text-sm text-[var(--body-on-dark)]"
            >
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--surface-elevated-dark)] text-xs font-semibold text-[var(--primary)]">
                {i + 1}
              </span>
              <Icon
                className="mt-0.5 h-4 w-4 shrink-0 text-[var(--primary)]"
                aria-hidden="true"
              />
              <span>{label}</span>
            </li>
          ))}
        </ol>
        <DialogClose asChild>
          <button
            type="button"
            className="mt-2 w-full rounded bg-[var(--primary)] py-2 text-sm font-semibold text-[var(--primary-foreground)]"
          >
            {t("close")}
          </button>
        </DialogClose>
      </DialogContent>
    </Dialog>
  );
}
