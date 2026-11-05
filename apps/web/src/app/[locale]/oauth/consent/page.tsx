import { getTranslations } from "next-intl/server";
import { Card, CardContent } from "@/components/ui/card";
import { ConsentForm } from "@/components/oauth/consent-form";
import { PublicHeader } from "@/components/common/public-header";
import { SiteFooter } from "@/components/common/site-footer";

/**
 * /oauth/consent — where the OAuth provider sends a signed-in user when an MCP
 * client asks for access (Phase 15). Outside (app) like sign-in, so the
 * onboarding guard can't bounce a brand-new user away mid-flow.
 */
interface ConsentPageProps {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export async function generateMetadata({ params }: ConsentPageProps) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "oauthConsent" });
  return { title: t("pageTitle") };
}

export default async function ConsentPage({
  params,
  searchParams,
}: ConsentPageProps) {
  const { locale } = await params;
  const sp = await searchParams;
  const query = new URLSearchParams(
    Object.entries(sp).flatMap(([k, v]) =>
      typeof v === "string" ? [[k, v]] : (v ?? []).map((x) => [k, x]),
    ),
  );

  return (
    <div className="flex min-h-screen flex-col bg-[var(--canvas-dark)]">
      <PublicHeader locale={locale} />
      <main className="flex flex-1 items-center justify-center px-4 py-10">
        <div className="w-full max-w-md">
          <Card>
            <CardContent className="pt-6">
              <ConsentForm
                clientId={query.get("client_id") ?? ""}
                scope={query.get("scope") ?? "read"}
                query={query.toString()}
              />
            </CardContent>
          </Card>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
