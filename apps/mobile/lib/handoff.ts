import type { HandoffSecret } from '@bhaiya-please/core';
import { decodeHandoffQR, encodeHandoffQR } from '@bhaiya-please/core/mock';
import { getItem, setItem } from './storage';

/** Wire formats come from core so QR text produced anywhere decodes everywhere. */
export { encodeHandoffQR, decodeHandoffQR, encodeAddressQR, decodeAddressQR } from '@bhaiya-please/core/mock';

const k = (key: string) => `bp.handoff.${key}`;
/** The handoff code + salt live only on the phone that sent the request. */
export const saveSecret = (s: HandoffSecret) => setItem('local', k(s.requestKey), JSON.stringify(s));
export function loadSecret(requestKey: string): HandoffSecret | null {
  try {
    const raw = getItem('local', k(requestKey));
    return raw ? (JSON.parse(raw) as HandoffSecret) : null;
  } catch {
    return null;
  }
}

const APP_URL = process.env.EXPO_PUBLIC_REAL_APP_URL ?? 'https://bhaiya-please.vercel.app';

/** B9 "Share handoff link": the camera-failure fallback the runner pastes in C8. */
export function handoffLink(s: HandoffSecret): string {
  return `${APP_URL}/h#${encodeURIComponent(encodeHandoffQR(s))}`;
}

/** Accepts raw QR text or a handoff link (C8 paste). Throws on anything else. */
export function parseHandoff(text: string): HandoffSecret {
  const t = text.trim();
  const hash = t.indexOf('/h#');
  return decodeHandoffQR(hash >= 0 ? decodeURIComponent(t.slice(hash + 3)) : t);
}
