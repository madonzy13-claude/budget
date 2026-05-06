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
    <main className="flex min-h-screen items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">
        <Card>
          <CardHeader className="text-center">
            <CardTitle className="text-3xl font-semibold leading-9">
              {t("signup.heading")}
            </CardTitle>
            <CardDescription>{t("signup.subtitle")}</CardDescription>
          </CardHeader>
          <CardContent>
            <SignUpForm defaultLocale={locale} />
            <div className="mt-4 text-center text-sm text-muted-foreground">
              {t("have_account")}{" "}
              <Link
                href={`/${locale}/sign-in`}
                className="underline underline-offset-4 hover:text-foreground"
              >
                {t("signin_link")}
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
