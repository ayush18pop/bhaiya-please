import { describe, expect, it } from 'vitest';
import type { RawEntity } from '../src/arkiv/port';
import { decode, encode, typeOf } from '../src/codec/entities';
import type { EntitySpec } from '../src/codec/entities';
import { ATTR, ENTITY_ATTRS } from '../src/codec/attrs';
import { PROJECT_TAG } from '../src/types';
import type { EntityKey, Hex } from '../src/types';
import { addr, HOME, NORTH } from './helpers';

const P = PROJECT_TAG;
const K1 = `0x${'11'.repeat(32)}` as EntityKey;
const K2 = `0x${'22'.repeat(32)}` as EntityKey;
const K3 = `0x${'33'.repeat(32)}` as EntityKey;
const COMMIT = `0x${'ab'.repeat(32)}` as Hex;
const SALT = `0x${'0f'.repeat(16)}` as Hex;
const alice = addr('alice');
const bob = addr('bob');

function raw(s: EntitySpec, over: Partial<RawEntity> = {}): RawEntity {
  return {
    key: K3,
    owner: alice,
    creator: alice,
    createdAt: 1000,
    expiresAt: 2000,
    readonly: s.readonly,
    permissionlessExtension: s.permissionlessExtension,
    attributes: Object.fromEntries(Object.entries(s.attributes).map(([n, v]) => [n, { ...v }])),
    payload: s.payload,
    contentType: 'application/json',
    ...over,
  };
}

const meta = { key: K3, owner: alice, creator: alice, createdAt: 1000, expiresAt: 2000 };

describe('codec round-trips', () => {
  it('shop', () => {
    const s = encode.shop(P, { zone: NORTH, category: 'bakery', nameTag: 'Kesar Bakehouse' });
    expect(s.permissionlessExtension).toBe(true);
    expect(s.readonly).toBe(false);
    expect(decode.shop(raw(s), P)).toEqual({
      ...meta,
      readonly: false,
      permissionlessExtension: true,
      zone: NORTH,
      zone5: NORTH.slice(0, 5),
      category: 'bakery',
      nameTag: 'Kesar Bakehouse',
    });
  });

  it('run (with and without note)', () => {
    const base = { destZone: HOME, fromZone: NORTH, eta: 1_800_000_000, capacityLeft: 2, claimedTier: 1 as const };
    const withNote = decode.run(raw(encode.run(P, { ...base, note: 'via market' })), P);
    expect(withNote).toMatchObject({ ...base, note: 'via market', readonly: false });
    const noNote = decode.run(raw(encode.run(P, base)), P);
    expect(noNote && 'note' in noNote).toBe(false);
  });

  it('request', () => {
    const i = { run: K1, shop: K2, destZone: HOME, maxPrice: 150, tip: 20, codeCommit: COMMIT, items: ['Milk', 'Eggs'] };
    const s = encode.request(P, i);
    expect(s.readonly).toBe(true);
    expect(decode.request(raw(s), P)).toEqual({ ...meta, readonly: true, permissionlessExtension: false, ...i });
  });

  it('accept / delivery / receipt / complaint / attestation', () => {
    expect(decode.accept(raw(encode.accept(P, { request: K1, run: K2, rider: bob })), P)).toMatchObject({ request: K1, run: K2, rider: bob });
    expect(
      decode.delivery(raw(encode.delivery(P, { request: K1, rider: bob, resident: alice, zone: HOME, code: '0427', salt: SALT })), P),
    ).toMatchObject({ request: K1, rider: bob, resident: alice, zone: HOME, code: '0427', salt: SALT, readonly: true });
    expect(
      decode.receipt(raw(encode.receipt(P, { rider: bob, delivery: K1, zone: HOME, at: 1234, tags: ['on_time', 'polite'] })), P),
    ).toMatchObject({ rider: bob, delivery: K1, at: 1234, tags: ['on_time', 'polite'] });
    expect(
      decode.complaint(raw(encode.complaint(P, { rider: bob, request: K1, reason: 'no_show', at: 99 })), P),
    ).toMatchObject({ rider: bob, request: K1, reason: 'no_show', at: 99 });
    expect(
      decode.attestation(raw(encode.attestation(P, { subject: bob, level: 'successor', prev: alice, at: 5 })), P),
    ).toMatchObject({ subject: bob, level: 'successor', prev: alice, trusted: false });
  });

  it('lowercases hex values so comparisons are exact', () => {
    const upper = bob.toUpperCase().replace('0X', '0x') as typeof bob;
    const s = encode.accept(P, { request: K1, run: K2, rider: upper });
    expect(decode.accept(raw(s), P)?.rider).toBe(bob);
  });

  it('attribute table covers every entity attribute', () => {
    for (const names of Object.values(ENTITY_ATTRS)) for (const n of names) expect(ATTR[n]).toBeDefined();
  });
});

