/**
 * Task 1 TDD RED: Domain entity tests for User + Session
 * These tests MUST FAIL before implementation.
 */
import { test, expect } from 'bun:test';
import { User } from '../src/domain/user';
import { Session } from '../src/domain/session';

test('User.changeLocale rejects invalid locale', () => {
  const u = new User('id1', 'a@b.com', false, 'en', 'USD', null, null);
  const r = u.changeLocale('de' as never);
  expect(r.isOk()).toBe(false);
  expect(r.isErr()).toBe(true);
});

test('User.changeLocale accepts valid locale', () => {
  const u = new User('id1', 'a@b.com', false, 'en', 'USD', null, null);
  const r = u.changeLocale('pl');
  expect(r.isOk()).toBe(true);
  expect(u.locale).toBe('pl');
});

test('User.changeDisplayCurrency rejects non-3-char value', () => {
  const u = new User('id1', 'a@b.com', false, 'en', 'USD', null, null);
  const r = u.changeDisplayCurrency('us');
  expect(r.isOk()).toBe(false);
});

test('User.changeDisplayCurrency rejects lowercase', () => {
  const u = new User('id1', 'a@b.com', false, 'en', 'USD', null, null);
  const r = u.changeDisplayCurrency('usd');
  expect(r.isOk()).toBe(false);
});

test('User.changeDisplayCurrency accepts valid ISO-4217 code', () => {
  const u = new User('id1', 'a@b.com', false, 'en', 'USD', null, null);
  const r = u.changeDisplayCurrency('EUR');
  expect(r.isOk()).toBe(true);
  expect(u.displayCurrency).toBe('EUR');
});

test('User.setProviderPrefs updates llm provider', () => {
  const u = new User('id1', 'a@b.com', false, 'en', 'USD', null, null);
  u.setProviderPrefs({ llm: 'claude_haiku' });
  expect(u.preferredLlm).toBe('claude_haiku');
  expect(u.preferredStt).toBeNull();
});

test('User.setProviderPrefs updates stt provider', () => {
  const u = new User('id1', 'a@b.com', false, 'en', 'USD', null, null);
  u.setProviderPrefs({ stt: 'groq' });
  expect(u.preferredStt).toBe('groq');
  expect(u.preferredLlm).toBeNull();
});

test('Session can be constructed', () => {
  const now = new Date();
  const s = new Session('sid', 'uid', 'chrome', '127.0.0.1', now, now, now);
  expect(s.id).toBe('sid');
  expect(s.userId).toBe('uid');
});
