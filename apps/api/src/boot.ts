/**
 * boot.ts — pre-flight initialization for apps/api.
 *
 * PC-02 + PC-15: imports ONLY from package ROOTS — never /dist/ or src/adapters/.
 * Sequence: loadEnv() → libsodiumReady() → logger → tenancy module → identity module.
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
} from "@budget/platform";
import { createIdentityModule } from "@budget/identity"; // PC-02, PC-15
import { createTenancyModule } from "@budget/tenancy"; // PC-02, PC-15
import pino, { type BaseLogger } from "pino";

export interface BootedDeps {
  env: ReturnType<typeof loadEnv>;
  logger: BaseLogger;
  keyStore: LibsodiumKeyStore;
  emailSender: EmailSender;
  identity: ReturnType<typeof createIdentityModule>;
  tenancy: ReturnType<typeof createTenancyModule>;
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
      user: env.SMTP_USER,
      pass: env.SMTP_PASS,
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

  logger.info({ region: env.REGION }, "apps/api booted");

  return { env, logger, keyStore, emailSender, identity, tenancy };
}
