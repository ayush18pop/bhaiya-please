import { z } from 'zod';
import { attr, u64V } from '../codec/attrs';
import { decode, encode } from '../codec/entities';
import { revealMatches } from '../codec/handoff';
import { addressSchema, complaintReasonSchema, keySchema } from '../codec/schemas';
import { parseOrThrow } from '../codec/validate';
import { BhaiyaPleaseError } from '../types';
import type { Address, Complaint, EntityKey, FileComplaintInput, MutationResult, Request, UnixSeconds } from '../types';
import type { Predicate } from '../arkiv/port';
import { extensionMovesLater, reader, requireSigner, sameAddr, TTL } from './context';
import type { Reader, ServiceContext } from './context';
import { loadNoShowsForRequest } from './noshow';

/** "Does a verified noshow by `rider` exist for this request?" (see services/noshow.ts). */
export type NoShowLookup = (requestKey: EntityKey, rider: Address) => Promise<boolean>;

/** Lookup that verifies each request's noshows on demand (only no_show complaints need it). */
export function noShowLookup(ctx: ServiceContext, rd: Reader): NoShowLookup {
  return async (requestKey, rider) => {
    const list = await loadNoShowsForRequest(ctx.port, rd, ctx.project, requestKey, rider, ctx.drop ? { drop: ctx.drop } : {});
    return list.some((v) => v.valid);
  };
}

const fileSchema = z.object({ requestKey: keySchema, rider: addressSchema, reason: complaintReasonSchema });

/**
 * Evidence that `rider` actually served `request`: a readonly Delivery for it, written by the rider
 * itself ($creator == rider attr), whose reveal hashes to the request's commit. Deliveries live 1 y,
 * longer than any complaint, so the evidence outlives the run and its Accept.
 */
export async function riderDelivered(rd: Reader, request: Request, rider: Address): Promise<boolean> {
  const list = await rd.list('delivery', decode.delivery, [{ op: 'eq', name: 'request', value: attr('request', request.key) }], {
    creator: rider,
  });
  return list.some(
    (d) =>
      d.readonly &&
      d.request === request.key &&
      sameAddr(d.creator, rider) &&
      sameAddr(d.rider, rider) &&
      revealMatches(d.code, d.salt, request.key, request.codeCommit),
  );
}

/**
 * Complaints about `rider`, keeping only those filed by the requester of the referenced request
 * with on-chain evidence (stops drive-by complaints: without it, any wallet with ANY request could
 * complain about ANY rider), one per request, newest first. Evidence:
 *   - reason 'no_show': a verified `noshow` for the request naming the rider (`noShowFor`; without
 *     a lookup, no_show complaints never count);
 *   - any other reason: the rider provably delivered the request (riderDelivered).
 */
export async function listComplaintsAgainst(
  rd: Reader,
  rider: Address,
  since?: UnixSeconds,
  noShowFor?: NoShowLookup,
): Promise<Complaint[]> {
  const where: Predicate[] = [{ op: 'eq', name: 'rider', value: attr('rider', rider) }];
  if (since !== undefined) where.push({ op: 'gte', name: 'at', value: u64V(Math.max(0, Math.floor(since))) });
  const list = await rd.list('complaint', decode.complaint, where);
  const checked = await Promise.all(
    list.map(async (c) => {
      if (!sameAddr(c.rider, rider) || sameAddr(c.creator, c.rider)) return null;
      const req = await rd.one(c.request, decode.request);
      if (!req || !sameAddr(req.creator, c.creator)) return null;
      if (c.reason === 'no_show') return noShowFor && (await noShowFor(req.key, rider)) ? c : null;
      return (await riderDelivered(rd, req, rider)) ? c : null;
    }),
  );
  const byRequest = new Map<string, Complaint>();
  for (const c of checked) {
    if (!c) continue;
    const prev = byRequest.get(c.request);
    if (!prev || c.createdAt < prev.createdAt) byRequest.set(c.request, c);
  }
  return [...byRequest.values()].sort((a, b) => b.createdAt - a.createdAt);
}

export function complaintService(ctx: ServiceContext) {
  const rd = () => reader(ctx.port, ctx.project, ctx.drop);
  return {
    async fileComplaint(input: FileComplaintInput): Promise<MutationResult> {
      const self = requireSigner(ctx);
      const i = parseOrThrow(fileSchema, input, 'complaint');
      const request = await rd().one(i.requestKey, decode.request);
      if (!request) throw new BhaiyaPleaseError('NOT_FOUND', 'Request not found or expired');
      if (!sameAddr(request.creator, self)) throw new BhaiyaPleaseError('NOT_OWNER', 'Only the requester can complain');
      if (sameAddr(i.rider, self)) throw new BhaiyaPleaseError('INVALID_INPUT', 'Cannot complain about yourself');
      const existing = await rd().list('complaint', decode.complaint, [
        { op: 'eq', name: 'request', value: attr('request', request.key) },
      ], { creator: self });
      if (existing.length > 0) throw new BhaiyaPleaseError('INVALID_INPUT', 'Complaint already filed for this request');
      // Same evidence rule every viewer applies, checked before spending gas.
      if (i.reason === 'no_show') {
        if (!(await noShowLookup(ctx, rd())(request.key, i.rider))) {
          throw new BhaiyaPleaseError(
            'INVALID_INPUT',
            'No verified no-show evidence for this request yet: it is recorded after the run\'s ETA passes without a delivery (Arkiv Triggers)',
          );
        }
      } else if (!(await riderDelivered(rd(), request, i.rider))) {
        throw new BhaiyaPleaseError('INVALID_INPUT', 'This runner has no recorded delivery for your request');
      }

      const now = ctx.port.now();
      const s = encode.complaint(ctx.project, { rider: i.rider, request: request.key, reason: i.reason, at: now });
      // Keep the request (the evidence) alive as long as the complaint; extend only if it moves later.
      const extend = extensionMovesLater(request.expiresAt, now, TTL.complaint);
      return ctx.port.write(async (w) => {
        const r = await w.batch({
          creates: [{ ...s, expiresInSeconds: TTL.complaint }],
          extensions: extend ? [{ key: request.key, seconds: TTL.complaint }] : [],
        });
        const key = r.created[0];
        if (!key) throw new BhaiyaPleaseError('BATCH_FAILED', 'Complaint batch created nothing');
        return { key, txHash: r.txHash };
      });
    },

    getComplaintsAgainst: (rider: Address, sinceUnix?: UnixSeconds) => {
      const r = rd();
      return listComplaintsAgainst(r, parseOrThrow(addressSchema, rider, 'rider'), sinceUnix, noShowLookup(ctx, r));
    },
  };
}
