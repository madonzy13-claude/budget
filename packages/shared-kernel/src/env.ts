import { z } from "zod";

const kek = z
  .string()
  .regex(
    /^[A-Za-z0-9+/=]{44}$/,
    "BUDGET_KEK must be 32-byte base64 (44 chars)",
  );

const region = z.string().default("eu-central-1");
const logLevel = z.enum(["debug", "info", "warn", "error"]).default("info");

const schema = z.object({
  DATABASE_URL_APP: z.string().url(),
  DATABASE_URL_WORKER: z.string().url(),
  DATABASE_URL_MIGRATOR: z.string().url().optional(),
  BUDGET_KEK: kek,
  BETTER_AUTH_SECRET: z.string().min(32),
  BETTER_AUTH_URL: z.string().url(),
  APP_URL: z.string().url(),
  TRUSTED_ORIGINS: z.string().optional(),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().int().min(1).max(65535).optional(),
  SMTP_FROM: z.string().email().optional(),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  // Phase 9: investments price-provider API keys (free tiers). Optional — the
  // adapters no-op-fail without them; the on-add fetch then blocks the save (A2).
  TWELVE_DATA_API_KEY: z.string().optional(),
  COINGECKO_API_KEY: z.string().optional(),
  METALS_DEV_API_KEY: z.string().optional(),
  REGION: region,
  LOG_LEVEL: logLevel,
});

const workerSchema = z.object({
  DATABASE_URL_WORKER: z.string().url(),
  BUDGET_KEK: kek,
  REGION: region,
  LOG_LEVEL: logLevel,
});

export type Env = z.infer<typeof schema>;
export type WorkerEnv = z.infer<typeof workerSchema>;

export function parseEnv(source: Record<string, string | undefined>): Env {
  return schema.parse(source);
}

export function parseWorkerEnv(
  source: Record<string, string | undefined>,
): WorkerEnv {
  return workerSchema.parse(source);
}

// Lazy-loaded singletons; consumers in apps/* call load*Env() at boot
let cached: Env | undefined;
let cachedWorker: WorkerEnv | undefined;

export function loadEnv(): Env {
  if (!cached) {
    cached = parseEnv(process.env as Record<string, string | undefined>);
  }
  return cached;
}

export function loadWorkerEnv(): WorkerEnv {
  if (!cachedWorker) {
    cachedWorker = parseWorkerEnv(
      process.env as Record<string, string | undefined>,
    );
  }
  return cachedWorker;
}
