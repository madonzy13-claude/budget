import { redirect } from "next/navigation";

/**
 * /budgets/[id] (BDP-02) — server redirect to the Spendings tab so the
 * Spendings grid is the default landing tab.
 */
interface BdpIndexProps {
  params: Promise<{ locale: string; id: string }>;
}

export default async function BdpIndex({ params }: BdpIndexProps) {
  const { locale, id } = await params;
  redirect(`/${locale}/budgets/${id}/spendings`);
}
