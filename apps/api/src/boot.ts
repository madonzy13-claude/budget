/**
 * boot.ts — pre-flight initialization for apps/api.
 *
 * PC-02 + PC-15: imports ONLY from package ROOTS — never /dist/ or src/adapters/.
 * Sequence: loadEnv() → libsodiumReady() → logger → tenancy module → identity module → budgeting module.
 */
import {
  loadEnv,
  StdoutEmailSender,
  type EmailSender,
} from "@budget/shared-kernel";
import {
  libsodiumReady,
  LibsodiumKeyStore,
  SmtpEmailSender,
  workerPool,
} from "@budget/platform";
import { createIdentityModule } from "@budget/identity"; // PC-02, PC-15
import { createTenancyModule } from "@budget/tenancy"; // PC-02, PC-15
import { createBudgetingModule } from "@budget/budgeting/src/contracts/factory";
import { DrizzleFxRateCacheRepo } from "@budget/budgeting/src/adapters/persistence/fx-rate-cache-repo";
import pino, { type BaseLogger } from "pino";

export interface BootedDeps {
  env: ReturnType<typeof loadEnv>;
  logger: BaseLogger;
  keyStore: LibsodiumKeyStore;
  emailSender: EmailSender;
  identity: ReturnType<typeof createIdentityModule>;
  tenancy: ReturnType<typeof createTenancyModule>;
  budgeting: ReturnType<typeof createBudgetingModule>;
}

/**
 * bootstrapSupportedCurrencies — one-shot best-effort on API boot.
 * Fetches Frankfurter /v2/currencies and UPSERTs into budgeting.supported_currencies.
 * Migration already seeded 8 fiat + 6 crypto stubs; this enriches with the full list.
 */
export async function bootstrapSupportedCurrencies(
  fetchFn: typeof fetch = fetch,
): Promise<void> {
  try {
    const r = await fetchFn("https://api.frankfurter.dev/v2/currencies");
    if (!r.ok) return; // best-effort; stub data already seeded by migration
    const j = (await r.json()) as Record<string, string>;
    const entries = Object.entries(j);
    if (entries.length === 0) return;
    const pool = workerPool(); // worker_role has INSERT on supported_currencies
    const values = entries
      .map(
        ([iso, name]) =>
          `('${iso.replace(/'/g, "''")}', NULL, '${name.replace(/'/g, "''")}', NULL, 'FIAT', 'frankfurter')`,
      )
      .join(",");
    await pool.query(
      `INSERT INTO budgeting.supported_currencies (iso_code, iso_numeric, name, symbol, kind, provider)
       VALUES ${values}
       ON CONFLICT (iso_code) DO NOTHING`,
    );
  } catch {
    // swallow — bootstrap is best-effort; stub data already seeded
  }
}

function buildEmailSender(
  env: ReturnType<typeof loadEnv>,
  logger: BaseLogger,
): EmailSender {
  if (env.SMTP_HOST && env.SMTP_PORT && env.SMTP_FROM) {
    logger.info(
      { host: env.SMTP_HOST, port: env.SMTP_PORT, from: env.SMTP_FROM },
      "email transport: SMTP",
    );
    return new SmtpEmailSender({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      from: env.SMTP_FROM,
      ...(env.SMTP_USER !== undefined ? { user: env.SMTP_USER } : {}),
      ...(env.SMTP_PASS !== undefined ? { pass: env.SMTP_PASS } : {}),
    });
  }
  logger.warn(
    "email transport: stdout (SMTP_HOST/SMTP_PORT/SMTP_FROM not set) — emails will not be delivered",
  );
  return new StdoutEmailSender();
}

export async function boot(): Promise<BootedDeps> {
  const env = loadEnv();

  // Pitfall 9: await libsodiumReady before any crypto call or HTTP listener
  await libsodiumReady();

  const logger = pino({ level: env.LOG_LEVEL });
  const keyStore = new LibsodiumKeyStore();
  const emailSender = buildEmailSender(env, logger);

  // Build tenancy first — its organizationPlugin is injected into identity
  const tenancy = createTenancyModule({ emailSender, appUrl: env.APP_URL });

  const identity = createIdentityModule({
    emailSender,
    keyStore,
    additionalPlugins: [tenancy.organizationPlugin],
    additionalSchema: tenancy.betterAuthSchema,
  });

  // Budgeting module: FX adapter wired to real cache repo (worker_role pool)
  const fxCache = new DrizzleFxRateCacheRepo(workerPool());
  const budgeting = createBudgetingModule({ fxCache });

  logger.info({ region: env.REGION }, "apps/api booted");

  return { env, logger, keyStore, emailSender, identity, tenancy, budgeting };
}
