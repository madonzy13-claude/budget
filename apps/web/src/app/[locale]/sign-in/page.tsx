import { getTranslations } from "next-intl/server";
import Link from "next/link";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { SignInForm } from "@/components/auth/sign-in-form";

interface SignInPageProps {
  params: Promise<{ locale: string }>;
}

export async function generateMetadata({ params }: SignInPageProps) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "auth.signin" });
  return { title: t("heading") };
}

export default async function SignInPage({ params }: SignInPageProps) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "auth" });

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">
        <Card>
          <CardHeader className="text-center">
            <CardTitle className="text-3xl font-semibold leading-9">
              {t("signin.heading")}
            </CardTitle>
            <CardDescription>{t("have_account")} </CardDescription>
          </CardHeader>
          <CardContent>
            <SignInForm locale={locale} />
            <div className="mt-4 text-center text-sm text-muted-foreground">
              <Link
                href={`/${locale}/sign-up`}
                className="underline underline-offset-4 hover:text-foreground"
              >
                {t("signup_link")}
              </Link>
              <span className="mx-2">·</span>
              <Link
                href={`/${locale}/reset-password`}
                className="underline underline-offset-4 hover:text-foreground"
              >
                {t("signin.forgot")}
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
