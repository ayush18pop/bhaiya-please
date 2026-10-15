import { z } from 'zod';
import { attr } from '../codec/attrs';
import { decode, encode } from '../codec/entities';
import { addressSchema, keySchema, receiptTagsSchema } from '../codec/schemas';
import { parseOrThrow } from '../codec/validate';
import { BhaiyaPleaseError } from '../types';
import type {
  Address,
  BhaiyaPleaseErrorCode,
  EntityKey,
  IssueReceiptInput,
  IssueReceiptResult,
  MutationResult,
  Receipt,
  TxHash,
  VerifiedReceipt,
} from '../types';
import type { CreateSpec, Writer } from '../arkiv/port';
import { extensionMovesLater, memoGets, reader, requireSigner, sameAddr, TTL } from './context';
import type { ServiceContext } from './context';
import { loadVerifiedReceipts, verifyDeliveryData } from './reputation';

const issueSchema = z.object({ deliveryKey: keySchema, tags: receiptTagsSchema });
/** [verify on chain] max ops per batch; 20 transfers is conservative. */
const TRANSFER_CHUNK = 20;
/** Engine rejections that the two-tx path may avoid (same-batch transfer of a new entity). */
const FALLBACK_CODES: readonly BhaiyaPleaseErrorCode[] = ['BATCH_FAILED', 'NOT_FOUND', 'NOT_OWNER', 'UNKNOWN'];

