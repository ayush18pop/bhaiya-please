/**
 * Account, modes and device preferences.
 *
 * Real app: ONE account (device key) used in every mode. Get things / Run errands / Society desk are
 * modes of the same person. Sandbox (mock core only): three persona accounts, one per mode, so a
 * single browser can play resident, runner and desk; the active mode is per tab (sessionStorage) or
 * fixed per iframe via `?frame=get|run|desk` (sandbox split view).
 */
import type { Address, Hex } from '@bhaiya-please/core';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import { clearPrefix, getItem, getJSON, removeItem, setItem, setJSON } from './storage';

export type Mode = 'get' | 'run' | 'desk';
export const MODES: Mode[] = ['get', 'run', 'desk'];
export type Language = 'en' | 'hi' | 'kn';
export type UseIntent = 'get' | 'run' | 'both';

export interface Wallet {
  privateKey: Hex;
  address: Address;
}

export function walletFromKey(privateKey: string): Wallet {
  const pk = (privateKey.trim().startsWith('0x') ? privateKey.trim() : `0x${privateKey.trim()}`) as Hex;
  return { privateKey: pk, address: privateKeyToAccount(pk).address.toLowerCase() as Address }; // throws on invalid
}
export const newWallet = (): Wallet => walletFromKey(generatePrivateKey());

// ------------------------------------------------------------------ real account
const ACCOUNT = 'bp.account';
export function loadAccount(): Wallet | null {
  const pk = getItem('local', ACCOUNT);
  if (!pk) return null;
  try {
    return walletFromKey(pk);
  } catch {
    return null;
  }
}
export const saveAccount = (w: Wallet) => setItem('local', ACCOUNT, w.privateKey);
export const deleteAccount = () => removeItem('local', ACCOUNT);

// ------------------------------------------------------------------ sandbox personas
const SB = 'bp.sandbox';
const personaKey = (m: Mode) => `bp.sb.wallet.${m}`;
export const isSandbox = () => getItem('local', SB) === '1';
export const setSandboxFlag = (on: boolean) => (on ? setItem('local', SB, '1') : removeItem('local', SB));
export function loadPersona(m: Mode): Wallet | null {
  const pk = getItem('local', personaKey(m));
  if (!pk) return null;
  try {
    return walletFromKey(pk);
  } catch {
    return null;
  }
}
export function ensurePersonas(): Record<Mode, Wallet> {
  const out = {} as Record<Mode, Wallet>;
  for (const m of MODES) {
    let w = loadPersona(m);
    if (!w) {
      w = newWallet();
      setItem('local', personaKey(m), w.privateKey);
    }
    out[m] = w;
  }
  return out;
}

// ------------------------------------------------------------------ preferences (device-local)
export interface Prefs {
  onboarded: boolean;
  use: UseIntent;
  societyId: string;
  language: Language;
  /** B1 "Notify me when someone is" heading to my society. */
  notifyMe: boolean;
  /** Runner road screens in paper/black for bright sun. */
  sunlight: boolean;
  /** C1 done, per account address. */
  runnerSetup: Record<string, boolean>;
  /** D9 backup confirmed, per account address. */
  backedUp: Record<string, boolean>;
  /** Runner's own UPI QR text (device only, never uploaded). */
  upi: string | null;
  /** Opened a society-desk invite link. */
  deskInvite: boolean;
  /** Default live-location toggle for new runs. */
  shareLocation: boolean;
  /** Recent runner trips for one-tap restart (C2). */
  recentTrips: { dest: string; from: string; minutes: number; capacity: number }[];
}

export const DEFAULT_PREFS: Prefs = {
  onboarded: false,
  use: 'both',
  societyId: 'A',
  language: 'en',
  notifyMe: false,
  sunlight: false,
  runnerSetup: {},
  backedUp: {},
  upi: null,
  deskInvite: false,
  shareLocation: true,
  recentTrips: [],
};

const PREFS = 'bp.prefs';
export const loadPrefs = (): Prefs => ({ ...DEFAULT_PREFS, ...getJSON<Partial<Prefs>>('local', PREFS, {}) });
export const savePrefs = (p: Prefs) => setJSON('local', PREFS, p);

// ------------------------------------------------------------------ mode (per tab)
export const getTabMode = (): Mode | null => (getItem('session', 'bp.mode') as Mode | null) ?? null;
export const saveTabMode = (m: Mode) => setItem('session', 'bp.mode', m);

/** Everything app-owned on this device (account, prefs, sandbox, handoff codes, notifications). */
export const wipeDevice = () => clearPrefix('bp.');
export const wipeSandbox = () => {
  clearPrefix('bp.sb.');
  removeItem('local', SB);
};

/** URL hints (web only): ?frame=run (sandbox iframe), ?sandbox=1, ?desk=1 (desk invite). */
export function readQuery(): { frame?: Mode; sandbox?: boolean; desk?: boolean; tour?: boolean } {
  try {
    if (typeof window === 'undefined' || !window.location) return {};
    const q = new URLSearchParams(window.location.search);
    const f = q.get('frame') as Mode | null;
    return {
      frame: f && MODES.includes(f) ? f : undefined,
      sandbox: q.get('sandbox') === '1',
      desk: q.get('desk') === '1',
      tour: q.get('tour') === '1',
    };
  } catch {
    return {};
  }
}

/** Open the app in a new browser tab in a given sandbox mode (web). */
export function openModeInNewTab(m: Mode) {
  if (typeof window === 'undefined') return;
  window.open(`${window.location.origin}/home?sandbox=1&frame=${m}`, '_blank', 'noopener');
}
