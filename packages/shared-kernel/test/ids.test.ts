import { test, expect } from 'bun:test';
import { newTenantId, newUserId, TenantId, UserId } from '../src/ids';

test('newTenantId() returns 36-char UUID', () => {
  const id = newTenantId();
  expect(id).toHaveLength(36);
  // UUID v7 format: xxxxxxxx-xxxx-7xxx-xxxx-xxxxxxxxxxxx
  expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
});

test('newUserId() returns 36-char UUID v7', () => {
  const id = newUserId();
  expect(id).toHaveLength(36);
  expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
});

test('consecutive newTenantId() values are monotonically non-decreasing', () => {
  const ids: string[] = [];
  for (let i = 0; i < 10; i++) {
    ids.push(newTenantId());
  }
  for (let i = 1; i < ids.length; i++) {
    expect(ids[i]! >= ids[i - 1]!).toBe(true);
  }
});

test('TenantId constructor wraps string as branded type', () => {
  const id = TenantId('test-tenant');
  // Cast to string for assertion — branded type IS a string at runtime
  expect(id as string).toBe('test-tenant');
});

test('UserId constructor wraps string as branded type', () => {
  const id = UserId('test-user');
  // Cast to string for assertion — branded type IS a string at runtime
  expect(id as string).toBe('test-user');
});
