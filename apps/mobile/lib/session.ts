import type { Address, Hex } from '@bhaiya-please/core';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import { clearPrefix, getItem, removeItem, setItem } from './storage';

export type Role = 'resident' | 'runner' | 'verifier';
export const ROLES: Role[] = ['resident', 'runner', 'verifier'];

/** Per-role wallets live in localStorage (shared by tabs); the ACTIVE role lives in sessionStorage (per tab). */
const walletKey = (r: Role) => `bp.wallet.${r}`;

export interface RoleWallet {
  role: Role;
  privateKey: Hex;
  address: Address;
}

export function loadWallet(role: Role): RoleWallet | null {
  const pk = getItem('local', walletKey(role)) as Hex | null;
  if (!pk) return null;
  try {
    return { role, privateKey: pk, address: privateKeyToAccount(pk).address.toLowerCase() as Address };
  } catch {
    return null;
  }
}

export function createWallet(role: Role): RoleWallet {
  const existing = loadWallet(role);
  if (existing) return existing;
  const privateKey = generatePrivateKey();
  setItem('local', walletKey(role), privateKey);
  return { role, privateKey, address: privateKeyToAccount(privateKey).address.toLowerCase() as Address };
}

export function importWallet(role: Role, privateKey: string): RoleWallet {
  const pk = (privateKey.startsWith('0x') ? privateKey : `0x${privateKey}`) as Hex;
  const address = privateKeyToAccount(pk).address.toLowerCase() as Address; // throws on invalid key
  setItem('local', walletKey(role), pk);
  return { role, privateKey: pk, address };
}

export function deleteWallet(role: Role) {
  removeItem('local', walletKey(role));
}

export const getRole = (): Role | null => (getItem('session', 'bp.role') as Role | null) ?? null;
export const saveRole = (r: Role) => setItem('session', 'bp.role', r);

export const isDemo = () => getItem('local', 'bp.demo') === '1';
export const setDemo = (on: boolean) => (on ? setItem('local', 'bp.demo', '1') : removeItem('local', 'bp.demo'));

export const getZoneId = () => getItem('local', 'bp.zone');
export const saveZoneId = (id: string) => setItem('local', 'bp.zone', id);

export const resetDemo = () => clearPrefix('bp.');

/** Role/zone/demo hints from the URL (web only): ?demo=1&zone=A&role=runner&verifier=1 */
export function readQuery() {
  try {
    if (typeof window === 'undefined') return {};
    const q = new URLSearchParams(window.location.search);
    return {
      demo: q.get('demo') === '1',
      zone: q.get('zone') ?? undefined,
      role: (q.get('role') as Role | null) ?? undefined,
      verifier: q.get('verifier') === '1',
    };
  } catch {
    return {};
  }
}

/** Open the app in a new browser tab as a given role (web). */
export function openInNewTab(role: Role, zoneId: string) {
  if (typeof window === 'undefined') return;
  const url = `${window.location.origin}/?demo=1&zone=${zoneId}&role=${role}`;
  window.open(url, '_blank', 'noopener');
}
