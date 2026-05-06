import { test, expect } from 'bun:test';
import { ok, err } from '../src/result';

test('ok().isOk() === true', () => {
  expect(ok(1).isOk()).toBe(true);
});

test('ok().value', () => {
  const r = ok(42);
  if (r.isOk()) {
    expect(r.value).toBe(42);
  }
});

test('err().isErr() === true', () => {
  expect(err('e').isErr()).toBe(true);
});

test('err().error', () => {
  const r = err('something went wrong');
  if (r.isErr()) {
    expect(r.error).toBe('something went wrong');
  }
});

test('ok().map() chains', () => {
  const r = ok(1).map(x => x + 1);
  expect(r.isOk()).toBe(true);
  if (r.isOk()) {
    expect(r.value).toBe(2);
  }
});

test('err().map() does not execute', () => {
  // neverthrow: err<T, E> where T=ok type, E=err type
  const r = err<number, string>('fail').map(x => x + 1);
  expect(r.isErr()).toBe(true);
});
