import { test, expect } from 'bun:test';
import { Money } from '../src/money';

test('Money crypto toDb preserves 18 decimal places', () => {
  const m = Money.of('0.123456789012345678', 'BTC');
  expect(m.toDb().amount_str).toBe('0.123456789012345678');
});

test('Money crypto fromDb round-trips', () => {
  const m = Money.fromDb('0.123456789012345678', 'BTC');
  expect(m.equals(Money.of('0.123456789012345678', 'BTC'))).toBe(true);
});

test('Money ETH is crypto', () => {
  expect(Money.of('1', 'ETH').isCrypto()).toBe(true);
});

test('Money crypto add preserves precision', () => {
  const a = Money.of('0.100000000000000001', 'BTC');
  const b = Money.of('0.100000000000000001', 'BTC');
  const sum = a.add(b);
  expect(sum.amount.toString()).toBe('0.200000000000000002');
});
