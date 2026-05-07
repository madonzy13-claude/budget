import { z } from "zod";

const schema = z.object({
  DATABASE_URL_APP: z.string().url(),
  DATABASE_URL_WORKER: z.string().url(),
  DATABASE_URL_MIGRATOR: z.string().url().optional(),
  BUDGET_KEK: z
    .string()
    .regex(
      /^[A-Za-z0-9+/=]{44}$/,
      "BUDGET_KEK must be 32-byte base64 (44 chars)",
    ),
  BETTER_AUTH_SECRET: z.string().min(32),
  BETTER_AUTH_URL: z.string().url(),
  APP_URL: z.string().url(),
  REGION: z.string().default("eu-central-1"),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
});

export type Env = z.infer<typeof schema>;

export function parseEnv(source: Record<string, string | undefined>): Env {
  return schema.parse(source);
}

// Lazy-loaded singleton; consumers in apps/* call loadEnv() at boot
let cached: Env | undefined;

export function loadEnv(): Env {
  if (!cached) {
    cached = parseEnv(process.env as Record<string, string | undefined>);
  }
  return cached;
}
