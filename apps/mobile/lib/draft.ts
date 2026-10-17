/** The request being written (B6 → B7), kept in memory so "Edit" and "Send to another runner" keep the items. */
import { useSyncExternalStore } from 'react';

export interface Draft {
  runKey: string | null;
  shopKey: string | null;
  items: string[];
  maxPrice: number;
  tip: number;
}
const EMPTY: Draft = { runKey: null, shopKey: null, items: [''], maxPrice: 150, tip: 20 };
let draft: Draft = EMPTY;
const subs = new Set<() => void>();

export function setDraft(patch: Partial<Draft>) {
  draft = { ...draft, ...patch };
  subs.forEach((f) => f());
}
export const resetDraft = () => setDraft(EMPTY);
export const getDraft = () => draft;
export function useDraft(): Draft {
  return useSyncExternalStore(
    (cb) => {
      subs.add(cb);
      return () => subs.delete(cb);
    },
    () => draft,
    () => draft,
  );
}
