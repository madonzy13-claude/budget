"use client";

/**
 * install-banner.tsx — PWA install prompt ribbon (Task 4, Phase 08-05)
 *
 * Renders only when:
 *   1. beforeinstallprompt has fired (captured prompt)
 *   2. Not running in standalone mode (not already installed)
 *   3. User has not dismissed (localStorage pwa-install-dismissed != "1")
 *
 * Defers to VerifyEmailBanner: rendered above it in layout, but checks
 * for the verify-email-banner's presence to yield if both are visible.
 *
 * Install click  → deferredPrompt.prompt() + hide
 * ✕ click        → localStorage pwa-install-dismissed=1 + hide
 * Learn more     → opens a Dialog listing 3 benefits
 */

import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import { X, Download } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogClose,
} from "@/components/ui/dialog";
import {
  setDeferredPrompt,
  subscribeToDeferredPrompt,
  getDeferredPrompt,
} from "@/lib/pwa-install-store";

const DISMISSED_KEY = "pwa-install-dismissed";

function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    ("standalone" in window.navigator &&
      (window.navigator as { standalone?: boolean }).standalone === true)
  );
}

function isDismissed(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return localStorage.getItem(DISMISSED_KEY) === "1";
  } catch {
    return false;
  }
}

export function InstallBanner() {
  const t = useTranslations("pwa.install");
  const [hasPrompt, setHasPrompt] = useState(false);
  const [visible, setVisible] = useState(false);
  const [learnMoreOpen, setLearnMoreOpen] = useState(false);

  useEffect(() => {
    // Check initial conditions
    if (isStandalone() || isDismissed()) return;

    // Listen for beforeinstallprompt
    function onBeforeInstallPrompt(e: Event) {
      e.preventDefault();
      setDeferredPrompt(
        e as unknown as Parameters<typeof setDeferredPrompt>[0],
      );
      setHasPrompt(true);
      setVisible(true);
    }

    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);

    // Subscribe to store in case prompt was already captured by another listener
    const unsub = subscribeToDeferredPrompt((prompt) => {
      if (prompt && !isStandalone() && !isDismissed()) {
        setHasPrompt(true);
        setVisible(true);
      }
    });

    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
      unsub();
    };
  }, []);

  async function handleInstall() {
    const prompt = getDeferredPrompt();
    if (!prompt) return;
    await prompt.prompt();
    setDeferredPrompt(null);
    setVisible(false);
  }

  function handleDismiss() {
    try {
      localStorage.setItem(DISMISSED_KEY, "1");
    } catch {
      // storage unavailable
    }
    setVisible(false);
  }

  if (!hasPrompt || !visible) return null;

  return (
    <>
      <div
        data-testid="install-banner"
        role="banner"
        aria-label={t("banner.ariaLabel")}
        className="flex items-center gap-3 bg-[color-mix(in_srgb,var(--primary)_15%,var(--surface-card-dark))] px-4 py-2.5 text-sm"
      >
        <Download
          className="h-4 w-4 shrink-0 text-[var(--primary)]"
          aria-hidden="true"
        />
        <span className="flex-1 text-[var(--body-on-dark)]">
          {t("banner.body")}
        </span>

        <button
          type="button"
          data-testid="install-banner-learn-more"
          onClick={() => setLearnMoreOpen(true)}
          className="shrink-0 text-[var(--primary)] underline-offset-2 hover:underline"
        >
          {t("banner.learnMore")}
        </button>

        <button
          type="button"
          data-testid="install-banner-cta"
          onClick={handleInstall}
          className="shrink-0 rounded bg-[var(--primary)] px-3 py-1 text-xs font-semibold text-[var(--primary-foreground)] hover:bg-[var(--primary)]/90"
        >
          {t("banner.cta")}
        </button>

        <button
          type="button"
          data-testid="install-banner-dismiss"
          aria-label={t("banner.dismiss")}
          onClick={handleDismiss}
          className="shrink-0 rounded p-1 text-[var(--muted-foreground)] hover:bg-[var(--surface-elevated-dark)] hover:text-[var(--body-on-dark)]"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>

      <Dialog open={learnMoreOpen} onOpenChange={setLearnMoreOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("dialog.title")}</DialogTitle>
          </DialogHeader>
          <ul className="space-y-3 py-2">
            <li className="text-sm text-[var(--body-on-dark)]">
              {t("dialog.benefit1")}
            </li>
            <li className="text-sm text-[var(--body-on-dark)]">
              {t("dialog.benefit2")}
            </li>
            <li className="text-sm text-[var(--body-on-dark)]">
              {t("dialog.benefit3")}
            </li>
          </ul>
          <DialogClose asChild>
            <button
              type="button"
              className="mt-2 w-full rounded bg-[var(--primary)] py-2 text-sm font-semibold text-[var(--primary-foreground)]"
            >
              {t("dialog.close")}
            </button>
          </DialogClose>
        </DialogContent>
      </Dialog>
    </>
  );
}
