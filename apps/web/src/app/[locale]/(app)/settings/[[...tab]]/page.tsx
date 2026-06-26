import { getTranslations } from "next-intl/server";
import { UserSettingsShell } from "@/components/settings/user-settings-shell";
import { getServerSession } from "@/lib/server-session";
import { isSettingsTab, type SettingsTab } from "@/lib/settings-tabs";

/**
 * User Settings — catch-all `[[...tab]]` route (mirrors the BDP `[[...tab]]`).
 *
 * One route segment serves both pill URLs (`/settings` → General, `/settings/user`
 * → User). The pill is read from the path here (direct loads / bookmarks /
 * deep-links) and seeded into <UserSettingsShell>, which from then on switches
 * pills in pure client state (pushState, no Next nav) — no per-pill RSC round-trip.
 *
 * The session is read FRESH (bypass the 60s Better Auth cookie cache): the
 * display-currency PUT updates the DB directly, so the cached session would serve
 * a stale currency for up to 60s and the picker would render the old value on
 * reload. Auth is enforced by the (app) layout + middleware; no tenant data here.
 */
interface SettingsPageProps {
  params: Promise<{ locale: string; tab?: string[] }>;
}

export default async function SettingsPage({ params }: SettingsPageProps) {
  const { locale, tab } = await params;
  const seg = tab?.[0];
  const initialTab: SettingsTab = isSettingsTab(seg) ? seg : "general";

  const session = await getServerSession({ disableCookieCache: true });
  const initialDisplayCurrency = session?.user?.displayCurrency ?? undefined;

  return (
    <>
      <UserSettingsShell
        locale={locale}
        initialTab={initialTab}
        initialLocale={locale}
        initialDisplayCurrency={initialDisplayCurrency}
        initialProfile={{
          name: session?.user?.name ?? "",
          email: session?.user?.email ?? "",
          emailVerified: session?.user?.emailVerified ?? true,
        }}
      />
      <BuildStamp locale={locale} />
    </>
  );
}

/* Build-freshness stamp (260614-rwt): muted footer so on-device freshness can be
   confirmed without the removed debug overlay. NEXT_PUBLIC_BUILD_ID is inlined at
   build time in next.config.mjs. */
async function BuildStamp({ locale }: { locale: string }) {
  const t = await getTranslations({ locale, namespace: "settings" });
  return (
    <footer className="mx-auto max-w-3xl border-t border-[var(--hairline-dark)] px-4 pt-4 pb-10 sm:px-6">
      <p className="text-[11px] text-[var(--muted-foreground)]">
        {t("build.label", { defaultValue: "Build" })}{" "}
        {process.env.NEXT_PUBLIC_BUILD_ID ?? "dev"}
      </p>
    </footer>
  );
}
