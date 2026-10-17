/**
 * No-show evidence (docs/TRIGGERS.md §4). A `noshow` entity claims: "at block B the request had the
 * runner's valid Accept, the run's ETA had passed and no valid Delivery existed". Anyone may write it
 * (normally an Arkiv Triggers worker running the `bhaiyaplease.noshow` attester); its $creator is NOT
 * trusted. It counts only if re-reading the chain AT block B (ArkivPort.at) confirms every fact, and
 * the rider has not recorded a valid Delivery since (a late handoff cancels the no-show).
 *
 * Pure functions over an ArkivPort, so the real client, the mock and a browser-side trigger engine
 * over the mock port all evaluate the same rule.
 */
import { attr } from '../codec/attrs';
import { decode, encode } from '../codec/entities';
import type { DropSink } from '../codec/entities';
import { keySchema } from '../codec/schemas';
import { parseOrThrow } from '../codec/validate';
import { BhaiyaPleaseError } from '../types';
import type {
  Accept,
  Address,
  EntityKey,
  NoShow,
  NoShowInvalidReason,
  NoShowVerification,
  Request,
  Run,
  VerifiedNoShow,
} from '../types';
import type { ArkivPort, CreateSpec, ReadPort } from '../arkiv/port';
import { mapLimit, memoGets, reader, sameAddr, TTL } from './context';
import type { Reader } from './context';
import { trustedDeliveryFor } from './handoff';
import { verifyDeliveryData } from './reputation';
import { acceptFor } from './requests';
import { getTrustedRun, isRunnerAccept } from './runs';

export interface NoShowEvidence {
  /** Ready for Writer.create (readonly, 180 d). Its $creator is whoever writes it. */
  spec: CreateSpec;
  /** Block the facts were evaluated at (also written as the `block` attribute). */
  block: bigint;
}

export interface NoShowOptions {
  /** Reserved: no-show evidence does not depend on attestations today. */
  trustedVerifiers?: readonly Address[];
  drop?: DropSink;
}

interface Facts {
  request: Request;
  run: Run;
  accept: Accept;
  /** Unix time of the evaluated block. */
  time: number;
}

type Evaluation = { ok: true; facts: Facts } | { ok: false; reason: NoShowInvalidReason };

/**
 * The no-show rule, evaluated on one (usually historical) reader. With `claim`, the facts must match
 * the claimed run / rider / accept; without, the runner's earliest valid accept is used.
 */
async function evaluate(
  rd: Reader,
  requestKey: EntityKey,
  claim?: { run: EntityKey; rider: Address; accept: EntityKey },
): Promise<Evaluation> {
  const no = (reason: NoShowInvalidReason): Evaluation => ({ ok: false, reason });
  const request = await rd.one(requestKey, decode.request);
  if (!request || (claim && request.run !== claim.run)) return no('request_missing');
  const run = await getTrustedRun(rd, request.run);
  if (!run) return no('run_missing');
  let accept: Accept | null;
  if (claim) {
    const a = await rd.one(claim.accept, decode.accept);
    accept = a && a.request === request.key && a.run === run.key && isRunnerAccept(a, run) ? a : null;
  } else {
    accept = await acceptFor(rd, request, run);
  }
  if (!accept) return no('accept_missing');
  if (claim && (!sameAddr(claim.rider, accept.rider) || !sameAddr(claim.rider, run.creator))) return no('rider_mismatch');
  const time = rd.now();
  if (time < run.eta) return no('before_eta');
  // Same trust rule as getDeliveryForRequest (reveal verifies, rider wrote it, matches the accept).
  if (await trustedDeliveryFor(rd, request.key, async () => accept)) return no('delivered');
  return { ok: true, facts: { request, run, accept, time } };
}

/** Errors that mean "try again later", never "the evidence is wrong". */
const transient = (e: unknown) =>
  e instanceof BhaiyaPleaseError && (e.retryable || e.code === 'QUOTA_EXHAUSTED' || e.code === 'RATE_LIMITED');

/**
 * Build no-show evidence for `requestKey` at the current block, or null if the facts do not hold:
 * the request exists, its run is trusted, a valid accept by the run's creator exists, no trusted
 * delivery exists, and the block's time is ≥ run.eta. The facts are read through `port.at(block)`,
 * exactly as verifyNoShowEvidence will re-read them. Used by the `bhaiyaplease.noshow` attester.
 */
export async function buildNoShowEvidence(
  port: ArkivPort,
  project: string,
  requestKey: EntityKey,
  opts: NoShowOptions = {},
): Promise<NoShowEvidence | null> {
  const k = parseOrThrow(keySchema, requestKey, 'requestKey');
  const block = await port.blockNumber();
  const historical = await port.at(block);
  const ev = await evaluate(reader(memoGets(historical), project, opts.drop), k);
  if (!ev.ok) return null;
  const { request, run, accept, time } = ev.facts;
  const s = encode.noshow(project, { request: request.key, run: run.key, rider: accept.rider, accept: accept.key, block, at: time });
  return { spec: { ...s, expiresInSeconds: TTL.noshow }, block };
}

