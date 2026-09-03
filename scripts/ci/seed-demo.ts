/**
 * seed-demo.ts — provision a demo account so the @demo E2E can run on CI.
 *
 * The demo is a DEPLOYMENT feature: one shared login per language, pointed at
 * pre-built budgets, wired through DEMO_* environment variables. A fresh CI
 * stack has none of that, so four @demo scenarios failed every retry — not
 * flaky, just impossible. They had never run on CI at all.
 *
 * Rather than tag them as debt, this builds the thing they need. It signs each
 * locale's demo user up through the REAL endpoint (so the password is hashed
 * the way Better Auth hashes it — no fabricated rows), verifies through
 * mailpit, and gives each two budgets, because one scenario asserts that both
 * are listed and that the all-budgets total renders.
 *
 * Prints the DEMO_* lines on stdout for the workflow to append to .env. The
 * user IDs are not knowable until sign-up returns them, which is why the stack
 * starts without demo configuration and api + web are recreated after.
 *
 * Reuses the E2E fixture's own sign-up and budget helpers rather than
 * reimplementing them: they already carry the 429 retry and the mailpit
 * verification walk, and a second copy would drift.
 */
import {
  signUpViaHttp,
  createBudgetViaHttp,
} from "../../apps/web/e2e/fixtures/fresh-user-per-scenario";

/** The locales the demo offers. Mirrors DEMO_LOCALES. */
const LOCALES = ["en", "pl", "uk"] as const;

/**
 * The two budgets each demo login gets.
 *
 * The NAMES are asserted by the aggregate scenario ("both demo budgets are
 * listed" looks for Personal and Family by text), so they are part of the
 * contract, not decoration. The CURRENCIES differ because the same scenario
 * asserts the all-budgets view spans more than one.
 */
const BUDGETS: Record<string, Array<[string, string, "PRIVATE" | "SHARED"]>> = {
  en: [
    ["Personal", "USD", "PRIVATE"],
    ["Family", "EUR", "SHARED"],
  ],
  pl: [
    ["Personal", "PLN", "PRIVATE"],
    ["Family", "EUR", "SHARED"],
  ],
  uk: [
    ["Personal", "UAH", "PRIVATE"],
    ["Family", "EUR", "SHARED"],
  ],
};

/** Stand-ins for the budgets a real deployment copies from. Their COUNT is what
 *  matters: readDemoConfig drops any locale whose destination count differs. */
const SOURCE_PLACEHOLDERS = [
  "00000000-0000-4000-8000-00000000d001",
  "00000000-0000-4000-8000-00000000d002",
];

function cookieHeaderFrom(setCookies: string[]): string {
  return setCookies.map((c) => c.split(";")[0]).join("; ");
}

async function main(): Promise<void> {
  const baseUrl = process.env["PLAYWRIGHT_BASE_URL"] ?? "http://localhost:3000";
  const password = process.env["DEMO_SEED_PASSWORD"] ?? "DemoSeed-1234!aA";

  const lines: string[] = [];
  const allTenants: string[] = [];
  const allUserIds: string[] = [];

  for (const locale of LOCALES) {
    const email = `demo-${locale}@test.local`;
    const { userId, setCookieHeaders } = await signUpViaHttp(
      baseUrl,
      email,
      password,
      `Demo ${locale.toUpperCase()}`,
    );
    const cookie = cookieHeaderFrom(setCookieHeaders);

    // Two budgets, named as the aggregate scenario expects.
    const tenants: string[] = [];
    for (const [name, currency, kind] of BUDGETS[locale]!) {
      tenants.push(
        await createBudgetViaHttp(baseUrl, cookie, name, kind, currency),
      );
    }

    const up = locale.toUpperCase();
    lines.push(`DEMO_EMAIL_${up}=${email}`);
    lines.push(`DEMO_PASSWORD_${up}=${password}`);
    lines.push(`DEMO_USER_ID_${up}=${userId}`);
    lines.push(`DEMO_TENANT_IDS_${up}=${tenants.join(",")}`);
    allTenants.push(...tenants);
    allUserIds.push(userId);
  }

  // readDemoConfig returns NULL without DEMO_SOURCE_TENANT_IDS, and null means
  // the API's demo guard is a no-op — the "restricted actions are blocked"
  // scenario would fail with the demo apparently working. The sources are the
  // budgets the nightly refresh copies FROM; that job never runs on CI, so
  // these only have to exist and match each locale's destination count.
  lines.push(`DEMO_SOURCE_TENANT_IDS=${SOURCE_PLACEHOLDERS.join(",")}`);
  // The unsuffixed forms too: the API's demo guard and the web's isDemoUser
  // both fall back to them, and the guard needs every id to refuse writes
  // from any demo login.
  lines.push(`DEMO_LOCALES=${LOCALES.join(",")}`);
  lines.push(`DEMO_TENANT_IDS=${allTenants.join(",")}`);
  lines.push(`DEMO_USER_ID=${allUserIds.join(",")}`);

  console.log(lines.join("\n"));
}

await main();
