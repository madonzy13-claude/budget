import { test, expect } from 'bun:test';
import { Money } from '../src/money';

test('Money USD add precision-stable', () => {
  const a = Money.of('1.99', 'USD');
  const b = Money.of('0.01', 'USD');
  expect(a.add(b).equals(Money.of('2.00', 'USD'))).toBe(true);
});

test('Money different currencies throws', () => {
  expect(() => Money.of('1', 'USD').add(Money.of('1', 'EUR'))).toThrow(/different currencies/i);
});

test('Money toDb returns string with 4 decimal places for fiat', () => {
  const m = Money.of('100.0001', 'USD');
  expect(m.toDb().amount_str).toBe('100.0001');
  expect(m.toDb().currency).toBe('USD');
});

test('Money fromDb round-trips fiat', () => {
  expect(Money.fromDb('100.0001', 'USD').amount.toString()).toBe('100.0001');
});

test('Money isCrypto returns false for fiat', () => {
  expect(Money.of('1.50', 'USD').isCrypto()).toBe(false);
});

test('Money isCrypto returns true for BTC', () => {
  expect(Money.of('1', 'BTC').isCrypto()).toBe(true);
});

test('Money sub', () => {
  const a = Money.of('5.00', 'USD');
  const b = Money.of('2.50', 'USD');
  expect(a.sub(b).equals(Money.of('2.50', 'USD'))).toBe(true);
});

test('Money mul', () => {
  const m = Money.of('2.00', 'USD');
  expect(m.mul('3').equals(Money.of('6.00', 'USD'))).toBe(true);
});

test('Money toString', () => {
  const m = Money.of('1.50', 'USD');
  const s = m.toString();
  expect(s).toContain('1.50');
  expect(s).toContain('USD');
});
