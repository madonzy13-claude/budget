import { getTranslations } from "next-intl/server";
import Link from "next/link";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { SignUpForm } from "@/components/auth/sign-up-form";
import { BrandMark } from "@/components/common/brand-mark";
import { PublicLocaleSwitcher } from "@/components/common/public-locale-switcher";
import { HeaderThemeToggle } from "@/components/common/header-theme-toggle";
import { SiteFooter } from "@/components/common/site-footer";

interface SignUpPageProps {
  params: Promise<{ locale: string }>;
}

export async function generateMetadata({ params }: SignUpPageProps) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "auth.signup" });
  return { title: t("heading") };
}

export default async function SignUpPage({ params }: SignUpPageProps) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "auth" });

  return (
    <div className="flex min-h-screen flex-col bg-[var(--canvas-dark)]">
      <header className="border-b border-[var(--hairline-dark)]">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-4 sm:px-6">
          <BrandMark href={`/${locale}`} />
          <div className="flex items-center gap-2">
            <PublicLocaleSwitcher current={locale} />
            <HeaderThemeToggle />
          </div>
        </div>
      </header>

      <main className="flex flex-1 items-start justify-center px-4 py-10 sm:items-center">
        <div className="w-full max-w-md">
          <Card>
            <CardHeader className="gap-2">
              <CardTitle className="text-display-sm">
                {t("signup.heading")}
              </CardTitle>
              <CardDescription>{t("signup.subtitle")}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <SignUpForm defaultLocale={locale} />
              <p className="text-sm text-[var(--muted-foreground)]">
                {t("have_account")}{" "}
                <Link
                  href={`/${locale}/sign-in`}
                  className="font-medium text-[var(--on-dark)] underline-offset-4 hover:underline"
                >
                  {t("signin_link")}
                </Link>
              </p>
            </CardContent>
          </Card>
        </div>
      </main>

      <SiteFooter />
    </div>
  );
}
