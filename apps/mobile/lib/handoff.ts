import type { HandoffSecret } from '@bhaiya-please/core';
import { getItem, setItem } from './storage';

/** Wire formats come from core so QR text produced anywhere decodes everywhere. */
export { encodeHandoffQR, decodeHandoffQR, encodeAddressQR, decodeAddressQR } from '@bhaiya-please/core/mock';

const k = (key: string) => `bp.handoff.${key}`;
export const saveSecret = (s: HandoffSecret) => setItem('local', k(s.requestKey), JSON.stringify(s));
export function loadSecret(requestKey: string): HandoffSecret | null {
  try {
    const raw = getItem('local', k(requestKey));
    return raw ? (JSON.parse(raw) as HandoffSecret) : null;
  } catch {
    return null;
  }
}
