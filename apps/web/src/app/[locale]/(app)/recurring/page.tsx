import { redirect } from "next/navigation";

/**
 * /recurring — retired in Phase 6 (D-03).
 *
 * Recurring rules are now managed inline in the Budget Settings accordion.
 * Redirect to home; the user can navigate to their budget's Settings tab.
 *
 * 260804: the old client + server action that rendered the form here were
 * deleted. They were already unreachable (this page only redirects), but the
 * form they mounted carried NO budget context, so its "category required" guard
 * — `!!budgetId && !categoryId` — could not fire: anything created through it
 * landed without a category and could size no reserve. Dead code that can only
 * do harm if revived.
 */
interface PageProps {
  params: Promise<{ locale: string }>;
}

export default async function RecurringPage({ params }: PageProps) {
  const { locale } = await params;
  redirect(`/${locale}`);
}
