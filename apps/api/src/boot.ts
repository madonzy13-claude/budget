/**
 * boot.ts — pre-flight initialization for apps/api.
 *
 * PC-02 + PC-15: imports ONLY from package ROOTS — never /dist/ or src/adapters/.
 * Sequence: loadEnv() → libsodiumReady() → logger → tenancy module → identity module.
 */
import { loadEnv, StdoutEmailSender } from "@budget/shared-kernel";
import { libsodiumReady, LibsodiumKeyStore } from "@budget/platform";
import { createIdentityModule } from "@budget/identity"; // PC-02, PC-15
import { createTenancyModule } from "@budget/tenancy"; // PC-02, PC-15
import pino, { type BaseLogger } from "pino";

export interface BootedDeps {
  env: ReturnType<typeof loadEnv>;
  logger: BaseLogger;
  keyStore: LibsodiumKeyStore;
  emailSender: StdoutEmailSender;
  identity: ReturnType<typeof createIdentityModule>;
  tenancy: ReturnType<typeof createTenancyModule>;
}

export async function boot(): Promise<BootedDeps> {
  const env = loadEnv();

  // Pitfall 9: await libsodiumReady before any crypto call or HTTP listener
  await libsodiumReady();

  const logger = pino({ level: env.LOG_LEVEL });
  const keyStore = new LibsodiumKeyStore();
  const emailSender = new StdoutEmailSender();

  // Build tenancy first — its organizationPlugin is injected into identity
  const tenancy = createTenancyModule({ emailSender, appUrl: env.APP_URL });

  const identity = createIdentityModule({
    emailSender,
    keyStore,
    additionalPlugins: [tenancy.organizationPlugin],
  });

  logger.info({ region: env.REGION }, "apps/api booted");

  return { env, logger, keyStore, emailSender, identity, tenancy };
}
