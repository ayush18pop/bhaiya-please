import { z } from 'zod';
import { attr, u64V } from '../codec/attrs';
import { decode, encode } from '../codec/entities';
import { addressSchema, complaintReasonSchema, keySchema } from '../codec/schemas';
import { parseOrThrow } from '../codec/validate';
import { BhaiyaPleaseError } from '../types';
import type { Address, Complaint, FileComplaintInput, MutationResult, UnixSeconds } from '../types';
import type { Predicate } from '../arkiv/port';
import { extensionMovesLater, reader, requireSigner, sameAddr, TTL } from './context';
import type { Reader, ServiceContext } from './context';

const fileSchema = z.object({ requestKey: keySchema, rider: addressSchema, reason: complaintReasonSchema });

/**
 * Complaints about `rider`, keeping only those filed by the requester of the referenced request
 * (stops drive-by complaints), one per request, newest first.
 * Known limit: a resident who posted any request on the rider's run qualifies, accepted or not.
 */
export async function listComplaintsAgainst(rd: Reader, rider: Address, since?: UnixSeconds): Promise<Complaint[]> {
  const where: Predicate[] = [{ op: 'eq', name: 'rider', value: attr('rider', rider) }];
  if (since !== undefined) where.push({ op: 'gte', name: 'at', value: u64V(Math.max(0, Math.floor(since))) });
  const list = await rd.list('complaint', decode.complaint, where);
  const checked = await Promise.all(
    list.map(async (c) => {
      if (!sameAddr(c.rider, rider) || sameAddr(c.creator, c.rider)) return null;
      const req = await rd.one(c.request, decode.request);
      return req && sameAddr(req.creator, c.creator) ? c : null;
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

    getComplaintsAgainst: (rider: Address, sinceUnix?: UnixSeconds) =>
      listComplaintsAgainst(rd(), parseOrThrow(addressSchema, rider, 'rider'), sinceUnix),
  };
}
