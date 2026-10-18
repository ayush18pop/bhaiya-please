/** Composes all services + the shared watcher into a BhaiyaPlease over any ArkivPort (real or fake). */
import { createWatcher } from '../arkiv/watcher';
import { typeOf } from '../codec/entities';
import { addressSchema, keySchema } from '../codec/schemas';
import { parseOrThrow } from '../codec/validate';
import type { BhaiyaPlease } from '../interface';
import { BhaiyaPleaseError } from '../types';
import type { Address, EntityInspection, EntityKey, NoShow, NoShowVerification, Profile, VerifiedNoShow } from '../types';
import { attestationService } from './attestations';
import { complaintService } from './complaints';
import { reader } from './context';
import type { ServiceContext } from './context';
import { handoffService } from './handoff';
import { locationService } from './locations';
import { loadNoShowsFor, loadNoShowsForRequest, pickForRequest, verifyNoShowEvidence } from './noshow';
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
  const nsOpts = ctx.drop ? { drop: ctx.drop } : {};

  const ownerListeners = new Set<{ match: (owner: Address) => boolean; cb: () => void }>();
  let ownerStop: (() => void) | null = null;

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

    verifyNoShow: (noshow: NoShow): Promise<NoShowVerification> => verifyNoShowEvidence(port, ctx.project, noshow, nsOpts),

    getNoShowsFor: (rider: Address): Promise<VerifiedNoShow[]> =>
      loadNoShowsFor(port, reader(port, ctx.project, ctx.drop), ctx.project, parseOrThrow(addressSchema, rider, 'rider'), nsOpts),

    async getNoShowForRequest(requestKey: EntityKey): Promise<VerifiedNoShow | null> {
      const k = parseOrThrow(keySchema, requestKey, 'requestKey');
      return pickForRequest(await loadNoShowsForRequest(port, reader(port, ctx.project, ctx.drop), ctx.project, k, undefined, nsOpts));
    },

    arkivPort: () => port,

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
    watchOwners(match, cb) {
      const l = { match, cb };
      ownerListeners.add(l);
      if (!ownerStop) {
        ownerStop = port.watch((e) => {
          for (const x of ownerListeners) {
            if ((e.owner && x.match(e.owner)) || (e.newOwner && x.match(e.newOwner))) {
              try {
                x.cb();
              } catch {}
            }
          }
        });
      }
      return () => {
        ownerListeners.delete(l);
        if (ownerListeners.size === 0 && ownerStop) {
          ownerStop();
          ownerStop = null;
        }
      };
    },
    close: () => {
      ownerListeners.clear();
      ownerStop?.();
      ownerStop = null;
      watcher.close();
    },
  };
}
