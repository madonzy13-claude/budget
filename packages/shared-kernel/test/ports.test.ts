import { test, expect } from 'bun:test';
import {
  InMemoryFxProvider,
  StdoutEmailSender,
  InMemoryCryptoKeyStore,
  InMemoryOutbox,
  InMemoryLLMProvider,
  InMemorySTTProvider,
} from '../src/ports';
import { TenantId, UserId } from '../src/ids';

test('InMemoryFxProvider returns 1 for same currency', async () => {
  const fx = new InMemoryFxProvider();
  const r = await fx.rateAsOf('USD', 'USD', new Date());
  expect(r.rate).toBe('1');
  expect(r.isStale).toBe(false);
});

test('InMemoryFxProvider returns fixed rate for cross-currency', async () => {
  const fx = new InMemoryFxProvider({ 'USD->EUR': '0.92' });
  const r = await fx.rateAsOf('USD', 'EUR', new Date());
  expect(r.rate).toBe('0.92');
  expect(r.provider).toBe('in-memory');
});

test('InMemoryFxProvider returns 1 for unknown cross-currency pair', async () => {
  const fx = new InMemoryFxProvider();
  const r = await fx.rateAsOf('USD', 'PLN', new Date());
  expect(r.rate).toBe('1');
});

test('StdoutEmailSender captures sent', async () => {
  const sender = new StdoutEmailSender();
  await sender.send({ to: 'a@b.c', template: 'verify', vars: { url: 'http://x' } });
  expect(sender.sent).toHaveLength(1);
  expect(sender.sent[0]!.to).toBe('a@b.c');
});

test('StdoutEmailSender captures multiple sends', async () => {
  const sender = new StdoutEmailSender();
  await sender.send({ to: 'a@b.c', template: 'verify', vars: {} });
  await sender.send({ to: 'x@y.z', template: 'reset', vars: {} });
  expect(sender.sent).toHaveLength(2);
});

test('InMemoryCryptoKeyStore round-trips plaintext', async () => {
  const ks = new InMemoryCryptoKeyStore();
  const dek = await ks.unwrapUserDek(await ks.generateUserDek(UserId('u1')));
  const enc = await ks.encryptForUser(dek, 'hello');
  const dec = await ks.decryptForUser(dek, enc);
  expect(dec).toBe('hello');
});

test('InMemoryCryptoKeyStore emailHash returns bytes', async () => {
  const ks = new InMemoryCryptoKeyStore();
  const hash = await ks.emailHash('Test@Example.COM');
  expect(hash).toBeInstanceOf(Uint8Array);
  // Should be lowercased
  const decoded = new TextDecoder().decode(hash);
  expect(decoded).toBe('test@example.com');
});

test('InMemoryOutbox records writes', async () => {
  const ob = new InMemoryOutbox();
  await ob.write({}, {
    tenantId: TenantId('t1'),
    aggregateType: 'A',
    aggregateId: 'i1',
    eventType: 'e',
    payload: { x: 1 },
  });
  expect(ob.events).toHaveLength(1);
  expect(ob.events[0]!.eventType).toBe('e');
});

test('InMemoryLLMProvider returns fixture', async () => {
  const llm = new InMemoryLLMProvider({ canned: { ok: true } });
  const r = await llm.generateObject({ schema: null, prompt: 'p', userId: UserId('u') });
  expect(r).toEqual({ ok: true });
});

test('InMemorySTTProvider returns fixture', async () => {
  const stt = new InMemorySTTProvider({ canned: 'hello world' });
  const r = await stt.transcribe({ audio: new Uint8Array(), language: 'en' });
  expect(r.text).toBe('hello world');
});
