/** Composes all services + the shared watcher into a BhaiyaPlease over any ArkivPort (real or fake). */
import { createWatcher } from '../arkiv/watcher';
import { typeOf } from '../codec/entities';
import { addressSchema, keySchema } from '../codec/schemas';
import { parseOrThrow } from '../codec/validate';
import type { BhaiyaPlease } from '../interface';
import { BhaiyaPleaseError } from '../types';
import type { Address, EntityInspection, EntityKey, Profile } from '../types';
import { attestationService } from './attestations';
import { complaintService } from './complaints';
import type { ServiceContext } from './context';
import { handoffService } from './handoff';
import { locationService } from './locations';
import { receiptService } from './receipts';
import { requestService } from './requests';
import { loadProfile } from './reputation';
import { runService } from './runs';
import { shopService } from './shops';

export interface DomainOptions {
  /** Min ms between watcher entity resolutions. */
  resolveIntervalMs: number;
  onError?: (op: string, err: unknown) => void;
}

export function createDomain(ctx: ServiceContext, opts: DomainOptions): BhaiyaPlease {
  const shops = shopService(ctx);
  const runs = runService(ctx);
  const requests = requestService(ctx);
  const handoff = handoffService(ctx, requests.getAcceptForRequest);
  const receipts = receiptService(ctx);
  const complaints = complaintService(ctx);
  const attestations = attestationService(ctx);
  const watcherOpts = opts.onError
    ? { resolveIntervalMs: opts.resolveIntervalMs, onError: opts.onError }
    : { resolveIntervalMs: opts.resolveIntervalMs };
  const watcher = createWatcher(ctx.port, ctx.project, watcherOpts);
  const port = ctx.port;

  return {
    get address() {
      return port.address;
    },

    async getBalance(address?: Address) {
      const a = address ?? port.address;
      if (!a) throw new BhaiyaPleaseError('NO_SIGNER', 'No wallet to check');
      return port.balance(parseOrThrow(addressSchema, a, 'address'));
    },

    ...shops,
    ...runs,
    ...requests,
    ...handoff,
    ...receipts,
    ...complaints,
    ...attestations,
    ...locationService(ctx),

    getProfile: (address: Address): Promise<Profile> =>
      loadProfile(ctx, port, parseOrThrow(addressSchema, address, 'address')),

    async getProfileAt(address: Address, block: bigint): Promise<Profile> {
      const historical = await port.at(block);
      return loadProfile(ctx, historical, parseOrThrow(addressSchema, address, 'address'), block);
    },

    getBlockNumber: () => port.blockNumber(),

    async inspect(key: EntityKey): Promise<EntityInspection | null> {
      const raw = await port.get(parseOrThrow(keySchema, key, 'key'));
      if (!raw) return null;
      const attributes: EntityInspection['attributes'] = {};
      for (const [name, a] of Object.entries(raw.attributes)) {
        attributes[name] = typeof a.value === 'boolean' ? String(a.value) : a.value;
      }
      const out: EntityInspection = {
        key: raw.key,
        creator: raw.creator,
        owner: raw.owner,
        createdAt: raw.createdAt,
        expiresAt: raw.expiresAt,
        readonly: raw.readonly,
        permissionlessExtension: raw.permissionlessExtension,
        type: typeOf(raw, ctx.project) ?? 'unknown',
        attributes,
      };
      const textual = /^text\/|json/.test(raw.contentType);
      if (raw.payload && textual) out.payloadText = raw.payload.slice(0, 4000);
      // [verify on chain] explorer path format.
      if (ctx.explorerBaseUrl) out.explorerUrl = `${ctx.explorerBaseUrl.replace(/\/+$/, '')}/entity/${raw.key}`;
      return out;
    },

    subscribe: (filter, cb) => watcher.subscribe(filter, cb),
    close: () => watcher.close(),
  };
}
