/**
 * Tiny sync storage shim. Web: localStorage / sessionStorage. Native: 'local' persists in the OS
 * keystore (expo-secure-store, sync API) so the account and settings survive restarts; 'session'
 * is in-memory (one app process = one "tab").
 */
import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

type Kind = 'local' | 'session';
const mem: Record<Kind, Map<string, string>> = { local: new Map(), session: new Map() };
const NATIVE = Platform.OS !== 'web';
const INDEX = 'bp.__keys';

function backend(kind: Kind): Storage | null {
  try {
    if (NATIVE || typeof window === 'undefined') return null;
    return kind === 'local' ? window.localStorage : window.sessionStorage;
  } catch {
    return null;
  }
}

// ---- native keystore (local kind only)
const safeKey = (k: string) => k.replace(/[^\w.-]/g, '_');
function secureGet(key: string): string | null {
  try {
    return SecureStore.getItem(safeKey(key));
  } catch {
    return null;
  }
}
function secureSet(key: string, value: string) {
  try {
    SecureStore.setItem(safeKey(key), value);
  } catch {}
}
function secureDel(key: string) {
  SecureStore.deleteItemAsync(safeKey(key)).catch(() => {});
}
function nativeIndex(): string[] {
  try {
    return JSON.parse(secureGet(INDEX) ?? '[]') as string[];
  } catch {
    return [];
  }
}
function indexAdd(key: string) {
  const ks = nativeIndex();
  if (!ks.includes(key)) secureSet(INDEX, JSON.stringify([...ks, key]));
}
function indexRemove(keys: string[]) {
  secureSet(INDEX, JSON.stringify(nativeIndex().filter((k) => !keys.includes(k))));
}

export function getItem(kind: Kind, key: string): string | null {
  try {
    const b = backend(kind);
    if (b) return b.getItem(key);
    if (mem[kind].has(key)) return mem[kind].get(key) ?? null;
    if (NATIVE && kind === 'local') {
      const v = secureGet(key);
      if (v !== null) mem.local.set(key, v);
      return v;
    }
    return null;
  } catch {
    return mem[kind].get(key) ?? null;
  }
}

export function setItem(kind: Kind, key: string, value: string) {
  mem[kind].set(key, value);
  try {
    const b = backend(kind);
    if (b) b.setItem(key, value);
    else if (NATIVE && kind === 'local') {
      secureSet(key, value);
      indexAdd(key);
    }
  } catch {}
}

export function removeItem(kind: Kind, key: string) {
  mem[kind].delete(key);
  try {
    backend(kind)?.removeItem(key);
    if (NATIVE && kind === 'local') {
      secureDel(key);
      indexRemove([key]);
    }
  } catch {}
}

export function clearPrefix(prefix: string) {
  for (const kind of ['local', 'session'] as const) {
    try {
      const b = backend(kind);
      if (b) Object.keys(b).filter((k) => k.startsWith(prefix)).forEach((k) => b.removeItem(k));
    } catch {}
    [...mem[kind].keys()].filter((k) => k.startsWith(prefix)).forEach((k) => mem[kind].delete(k));
  }
  if (NATIVE) {
    const ks = nativeIndex().filter((k) => k.startsWith(prefix));
    ks.forEach(secureDel);
    indexRemove(ks);
  }
}

/** JSON helpers. */
export function getJSON<T>(kind: Kind, key: string, fallback: T): T {
  try {
    const raw = getItem(kind, key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}
export const setJSON = (kind: Kind, key: string, value: unknown) => setItem(kind, key, JSON.stringify(value));
