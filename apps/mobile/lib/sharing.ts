/** Runner live-location sharing state (one per tab), read by the beacon and the runner screens. */
import { useSyncExternalStore } from 'react';
import { getItem, setItem } from './storage';

export type SharingStatus = 'off' | 'waiting' | 'sending' | 'sharing' | 'denied' | 'error' | 'ended';

export interface SharingState {
  enabled: boolean;
  /** Demo: move along a synthetic route instead of reading GPS (judges on desktop). */
  simulate: boolean;
  status: SharingStatus;
  lastSentAt: number | null;
  lastGh7: string | null;
  /** Optimistic own position, shown before the ping lands on chain. */
  pendingGh7: string | null;
  error: string | null;
}

let state: SharingState = {
  enabled: getItem('session', 'bp.share') !== '0',
  // Simulated by default: Arkiv data is public, so real GPS is an explicit opt-in (no real location on testnet).
  simulate: getItem('session', 'bp.share.sim') !== '0',
  status: 'off',
  lastSentAt: null,
  lastGh7: null,
  pendingGh7: null,
  error: null,
};
const listeners = new Set<() => void>();

export function setSharing(patch: Partial<SharingState>) {
  state = { ...state, ...patch };
  if ('enabled' in patch) setItem('session', 'bp.share', state.enabled ? '1' : '0');
  if ('simulate' in patch) setItem('session', 'bp.share.sim', state.simulate ? '1' : '0');
  listeners.forEach((l) => l());
}

export const getSharing = () => state;

export function useSharing(): SharingState {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => state,
    () => state,
  );
}
