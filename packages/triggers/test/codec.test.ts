import { sha256, stringToHex } from 'viem';
import { describe, expect, it } from 'vitest';
import {
  buildTriggerSpec,
  channelMessage,
  decodeTrigger,
  fillTemplate,
  pred,
  TriggerInputError,
  val,
  watchId,
  webPushTarget,
  ZERO_BYTES32,
} from '../src';
import type { RawEntity } from '../src/port';

const CH = `0x${'ab'.repeat(32)}` as const;
const KEY = `0x${'cd'.repeat(32)}` as const;
const OWNER = `0x${'11'.repeat(20)}` as const;

function asRaw(spec: ReturnType<typeof buildTriggerSpec>): RawEntity {
  return {
    key: KEY,
    owner: OWNER,
    creator: OWNER,
    createdAt: 1,
    expiresAt: 1 + spec.expiresInSeconds,
    readonly: spec.readonly,
    permissionlessExtension: false,
    attributes: spec.attributes,
    payload: spec.payload,
    contentType: 'application/json',
  };
}

describe('codec + client helpers', () => {
  it('round-trips a trigger, u64 predicate values included', () => {
    const spec = buildTriggerSpec({
      watchProject: 'bhaiyaplease',
      watchType: 'run',
      on: 'expiring',
      lead: 300,
      action: 'push',
      channel: CH,
      match: { where: [pred.key('$key', KEY), pred.gte('at_gate', val.u64(1))], creator: OWNER },
      unless: { project: 'bhaiyaplease', type: 'delivery', where: [pred.key('request', KEY)] },
      label: 'Run ending',
      body: 'Run to {dest_zone}',
      href: '/home',
      expiresInSeconds: 3600,
    });
    expect(spec.attributes.lead).toEqual({ type: 'u64', value: 300n });
    const t = decodeTrigger(asRaw(spec));
    expect(t).toMatchObject({ on: 'expiring', lead: 300, action: 'push', channel: CH, label: 'Run ending' });
    expect(t?.match.where[1]).toEqual({ op: 'gte', name: 'at_gate', value: { type: 'u64', value: 1n } });
    expect(t?.unless?.type).toBe('delivery');
  });

  it('rejects invalid input', () => {
    const base = { watchProject: 'bhaiyaplease', watchType: 'run', on: 'created' as const, match: { where: [] }, expiresInSeconds: 60 };
    expect(() => buildTriggerSpec({ ...base, action: 'push' })).toThrow(TriggerInputError);
    expect(() => buildTriggerSpec({ ...base, action: 'attest' })).toThrow(/attester/);
    expect(() => buildTriggerSpec({ ...base, action: 'push', channel: CH, label: 'x'.repeat(81) })).toThrow(TriggerInputError);
    expect(() => buildTriggerSpec({ ...base, action: 'push', channel: CH, match: { where: [pred.str('project', 'x')] } })).toThrow(/project/);
    expect(() => buildTriggerSpec({ ...base, action: 'push', channel: CH, expiresInSeconds: 0 })).toThrow(TriggerInputError);
    expect(buildTriggerSpec({ ...base, action: 'attest', attester: 'x.y', channel: CH }).attributes.channel).toEqual({ type: 'bytes32', value: ZERO_BYTES32 });
  });

  it('decoder drops a push trigger without a channel', () => {
    const spec = buildTriggerSpec({ watchProject: 'p', watchType: 't', on: 'created', action: 'attest', attester: 'a', match: { where: [] }, expiresInSeconds: 60 });
    const raw = asRaw(spec);
    raw.attributes = { ...raw.attributes, action: val.str('push') };
    expect(decodeTrigger(raw)).toBeNull();
  });

  it('channelMessage has the exact spec format', () => {
    const target = 'ExponentPushToken[abc]';
    expect(channelMessage('expo', target, 1_790_000_000)).toBe(
      `arkiv-triggers channel\nexpo\n${sha256(stringToHex(target))}\n1790000000`,
    );
    expect(webPushTarget({ endpoint: 'https://x', keys: { p256dh: 'p', auth: 'a' }, expirationTime: null })).toBe(
      '{"endpoint":"https://x","keys":{"p256dh":"p","auth":"a"}}',
    );
  });

  it('fillTemplate fills attributes, blanks unknowns, caps length', () => {
    expect(fillTemplate('{tip} rupees to {dest_zone}{nope}', { tip: { type: 'i32', value: 20 }, dest_zone: 'tdr1y4' })).toBe('20 rupees to tdr1y4');
    expect(fillTemplate('{x}'.repeat(10), { x: 'y'.repeat(100) })).toHaveLength(200);
  });

  it('watchId ignores predicate order', () => {
    const a = { watchProject: 'p', watchType: 't', match: { where: [pred.str('a', '1'), pred.str('b', '2')] } };
    const b = { watchProject: 'p', watchType: 't', match: { where: [pred.str('b', '2'), pred.str('a', '1')] } };
    expect(watchId(a)).toBe(watchId(b));
  });
});
