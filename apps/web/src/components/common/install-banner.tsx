"use client";

/**
 * install-banner.tsx — PWA install suggestion ribbon (08-05, reworked in UAT-08)
 *
 * Mobile-only (hidden above the `sm` breakpoint — desktop installs via the
 * profile-menu entry). Renders when the app is installable and not installed:
 *   - Chromium: beforeinstallprompt captured → CTA runs the native prompt
 *   - iOS: no beforeinstallprompt exists → CTA opens the Share → Add to
 *     Home Screen instructions dialog
 *
 * Hidden when: standalone, already installed (appinstalled flag or the
 * prompt-silence heuristic in install-detect.ts), or dismissed via ✕
 * (persisted in localStorage).
 */

import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import { X, Download, WifiOff, Zap, Bell } from "lucide-react";
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
  setInstalled,
  markSessionInstalled,
  subscribeToInstalled,
} from "@/lib/pwa-install-store";
import { isIos } from "@/lib/ios-install";
import { shouldAssumeInstalled } from "@/lib/install-detect";
import { IosInstallDialog } from "./ios-install-dialog";

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
  const [installed, setInstalledState] = useState(false);
  const [ios, setIos] = useState(false);
  const [learnMoreOpen, setLearnMoreOpen] = useState(false);
  const [iosDialogOpen, setIosDialogOpen] = useState(false);
  // Bumped on dismiss so visibility recomputes after the localStorage write.
  const [, setDismissTick] = useState(0);

  useEffect(() => {
    if (isStandalone()) return;

    setIos(isIos());

    function onBeforeInstallPrompt(e: Event) {
      e.preventDefault();
      setDeferredPrompt(
        e as unknown as Parameters<typeof setDeferredPrompt>[0],
      );
      setHasPrompt(true);
    }

    function onAppInstalled() {
      setInstalled(true);
    }

    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    window.addEventListener("appinstalled", onAppInstalled);

    // Subscribe to store in case prompt was already captured by another listener
    const unsubPrompt = subscribeToDeferredPrompt((prompt) => {
      if (prompt && !isStandalone()) setHasPrompt(true);
    });
    const unsubInstalled = subscribeToInstalled(setInstalledState);

    // Pre-existing installs never fire beforeinstallprompt and predate the
    // persisted appinstalled flag. Probe: if no prompt materialized within
    // the window on a Chromium browser with an active SW, assume installed
    // (session-only; a late prompt reverses it via the store).
    const probe = setTimeout(() => {
      if (
        shouldAssumeInstalled({
          swControlled: !!window.navigator.serviceWorker?.controller,
          hasPrompt: !!getDeferredPrompt(),
        })
      ) {
        markSessionInstalled(true);
      }
    }, 2500);

    return () => {
      clearTimeout(probe);
      window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
      window.removeEventListener("appinstalled", onAppInstalled);
      unsubPrompt();
      unsubInstalled();
    };
  }, []);

  async function handleInstall() {
    if (ios) {
      setIosDialogOpen(true);
      return;
    }
    const prompt = getDeferredPrompt();
    if (!prompt) return;
    await prompt.prompt();
    // A BeforeInstallPromptEvent is single-use; the browser refires
    // beforeinstallprompt later if the user dismissed the native prompt.
    setDeferredPrompt(null);
    setHasPrompt(false);
  }

  function handleDismiss() {
    try {
      localStorage.setItem(DISMISSED_KEY, "1");
    } catch {
      // storage unavailable
    }
    setDismissTick((n) => n + 1);
  }

  const visible =
    !isStandalone() && !installed && (hasPrompt || ios) && !isDismissed();

  if (!visible) return null;

  const benefits = [
    { icon: WifiOff, label: t("dialog.benefit1") },
    { icon: Zap, label: t("dialog.benefit2") },
    { icon: Bell, label: t("dialog.benefit3") },
  ];

  return (
    <>
      <div
        data-testid="install-banner"
        role="banner"
        aria-label={t("banner.ariaLabel")}
        className="flex items-center gap-3 bg-[color-mix(in_srgb,var(--primary)_15%,var(--surface-card-dark))] px-4 py-2.5 text-sm sm:hidden"
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
          <ul className="space-y-4 py-2">
            {benefits.map(({ icon: Icon, label }) => {
              const [head, ...rest] = label.split("—");
              const detail = rest.join("—").trim();
              return (
                <li key={label} className="flex items-start gap-3">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--surface-elevated-dark)]">
                    <Icon
                      className="h-4 w-4 text-[var(--primary)]"
                      aria-hidden="true"
                    />
                  </span>
                  <span className="min-w-0 text-sm">
                    <span className="block font-semibold text-[var(--body-on-dark)]">
                      {head.trim()}
                    </span>
                    {detail ? (
                      <span className="block text-[var(--muted-foreground)]">
                        {detail}
                      </span>
                    ) : null}
                  </span>
                </li>
              );
            })}
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

      <IosInstallDialog open={iosDialogOpen} onOpenChange={setIosDialogOpen} />
    </>
  );
}
