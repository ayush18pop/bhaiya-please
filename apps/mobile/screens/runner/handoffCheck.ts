/**
 * C8: check a scanned/pasted handoff code against this run's requests BEFORE saving anything.
 * Same commit formula as core (keccak256(code ‖ salt ‖ requestKey)), computed on the phone.
 */
import type { HandoffSecret, Hex } from '@bhaiya-please/core';
import { concat, hexToBytes, keccak256, stringToBytes } from 'viem';
import type { RequestRow } from '@/hooks/queries';
import { parseHandoff } from '@/lib/handoff';

export type HandoffCheck =
  | { kind: 'ok'; secret: HandoffSecret; row: RequestRow }
  | { kind: 'other'; secret: HandoffSecret; row: RequestRow }
  | { kind: 'already'; row: RequestRow }
  | { kind: 'nomatch' }
  | { kind: 'bad' };

function commitOf(s: HandoffSecret): Hex | null {
  try {
    if (!/^\d{4}$/.test(s.code) || !/^0x[0-9a-fA-F]{32}$/.test(s.salt) || !/^0x[0-9a-fA-F]{64}$/.test(s.requestKey)) return null;
    return keccak256(concat([stringToBytes(s.code), hexToBytes(s.salt), hexToBytes(s.requestKey as Hex)])).toLowerCase() as Hex;
  } catch {
    return null;
  }
}

/** `target` is the request the runner opened the scanner for (may be null: any waiting request). */
export function checkHandoff(text: string, rows: RequestRow[], target: string | null): HandoffCheck {
  let secret: HandoffSecret;
  try {
    secret = parseHandoff(text);
  } catch {
    return { kind: 'bad' };
  }
  const row = rows.find((r) => r.request.key.toLowerCase() === secret.requestKey.toLowerCase());
  if (!row || !row.accept) return { kind: 'nomatch' };
  if (row.delivery) return { kind: 'already', row };
  const c = commitOf(secret);
  if (!c || c !== row.request.codeCommit.toLowerCase()) return { kind: 'nomatch' };
  if (target && target.toLowerCase() !== row.request.key.toLowerCase()) return { kind: 'other', secret, row };
  return { kind: 'ok', secret, row };
}
