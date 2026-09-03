import "server-only";

/**
 * demo.server.ts — "is this one of the demo accounts?", resolved on the server.
 *
 * There is one demo account PER LANGUAGE, because the demo's data (category
 * names, notes, wallets) is written into the database in one language and a
 * single account cannot serve three. So this checks the session against every
 * configured demo user, not just one.
 *
 * Deliberately NOT NEXT_PUBLIC_. Those are baked at image build time, and this
 * repo has already been bitten once by a public env var absent from the build
 * (the VAPID key, which silently produced zero push subscriptions). Reading it
 * per request means configuring the demo never requires rebuilding web.
 */
const LOCALES = ["en", "pl", "uk"] as const;

/** Every configured demo user id, across languages. */
export function demoUserIds(): string[] {
  const ids = [
    process.env["DEMO_USER_ID"],
    ...LOCALES.map((l) => process.env[`DEMO_USER_ID_${l.toUpperCase()}`]),
    process.env["DEMO_SECOND_USER_ID"],
    ...LOCALES.map(
      (l) => process.env[`DEMO_SECOND_USER_ID_${l.toUpperCase()}`],
    ),
  ];
  return [...new Set(ids.filter((v): v is string => Boolean(v && v.trim())))];
}

export function isDemoSession(session: unknown): boolean {
  const userId = (session as { user?: { id?: string } } | null)?.user?.id;
  if (!userId) return false;
  return demoUserIds().includes(userId);
}

/**
 * Credentials for the demo account of a given language, falling back to the
 * single-locale variables so a deployment configured before per-language
 * accounts existed keeps working as the English demo.
 */
export function demoCredentialsFor(
  locale: string,
): { email: string; password: string } | null {
  const suffix = locale.toUpperCase();
  const email =
    process.env[`DEMO_EMAIL_${suffix}`] ?? process.env["DEMO_EMAIL"];
  const password =
    process.env[`DEMO_PASSWORD_${suffix}`] ?? process.env["DEMO_PASSWORD"];
  if (!email || !password) return null;
  return { email, password };
}
