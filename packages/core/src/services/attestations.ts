import { z } from 'zod';
import { attr } from '../codec/attrs';
import { decode, encode } from '../codec/entities';
import { addressSchema, attestationLevelSchema } from '../codec/schemas';
import { parseOrThrow } from '../codec/validate';
import { BhaiyaPleaseError } from '../types';
import type { Address, Attestation, EntityKey, IssueAttestationInput, MutationResult } from '../types';
import { reader, requireSigner, sameAddr, TTL } from './context';
import type { Reader, ServiceContext } from './context';

const issueSchema = z
  .object({ subject: addressSchema, level: attestationLevelSchema, prev: addressSchema.optional() })
  .refine((i) => (i.level === 'successor') === (i.prev !== undefined), 'prev is required iff level is successor');

/** Attestations about `subject`, newest first, each marked trusted iff $creator ∈ trusted list. */
export async function listAttestationsFor(
  rd: Reader,
  trusted: ReadonlySet<Address>,
  subject: Address,
): Promise<Attestation[]> {
  const list = await rd.list('attestation', decode.attestation, [{ op: 'eq', name: 'subject', value: attr('subject', subject) }]);
  return list
    .filter((a) => sameAddr(a.subject, subject) && !sameAddr(a.creator, a.subject))
    .map((a) => ({ ...a, trusted: trusted.has(a.creator) }))
    .sort((a, b) => b.createdAt - a.createdAt);
}

export function attestationService(ctx: ServiceContext) {
  const rd = () => reader(ctx.port, ctx.project, ctx.drop);
  return {
    async issueAttestation(input: IssueAttestationInput): Promise<MutationResult> {
      const self = requireSigner(ctx);
      const i = parseOrThrow(issueSchema, input, 'attestation');
      if (sameAddr(i.subject, self)) throw new BhaiyaPleaseError('INVALID_INPUT', 'A verifier cannot attest itself');
      const s = encode.attestation(ctx.project, { ...i, at: ctx.port.now() });
      return ctx.port.write(async (w) => {
        const r = await w.create({ ...s, expiresInSeconds: TTL.attestation });
        return { key: r.key, txHash: r.txHash };
      });
    },

    async revokeAttestation(key: EntityKey): Promise<MutationResult> {
      const self = requireSigner(ctx);
      const a = await rd().one(key, decode.attestation);
      if (!a) throw new BhaiyaPleaseError('NOT_FOUND', 'Attestation not found or expired');
      if (!sameAddr(a.owner, self)) throw new BhaiyaPleaseError('NOT_OWNER', 'Only the issuing verifier can revoke');
      return ctx.port.write(async (w) => ({ key: a.key, txHash: (await w.remove(a.key)).txHash }));
    },

    getAttestationsFor: (subject: Address) =>
      listAttestationsFor(rd(), ctx.trustedVerifiers, parseOrThrow(addressSchema, subject, 'subject')),

    async getMyIssuedAttestations(): Promise<Attestation[]> {
      const self = ctx.port.address;
      if (!self) return [];
      const list = await rd().list('attestation', decode.attestation, [], { creator: self });
      return list.map((a) => ({ ...a, trusted: ctx.trustedVerifiers.has(a.creator) })).sort((a, b) => b.createdAt - a.createdAt);
    },
  };
}
