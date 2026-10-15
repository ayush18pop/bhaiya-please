import { concat, keccak256 } from 'viem';
import { describe, expect, it } from 'vitest';
import {
  computeCodeCommit,
  decodeAddressQR,
  decodeHandoffQR,
  encodeAddressQR,
  encodeHandoffQR,
  generateHandoffSecret,
  revealMatches,
} from '../src/codec/handoff';
import { BhaiyaPleaseError } from '../src/types';
import type { EntityKey, Hex } from '../src/types';
import { addressOfKey, decodeKeyExport, encodeKeyExport, generateBurnerKey } from '../src/wallet';
import { zoneFromGeohash, zoneFromLatLng, DEMO_ZONES } from '../src/zones';

const KEY = `0x${'a1'.repeat(32)}` as EntityKey;
const SALT = '0x000102030405060708090a0b0c0d0e0f' as Hex;

const code = (fn: () => unknown) => {
  try {
    fn();
  } catch (e) {
    return e instanceof BhaiyaPleaseError ? e.code : 'not-bhaiya-error';
  }
  return 'no-throw';
};

describe('computeCodeCommit', () => {
  it('is keccak256(ascii(code) ‖ salt ‖ requestKey) over exactly 52 bytes', () => {
    const expected = keccak256(concat(['0x30343237', SALT, KEY]));
    expect(computeCodeCommit('0427', SALT, KEY)).toBe(expected);
  });

  it('is case-insensitive on hex inputs and returns lowercase', () => {
    const c = computeCodeCommit('0427', SALT.toUpperCase().replace('0X', '0x') as Hex, KEY);
    expect(c).toBe(computeCodeCommit('0427', SALT, KEY));
    expect(c).toBe(c.toLowerCase());
  });

  it('changes with code, salt or key', () => {
    const base = computeCodeCommit('0427', SALT, KEY);
    expect(computeCodeCommit('0428', SALT, KEY)).not.toBe(base);
    expect(computeCodeCommit('0427', `0x${'ff'.repeat(16)}` as Hex, KEY)).not.toBe(base);
    expect(computeCodeCommit('0427', SALT, `0x${'b2'.repeat(32)}` as EntityKey)).not.toBe(base);
  });

  it('revealMatches: right reveal true, wrong code/salt false, garbage false (never throws)', () => {
    const commit = computeCodeCommit('0427', SALT, KEY);
    expect(revealMatches('0427', SALT, KEY, commit)).toBe(true);
    expect(revealMatches('0000', SALT, KEY, commit)).toBe(false);
    expect(revealMatches('0427', `0x${'00'.repeat(16)}` as Hex, KEY, commit)).toBe(false);
    expect(revealMatches('abcd', SALT, KEY, commit)).toBe(false);
    expect(revealMatches('0427', '0x01' as Hex, KEY, commit)).toBe(false);
  });

  it('rejects malformed inputs with INVALID_INPUT', () => {
    expect(code(() => computeCodeCommit('427', SALT, KEY))).toBe('INVALID_INPUT');
    expect(code(() => computeCodeCommit('0427', '0x1234' as Hex, KEY))).toBe('INVALID_INPUT');
    expect(code(() => computeCodeCommit('0427', SALT, '0x12' as EntityKey))).toBe('INVALID_INPUT');
  });

  it('generateHandoffSecret yields 4 digits + 16-byte salt', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 50; i++) {
      const s = generateHandoffSecret(KEY);
      expect(s.code).toMatch(/^\d{4}$/);
      expect(s.salt).toMatch(/^0x[0-9a-f]{32}$/);
      seen.add(s.salt);
    }
    expect(seen.size).toBe(50);
  });
});

describe('QR formats', () => {
  it('handoff round-trip and documented format', () => {
    const secret = { requestKey: KEY, code: '0427', salt: SALT };
    const qr = encodeHandoffQR(secret);
    expect(qr).toBe(`bhaiyaplease:h1:${KEY}:0427:${SALT}`);
    expect(decodeHandoffQR(qr)).toEqual(secret);
    expect(decodeHandoffQR(`  ${qr.toUpperCase().replace('BHAIYAPLEASE:H1:', 'bhaiyaplease:h1:')}  `)).toEqual(secret);
    expect(decodeHandoffQR(`bhaiyaplease:h1:${KEY.slice(2)}:0427:${SALT.slice(2)}`)).toEqual(secret);
  });

  it('handoff decode rejects garbage', () => {
    expect(code(() => decodeHandoffQR('hello'))).toBe('INVALID_INPUT');
    expect(code(() => decodeHandoffQR(`bhaiyaplease:h1:${KEY}:0427`))).toBe('INVALID_INPUT');
    expect(code(() => decodeHandoffQR(`bhaiyaplease:h1:${KEY}:42:${SALT}`))).toBe('INVALID_INPUT');
  });

  it('address QR round-trip, bare paste, rejects garbage', () => {
    const a = addressOfKey(generateBurnerKey());
    expect(decodeAddressQR(encodeAddressQR(a))).toBe(a);
    expect(decodeAddressQR(a.toUpperCase().replace('0X', '0x'))).toBe(a);
    expect(code(() => decodeAddressQR('bhaiyaplease:a1:0x1234'))).toBe('INVALID_INPUT');
  });

  it('key export round-trip', () => {
    const k = generateBurnerKey();
    expect(decodeKeyExport(encodeKeyExport(k))).toBe(k.toLowerCase());
    expect(code(() => decodeKeyExport('bhaiyaplease:k1:0xnope'))).toBe('INVALID_INPUT');
  });
});

describe('zones', () => {
  it('geohash precision 6 / 5 and demo zones share a route cell', () => {
    const z = zoneFromLatLng(12.9721, 77.7447);
    expect(z.zone6).toHaveLength(6);
    expect(z.zone5).toBe(z.zone6.slice(0, 5));
    expect(DEMO_ZONES[0]!.zone5).toBe(DEMO_ZONES[1]!.zone5);
    expect(code(() => zoneFromGeohash('tdr3ca'))).toBe('INVALID_INPUT');
    expect(code(() => zoneFromLatLng(91, 0))).toBe('INVALID_INPUT');
  });
});
