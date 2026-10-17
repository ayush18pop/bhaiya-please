/**
 * In-app notification inbox (D7), per account, device-local. Push needs an off-chain relay (later);
 * the watcher (components/shared/NotificationWatcher) diffs live data and calls `notify`.
 */
import { useSyncExternalStore } from 'react';
import { getJSON, setJSON } from './storage';

export type NotifKind =
  | 'accepted' | 'near' | 'atGate' | 'handedOver' | 'receipt' | 'report' | 'vouched' | 'unvouched'
  | 'newRequest' | 'runEnding' | 'runHere' | 'declined' | 'info';

export interface Notif {
  id: string;
  kind: NotifKind;
  title: string;
  body?: string;
  /** Route to open (expo-router href). */
  href?: string;
  at: number; // unix seconds
  read: boolean;
}

const MAX = 80;
let owner: string | null = null;
let list: Notif[] = [];
const subs = new Set<() => void>();
const key = (a: string) => `bp.notifs.${a.toLowerCase()}`;
const emit = () => subs.forEach((f) => f());

/** Switch the inbox to an account (called by the shell when the active address changes). */
export function setNotifOwner(address: string | null) {
  if (address === owner) return;
  owner = address;
  list = address ? getJSON<Notif[]>('local', key(address), []) : [];
  emit();
}

function persist() {
  if (owner) setJSON('local', key(owner), list);
  emit();
}

/** Add once per id (dedupes repeats across refetches). Returns true if it was new. */
export function notify(n: Omit<Notif, 'read' | 'at'> & { at?: number }): boolean {
  if (!owner || list.some((x) => x.id === n.id)) return false;
  list = [{ ...n, at: n.at ?? Math.floor(Date.now() / 1000), read: false }, ...list].slice(0, MAX);
  persist();
  return true;
}
export function markAllRead() {
  if (!list.some((x) => !x.read)) return;
  list = list.map((x) => ({ ...x, read: true }));
  persist();
}
export function markRead(id: string) {
  list = list.map((x) => (x.id === id ? { ...x, read: true } : x));
  persist();
}
export function hasNotif(id: string) {
  return list.some((x) => x.id === id);
}

export function useNotifs(): Notif[] {
  return useSyncExternalStore(
    (cb) => {
      subs.add(cb);
      return () => subs.delete(cb);
    },
    () => list,
    () => list,
  );
}
export const useUnreadCount = () => useNotifs().filter((n) => !n.read).length;
