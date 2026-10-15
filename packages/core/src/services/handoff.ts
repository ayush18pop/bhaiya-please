import { z } from 'zod';
import { attr } from '../codec/attrs';
import { decode, encode } from '../codec/entities';
import { revealMatches } from '../codec/handoff';
import { codeSchema, keySchema, saltSchema } from '../codec/schemas';
import { parseOrThrow } from '../codec/validate';
import { BhaiyaPleaseError } from '../types';
import type { Accept, Delivery, DeliveryVerification, EntityKey, MutationResult, RecordDeliveryInput } from '../types';
import { reader, requireSigner, sameAddr, TTL } from './context';
import type { Reader, ServiceContext } from './context';
import { verifyDeliveryData } from './reputation';

const secretSchema = z.object({ requestKey: keySchema, code: codeSchema, salt: saltSchema });

/**
 * The trusted delivery for a request: reveal verifies, written by the rider itself, and — while the
 * Accept is still live — by the accepted rider. Earliest wins.
 */
export async function trustedDeliveryFor(
  rd: Reader,
  requestKey: EntityKey,
  getAccept: (k: EntityKey) => Promise<Accept | null>,
): Promise<Delivery | null> {
  const request = await rd.one(requestKey, decode.request);
  if (!request) return null;
  const [list, accept] = await Promise.all([
    rd.list('delivery', decode.delivery, [{ op: 'eq', name: 'request', value: attr('request', request.key) }]),
    getAccept(request.key),
  ]);
  const ok = list.filter(
    (d) =>
      verifyDeliveryData(d, request).valid &&
      !sameAddr(d.rider, request.creator) &&
      (!accept || sameAddr(d.rider, accept.rider)),
  );
  return ok.sort((a, b) => a.createdAt - b.createdAt)[0] ?? null;
}

export function handoffService(ctx: ServiceContext, getAccept: (k: EntityKey) => Promise<Accept | null>) {
  const rd = () => reader(ctx.port, ctx.project, ctx.drop);
  return {
    /** Verifies the scanned reveal locally BEFORE writing, so a bad scan never costs gas. */
    async recordDelivery(input: RecordDeliveryInput): Promise<MutationResult> {
      const self = requireSigner(ctx);
      const secret = parseOrThrow(secretSchema, input.secret, 'secret');
      const r = rd();
      const request = await r.one(secret.requestKey, decode.request);
      if (!request) throw new BhaiyaPleaseError('NOT_FOUND', 'Request not found or expired');
      if (!revealMatches(secret.code, secret.salt, request.key, request.codeCommit)) {
        throw new BhaiyaPleaseError('INVALID_REVEAL', 'Code does not match this request');
      }
      if (sameAddr(request.creator, self)) throw new BhaiyaPleaseError('INVALID_INPUT', 'You cannot deliver your own request');
      const accept = await getAccept(request.key);
      if (accept && !sameAddr(accept.rider, self)) {
        throw new BhaiyaPleaseError('NOT_OWNER', 'Another runner accepted this request');
      }
      // No accept while the run is live means it was never accepted; after the run expires the
      // accept is gone too, and the reveal alone proves the handoff.
      if (!accept && (await r.one(request.run, decode.run))) {
        throw new BhaiyaPleaseError('INVALID_INPUT', 'Accept the request before delivering');
      }
      const existing = await trustedDeliveryFor(r, request.key, getAccept);
      if (existing) throw new BhaiyaPleaseError('INVALID_INPUT', 'Delivery already recorded');

      const s = encode.delivery(ctx.project, {
        request: request.key,
        rider: self,
        resident: request.creator,
        zone: request.destZone,
        code: secret.code,
        salt: secret.salt,
      });
      return ctx.port.write(async (w) => {
        const c = await w.create({ ...s, expiresInSeconds: TTL.year });
        return { key: c.key, txHash: c.txHash };
      });
    },

    getDeliveryForRequest: (requestKey: EntityKey) =>
      trustedDeliveryFor(rd(), parseOrThrow(keySchema, requestKey, 'requestKey'), getAccept),

    /** Anyone can check. Throws NOT_FOUND if the delivery itself is missing/expired/malformed. */
    async verifyDelivery(deliveryKey: EntityKey): Promise<DeliveryVerification> {
      const r = rd();
      const delivery = await r.one(parseOrThrow(keySchema, deliveryKey, 'deliveryKey'), decode.delivery);
      if (!delivery) throw new BhaiyaPleaseError('NOT_FOUND', 'Delivery not found or expired');
      return verifyDeliveryData(delivery, await r.one(delivery.request, decode.request));
    },
  };
}