describe('codec drops hostile/malformed entities', () => {
  const runSpec = () => encode.run(P, { destZone: HOME, fromZone: NORTH, eta: 1_800_000_000, capacityLeft: 1, claimedTier: 0 });

  it('wrong project or type', () => {
    expect(decode.run(raw(runSpec()), 'otherproject')).toBeNull();
    expect(decode.request(raw(runSpec()), P)).toBeNull();
    expect(typeOf(raw(runSpec()), P)).toBe('run');
    const r = raw(runSpec());
    r.attributes.type = { type: 'str', value: 'banana' };
    expect(typeOf(r, P)).toBeNull();
  });

  it('wrong attribute type (eta as i32 instead of u64)', () => {
    const r = raw(runSpec());
    r.attributes.eta = { type: 'i32', value: 5 };
    expect(decode.run(r, P)).toBeNull();
  });

  it('out-of-range values', () => {
    const r = raw(runSpec());
    r.attributes.capacity_left = { type: 'i32', value: 50 };
    expect(decode.run(r, P)).toBeNull();
    const r2 = raw(runSpec());
    r2.attributes.eta = { type: 'u64', value: 2n ** 60n };
    expect(decode.run(r2, P)).toBeNull();
    const r3 = raw(runSpec());
    r3.attributes.dest_zone = { type: 'str', value: 'tdr3ca' }; // 'a' is not in the geohash alphabet
    expect(decode.run(r3, P)).toBeNull();
  });

  it('missing attribute', () => {
    const r = raw(runSpec());
    delete r.attributes.from_zone;
    const drops: string[] = [];
    expect(decode.run(r, P, (_k, reason) => drops.push(reason))).toBeNull();
    expect(drops).toHaveLength(1);
  });

  it('bad payloads', () => {
    const req = encode.request(P, { run: K1, shop: K2, destZone: HOME, maxPrice: 1, tip: 0, codeCommit: COMMIT, items: ['x'] });
    expect(decode.request(raw(req, { payload: 'not json' }), P)).toBeNull();
    expect(decode.request(raw(req, { payload: JSON.stringify({ items: ['a', 'b', 'c', 'd'] }) }), P)).toBeNull();
    expect(decode.request(raw(req, { payload: JSON.stringify({ items: [] }) }), P)).toBeNull();
    const del = encode.delivery(P, { request: K1, rider: bob, resident: alice, zone: HOME, code: '0427', salt: SALT });
    expect(decode.delivery(raw(del, { payload: JSON.stringify({ code: '12345', salt: SALT }) }), P)).toBeNull();
    expect(decode.delivery(raw(del, { payload: JSON.stringify({ code: '1234', salt: '0x00' }) }), P)).toBeNull();
    const rec = encode.receipt(P, { rider: bob, delivery: K1, zone: HOME, at: 1, tags: ['on_time'] });
    expect(decode.receipt(raw(rec, { payload: JSON.stringify({ tags: ['on_time', 'on_time'] }) }), P)).toBeNull();
    expect(decode.receipt(raw(rec, { payload: JSON.stringify({ tags: ['bribe'] }) }), P)).toBeNull();
  });

  it('inconsistent derived fields', () => {
    const s = encode.shop(P, { zone: NORTH, category: 'grocery', nameTag: 'X' });
    const r = raw(s);
    r.attributes.zone5 = { type: 'str', value: 'tdr3b' };
    expect(decode.shop(r, P)).toBeNull();
    const att = raw(encode.attestation(P, { subject: bob, level: 'id_checked', at: 1 }));
    att.attributes.level = { type: 'str', value: 'successor' };
    expect(decode.attestation(att, P)).toBeNull();
  });

  it('extra unknown attributes are ignored, not fatal', () => {
    const r = raw(runSpec());
    r.attributes.spam = { type: 'str', value: 'hello' };
    expect(decode.run(r, P)).not.toBeNull();
  });
});
