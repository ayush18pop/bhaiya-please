/**
 * Ping codec (live location). Kept apart from entities.ts so the location feature stays isolated.
 * A ping is readonly, expires in PING_RULES.ttlSeconds, and carries only a geohash-7 cell.
 */
import { z } from 'zod';
import type { RawEntity } from '../arkiv/port';
import type { Address, EntityKey, Gh7, Ping, UnixSeconds } from '../types';
import { attr } from './attrs';
import type { DropSink, EntitySpec } from './entities';
import { metaOf, typeOf } from './entities';
import { A } from './schemas';

const GEOHASH = '0123456789bcdefghjkmnpqrstuvwxyz';
export const gh7Schema = z.string().regex(new RegExp(`^[${GEOHASH}]{7}$`), 'gh7 must be a 7-char geohash');
export const seqSchema = z.number().int().min(0).max(2_147_483_647);

export const pingAttrSchema = z.object({
  run: A.key,
  rider: A.addr,
  gh7: A.str(gh7Schema),
  zone5: A.zone5,
  at: A.unix,
  seq: z.object({ type: z.literal('i32'), value: seqSchema }).optional(),
});

export const pingPayloadSchema = z.object({
  heading: z.number().min(0).max(360).optional(),
  speedKmh: z.number().min(0).max(200).optional(),
});

export interface PingFields {
  run: EntityKey;
  rider: Address;
  gh7: Gh7;
  at: UnixSeconds;
  seq?: number;
  heading?: number;
  speedKmh?: number;
}

export function encodePing(project: string, i: PingFields): EntitySpec {
  const attributes: EntitySpec['attributes'] = {
    project: { type: 'str', value: project },
    type: { type: 'str', value: 'ping' },
    run: attr('run', i.run),
    rider: attr('rider', i.rider),
    gh7: attr('gh7', i.gh7),
    zone5: attr('zone5', i.gh7.slice(0, 5)),
    at: attr('at', BigInt(i.at)),
  };
  if (i.seq !== undefined) attributes.seq = attr('seq', i.seq);
  const payload: { heading?: number; speedKmh?: number } = {};
  if (i.heading !== undefined) payload.heading = Math.round(i.heading) % 360;
  if (i.speedKmh !== undefined) payload.speedKmh = Math.round(i.speedKmh * 10) / 10;
  return { attributes, payload: JSON.stringify(payload), readonly: true, permissionlessExtension: false };
}

export function decodePing(raw: RawEntity, project: string, drop?: DropSink): Ping | null {
  if (typeOf(raw, project) !== 'ping') return null;
  const a = pingAttrSchema.safeParse(raw.attributes);
  if (!a.success) {
    drop?.(raw.key, `ping attrs: ${a.error.issues[0]?.message ?? 'invalid'}`);
    return null;
  }
  // zone5 is derived; a mismatch means a hand-crafted entity.
  if (a.data.zone5.value !== a.data.gh7.value.slice(0, 5)) {
    drop?.(raw.key, 'ping: zone5 does not match gh7');
    return null;
  }
  let json: unknown = {};
  if (raw.payload !== '') {
    try {
      json = JSON.parse(raw.payload);
    } catch {
      json = undefined;
    }
  }
  const p = pingPayloadSchema.safeParse(json);
  if (!p.success) {
    drop?.(raw.key, `ping payload: ${p.error.issues[0]?.message ?? 'invalid'}`);
    return null;
  }
  const ping: Ping = {
    ...metaOf(raw),
    run: a.data.run.value,
    rider: a.data.rider.value,
    gh7: a.data.gh7.value,
    zone5: a.data.zone5.value,
    at: a.data.at.value,
  };
  if (a.data.seq) ping.seq = a.data.seq.value;
  if (p.data.heading !== undefined) ping.heading = p.data.heading;
  if (p.data.speedKmh !== undefined) ping.speedKmh = p.data.speedKmh;
  return ping;
}
