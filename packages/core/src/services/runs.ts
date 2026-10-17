import { z } from 'zod';
import { attr, i32V, u64V } from '../codec/attrs';
import { decode, encode } from '../codec/entities';
import { keySchema, noteSchema, zone6Schema } from '../codec/schemas';
import { parseOrThrow } from '../codec/validate';
import { BhaiyaPleaseError } from '../types';
import type { Accept, AnnounceRunInput, Decline, EntityKey, MutationResult, Run, Zone6 } from '../types';
import { reader, requireSigner, sameAddr, TTL } from './context';
import type { Reader, ServiceContext } from './context';
import { loadProfile } from './reputation';

const announceSchema = z.object({
  destZone: zone6Schema,
  fromZone: zone6Schema,
  etaMinutes: z.number().int().min(1).max(240),
  capacity: z.number().int().min(1).max(10),
  note: noteSchema.optional(),
});

/** A run whose owner changed hands could be patched by a stranger; only creator-owned runs count. */
const isTrustedRun = (r: Run) => sameAddr(r.owner, r.creator);

export async function getTrustedRun(rd: Reader, key: EntityKey): Promise<Run | null> {
  const run = await rd.one(key, decode.run);
  return run && isTrustedRun(run) ? run : null;
}

/** Accepts the runner wrote for itself on this run, one per request (earliest wins). */
export async function validAcceptsForRun(rd: Reader, run: Run): Promise<Accept[]> {
  const list = await rd.list('accept', decode.accept, [{ op: 'eq', name: 'run', value: attr('run', run.key) }], {
    creator: run.creator,
  });
  return earliestPerRequest(list.filter((a) => a.run === run.key && isRunnerAccept(a, run)));
}

export function isRunnerAccept(a: Accept, run: Run): boolean {
  return sameAddr(a.creator, run.creator) && sameAddr(a.rider, a.creator);
}

/** Same rule as accepts: only the runner's own decline, naming itself as rider, counts. */
export function isRunnerDecline(d: Decline, run: Run): boolean {
  return sameAddr(d.creator, run.creator) && sameAddr(d.rider, d.creator);
}

function earliestPerRequest(accepts: Accept[]): Accept[] {
  const m = new Map<EntityKey, Accept>();
  for (const a of accepts) {
    const prev = m.get(a.request);
    if (!prev || a.createdAt < prev.createdAt) m.set(a.request, a);
  }
  return [...m.values()];
}

export function runService(ctx: ServiceContext) {
  const rd = () => reader(ctx.port, ctx.project, ctx.drop);
  return {
    async announceRun(input: AnnounceRunInput): Promise<MutationResult> {
      const self = requireSigner(ctx);
      const i = parseOrThrow(announceSchema, input, 'run');
      const profile = await loadProfile(ctx, ctx.port, self);
      const now = ctx.port.now();
      const s = encode.run(ctx.project, {
        destZone: i.destZone,
        fromZone: i.fromZone,
        eta: now + i.etaMinutes * 60,
        capacityLeft: Math.min(i.capacity, profile.tier.requestsPerRun),
        claimedTier: profile.tier.tier,
        ...(i.note ? { note: i.note } : {}),
      });
      return ctx.port.write(async (w) => {
        const r = await w.create({ ...s, expiresInSeconds: i.etaMinutes * 60 + TTL.runAfterEta });
        return { key: r.key, txHash: r.txHash };
      });
    },

    async getLiveRuns(destZone: Zone6): Promise<Run[]> {
      const z6 = parseOrThrow(zone6Schema, destZone, 'destZone');
      const now = ctx.port.now();
      const runs = await rd().list('run', decode.run, [
        { op: 'eq', name: 'dest_zone', value: attr('dest_zone', z6) },
        { op: 'gt', name: 'eta', value: u64V(now) },
        { op: 'gt', name: 'capacity_left', value: i32V(0) },
      ]);
      return runs.filter((r) => isTrustedRun(r) && r.eta > now && r.capacityLeft > 0).sort((a, b) => a.eta - b.eta);
    },

    async getMyRuns(): Promise<Run[]> {
      const self = ctx.port.address;
      if (!self) return [];
      const runs = await rd().list('run', decode.run, [], { creator: self });
      return runs.filter(isTrustedRun).sort((a, b) => a.eta - b.eta);
    },

    getRun: (key: EntityKey) => getTrustedRun(rd(), key),

    async cancelRun(key: EntityKey): Promise<MutationResult> {
      const self = requireSigner(ctx);
      const run = await getTrustedRun(rd(), key);
      if (!run) throw new BhaiyaPleaseError('NOT_FOUND', 'Run not found or expired');
      if (!sameAddr(run.owner, self)) throw new BhaiyaPleaseError('NOT_OWNER', 'Only the runner can cancel this run');
      return ctx.port.write(async (w) => ({ key: run.key, txHash: (await w.remove(run.key)).txHash }));
    },

    /** Partial patch of `at_gate` only; capacity_left, other attributes and expiry stay as they are. */
    async markAtGate(runKey: EntityKey): Promise<MutationResult> {
      const self = requireSigner(ctx);
      const k = parseOrThrow(keySchema, runKey, 'runKey');
      return ctx.port.write(async (w) => {
        const run = await getTrustedRun(rd(), k);
        if (!run) throw new BhaiyaPleaseError('NOT_FOUND', 'Run not found or expired');
        if (!sameAddr(run.owner, self)) throw new BhaiyaPleaseError('NOT_OWNER', 'Only the runner can mark this run at the gate');
        // Allowed after ETA (arriving late is normal); only an expired run is refused.
        const now = ctx.port.now();
        if (run.expiresAt <= now) throw new BhaiyaPleaseError('EXPIRED', 'This run has ended');
        const res = await w.patch(run.key, { at_gate: attr('at_gate', BigInt(now)) });
        return { key: run.key, txHash: res.txHash };
      });
    },
  };
}
