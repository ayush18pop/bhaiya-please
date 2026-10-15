import { z } from 'zod';
import { attr } from '../codec/attrs';
import { decode, encode } from '../codec/entities';
import { computeCodeCommit, generateHandoffSecret } from '../codec/handoff';
import { itemsSchema, keySchema, rupeesSchema } from '../codec/schemas';
import { parseOrThrow } from '../codec/validate';
import { BhaiyaPleaseError } from '../types';
import type { Accept, EntityKey, MutationResult, PostRequestInput, PostRequestResult, Request } from '../types';
import type { Writer } from '../arkiv/port';
import { reader, requireSigner, sameAddr, TTL } from './context';
import type { ServiceContext } from './context';
import { loadProfile } from './reputation';
import { getTrustedRun, isRunnerAccept, validAcceptsForRun } from './runs';

const postSchema = z.object({
  runKey: keySchema,
  shopKey: keySchema,
  items: itemsSchema,
  maxPrice: rupeesSchema.min(1),
  tip: rupeesSchema,
});

export function requestService(ctx: ServiceContext) {
  const rd = () => reader(ctx.port, ctx.project, ctx.drop);

  async function getAcceptForRequest(requestKey: EntityKey): Promise<Accept | null> {
    const r = rd();
    const request = await r.one(requestKey, decode.request);
    if (!request) return null;
    const run = await getTrustedRun(r, request.run);
    if (!run) return null;
    const accepts = await r.list('accept', decode.accept, [{ op: 'eq', name: 'request', value: attr('request', request.key) }], {
      creator: run.creator,
    });
    const valid = accepts.filter((a) => a.request === request.key && a.run === run.key && isRunnerAccept(a, run));
    return valid.sort((a, b) => a.createdAt - b.createdAt)[0] ?? null;
  }

  return {
    async postRequest(input: PostRequestInput): Promise<PostRequestResult> {
      const self = requireSigner(ctx);
      const i = parseOrThrow(postSchema, input, 'request');
      const r = rd();
      const run = await getTrustedRun(r, i.runKey);
      if (!run) throw new BhaiyaPleaseError('NOT_FOUND', 'Run not found or expired');
      const now = ctx.port.now();
      if (run.eta <= now) throw new BhaiyaPleaseError('EXPIRED', 'This run has already left');
      if (sameAddr(run.creator, self)) throw new BhaiyaPleaseError('INVALID_INPUT', 'You cannot request on your own run');
      if (run.capacityLeft <= 0) throw new BhaiyaPleaseError('CAPACITY_EXHAUSTED', 'This run is full');
      const shop = await r.one(i.shopKey, decode.shop);
      if (!shop) throw new BhaiyaPleaseError('NOT_FOUND', 'Shop not found or expired');

      // Limits come from the runner's viewer-computed tier, never the run's claimed tier.
      const runner = await loadProfile(ctx, ctx.port, run.creator);
      if (i.maxPrice > runner.tier.priceCap) {
        throw new BhaiyaPleaseError('TIER_LIMIT', `This runner's limit is ₹${runner.tier.priceCap}`);
      }
      const accepted = await validAcceptsForRun(r, run);
      if (accepted.length >= runner.tier.requestsPerRun) {
        throw new BhaiyaPleaseError('CAPACITY_EXHAUSTED', 'This run is full');
      }

      const expiresInSeconds = Math.max(60, run.expiresAt - now + TTL.requestGrace);
      // Prediction is nonce-bound: predict + create must hold the write slot together.
      return ctx.port.write(async (w) => {
        const attempt = async (): Promise<PostRequestResult | null> => {
          const [p] = await w.predictKeys(1);
          if (!p) throw new BhaiyaPleaseError('KEY_PREDICTION_MISMATCH', 'No key predicted');
          const secret = generateHandoffSecret(p.key);
          const s = encode.request(ctx.project, {
            run: run.key,
            shop: shop.key,
            destZone: run.destZone,
            maxPrice: i.maxPrice,
            tip: i.tip,
            codeCommit: computeCodeCommit(secret.code, secret.salt, p.key),
            items: i.items,
          });
          const created = await w.create({ ...s, salt: p.salt, expiresInSeconds });
          if (created.key === p.key) return { key: created.key, txHash: created.txHash, secret };
          await removeQuietly(w, created.key);
          return null;
        };
        const result = (await attempt()) ?? (await attempt());
        if (!result) throw new BhaiyaPleaseError('KEY_PREDICTION_MISMATCH', 'Created key differs from prediction', { retryable: true });
        return result;
      });
    },

    async getRequestsForRun(runKey: EntityKey): Promise<Request[]> {
      const k = parseOrThrow(keySchema, runKey, 'runKey');
      const list = await rd().list('request', decode.request, [{ op: 'eq', name: 'run', value: attr('run', k) }]);
      return list.filter((q) => q.run === k).sort((a, b) => a.createdAt - b.createdAt);
    },

    async getMyRequests(): Promise<Request[]> {
      const self = ctx.port.address;
      if (!self) return [];
      const list = await rd().list('request', decode.request, [], { creator: self });
      return list.sort((a, b) => b.createdAt - a.createdAt);
    },

    getRequest: (key: EntityKey) => rd().one(key, decode.request),

    /** ONE batch: create Accept + patch run.capacity_left − 1, after a fresh read inside the write slot. */
    async acceptRequest(requestKey: EntityKey): Promise<MutationResult> {
      const self = requireSigner(ctx);
      const k = parseOrThrow(keySchema, requestKey, 'requestKey');
      const r = rd();
      const request = await r.one(k, decode.request);
      if (!request) throw new BhaiyaPleaseError('NOT_FOUND', 'Request not found or expired');
      const profile = await loadProfile(ctx, ctx.port, self);
      if (request.maxPrice > profile.tier.priceCap) {
        throw new BhaiyaPleaseError('TIER_LIMIT', `Above your ₹${profile.tier.priceCap} limit`);
      }
      return ctx.port.write(async (w) => {
        const run = await getTrustedRun(r, request.run);
        if (!run) throw new BhaiyaPleaseError('NOT_FOUND', 'Run not found or expired');
        if (!sameAddr(run.creator, self)) throw new BhaiyaPleaseError('NOT_OWNER', 'Only the runner can accept');
        if (run.eta <= ctx.port.now()) throw new BhaiyaPleaseError('EXPIRED', 'This run has already left');
        const accepts = await validAcceptsForRun(r, run);
        if (accepts.some((a) => a.request === request.key)) {
          throw new BhaiyaPleaseError('INVALID_INPUT', 'Already accepted');
        }
        if (run.capacityLeft <= 0) throw new BhaiyaPleaseError('CAPACITY_EXHAUSTED', 'No capacity left on this run');
        if (accepts.length >= profile.tier.requestsPerRun) {
          throw new BhaiyaPleaseError('TIER_LIMIT', `Your tier allows ${profile.tier.requestsPerRun} per run`);
        }
        const s = encode.accept(ctx.project, { request: request.key, run: run.key, rider: self });
        // [verify on chain] a partial patch leaves the run's expiry and other attributes unchanged.
        const res = await w.batch({
          creates: [{ ...s, expiresInSeconds: Math.max(2, run.expiresAt - ctx.port.now()) }],
          patches: [{ key: run.key, set: { capacity_left: attr('capacity_left', run.capacityLeft - 1) } }],
        });
        const key = res.created[0];
        if (!key) throw new BhaiyaPleaseError('BATCH_FAILED', 'Accept batch created nothing');
        return { key, txHash: res.txHash };
      });
    },

    getAcceptForRequest,
  };
}

async function removeQuietly(w: Writer, key: EntityKey): Promise<void> {
  try {
    await w.remove(key);
  } catch {
    // Orphan request without a usable commit; it expires with the run.
  }
}
