import { getTranslations } from "next-intl/server";
import { UserSettingsShell } from "@/components/settings/user-settings-shell";
import { getServerSession } from "@/lib/server-session";

/**
 * User Settings — catch-all `[[...tab]]` route. The page is now a single stacked
 * accordion (General · Profile · Security · Danger Zone), so the path segment is
 * ignored; `/settings` and any legacy `/settings/*` deep-link render the same page.
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
  const { locale } = await params;

  const session = await getServerSession({ disableCookieCache: true });
  const initialDisplayCurrency = session?.user?.displayCurrency ?? undefined;
  const initialTimezone =
    (session?.user as { timezone?: string } | undefined)?.timezone ?? undefined;

  return (
    <>
      <UserSettingsShell
        initialLocale={locale}
        initialDisplayCurrency={initialDisplayCurrency}
        initialTimezone={initialTimezone}
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
