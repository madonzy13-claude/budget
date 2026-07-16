import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { MailCheck, Clock, Lock } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { SignInForm } from "@/components/auth/sign-in-form";
import { BrandMark } from "@/components/common/brand-mark";
import { InstallBanner } from "@/components/common/install-banner";
import { PublicLocaleSwitcher } from "@/components/common/public-locale-switcher";
import { HeaderThemeToggle } from "@/components/common/header-theme-toggle";
import { SiteFooter } from "@/components/common/site-footer";

interface SignInPageProps {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export async function generateMetadata({ params }: SignInPageProps) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "auth.signin" });
  return { title: t("heading") };
}

export default async function SignInPage({
  params,
  searchParams,
}: SignInPageProps) {
  const { locale } = await params;
  const sp = await searchParams;
  const t = await getTranslations({ locale, namespace: "auth" });
  const showVerifyPending = sp.verify === "pending";
  const reason = typeof sp.reason === "string" ? sp.reason : null;
  const showSessionExpired = reason === "session_expired";
  const showAuthRequired = reason === "required";

  return (
    <div className="flex min-h-screen flex-col bg-[var(--canvas-dark)]">
      {/* r40: the install nudge must reach users BEFORE they log in — the
          logged-out entry pages are where new devices land. */}
      <InstallBanner />
      <header className="border-b border-[var(--hairline-dark)]">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-4 sm:px-6">
          <BrandMark href={`/${locale}`} />
          <div className="flex items-center gap-2">
            <PublicLocaleSwitcher current={locale} />
            <HeaderThemeToggle />
          </div>
        </div>
      </header>

      <main className="flex flex-1 items-center justify-center px-4 py-10">
        <div className="w-full max-w-md">
          {showVerifyPending && (
            <Alert
              variant="warning"
              className="mb-6"
              data-testid="verify-pending-banner"
            >
              <MailCheck />
              <AlertTitle>{t("signin.verify_pending.title")}</AlertTitle>
              <AlertDescription>
                {t("signin.verify_pending.body")}
              </AlertDescription>
            </Alert>
          )}

          {showSessionExpired && (
            <Alert
              variant="warning"
              className="mb-6"
              data-testid="session-expired-banner"
            >
              <Clock />
              <AlertTitle>{t("signin.session_expired.title")}</AlertTitle>
              <AlertDescription>
                {t("signin.session_expired.body")}
              </AlertDescription>
            </Alert>
          )}

          {showAuthRequired && (
            <Alert
              variant="warning"
              className="mb-6"
              data-testid="auth-required-banner"
            >
              <Lock />
              <AlertTitle>{t("signin.auth_required.title")}</AlertTitle>
              <AlertDescription>
                {t("signin.auth_required.body")}
              </AlertDescription>
            </Alert>
          )}

          <Card>
            <CardHeader className="gap-2">
              <CardTitle className="text-display-sm">
                {t("signin.heading")}
              </CardTitle>
              <CardDescription>{t("have_account")}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <SignInForm locale={locale} />
              <div className="flex items-center justify-between text-sm text-[var(--muted-foreground)]">
                <Link
                  href={`/${locale}/sign-up`}
                  className="font-medium text-[var(--on-dark)] underline-offset-4 hover:underline"
                >
                  {t("signup_link")}
                </Link>
                <Link
                  href={`/${locale}/forgot-password`}
                  className="font-medium text-[var(--primary)] hover:text-[var(--primary-active)]"
                >
                  {t("signin.forgot")}
                </Link>
              </div>
            </CardContent>
          </Card>
        </div>
      </main>

      <SiteFooter />
    </div>
  );
}
