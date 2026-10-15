/** Tiny sync storage shim: localStorage / sessionStorage on web, in-memory elsewhere. */
type Kind = 'local' | 'session';
const mem: Record<Kind, Map<string, string>> = { local: new Map(), session: new Map() };

function backend(kind: Kind): Storage | null {
  try {
    if (typeof window === 'undefined') return null;
    return kind === 'local' ? window.localStorage : window.sessionStorage;
  } catch {
    return null;
  }
}

export function getItem(kind: Kind, key: string): string | null {
  try {
    const b = backend(kind);
    return b ? b.getItem(key) : (mem[kind].get(key) ?? null);
  } catch {
    return mem[kind].get(key) ?? null;
  }
}

export function setItem(kind: Kind, key: string, value: string) {
  try {
    const b = backend(kind);
    if (b) b.setItem(key, value);
    else mem[kind].set(key, value);
  } catch {
    mem[kind].set(key, value);
  }
}

export function removeItem(kind: Kind, key: string) {
  try {
    backend(kind)?.removeItem(key);
  } catch {}
  mem[kind].delete(key);
}

export function clearPrefix(prefix: string) {
  for (const kind of ['local', 'session'] as const) {
    try {
      const b = backend(kind);
      if (b) Object.keys(b).filter((k) => k.startsWith(prefix)).forEach((k) => b.removeItem(k));
    } catch {}
    [...mem[kind].keys()].filter((k) => k.startsWith(prefix)).forEach((k) => mem[kind].delete(k));
  }
}
