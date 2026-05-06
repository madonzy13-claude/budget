import { test, expect } from 'bun:test';
import { parseEnv } from '../src/env';

const valid = {
  DATABASE_URL_APP: 'postgresql://app_role:pw@db:5432/budget',
  DATABASE_URL_WORKER: 'postgresql://worker_role:pw@db:5432/budget',
  DATABASE_URL_MIGRATOR: 'postgresql://migrator:pw@db:5432/budget',
  BUDGET_KEK: 'A'.repeat(43) + '=',  // 44-char base64
  BETTER_AUTH_SECRET: 'x'.repeat(32),
  BETTER_AUTH_URL: 'http://localhost:3000',
  APP_URL: 'http://localhost:3000',
};

test('valid env parses', () => {
  const env = parseEnv(valid);
  expect(env.DATABASE_URL_APP).toBe(valid.DATABASE_URL_APP);
  expect(env.LOG_LEVEL).toBe('info');
  expect(env.REGION).toBe('eu-central-1');
});

test('LOG_LEVEL explicit override works', () => {
  const env = parseEnv({ ...valid, LOG_LEVEL: 'debug' });
  expect(env.LOG_LEVEL).toBe('debug');
});

test('REGION explicit override works', () => {
  const env = parseEnv({ ...valid, REGION: 'us-east-1' });
  expect(env.REGION).toBe('us-east-1');
});

test('missing required throws', () => {
  expect(() => parseEnv({})).toThrow();
});

test('BUDGET_KEK wrong length throws', () => {
  expect(() => parseEnv({ ...valid, BUDGET_KEK: 'short' })).toThrow();
});

test('BUDGET_KEK exactly 44 chars valid', () => {
  const kek44 = 'B'.repeat(44);
  const env = parseEnv({ ...valid, BUDGET_KEK: kek44 });
  expect(env.BUDGET_KEK).toBe(kek44);
});

test('invalid LOG_LEVEL throws', () => {
  expect(() => parseEnv({ ...valid, LOG_LEVEL: 'verbose' })).toThrow();
});
