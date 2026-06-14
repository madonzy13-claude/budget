import { getTranslations } from "next-intl/server";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { SessionsList } from "@/components/settings/sessions-list";
import { LocaleSelect } from "@/components/settings/locale-select";
import { DisplayCurrencyPicker } from "@/components/settings/display-currency-picker";
import { getServerSession } from "@/lib/server-session";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface SettingsPageProps {
  params: Promise<{ locale: string }>;
}

const LLM_PROVIDERS = [
  { value: "anthropic", label: "Claude (Anthropic)" },
  { value: "groq", label: "Groq" },
];

const STT_PROVIDERS = [
  { value: "browser", label: "Browser Web Speech (free)" },
  { value: "groq", label: "Groq Whisper" },
];

export default async function SettingsPage({ params }: SettingsPageProps) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "settings" });
  const session = await getServerSession();
  const initialDisplayCurrency = session?.user?.displayCurrency ?? undefined;

  return (
    <main className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <header className="mb-10 space-y-2">
        <p className="text-caption uppercase tracking-wide text-[var(--muted-foreground)]">
          {t("eyebrow", { defaultValue: "Account" })}
        </p>
        <h1 className="text-display-sm text-[var(--on-dark)]">
          {t("heading")}
        </h1>
      </header>

      <Tabs defaultValue="sessions">
        <TabsList>
          <TabsTrigger value="sessions">{t("sessions.tab")}</TabsTrigger>
          <TabsTrigger value="display_currency">
            {t("display_currency.tab")}
          </TabsTrigger>
          <TabsTrigger value="locale">{t("locale.tab")}</TabsTrigger>
          <TabsTrigger value="providers">{t("providers.tab")}</TabsTrigger>
        </TabsList>

        <TabsContent value="sessions" className="space-y-6">
          <h2 className="text-title-md text-[var(--on-dark)]">
            {t("sessions.heading")}
          </h2>
          <SessionsList sessions={[]} />
        </TabsContent>

        <TabsContent value="display_currency" className="space-y-6">
          <div className="space-y-1">
            <h2 className="text-title-md text-[var(--on-dark)]">
              {t("display_currency.label")}
            </h2>
            <p className="max-w-prose text-sm text-[var(--muted-foreground)]">
              {t("display_currency.helper")}
            </p>
          </div>
          {initialDisplayCurrency ? (
            <DisplayCurrencyPicker initialCurrency={initialDisplayCurrency} />
          ) : (
            <DisplayCurrencyPicker />
          )}
        </TabsContent>

        <TabsContent value="locale" className="space-y-6">
          <h2 className="text-title-md text-[var(--on-dark)]">
            {t("locale.label")}
          </h2>
          <LocaleSelect initialLocale={locale} />
        </TabsContent>

        <TabsContent value="providers" className="space-y-10">
          <section className="space-y-3">
            <h2 className="text-title-md text-[var(--on-dark)]">
              {t("providers.llm.label")}
            </h2>
            <p className="max-w-prose text-sm text-[var(--muted-foreground)]">
              {t("providers.llm.helper")}
            </p>
            <Select defaultValue="anthropic">
              <SelectTrigger aria-label={t("providers.llm.label")}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {LLM_PROVIDERS.map((p) => (
                  <SelectItem key={p.value} value={p.value}>
                    {p.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </section>

          <section className="space-y-3">
            <h2 className="text-title-md text-[var(--on-dark)]">
              {t("providers.stt.label")}
            </h2>
            <p className="max-w-prose text-sm text-[var(--muted-foreground)]">
              {t("providers.stt.helper")}
            </p>
            <Select defaultValue="browser">
              <SelectTrigger aria-label={t("providers.stt.label")}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STT_PROVIDERS.map((p) => (
                  <SelectItem key={p.value} value={p.value}>
                    {p.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </section>

          <p className="text-xs text-[var(--muted-foreground)]">
            {t("providers.footnote")}
          </p>
        </TabsContent>
      </Tabs>

      {/* Build-freshness stamp (260614-rwt): muted footer so on-device freshness
          can be confirmed without the removed debug overlay. NEXT_PUBLIC_BUILD_ID
          is inlined at build time in next.config.mjs. */}
      <footer className="mt-12 border-t border-[var(--hairline-dark)] pt-4">
        <p className="text-[11px] text-[var(--muted-foreground)]">
          {t("build.label", { defaultValue: "Build" })}{" "}
          {process.env.NEXT_PUBLIC_BUILD_ID ?? "dev"}
        </p>
      </footer>
    </main>
  );
}
