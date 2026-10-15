import { describe, expect, it } from 'vitest';
import { rpcUrlWithKey } from '../src/arkiv/adapter';
import { classify, toBhaiyaError } from '../src/arkiv/errors';
import { lifetimeSeconds } from '../src/arkiv/port';
import { createWriteQueue } from '../src/arkiv/queue';
import { createWatcher, matchesFilter } from '../src/arkiv/watcher';
import { encode } from '../src/codec/entities';
import { MockChain } from '../src/mock/chain';
import { BhaiyaPleaseError, PROJECT_TAG } from '../src/types';
import type { ChangeEvent } from '../src/types';
import { addr, createSpec, HOME, NORTH } from './helpers';

const named = (name: string, extra: Record<string, unknown> = {}) => Object.assign(new Error(name), { name, ...extra });

describe('error classification', () => {
  it('rate limits and transport errors are retryable; reverts never', () => {
    expect(classify(named('HttpRequestError', { status: 429 }))).toMatchObject({ code: 'RATE_LIMITED', retry: 'transport' });
    expect(classify(named('HttpRequestError', { status: 503 }))).toMatchObject({ code: 'NETWORK', retry: 'transport' });
    expect(classify(new TypeError('fetch failed'))).toMatchObject({ code: 'NETWORK', retry: 'transport' });
    const revert = named('EntityMutationError', {
      cause: named('ContractFunctionExecutionError', { cause: named('ContractFunctionRevertedError', { data: { errorName: 'NotOwner' } }) }),
    });
    expect(classify(revert)).toMatchObject({ code: 'NOT_OWNER', retry: 'never', revert: 'NotOwner' });
    expect(classify(named('ContractFunctionRevertedError', { data: { errorName: 'ReadOnlyEntity' } })).code).toBe('NOT_OWNER');
    expect(classify(named('ContractFunctionRevertedError', { data: { errorName: 'Weird' } })).code).toBe('BATCH_FAILED');
    expect(classify(named('InsufficientFundsError'))).toMatchObject({ code: 'INSUFFICIENT_FUNDS', retry: 'never' });
    expect(classify(named('NonceTooLowError'))).toMatchObject({ retry: 'nonce' });
    expect(classify(named('NoEntityFoundError')).code).toBe('NOT_FOUND');
    expect(classify(new Error('???')).code).toBe('UNKNOWN');
  });

  it('marks errors after broadcast so writes are never retried once a tx hash exists', () => {
    const e = named('EntityMutationError', { txHash: '0xabc', cause: named('HttpRequestError', { status: 502 }) });
    expect(classify(e)).toMatchObject({ code: 'NETWORK', broadcast: true });
  });

  it('wraps into BhaiyaPleaseError with retryable flag', () => {
    const e = toBhaiyaError('query', named('HttpRequestError', { status: 429 }));
    expect(e).toBeInstanceOf(BhaiyaPleaseError);
    expect(e.retryable).toBe(true);
    const same = new BhaiyaPleaseError('TIER_LIMIT', 'x');
    expect(toBhaiyaError('op', same)).toBe(same);
  });
});

describe('adapter helpers', () => {
  it('access key is appended to the RPC URL', () => {
    expect(rpcUrlWithKey('https://rpc.example/', 'abc')).toBe('https://rpc.example/abc');
    expect(rpcUrlWithKey('https://rpc.example')).toBe('https://rpc.example');
  });

  it('lifetimes round up to whole 2 s blocks', () => {
    expect(lifetimeSeconds(3)).toBe(4);
    expect(lifetimeSeconds(0)).toBe(2);
    expect(lifetimeSeconds(600)).toBe(600);
  });

  it('write queue runs tasks one at a time, in order, surviving failures', async () => {
    const q = createWriteQueue();
    const log: string[] = [];
    const task = (id: string, fail = false) =>
      q(async () => {
        log.push(`start ${id}`);
        await new Promise((r) => setTimeout(r, 5));
        log.push(`end ${id}`);
        if (fail) throw new Error(id);
        return id;
      });
    const results = await Promise.allSettled([task('a'), task('b', true), task('c')]);
    expect(results.map((r) => r.status)).toEqual(['fulfilled', 'rejected', 'fulfilled']);
    expect(log).toEqual(['start a', 'end a', 'start b', 'end b', 'start c', 'end c']);
  });
});

describe('watcher', () => {
  it('drops foreign entities, classifies ours, applies filters, stops when unsubscribed', async () => {
    const chain = new MockChain({ now: () => 1_790_000_000 });
    const me = addr('me');
    const port = chain.port(() => me);
    const watcher = createWatcher(port, PROJECT_TAG, { resolveIntervalMs: 0 });
    const all: ChangeEvent[] = [];
    const runsOnly: ChangeEvent[] = [];
    const off1 = watcher.subscribe({}, (e) => all.push(e));
    const off2 = watcher.subscribe({ types: ['run'], destZone: HOME }, (e) => runsOnly.push(e));

    const foreign = await port.write((w) => w.create(createSpec(encode.shop('otherproject', { zone: NORTH, category: 'grocery', nameTag: 'x' }))));
    const shop = await port.write((w) => w.create(createSpec(encode.shop(PROJECT_TAG, { zone: NORTH, category: 'grocery', nameTag: 'x' }))));
    const run = await port.write((w) =>
      w.create(createSpec(encode.run(PROJECT_TAG, { destZone: HOME, fromZone: NORTH, eta: 1_790_000_900, capacityLeft: 1, claimedTier: 0 }))),
    );
    await port.write((w) => w.remove(run.key));
    await new Promise((r) => setTimeout(r, 0));

    expect(all.some((e) => e.key === foreign.key)).toBe(false);
    expect(all.map((e) => [e.kind, e.type])).toEqual([
      ['created', 'shop'],
      ['created', 'run'],
      ['deleted', 'run'],
    ]);
    expect(all[0]!.key).toBe(shop.key);
    expect(runsOnly.map((e) => e.kind)).toEqual(['created', 'deleted']);
    expect(runsOnly[0]!.hints).toMatchObject({ run: run.key, destZone: HOME, owner: me });

    off1();
    off2();
    await port.write((w) => w.create(createSpec(encode.shop(PROJECT_TAG, { zone: NORTH, category: 'grocery', nameTag: 'y' }))));
    await new Promise((r) => setTimeout(r, 0));
    expect(all).toHaveLength(3);
    watcher.close();
  });

  it('matchesFilter ANDs fields and is case-insensitive on addresses', () => {
    const e: ChangeEvent = { kind: 'created', key: `0x${'1'.repeat(64)}`, type: 'receipt', hints: { rider: addr('r') } };
    expect(matchesFilter({ rider: addr('r').toUpperCase().replace('0X', '0x') as `0x${string}` }, e)).toBe(true);
    expect(matchesFilter({ rider: addr('r'), types: ['run'] }, e)).toBe(false);
    expect(matchesFilter({ subject: addr('r') }, e)).toBe(false);
  });
});
