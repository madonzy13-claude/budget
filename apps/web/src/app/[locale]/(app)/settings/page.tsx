import { getTranslations } from "next-intl/server";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { SessionsList } from "@/components/settings/sessions-list";
import { LocaleSelect } from "@/components/settings/locale-select";
import { DisplayCurrencyPicker } from "@/components/settings/display-currency-picker";
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

// Phase 1: hardcoded provider options; Phase 5 expands these
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

  return (
    <main className="mx-auto max-w-2xl px-4 py-8 sm:px-6">
      <h1 className="mb-6 text-3xl font-semibold leading-9">{t("heading")}</h1>

      <Tabs defaultValue="sessions">
        <TabsList className="mb-6">
          <TabsTrigger value="sessions">{t("sessions.tab")}</TabsTrigger>
          <TabsTrigger value="display_currency">
            {t("display_currency.tab")}
          </TabsTrigger>
          <TabsTrigger value="locale">{t("locale.tab")}</TabsTrigger>
          <TabsTrigger value="providers">{t("providers.tab")}</TabsTrigger>
        </TabsList>

        {/* Sessions tab — IDNT-04 */}
        <TabsContent value="sessions" className="space-y-4">
          <h2 className="text-xl font-semibold leading-7">
            {t("sessions.heading")}
          </h2>
          {/* Phase 1: skeleton — real session data wired in Phase 2 */}
          <SessionsList sessions={[]} />
        </TabsContent>

        {/* Display currency tab — MONY-09 */}
        <TabsContent value="display_currency" className="space-y-4">
          <div>
            <h2 className="text-xl font-semibold leading-7">
              {t("display_currency.label")}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {t("display_currency.helper")}
            </p>
          </div>
          <DisplayCurrencyPicker />
        </TabsContent>

        {/* Language tab */}
        <TabsContent value="locale" className="space-y-4">
          <div>
            <h2 className="text-xl font-semibold leading-7">
              {t("locale.label")}
            </h2>
          </div>
          <LocaleSelect initialLocale={locale} />
        </TabsContent>

        {/* Providers tab — IDNT-07, IDNT-08 */}
        <TabsContent value="providers" className="space-y-6">
          {/* preferred_llm_provider */}
          <div className="space-y-2">
            <h2 className="text-xl font-semibold leading-7">
              {t("providers.llm.label")}
            </h2>
            <p className="text-sm text-muted-foreground">
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
          </div>

          {/* preferred_stt_provider */}
          <div className="space-y-2">
            <h2 className="text-xl font-semibold leading-7">
              {t("providers.stt.label")}
            </h2>
            <p className="text-sm text-muted-foreground">
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
          </div>

          <p className="text-xs text-muted-foreground">
            Phase 1 wires the picker only. STT and LLM adapters connect in Phase
            5.
          </p>
        </TabsContent>
      </Tabs>
    </main>
  );
}
