import { test, expect } from "bun:test";
import {
  parseEnv,
  parseWorkerEnv,
  loadEnv,
  loadWorkerEnv,
} from "../src/env";

const valid = {
  DATABASE_URL_APP: "postgresql://app_role:pw@db:5432/budget",
  DATABASE_URL_WORKER: "postgresql://worker_role:pw@db:5432/budget",
  DATABASE_URL_MIGRATOR: "postgresql://migrator:pw@db:5432/budget",
  BUDGET_KEK: "A".repeat(43) + "=", // 44-char base64
  BETTER_AUTH_SECRET: "x".repeat(32),
  BETTER_AUTH_URL: "http://localhost:3000",
  APP_URL: "http://localhost:3000",
};

test("valid env parses", () => {
  const env = parseEnv(valid);
  expect(env.DATABASE_URL_APP).toBe(valid.DATABASE_URL_APP);
  expect(env.LOG_LEVEL).toBe("info");
  expect(env.REGION).toBe("eu-central-1");
});

test("LOG_LEVEL explicit override works", () => {
  const env = parseEnv({ ...valid, LOG_LEVEL: "debug" });
  expect(env.LOG_LEVEL).toBe("debug");
});

test("REGION explicit override works", () => {
  const env = parseEnv({ ...valid, REGION: "us-east-1" });
  expect(env.REGION).toBe("us-east-1");
});

test("missing required throws", () => {
  expect(() => parseEnv({})).toThrow();
});

test("BUDGET_KEK wrong length throws", () => {
  expect(() => parseEnv({ ...valid, BUDGET_KEK: "short" })).toThrow();
});

test("BUDGET_KEK exactly 44 chars valid", () => {
  const kek44 = "B".repeat(44);
  const env = parseEnv({ ...valid, BUDGET_KEK: kek44 });
  expect(env.BUDGET_KEK).toBe(kek44);
});

test("invalid LOG_LEVEL throws", () => {
  expect(() => parseEnv({ ...valid, LOG_LEVEL: "verbose" })).toThrow();
});

test("SMTP_FROM accepts RFC-5322 display-name form (nodemailer-valid)", () => {
  // Providers set a friendly From like `Budget <noreply@send.madonzy.com>`;
  // nodemailer accepts it — env validation must not reject it.
  const env = parseEnv({
    ...valid,
    SMTP_FROM: "Budget <noreply@send.madonzy.com>",
  });
  expect(env.SMTP_FROM).toBe("Budget <noreply@send.madonzy.com>");
});

const workerValid = {
  DATABASE_URL_WORKER: "postgresql://worker_role:pw@db:5432/budget",
  BUDGET_KEK: "A".repeat(43) + "=",
};

test("parseWorkerEnv accepts worker-only subset (no DATABASE_URL_APP, no BETTER_AUTH_*, no APP_URL)", () => {
  const env = parseWorkerEnv(workerValid);
  expect(env.DATABASE_URL_WORKER).toBe(workerValid.DATABASE_URL_WORKER);
  expect(env.BUDGET_KEK).toBe(workerValid.BUDGET_KEK);
  expect(env.LOG_LEVEL).toBe("info");
  expect(env.REGION).toBe("eu-central-1");
});

test("parseWorkerEnv missing DATABASE_URL_WORKER throws", () => {
  expect(() => parseWorkerEnv({ BUDGET_KEK: "A".repeat(43) + "=" })).toThrow();
});

test("parseWorkerEnv missing BUDGET_KEK throws", () => {
  expect(() =>
    parseWorkerEnv({ DATABASE_URL_WORKER: workerValid.DATABASE_URL_WORKER }),
  ).toThrow();
});

// The lazy singletons. Worth pinning beyond coverage: every consumer calls
// loadEnv() per use (LibsodiumKeyStore does it on every kekBytes()), so if the
// cache ever stopped holding, a hot path would re-parse and re-validate the whole
// environment on each call.
// Both singletons read process.env, and the CI unit job runs with no .env at
// all — inheriting the developer's shell made these two green here and red
// there. Seed the variables the schema requires, then put process.env back.
function withValidProcessEnv(fn: () => void): void {
  const saved = new Map<string, string | undefined>();
  for (const [k, v] of Object.entries(valid)) {
    saved.set(k, process.env[k]);
    process.env[k] = v;
  }
  try {
    fn();
  } finally {
    for (const [k, v] of saved) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
}

test("loadEnv caches — repeated calls return the very same object", () => {
  withValidProcessEnv(() => {
    const a = loadEnv();
    const b = loadEnv();
    expect(a).toBe(b);
  });
});

test("loadWorkerEnv caches independently of loadEnv", () => {
  withValidProcessEnv(() => {
    const a = loadWorkerEnv();
    const b = loadWorkerEnv();
    expect(a).toBe(b);
    expect(a as unknown).not.toBe(loadEnv() as unknown);
  });
});
