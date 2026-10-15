/**
 * Handoff proof and QR formats. Pure; shared by real + mock so hashes always match.
 *
 * Commit byte encoding (52 bytes, no separators, no length prefixes):
 *   bytes  0..3   code       — the 4 ASCII digits, UTF-8 (= ASCII), e.g. "0427" → 0x30343237
 *   bytes  4..19  salt       — the 16 raw salt bytes
 *   bytes 20..51  requestKey — the 32 raw entity-key bytes
 *   codeCommit = keccak256(bytes), lowercase 0x-hex.
 * Fixed widths make the concatenation unambiguous; inputs are validated before hashing.
 */
import { concat, hexToBytes, keccak256, stringToBytes, toHex } from 'viem';
import { BhaiyaPleaseError } from '../types';
import type { Address, EntityKey, HandoffSecret, Hex } from '../types';
import { addressSchema, codeSchema, keySchema, saltSchema } from './schemas';
import { parseOrThrow } from './validate';

export function computeCodeCommit(code: string, salt: Hex, requestKey: EntityKey): Hex {
  const c = parseOrThrow(codeSchema, code, 'code');
  const s = parseOrThrow(saltSchema, salt, 'salt');
  const k = parseOrThrow(keySchema, requestKey, 'requestKey');
  return keccak256(concat([stringToBytes(c), hexToBytes(s), hexToBytes(k)])).toLowerCase() as Hex;
}

/** True iff the reveal hashes to the commit. Never throws (malformed reveal → false). */
export function revealMatches(code: string, salt: Hex, requestKey: EntityKey, commit: Hex): boolean {
  try {
    return computeCodeCommit(code, salt, requestKey) === commit.toLowerCase();
  } catch {
    return false;
  }
}

/** Uniform 4-digit code + 16-byte salt from globalThis.crypto (RN needs react-native-get-random-values). */
export function generateHandoffSecret(requestKey: EntityKey): HandoffSecret {
  const crypto = getCrypto();
  const buf = new Uint32Array(1);
  let n: number;
  // Rejection sampling: 2^32 is not a multiple of 10000.
  const limit = Math.floor(0x1_0000_0000 / 10_000) * 10_000;
  do {
    crypto.getRandomValues(buf);
    n = buf[0] ?? 0;
  } while (n >= limit);
  const code = String(n % 10_000).padStart(4, '0');
  const salt = toHex(crypto.getRandomValues(new Uint8Array(16)));
  return { requestKey: requestKey.toLowerCase() as EntityKey, code, salt };
}

export function getCrypto(): { getRandomValues<T extends ArrayBufferView>(a: T): T } {
  const c = (globalThis as { crypto?: { getRandomValues?: unknown } }).crypto;
  if (!c || typeof c.getRandomValues !== 'function') {
    throw new BhaiyaPleaseError(
      'UNKNOWN',
      'globalThis.crypto.getRandomValues is unavailable (React Native: import react-native-get-random-values first)',
    );
  }
  return c as { getRandomValues<T extends ArrayBufferView>(a: T): T };
}

// ------------------------------------------------------------------ QR formats

const HANDOFF_PREFIX = 'bhaiyaplease:h1:';
const ADDRESS_PREFIX = 'bhaiyaplease:a1:';

/** "bhaiyaplease:h1:<requestKey 0x+64 hex>:<code 4 digits>:<salt 0x+32 hex>", all lowercase. */
export function encodeHandoffQR(secret: HandoffSecret): string {
  const k = parseOrThrow(keySchema, secret.requestKey, 'requestKey');
  const c = parseOrThrow(codeSchema, secret.code, 'code');
  const s = parseOrThrow(saltSchema, secret.salt, 'salt');
  return `${HANDOFF_PREFIX}${k}:${c}:${s}`;
}

/** Accepts surrounding whitespace, any hex case, and hex with or without 0x. */
export function decodeHandoffQR(text: string): HandoffSecret {
  const t = text.trim();
  if (!t.toLowerCase().startsWith(HANDOFF_PREFIX)) {
    throw new BhaiyaPleaseError('INVALID_INPUT', 'Not a Bhaiya Please handoff code');
  }
  const parts = t.slice(HANDOFF_PREFIX.length).split(':');
  if (parts.length !== 3) throw new BhaiyaPleaseError('INVALID_INPUT', 'Malformed handoff code');
  const [k, c, s] = parts as [string, string, string];
  return {
    requestKey: parseOrThrow(keySchema, with0x(k), 'requestKey'),
    code: parseOrThrow(codeSchema, c, 'code'),
    salt: parseOrThrow(saltSchema, with0x(s), 'salt'),
  };
}

/** "bhaiyaplease:a1:<address>", lowercase. */
export function encodeAddressQR(address: Address): string {
  return `${ADDRESS_PREFIX}${parseOrThrow(addressSchema, address, 'address')}`;
}

/** Accepts the QR form or a bare 0x address (paste fallback). Returns lowercase. */
export function decodeAddressQR(text: string): Address {
  const t = text.trim();
  const body = t.toLowerCase().startsWith(ADDRESS_PREFIX) ? t.slice(ADDRESS_PREFIX.length) : t;
  return parseOrThrow(addressSchema, with0x(body), 'address');
}

function with0x(s: string): string {
  return /^0x/i.test(s) ? `0x${s.slice(2)}` : `0x${s}`;
}