export function receiptService(ctx: ServiceContext) {
  const rd = () => reader(ctx.port, ctx.project, ctx.drop);
  /** In 'auto' mode, once the atomic batch is rejected, stop paying for doomed attempts. */
  let batchRejected = false;

  async function handOver(w: Writer, key: EntityKey, rider: Address): Promise<TxHash> {
    for (let attempt = 1; ; attempt++) {
      try {
        return (await w.transfer(key, rider)).txHash;
      } catch (err) {
        const retryable = err instanceof BhaiyaPleaseError && err.retryable;
        if (!retryable || attempt >= 3) {
          throw new BhaiyaPleaseError('BATCH_FAILED', 'Receipt issued, but handing it to the runner failed. Retry to finish.', {
            retryable: true,
            cause: err,
          });
        }
      }
    }
  }

  return {
    /**
     * Default: ONE batch = create readonly Receipt (predicted key) + extend own Request to 1 y +
     * changeOwnership(receipt → rider). Fallback 'two_tx': batch(create + extend), then transfer.
     * Re-calling after a failed hand-over resumes it instead of minting a second receipt.
     */
    async issueReceipt(input: IssueReceiptInput): Promise<IssueReceiptResult> {
      const self = requireSigner(ctx);
      const i = parseOrThrow(issueSchema, input, 'receipt');
      const r = rd();
      const delivery = await r.one(i.deliveryKey, decode.delivery);
      if (!delivery) throw new BhaiyaPleaseError('NOT_FOUND', 'Delivery not found or expired');
      const v = verifyDeliveryData(delivery, await r.one(delivery.request, decode.request));
      if (!v.valid || !v.request) throw new BhaiyaPleaseError('INVALID_REVEAL', `Delivery does not verify (${v.reason})`);
      const request = v.request;
      if (!sameAddr(request.creator, self)) throw new BhaiyaPleaseError('NOT_OWNER', 'Only the requester can issue a receipt');
      const rider = delivery.rider;
      if (sameAddr(rider, self)) throw new BhaiyaPleaseError('INVALID_INPUT', 'Cannot issue a receipt to yourself');

      const mine = await r.list('receipt', decode.receipt, [{ op: 'eq', name: 'delivery', value: attr('delivery', delivery.key) }], {
        creator: self,
      });
      if (mine.some((x) => sameAddr(x.owner, rider))) throw new BhaiyaPleaseError('INVALID_INPUT', 'Receipt already issued');
      const stuck = mine.find((x) => sameAddr(x.owner, self));
      if (stuck) {
        return ctx.port.write(async (w) => {
          const txHash = await handOver(w, stuck.key, rider);
          return { key: stuck.key, txHash, path: 'two_tx' };
        });
      }

      const now = ctx.port.now();
      const create: CreateSpec = {
        ...encode.receipt(ctx.project, { rider, delivery: delivery.key, zone: delivery.zone, at: now, tags: i.tags }),
        expiresInSeconds: TTL.year,
      };
      // Keeps the Request (and its commit) verifiable as long as the receipt, without atBlock.
      // [verify on chain] extending a readonly entity is allowed (SDK docs say yes).
      const extensions = extensionMovesLater(request.expiresAt, now, TTL.year) ? [{ key: request.key, seconds: TTL.year }] : [];

      // [verify on chain] transfer of an entity created earlier in the same batch; 'auto' falls back if rejected.
      const viaBatch = async (w: Writer): Promise<IssueReceiptResult> => {
        const [p] = await w.predictKeys(1);
        if (!p) throw new BhaiyaPleaseError('KEY_PREDICTION_MISMATCH', 'No key predicted');
        const res = await w.batch({
          creates: [{ ...create, salt: p.salt }],
          extensions,
          transfers: [{ key: p.key, to: rider }],
        });
        if (res.created[0] !== p.key) {
          throw new BhaiyaPleaseError('KEY_PREDICTION_MISMATCH', 'Receipt key differs from prediction');
        }
        return { key: p.key, txHash: res.txHash, path: 'batch' };
      };

      const viaTwoTx = async (w: Writer): Promise<IssueReceiptResult> => {
        const res = await w.batch({ creates: [create], extensions });
        const key = res.created[0];
        if (!key) throw new BhaiyaPleaseError('BATCH_FAILED', 'Receipt batch created nothing');
        const txHash = await handOver(w, key, rider);
        return { key, txHash, txHashes: [res.txHash, txHash], path: 'two_tx' };
      };

      return ctx.port.write(async (w) => {
        const mode = ctx.receiptMode === 'auto' && batchRejected ? 'two_tx' : ctx.receiptMode;
        if (mode === 'two_tx') return viaTwoTx(w);
        try {
          return await viaBatch(w);
        } catch (err) {
          const fallback =
            mode === 'auto' && err instanceof BhaiyaPleaseError && FALLBACK_CODES.includes(err.code);
          if (!fallback) throw err;
          batchRejected = true;
          return viaTwoTx(w);
        }
      });
    },

    async getReceiptsFor(rider: Address): Promise<VerifiedReceipt[]> {
      const a = parseOrThrow(addressSchema, rider, 'rider');
      const list = await loadVerifiedReceipts(reader(memoGets(ctx.port), ctx.project, ctx.drop), [a]);
      return list.sort((x, y) => y.receipt.createdAt - x.receipt.createdAt);
    },

    async extendReceipt(receiptKey: EntityKey): Promise<MutationResult> {
      const self = requireSigner(ctx);
      const receipt = await rd().one(receiptKey, decode.receipt);
      if (!receipt) throw new BhaiyaPleaseError('NOT_FOUND', 'Receipt not found or expired');
      if (!sameAddr(receipt.owner, self)) throw new BhaiyaPleaseError('NOT_OWNER', 'Only the receipt owner can renew it');
      if (!extensionMovesLater(receipt.expiresAt, ctx.port.now(), TTL.year)) {
        throw new BhaiyaPleaseError('INVALID_INPUT', 'Receipt was renewed moments ago');
      }
      return ctx.port.write(async (w) => ({ key: receipt.key, txHash: (await w.extend(receipt.key, TTL.year)).txHash }));
    },

    /** Key rotation: move every own receipt to `to` (chunked batches). */
    async transferAllReceipts(to: Address): Promise<MutationResult> {
      const self = requireSigner(ctx);
      const dest = parseOrThrow(addressSchema, to, 'to');
      if (sameAddr(dest, self)) throw new BhaiyaPleaseError('INVALID_INPUT', 'Already your wallet');
      const receipts: Receipt[] = await rd().list('receipt', decode.receipt, [], { owner: self });
      const last = receipts[receipts.length - 1];
      if (!last) throw new BhaiyaPleaseError('INVALID_INPUT', 'No receipts to transfer');
      return ctx.port.write(async (w) => {
        const txHashes: TxHash[] = [];
        for (let i = 0; i < receipts.length; i += TRANSFER_CHUNK) {
          const chunk = receipts.slice(i, i + TRANSFER_CHUNK);
          const res = await w.batch({ transfers: chunk.map((x) => ({ key: x.key, to: dest })) });
          txHashes.push(res.txHash);
        }
        return { key: last.key, txHash: txHashes[txHashes.length - 1] as TxHash, txHashes };
      });
    },
  };
}
