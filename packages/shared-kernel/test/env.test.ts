import { test, expect } from "bun:test";
import { parseEnv, parseWorkerEnv } from "../src/env";

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
