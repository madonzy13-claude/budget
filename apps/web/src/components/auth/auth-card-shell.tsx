import Link from "next/link";

/**
 * auth-card-shell.tsx — centered brand + card frame shared by the logged-out
 * password pages (forgot-password / reset-password). Plain UI primitives, no
 * NavLink chrome, so it stays simple and test-light. No "use client" — it has no
 * hooks, so it composes into either a server or client tree.
 */
export function AuthCardShell({
  locale,
  children,
}: {
  locale: string;
  children: React.ReactNode;
}) {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-[var(--canvas-dark)] px-4 py-10">
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
