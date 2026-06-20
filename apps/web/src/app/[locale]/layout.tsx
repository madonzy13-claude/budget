import { NextIntlClientProvider } from "next-intl";
import { getMessages } from "next-intl/server";
import { notFound } from "next/navigation";
import { routing } from "../../../i18n/routing";
import type { Locale } from "../../../i18n.config";
import { QueryProvider } from "@/components/providers/query-provider";
import { SwDeepLinkNav } from "@/components/common/sw-deep-link-nav";

interface LocaleLayoutProps {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}

export default async function LocaleLayout({
  children,
  params,
}: LocaleLayoutProps) {
  const { locale } = await params;

  // Validate that the incoming locale is supported
  if (!routing.locales.includes(locale as Locale)) {
    notFound();
  }

  // Providing all messages to the client so they can be used in client components
  const messages = await getMessages();

  return (
    <QueryProvider>
      <NextIntlClientProvider messages={messages}>
        {/* Page-side bridge: navigates when the SW postMessages a DEEP_LINK
            after a push tap (iOS SW cannot route the window itself). */}
        <SwDeepLinkNav />
        {children}
      </NextIntlClientProvider>
    </QueryProvider>
  );
}
