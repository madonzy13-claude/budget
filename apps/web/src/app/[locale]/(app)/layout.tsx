import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { SignOutButton } from "@/components/auth/sign-out-button";
import { BrandMark } from "@/components/common/brand-mark";
import { SiteFooter } from "@/components/common/site-footer";

interface AppLayoutProps {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}

/**
 * Authenticated app shell. DESIGN.md `top-nav-dark` — 64px height, dark canvas,
 * yellow brand mark left, nav links + sign-out cluster right.
 *
 * The verify-email banner sits flush above the nav so it visually owns the
 * top of the page until verification completes.
 */
export default async function AppLayout({ children, params }: AppLayoutProps) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "nav" });

  return (
    <div className="flex min-h-screen flex-col bg-[var(--canvas-dark)] text-[var(--body-on-dark)]">
      <AppVerifyBannerSlot />

      <header className="sticky top-0 z-40 border-b border-[var(--hairline-dark)] bg-[var(--canvas-dark)]/95 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
          <div className="flex items-center gap-8">
            <BrandMark href={`/${locale}/workspaces`} />
            <nav className="hidden items-center gap-6 sm:flex">
              <Link
                href={`/${locale}/workspaces`}
                className="text-nav-link text-[var(--muted-foreground)] transition-colors hover:text-[var(--on-dark)]"
              >
                {t("workspaces")}
              </Link>
              <Link
                href={`/${locale}/settings`}
                className="text-nav-link text-[var(--muted-foreground)] transition-colors hover:text-[var(--on-dark)]"
              >
                {t("settings")}
              </Link>
            </nav>
          </div>
          <div className="flex items-center gap-2">
            <SignOutButton locale={locale} />
          </div>
        </div>
      </header>

      <div className="flex-1">{children}</div>

      <SiteFooter />
    </div>
  );
}

/**
 * Client wrapper for verify-email banner. Phase 1: returns null — workspace
 * pages render the banner with their own session data.
 */
function AppVerifyBannerSlot() {
  return null;
}
