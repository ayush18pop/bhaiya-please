import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { channelMessage, fetchWorkerFirings, registerChannel, unregisterChannel, webPushTarget, WorkerHttpError } from '@arkiv-triggers/core';
import type { Address, Hex } from '@arkiv-triggers/core';
import type { Server } from 'node:http';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { makeRedactor } from '../src/config';
import { webhookUrlError } from '../src/push';
import { createWorkerServer } from '../src/server';
import { WorkerStore } from '../src/store';

const NOW = 1_790_000_000;
const alice = privateKeyToAccount(generatePrivateKey());
const bob = privateKeyToAccount(generatePrivateKey());
const owner = (acc: typeof alice) => acc.address.toLowerCase() as Address;
const SUB = webPushTarget({ endpoint: 'https://push.example.com/abc', keys: { p256dh: 'B'.repeat(87), auth: 'a'.repeat(22) } });

let dir: string;
let store: WorkerStore;
let server: Server;
let url: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'triggers-worker-'));
  store = await WorkerStore.open(dir);
  server = createWorkerServer({
    store,
    workerAddress: '0x00000000000000000000000000000000000000aa',
    vapidPublicKey: 'BPUB',
    allowedOrigins: ['https://app.example'],
    allowInsecureWebhooks: false,
    health: () => ({ triggers: 3, watches: 2, pendingReceipts: 0, lastTickAt: NOW, firedTotal: 0, balance: '0.02' }),
    log: () => undefined,
    now: () => NOW,
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
  url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterEach(async () => {
  server.closeAllConnections();
  await new Promise((r) => server.close(r));
  await store.saveNow();
  await rm(dir, { recursive: true, force: true });
});

async function reg(acc: typeof alice, kind: 'webpush' | 'expo' | 'webhook', target: string, issuedAt = NOW) {
  const signature = await acc.signMessage({ message: channelMessage(kind, target, issuedAt) });
  return registerChannel(url, { kind, target, owner: owner(acc), issuedAt, signature });
}

describe('worker HTTP API', () => {
  it('health, vapid, CORS', async () => {
    const h = await fetch(`${url}/health`, { headers: { origin: 'https://app.example' } });
    expect(h.headers.get('access-control-allow-origin')).toBe('https://app.example');
    expect(await h.json()).toMatchObject({ ok: true, worker: '0x00000000000000000000000000000000000000aa', triggers: 3, watches: 2 });
    const other = await fetch(`${url}/health`, { headers: { origin: 'https://evil.example' } });
    expect(other.headers.get('access-control-allow-origin')).toBeNull();
    expect(await (await fetch(`${url}/vapid`)).json()).toEqual({ publicKey: 'BPUB' });
    const pre = await fetch(`${url}/channels`, { method: 'OPTIONS', headers: { origin: 'https://app.example' } });
    expect(pre.status).toBe(204);
    expect(pre.headers.get('access-control-allow-methods')).toContain('DELETE');
  });

  it('registers channels with a valid signature, idempotently per owner + target', async () => {
    const a = await reg(alice, 'webpush', SUB);
    expect(a.channel).toMatch(/^0x[0-9a-f]{64}$/);
    expect((await reg(alice, 'webpush', SUB, NOW + 60)).channel).toBe(a.channel);
    const b = await reg(bob, 'webpush', SUB);
    expect(b.channel).not.toBe(a.channel);
    const e = await reg(alice, 'expo', 'ExponentPushToken[abcdefghijklmnop]');
    expect(store.getChannel(e.channel)).toMatchObject({ kind: 'expo', owner: owner(alice) });
    // Persisted with mode 0600, target kept off the API.
    await store.saveNow();
    const file = await readFile(join(dir, 'worker.json'), 'utf8');
    expect(JSON.parse(file).channels[a.channel].owner).toBe(owner(alice));
    expect((await stat(join(dir, 'worker.json'))).mode & 0o777).toBe(0o600);
  });

  it('rejects bad signatures, stale issuedAt, wrong signer and bad targets', async () => {
    const issuedAt = NOW;
    const sig = await alice.signMessage({ message: channelMessage('webpush', SUB, issuedAt) });
    const fail = async (body: Record<string, unknown>) => {
      try {
        await registerChannel(url, { kind: 'webpush', target: SUB, owner: owner(alice), issuedAt, signature: sig, ...body } as never);
        return 0;
      } catch (e) {
        return (e as WorkerHttpError).status;
      }
    };
    expect(await fail({ owner: owner(bob) })).toBe(401);
    expect(await fail({ issuedAt: NOW - 601 })).toBe(401);
    expect(await fail({ target: SUB.replace('abc', 'abd') })).toBe(401);
    expect(await fail({ target: '{"endpoint":"http://x"}' })).toBe(400);
    expect(await fail({ kind: 'expo' })).toBe(400);
    expect(await fail({ kind: 'webhook', target: 'https://127.0.0.1/hook' })).toBe(400);
    expect(await fail({ signature: '0x1234' })).toBe(400);
    expect(store.channelCount).toBe(0);
  });

  it('deletes only with the owner signature', async () => {
    const { channel } = await reg(alice, 'webpush', SUB);
    const del = async (acc: typeof alice, id: Hex) => {
      const signature = await acc.signMessage({ message: channelMessage('delete', id, NOW) });
      return unregisterChannel(url, { channel: id, owner: owner(acc), issuedAt: NOW, signature });
    };
    await expect(del(bob, channel)).rejects.toMatchObject({ status: 404 });
    expect(store.getChannel(channel)).not.toBeNull();
    await expect(del(alice, channel)).resolves.toEqual({ ok: true });
    expect(store.getChannel(channel)).toBeNull();
  });

  it('GET /firings filters by owner', async () => {
    store.logFiring({
      id: `0x${'1'.repeat(64)}`,
      trigger: { key: `0x${'2'.repeat(64)}`, owner: owner(alice), creator: owner(alice), label: 'Accepted', href: '/r' } as never,
      entity: `0x${'3'.repeat(64)}`,
      event: 'created',
      outcome: 'delivered',
      block: 5n,
      at: NOW,
    });
    expect(await fetchWorkerFirings(url, owner(alice), NOW - 10)).toMatchObject([{ event: 'created', label: 'Accepted', block: '5' }]);
    expect(await fetchWorkerFirings(url, owner(bob), NOW - 10)).toEqual([]);
    expect((await fetch(`${url}/firings?owner=nope`)).status).toBe(400);
  });
});

describe('helpers', () => {
  it('webhook URL guard', () => {
    expect(webhookUrlError('https://hooks.example.com/x', false)).toBeNull();
    expect(webhookUrlError('http://hooks.example.com/x', false)).toMatch(/https/);
    expect(webhookUrlError('https://localhost/x', false)).toMatch(/public/);
    expect(webhookUrlError('https://192.168.1.4/x', false)).toMatch(/public/);
    expect(webhookUrlError('https://[::1]/x', false)).toMatch(/public/);
    expect(webhookUrlError('http://localhost:3000/x', true)).toBeNull();
  });

  it('redactor scrubs keys in any case, with or without 0x', () => {
    const k = `0x${'Ab'.repeat(32)}`;
    const r = makeRedactor([k]);
    expect(r(`a ${k} b ${k.toLowerCase()} c ${k.slice(2)}`)).toBe('a *** b *** c ***');
  });
});
