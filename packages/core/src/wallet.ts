/** Burner wallet helpers. Keys stay on the device; core never persists them. */
import { generatePrivateKey, privateKeyToAddress } from 'viem/accounts';
import { BhaiyaPleaseError } from './types';
import type { Address, Hex } from './types';

export { encodeAddressQR, decodeAddressQR } from './codec/handoff';

/** New random secp256k1 key (uses globalThis.crypto). */
export function generateBurnerKey(): Hex {
  return generatePrivateKey();
}

export function addressOfKey(privateKey: Hex): Address {
  return privateKeyToAddress(assertKey(privateKey)).toLowerCase() as Address;
}

const KEY_PREFIX = 'bhaiyaplease:k1:';

/** Export format "bhaiyaplease:k1:<0x+64 hex>". This IS the private key: show only to its owner. */
export function encodeKeyExport(privateKey: Hex): string {
  return `${KEY_PREFIX}${assertKey(privateKey)}`;
}

/** Accepts the export format or a bare 0x key. */
export function decodeKeyExport(text: string): Hex {
  const t = text.trim();
  const body = t.toLowerCase().startsWith(KEY_PREFIX) ? t.slice(KEY_PREFIX.length) : t;
  return assertKey(body);
}

function assertKey(k: string): Hex {
  if (!/^0x[0-9a-fA-F]{64}$/.test(k)) throw new BhaiyaPleaseError('INVALID_INPUT', 'Invalid private key');
  return k.toLowerCase() as Hex;
}
