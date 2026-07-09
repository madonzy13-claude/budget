import Link from "next/link";
import { HeaderThemeToggle } from "@/components/common/header-theme-toggle";

/**
 * auth-card-shell.tsx — centered brand + card frame shared by the logged-out
 * password pages (forgot-password / reset-password). A dark/light switcher sits
 * top-right (the only chrome here) so a visitor can flip the palette before they
 * have an account. No "use client" — the toggle is its own client island.
 */
export function AuthCardShell({
  locale,
  children,
}: {
  locale: string;
  children: React.ReactNode;
}) {
  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center bg-[var(--canvas-dark)] px-4 py-10">
      <div className="absolute right-4 top-4">
        <HeaderThemeToggle />
      </div>
      <Link
        href={`/${locale}`}
        className="mb-6 inline-flex items-center text-[17px] font-bold uppercase tracking-[0.04em] text-[var(--primary)]"
      >
        Budget
      </Link>
      <div className="w-full max-w-md">{children}</div>
    </main>
  );
}