/**
 * Trustless check of a noshow: re-read the chain at `noshow.block` and confirm request, run, the
 * rider's own valid accept (`noshow.accept`), run.eta ≤ block time and no trusted delivery; then
 * confirm at head that the rider has not delivered since. Any $creator is allowed.
 */
export async function verifyNoShowEvidence(
  port: ArkivPort,
  project: string,
  noshow: NoShow,
  opts: NoShowOptions = {},
): Promise<NoShowVerification> {
  let historical: ReadPort;
  try {
    historical = await port.at(noshow.block);
  } catch (e) {
    if (transient(e)) throw e;
    return { valid: false, reason: 'history_unavailable' };
  }
  let ev: Evaluation;
  try {
    ev = await evaluate(reader(memoGets(historical), project, opts.drop), noshow.request, {
      run: noshow.run,
      rider: noshow.rider,
      accept: noshow.accept,
    });
  } catch (e) {
    if (transient(e)) throw e;
    return { valid: false, reason: 'history_unavailable' };
  }
  if (!ev.ok) return { valid: false, reason: ev.reason };
  if (await deliveredSince(reader(port, project, opts.drop), ev.facts.request, noshow.rider)) {
    return { valid: false, reason: 'delivered_later' };
  }
  return { valid: true };
}

/** A valid Delivery for the request written by the rider, live at head (deliveries live 1 y). */
async function deliveredSince(rd: Reader, request: Request, rider: Address): Promise<boolean> {
  const list = await rd.list('delivery', decode.delivery, [{ op: 'eq', name: 'request', value: attr('request', request.key) }], {
    creator: rider,
  });
  return list.some((d) => sameAddr(d.rider, rider) && !sameAddr(d.rider, request.creator) && verifyDeliveryData(d, request).valid);
}

/**
 * Verify a list of noshows; one credit per request: the earliest valid one wins, later valid ones are
 * marked 'duplicate' (several workers may race to write the same evidence). Newest first.
 */
export async function verifyNoShows(
  port: ArkivPort,
  project: string,
  list: readonly NoShow[],
  opts: NoShowOptions = {},
): Promise<VerifiedNoShow[]> {
  const checked = await mapLimit(list, 4, async (noshow): Promise<VerifiedNoShow> => {
    const v = await verifyNoShowEvidence(port, project, noshow, opts);
    return v.valid ? { noshow, valid: true } : { noshow, valid: false, reason: v.reason };
  });
  const seen = new Set<EntityKey>();
  const oldestFirst = [...checked].sort(
    (a, b) => a.noshow.createdAt - b.noshow.createdAt || (a.noshow.key < b.noshow.key ? -1 : 1),
  );
  const out = oldestFirst.map((v): VerifiedNoShow => {
    if (!v.valid) return v;
    if (seen.has(v.noshow.request)) return { noshow: v.noshow, valid: false, reason: 'duplicate' };
    seen.add(v.noshow.request);
    return v;
  });
  return out.reverse();
}

/** All noshows naming `rider` (read through `rd`, head or historical), each verified at its block. */
export async function loadNoShowsFor(
  port: ArkivPort,
  rd: Reader,
  project: string,
  rider: Address,
  opts: NoShowOptions = {},
): Promise<VerifiedNoShow[]> {
  const list = await rd.list('noshow', decode.noshow, [{ op: 'eq', name: 'rider', value: attr('rider', rider) }]);
  return verifyNoShows(port, project, list.filter((n) => sameAddr(n.rider, rider)), opts);
}

/** Noshows for one request (optionally only those naming `rider`), verified. */
export async function loadNoShowsForRequest(
  port: ArkivPort,
  rd: Reader,
  project: string,
  requestKey: EntityKey,
  rider?: Address,
  opts: NoShowOptions = {},
): Promise<VerifiedNoShow[]> {
  const where = [{ op: 'eq' as const, name: 'request', value: attr('request', requestKey) }];
  if (rider) where.push({ op: 'eq', name: 'rider', value: attr('rider', rider) });
  const list = await rd.list('noshow', decode.noshow, where);
  return verifyNoShows(
    port,
    project,
    list.filter((n) => n.request === requestKey && (!rider || sameAddr(n.rider, rider))),
    opts,
  );
}

/** The verified noshow for a request if any, else the newest invalid one (with its reason), else null. */
export function pickForRequest(list: readonly VerifiedNoShow[]): VerifiedNoShow | null {
  return list.find((v) => v.valid) ?? list[0] ?? null;
}
