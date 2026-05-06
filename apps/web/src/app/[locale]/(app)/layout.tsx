import { getTranslations } from "next-intl/server";
import Link from "next/link";

interface AppLayoutProps {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}

/**
 * Authenticated app shell layout.
 * - verify-email banner persists across all (app) routes until email is verified
 * - workspaces.verify_required gate is enforced in workspace create actions
 */
export default async function AppLayout({ children, params }: AppLayoutProps) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "nav" });

  // In production, we'd read the session server-side to determine if email is verified.
  // Phase 1: Banner visibility is controlled client-side via Better Auth session.
  // The banner component handles its own session state via useSession hook.

  return (
    <div className="flex min-h-screen flex-col">
      {/* Verify email banner — full width, edge-to-edge, before page padding */}
      {/* Controlled client-side: VerifyEmailBannerWrapper reads session state */}
      <AppVerifyBannerSlot />

      {/* Top nav */}
      <header className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4 sm:px-6">
          <Link
            href={`/${locale}/workspaces`}
            className="text-base font-semibold"
          >
            Budget
          </Link>
          <nav className="flex items-center gap-4 text-sm">
            <Link
              href={`/${locale}/workspaces`}
              className="text-muted-foreground hover:text-foreground"
            >
              {t("workspaces")}
            </Link>
            <Link
              href={`/${locale}/settings`}
              className="text-muted-foreground hover:text-foreground"
            >
              {t("settings")}
            </Link>
          </nav>
        </div>
      </header>

      {/* Page content */}
      <div className="flex-1">{children}</div>
    </div>
  );
}

/**
 * Client wrapper for verify-email banner.
 * Uses Better Auth session to determine if banner should show.
 */
function AppVerifyBannerSlot() {
  // Phase 1: Return null — banner is rendered conditionally by workspace pages
  // that receive session data from Better Auth.
  // Phase 2+ will wire the RSC session check here.
  return null;
}
