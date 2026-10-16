/**
 * Live location: coarse, self-expiring pings. The runner app publishes one every ~20 s while its run
 * is live; each ping deletes itself after 2 min (never outliving the run). Readers keep only pings
 * whose $creator is the run's $creator (and whose `rider` says the same), latest per run.
 */
import { z } from 'zod';
import type { Predicate } from '../arkiv/port';
import { attr } from '../codec/attrs';
import { decodePing, encodePing, gh7Schema, seqSchema } from '../codec/ping';
import { keySchema, zone5Schema } from '../codec/schemas';
import { parseOrThrow } from '../codec/validate';
import { BhaiyaPleaseError, PING_RULES } from '../types';
import type { EntityKey, MutationResult, Ping, PingMeta, Run, Zone5 } from '../types';
import { mapLimit, reader, requireSigner, sameAddr } from './context';
import type { ServiceContext } from './context';
import { getTrustedRun } from './runs';

const metaSchema = z.object({
  seq: seqSchema.optional(),
  heading: z.number().min(0).max(360).optional(),
  speedKmh: z.number().min(0).max(200).optional(),
});

/** Trust rule: written by the runner of a live, trusted run, about itself. */
export function isRunnerPing(p: Ping, run: Run | null, now: number): boolean {
  return (
    !!run &&
    p.run === run.key &&
    now < run.expiresAt &&
    sameAddr(p.creator, run.creator) &&
    sameAddr(p.rider, p.creator)
  );
}

/** Newest first: $createdAt, then seq, then declared `at`. */
const newer = (a: Ping, b: Ping) => b.createdAt - a.createdAt || (b.seq ?? -1) - (a.seq ?? -1) || b.at - a.at;

export function locationService(ctx: ServiceContext) {
  const rd = () => reader(ctx.port, ctx.project, ctx.drop);

  async function trusted(pings: Ping[]): Promise<Ping[]> {
    const now = ctx.port.now();
    const keys = [...new Set(pings.map((p) => p.run))];
    const runs = new Map<EntityKey, Run | null>();
    await mapLimit(keys, 6, async (k) => runs.set(k, await getTrustedRun(rd(), k)));
    return pings.filter((p) => isRunnerPing(p, runs.get(p.run) ?? null, now));
  }

  return {
    async publishPing(runKey: EntityKey, gh7: string, meta: PingMeta = {}): Promise<MutationResult> {
      const self = requireSigner(ctx);
      const key = parseOrThrow(keySchema, runKey, 'runKey');
      const cell = parseOrThrow(gh7Schema, gh7.toLowerCase(), 'gh7');
      const m = parseOrThrow(metaSchema, meta, 'ping');
      const run = await getTrustedRun(rd(), key);
      if (!run) throw new BhaiyaPleaseError('EXPIRED', 'Run ended: stop sharing location');
      if (!sameAddr(run.creator, self)) throw new BhaiyaPleaseError('NOT_OWNER', 'Only the runner can share location for this run');
      const now = ctx.port.now();
      const left = run.expiresAt - now;
      if (left <= 2) throw new BhaiyaPleaseError('EXPIRED', 'Run ended: stop sharing location');
      const s = encodePing(ctx.project, { run: key, rider: self, gh7: cell, at: now, ...m });
      return ctx.port.write(async (w) => {
        const r = await w.create({ ...s, expiresInSeconds: Math.min(PING_RULES.ttlSeconds, left) });
        return { key: r.key, txHash: r.txHash };
      });
    },

    /** Latest valid ping per run, for runs in an area (zone5) or an explicit list of runs. */
    async getLatestPings(scope: Zone5 | readonly EntityKey[]): Promise<Ping[]> {
      let where: Predicate[];
      if (typeof scope === 'string') {
        where = [{ op: 'eq', name: 'zone5', value: attr('zone5', parseOrThrow(zone5Schema, scope, 'zone5')) }];
      } else {
        const keys = [...new Set(scope.map((k) => parseOrThrow(keySchema, k, 'runKey')))];
        if (keys.length === 0) return [];
        const preds: Predicate[] = keys.map((k) => ({ op: 'eq', name: 'run', value: attr('run', k) }));
        where = [preds.length === 1 ? preds[0]! : { op: 'or', preds }];
      }
      const valid = await trusted(await rd().list('ping', decodePing, where));
      const latest = new Map<EntityKey, Ping>();
      for (const p of valid.sort(newer)) if (!latest.has(p.run)) latest.set(p.run, p);
      return [...latest.values()];
    },

    /** All live valid pings of one run, oldest → newest (≤ 2 min of breadcrumbs). */
    async getRunTrail(runKey: EntityKey): Promise<Ping[]> {
      const key = parseOrThrow(keySchema, runKey, 'runKey');
      const run = await getTrustedRun(rd(), key);
      if (!run) return [];
      const list = await rd().list('ping', decodePing, [{ op: 'eq', name: 'run', value: attr('run', key) }], {
        creator: run.creator,
      });
      const now = ctx.port.now();
      return list.filter((p) => isRunnerPing(p, run, now)).sort((a, b) => -newer(a, b));
    },
  };
}
