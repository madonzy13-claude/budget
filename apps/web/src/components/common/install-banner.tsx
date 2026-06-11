"use client";

/**
 * install-banner.tsx — PWA install / open-app ribbon (08-05, reworked in UAT-08)
 *
 * Three modes:
 *   install   — beforeinstallprompt captured: Install CTA runs the native prompt
 *   install (iOS) — iOS never fires beforeinstallprompt; CTA opens the
 *                   Share → Add to Home Screen instructions dialog instead
 *   open-app  — app already installed but page runs in a browser tab:
 *               CTA opens the app scope in a new top-level context so
 *               browsers with link capturing (launch_handler) focus the
 *               installed app window
 *
 * Never renders in standalone mode. Each mode has its own persistent
 * dismissal key so dismissing the install offer doesn't suppress the
 * later open-app hint (and vice versa).
 */

import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import { X, Download, ExternalLink } from "lucide-react";
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
const OPEN_APP_DISMISSED_KEY = "pwa-open-app-dismissed";

function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    ("standalone" in window.navigator &&
      (window.navigator as { standalone?: boolean }).standalone === true)
  );
}

function flagSet(key: string): boolean {
  if (typeof window === "undefined") return false;
  try {
    return localStorage.getItem(key) === "1";
  } catch {
    return false;
  }
}

function setFlag(key: string) {
  try {
    localStorage.setItem(key, "1");
  } catch {
    // storage unavailable
  }
}

export function InstallBanner() {
  const t = useTranslations("pwa.install");
  const [hasPrompt, setHasPrompt] = useState(false);
  const [installed, setInstalledState] = useState(false);
  const [ios, setIos] = useState(false);
  const [learnMoreOpen, setLearnMoreOpen] = useState(false);
  const [iosDialogOpen, setIosDialogOpen] = useState(false);
  // Bumped on dismiss so the mode recomputes after the localStorage write.
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

  function handleOpenApp() {
    // New top-level navigation: browsers with link capturing enabled
    // (manifest launch_handler) route it to the installed app window.
    window.open(`${window.location.origin}/`, "_blank", "noopener");
  }

  function handleDismiss(key: string) {
    setFlag(key);
    setDismissTick((n) => n + 1);
  }

  const mode: "install" | "open-app" | null = (() => {
    if (isStandalone()) return null;
    if (installed) return flagSet(OPEN_APP_DISMISSED_KEY) ? null : "open-app";
    if ((hasPrompt || ios) && !flagSet(DISMISSED_KEY)) return "install";
    return null;
  })();

  if (mode === null) return null;

  if (mode === "open-app") {
    return (
      <div
        data-testid="install-banner"
        role="banner"
        aria-label={t("openApp.ariaLabel")}
        className="flex items-center gap-3 bg-[color-mix(in_srgb,var(--primary)_15%,var(--surface-card-dark))] px-4 py-2.5 text-sm"
      >
        <ExternalLink
          className="h-4 w-4 shrink-0 text-[var(--primary)]"
          aria-hidden="true"
        />
        <span className="flex-1 text-[var(--body-on-dark)]">
          {t("openApp.body")}
        </span>

        <button
          type="button"
          data-testid="install-banner-open-app"
          onClick={handleOpenApp}
          className="shrink-0 rounded bg-[var(--primary)] px-3 py-1 text-xs font-semibold text-[var(--primary-foreground)] hover:bg-[var(--primary)]/90"
        >
          {t("openApp.cta")}
        </button>

        <button
          type="button"
          data-testid="install-banner-dismiss"
          aria-label={t("banner.dismiss")}
          onClick={() => handleDismiss(OPEN_APP_DISMISSED_KEY)}
          className="shrink-0 rounded p-1 text-[var(--muted-foreground)] hover:bg-[var(--surface-elevated-dark)] hover:text-[var(--body-on-dark)]"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
    );
  }

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
          onClick={() => handleDismiss(DISMISSED_KEY)}
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

      <IosInstallDialog open={iosDialogOpen} onOpenChange={setIosDialogOpen} />
    </>
  );
}
