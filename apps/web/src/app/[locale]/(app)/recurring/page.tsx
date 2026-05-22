import { redirect } from "next/navigation";

/**
 * /recurring — retired in Phase 6 (D-03).
 *
 * Recurring rules are now managed inline in the Budget Settings accordion.
 * Redirect to home; the user can navigate to their budget's Settings tab.
 */
interface PageProps {
  params: Promise<{ locale: string }>;
}

export default async function RecurringPage({ params }: PageProps) {
  const { locale } = await params;
  redirect(`/${locale}`);
}
