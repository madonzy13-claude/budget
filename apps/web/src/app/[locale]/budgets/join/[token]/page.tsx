/**
 * /budgets/join/[token] — Public share-link recipient join page.
 *
 * SHRD-04 / Pitfall 5: this route lives OUTSIDE the (app) group so it does NOT
 * inherit the authenticated app layout (TopNav, onboarding guard, etc.).
 * Middleware exempts /budgets/join/* from the PROTECTED_ROUTES bounce via
 * PUBLIC_BUDGET_PATHS — unauthenticated users can view this page.
 *
 * Server-side: resolve the token via the public GET endpoint (no auth cookie
 * needed). Determine auth state via getServerSession(). Pass both to the client
 * JoinPageCard which renders the appropriate state.
 */
import { getTranslations } from "next-intl/server";
import { BrandMark } from "@/components/common/brand-mark";
import { InstallBanner } from "@/components/common/install-banner";
import { Toaster } from "@/components/ui/sonner";
import {
  JoinPageCard,
  type JoinPageState,
} from "@/components/share/join-page-card";
import { getServerSession } from "@/lib/server-session";

const SERVER_API_BASE = process.env["API_INTERNAL_URL"] ?? "http://api:4000";

interface PageProps {
  params: Promise<{ locale: string; token: string }>;
}

interface ResolveResponse {
  budgetName: string;
  isExpired: boolean;
  isRevoked: boolean;
  isUsed: boolean;
}

export async function generateMetadata({ params }: PageProps) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "share" });
  return { title: t("valid_heading") };
}

export default async function JoinPage({ params }: PageProps) {
  const { locale, token } = await params;

  // Resolve the share link (public endpoint — no auth required)
  let resolveData: ResolveResponse | null = null;
  let notFound = false;

  try {
    const res = await fetch(`${SERVER_API_BASE}/budgets/join/${token}`, {
      cache: "no-store",
    });
    if (res.status === 404) {
      notFound = true;
    } else if (res.ok) {
      resolveData = (await res.json()) as ResolveResponse;
    } else {
      notFound = true;
    }
  } catch {
    notFound = true;
  }

  // Determine session (null = unauthenticated)
  const session = await getServerSession();
  const isAuthenticated = !!session;

  // Map resolve result to card state
  let cardState: JoinPageState = "valid";
  if (notFound || !resolveData) {
    cardState = "not_found";
  } else if (resolveData.isExpired || resolveData.isRevoked) {
    cardState = "expired";
  } else if (resolveData.isUsed) {
    cardState = "already_used";
  }

  return (
    <div className="flex min-h-screen flex-col bg-[var(--canvas-dark)]">
      {/* r40: install nudge reaches logged-out users too — invited family
          members land here on a fresh device. */}
      <InstallBanner />
      <header className="border-b border-[var(--hairline-dark)]">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center px-4 sm:px-6">
          <BrandMark href={`/${locale}`} />
        </div>
      </header>

      <main className="flex flex-1 items-center justify-center px-4 py-10">
        <JoinPageCard
          state={cardState}
          budgetName={resolveData?.budgetName}
          token={token}
          isAuthenticated={isAuthenticated}
        />
      </main>

      <Toaster />
    </div>
  );
}
