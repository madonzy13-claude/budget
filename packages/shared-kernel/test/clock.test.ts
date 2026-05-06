import { test, expect } from 'bun:test';
import { SystemClock, FakeClock } from '../src/clock';

test('SystemClock.now() returns Date close to Date.now()', () => {
  const clock = new SystemClock();
  const before = Date.now();
  const result = clock.now();
  const after = Date.now();
  expect(result.getTime()).toBeGreaterThanOrEqual(before);
  expect(result.getTime()).toBeLessThanOrEqual(after + 1);
});

test('FakeClock.now() returns injected date', () => {
  const d = new Date('2024-01-01T00:00:00Z');
  const clock = new FakeClock(d);
  expect(clock.now().toISOString()).toBe(d.toISOString());
});

test('FakeClock.advance() increments by ms', () => {
  const d = new Date('2024-01-01T00:00:00Z');
  const clock = new FakeClock(d);
  clock.advance(1000);
  expect(clock.now().getTime()).toBe(d.getTime() + 1000);
});

test('FakeClock.set() replaces current time', () => {
  const d1 = new Date('2024-01-01T00:00:00Z');
  const d2 = new Date('2025-06-15T12:00:00Z');
  const clock = new FakeClock(d1);
  clock.set(d2);
  expect(clock.now().toISOString()).toBe(d2.toISOString());
});

test('FakeClock.now() returns copy (mutation-safe)', () => {
  const d = new Date('2024-01-01T00:00:00Z');
  const clock = new FakeClock(d);
  const n = clock.now();
  n.setFullYear(9999);
  expect(clock.now().getFullYear()).toBe(2024);
});
