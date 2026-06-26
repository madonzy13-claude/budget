"use client";

/**
 * user-settings-shell.tsx — the User Settings page as a SINGLE client-rendered
 * unit, mirroring the BDP budget-detail.tsx pattern but LIGHTER (2 pills, no
 * per-pill RSC data, no task slider).
 *
 * Pills are BUTTONS: switching is pure client state — clicking a pill sets
 * `activeTab` and pushes the URL with history.pushState (NO Next navigation, so
 * no per-pill RSC round-trip). The carousel slide plays instantly. The server
 * catch-all `[[...tab]]/page.tsx` seeds `initialTab` from the path; a popstate
 * listener mirrors browser back/forward back into state so deep-links + back
 * button stay correct.
 *
 * General reads the user's locale/currency (seeded from the server session);
 * User mounts the Profile/Security/Danger accordion (client components).
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { GeneralPill } from "@/components/settings/general-pill";
import { UserPill } from "@/components/settings/user-pill";
import type { ProfileSectionProps } from "@/components/settings/profile-section";
import {
  SETTINGS_TAB_ORDER,
  isSettingsTab,
  type SettingsTab,
} from "@/lib/settings-tabs";

interface UserSettingsShellProps {
  locale: string;
  initialTab: SettingsTab;
  initialLocale: string;
  initialDisplayCurrency?: string;
  initialProfile: ProfileSectionProps;
}

const variants = {
  enter: (dir: number) => ({ x: dir >= 0 ? "100%" : "-100%" }),
  center: { x: "0%" },
  exit: (dir: number) => ({ x: dir >= 0 ? "-100%" : "100%" }),
};

function Pane({
  tab,
  initialLocale,
  initialDisplayCurrency,
  initialProfile,
}: {
  tab: SettingsTab;
  initialLocale: string;
  initialDisplayCurrency?: string;
  initialProfile: ProfileSectionProps;
}) {
  if (tab === "general") {
    return (
      <GeneralPill
        initialLocale={initialLocale}
        initialDisplayCurrency={initialDisplayCurrency}
      />
    );
  }
  return <UserPill profile={initialProfile} />;
}

export function UserSettingsShell({
  locale,
  initialTab,
  initialLocale,
  initialDisplayCurrency,
  initialProfile,
}: UserSettingsShellProps) {
  const t = useTranslations("settings.pills");
  const tRoot = useTranslations("settings");
  const reduce = useReducedMotion();
  const [activeTab, setActiveTab] = useState<SettingsTab>(initialTab);

  // Direction + monotonic per-switch key (ported from budget-detail.tsx).
  const prevIdx = useRef(SETTINGS_TAB_ORDER.indexOf(initialTab));
  const lastTab = useRef<SettingsTab>(initialTab);
  const navKey = useRef(0);
  const curIdx = SETTINGS_TAB_ORDER.indexOf(activeTab);
  const dir = curIdx >= prevIdx.current ? 1 : -1;
  if (activeTab !== lastTab.current) {
    navKey.current += 1;
    lastTab.current = activeTab;
    prevIdx.current = curIdx;
  }

  const select = useCallback(
    (tab: SettingsTab) => {
      setActiveTab((prev) => {
        if (prev === tab) return prev;
        // URL sync for bookmark/back — NOT a Next navigation, so no RSC fetch.
        const path =
          tab === "general"
            ? `/${locale}/settings`
            : `/${locale}/settings/${tab}`;
        window.history.pushState(null, "", path);
        return tab;
      });
    },
    [locale],
  );

  // Browser back/forward → mirror the URL's tab back into state.
  useEffect(() => {
    function onPop() {
      const m = window.location.pathname.match(/\/settings\/([^/]+)/);
      const tab = isSettingsTab(m?.[1]) ? (m![1] as SettingsTab) : "general";
      setActiveTab(tab);
    }
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  return (
    <main className="mx-auto w-full max-w-3xl px-4 pt-6 pb-12 sm:px-6 sm:pb-16">
      <header className="mb-6 space-y-2">
        <p className="text-caption uppercase tracking-wide text-[var(--muted-foreground)]">
          {tRoot("eyebrow")}
        </p>
        <h1 className="text-display-sm text-[var(--on-dark)]">
          {tRoot("heading")}
        </h1>
      </header>

      {/* Pill bar — 2 buttons with a sliding yellow active pill (mirrors BdpTabs). */}
      <nav
        aria-label={t("aria", { defaultValue: "Settings sections" })}
        className="mb-8 flex items-center gap-2"
        data-testid="settings-pills"
      >
        {SETTINGS_TAB_ORDER.map((tab) => {
          const active = tab === activeTab;
          const label = t(tab);
          return (
            <button
              key={tab}
              type="button"
              data-testid={`settings-pill-${tab}`}
              onClick={() => select(tab)}
              aria-current={active ? "page" : undefined}
              className={cn(
                "relative inline-flex h-9 items-center rounded-[var(--radius-pill)] px-4 transition-colors",
                "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--info)]",
                "min-h-[44px] sm:min-h-0",
                active
                  ? "text-[var(--on-primary)] text-sm font-semibold"
                  : "text-[var(--muted-foreground)] hover:bg-[var(--surface-elevated-dark)] hover:text-[var(--body-on-dark)]",
              )}
            >
              {active && (
                <motion.span
                  layoutId="settings-pill"
                  aria-hidden="true"
                  className="absolute inset-0 z-0 rounded-[var(--radius-pill)] bg-[var(--primary)]"
                  transition={{ duration: 0.7, ease: [0.32, 0.72, 0, 1] }}
                />
              )}
              <span className="relative z-10">{label}</span>
            </button>
          );
        })}
      </nav>

      <div className="grid grid-cols-[minmax(0,1fr)] overflow-x-clip">
        <AnimatePresence initial={false} custom={dir}>
          <motion.div
            key={navKey.current}
            className="min-w-0 [grid-area:1/1]"
            custom={dir}
            variants={reduce ? undefined : variants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={
              reduce
                ? { duration: 0 }
                : { duration: 0.7, ease: [0.32, 0.72, 0, 1] }
            }
          >
            <Pane
              tab={activeTab}
              initialLocale={initialLocale}
              initialDisplayCurrency={initialDisplayCurrency}
              initialProfile={initialProfile}
            />
          </motion.div>
        </AnimatePresence>
      </div>
    </main>
  );
}
