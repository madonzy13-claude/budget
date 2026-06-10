import { redirect } from "next/navigation";

/**
 * /budgets/[id] (BDP-02) — server redirect to the default landing tab.
 * UAT-PH5-T2-02: default landing changed from /spendings to /wallets so it
 * matches the new pill order (Wallets first).
 */
interface BdpIndexProps {
  params: Promise<{ locale: string; id: string }>;
}

export default async function BdpIndex({ params }: BdpIndexProps) {
  const { locale, id } = await params;
  redirect(`/${locale}/budgets/${id}/wallets`);
}
