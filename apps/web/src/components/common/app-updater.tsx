"use client";

/**
 * app-updater.tsx — keeps the installed app on the latest build (user, 261023).
 *
 * Replaces the old controllerchange reloader, which reloaded mid-action, only
 * looked on resume, and — through a once-per-session guard — ignored every
 * deploy after the first until the app was swiped away.
 *
 * Asks /version.json on open, on resume and every 30 minutes. A stale app
 * reloads when nobody is using it (see readyToReload); a plain reload that
 * brings the old build back escalates to a clean one, then stops. The page
 * comes back scrolled where it was, and announces the new version once.
 */
import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import {
  APP_VERSION,
  RUNNING_BUILD,
  cleanReload,
  fetchLatestBuild,
  nextUpdateStep,
  readAttempt,
  readyToReload,
  setLatestBuild,
  writeAttempt,
} from "@/lib/app-update";

const CHECK_MS = 30 * 60_000;
/** A resume within this of the last check doesn't ask again. */
const RESUME_CHECK_MS = 60_000;
const TICK_MS = 5_000;
const SCROLL_KEY = "app-update-scroll";

function scroller(): HTMLElement | null {
  return document.querySelector<HTMLElement>("main[data-shell-scroll]");
}

function saveScroll() {
  const top = scroller()?.scrollTop || window.scrollY || 0;
  try {
    sessionStorage.setItem(
      SCROLL_KEY,
      JSON.stringify({ path: window.location.pathname, top }),
    );
  } catch {
    // storage blocked — reload lands at the top
  }
}

/** Put the page back where it was; content may need a moment to lay out. */
function restoreScroll(): () => void {
  let saved: { path: string; top: number } | null = null;
  try {
    saved = JSON.parse(sessionStorage.getItem(SCROLL_KEY) ?? "null");
    sessionStorage.removeItem(SCROLL_KEY);
  } catch {
    return () => {};
  }
  if (!saved || saved.path !== window.location.pathname || !saved.top)
    return () => {};
  const top = saved.top;
  let tries = 0;
  const id = setInterval(() => {
    const main = scroller();
    if (main) main.scrollTop = top;
    else window.scrollTo(0, top);
    const at = main ? main.scrollTop : window.scrollY;
    if (at >= top || ++tries >= 30) clearInterval(id);
  }, 100);
  return () => clearInterval(id);
}

export function AppUpdater() {
  const t = useTranslations("settings");
  const qc = useQueryClient();
  const tRef = useRef(t);
  tRef.current = t;

  useEffect(() => {
    // The update this page is the result of: say so once.
    const landed = readAttempt();
    if (landed?.target === RUNNING_BUILD) {
      writeAttempt(null);
      toast.success(tRef.current("version.updated", { version: APP_VERSION }));
    }
    const stopRestore = restoreScroll();

    let lastInputAt: number | null = null;
    let latest: string | null = null;
    let lastCheck = 0;
    let acting = false;

    const onInput = () => {
      lastInputAt = Date.now();
    };
    const busy = () => {
      const a = document.activeElement as HTMLElement | null;
      return (
        !!a &&
        (a.tagName === "INPUT" ||
          a.tagName === "TEXTAREA" ||
          a.tagName === "SELECT" ||
          a.isContentEditable)
      ) ||
        !!document.querySelector('[role="dialog"]') ||
        qc.isMutating() > 0;
    };

    const tryReload = () => {
      if (acting || !latest) return;
      const ready = readyToReload({
        stale: latest !== RUNNING_BUILD,
        busy: busy(),
        lastInputAt,
        now: Date.now(),
      });
      if (!ready) return;
      const step = nextUpdateStep(readAttempt(), latest);
      if (step === "stop") return;
      acting = true;
      writeAttempt({ target: latest, step });
      saveScroll();
      if (step === "clean") void cleanReload();
      else window.location.reload();
    };

    const check = async () => {
      lastCheck = Date.now();
      const id = await fetchLatestBuild();
      if (!id) return;
      latest = id;
      setLatestBuild(id);
      if (id !== RUNNING_BUILD)
        // Let the service worker fetch the new build too.
        void navigator.serviceWorker?.ready
          .then((r) => r.update())
          .catch(() => {});
      tryReload();
    };

    const onVisibility = () => {
      // Coming back to the app is like opening it: untouched again.
      if (document.visibilityState === "hidden") {
        lastInputAt = null;
        return;
      }
      if (Date.now() - lastCheck >= RESUME_CHECK_MS) void check();
      else tryReload();
    };
    const tick = setInterval(() => {
      if (document.visibilityState === "hidden") return;
      if (Date.now() - lastCheck >= CHECK_MS) void check();
      else tryReload();
    }, TICK_MS);

    document.addEventListener("pointerdown", onInput, true);
    document.addEventListener("keydown", onInput, true);
    document.addEventListener("visibilitychange", onVisibility);
    void check();
    return () => {
      stopRestore();
      clearInterval(tick);
      document.removeEventListener("pointerdown", onInput, true);
      document.removeEventListener("keydown", onInput, true);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [qc]);

  return null;
}
