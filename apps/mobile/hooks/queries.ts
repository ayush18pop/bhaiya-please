import { useQueries, useQuery } from '@tanstack/react-query';
import type { Accept, Address, Attestation, Complaint, Decline, Delivery, EntityKey, Ping, Profile, Receipt, Request, Run, Shop, VerifiedReceipt } from '@bhaiya-please/core';
import { useCore, useSession } from '@/components/providers';

/**
 * Freshness per query family. Chain events already invalidate the affected families (LiveBridge in
 * providers.tsx), so polling is only a safety net: fast for the live board and map, slow for data
 * that rarely changes (profiles, receipts, vouches, shops). Every read is an RPC call that spends
 * the access-key quota, so keep these honest. Polling pauses while the tab is hidden.
 */
const SEC = 1000;
export const FRESHNESS: Record<string, { refetchInterval: number | false; staleTime: number }> = {
  runs: { refetchInterval: 20 * SEC, staleTime: 10 * SEC },
  pings: { refetchInterval: 20 * SEC, staleTime: 10 * SEC },
  runnerBoard: { refetchInterval: 20 * SEC, staleTime: 10 * SEC },
  reqStatus: { refetchInterval: 20 * SEC, staleTime: 10 * SEC },
  myRequests: { refetchInterval: 30 * SEC, staleTime: 15 * SEC },
  run: { refetchInterval: 30 * SEC, staleTime: 15 * SEC },
  runRows: { refetchInterval: 30 * SEC, staleTime: 15 * SEC },
  myRuns: { refetchInterval: 60 * SEC, staleTime: 30 * SEC },
  profile: { refetchInterval: 120 * SEC, staleTime: 60 * SEC },
  receipts: { refetchInterval: 120 * SEC, staleTime: 60 * SEC },
  attestations: { refetchInterval: 120 * SEC, staleTime: 60 * SEC },
  issued: { refetchInterval: 120 * SEC, staleTime: 60 * SEC },
  shops: { refetchInterval: 300 * SEC, staleTime: 120 * SEC },
  shop: { refetchInterval: 300 * SEC, staleTime: 120 * SEC },
  inspect: { refetchInterval: false, staleTime: Infinity },
};
const DEFAULT_FRESHNESS = { refetchInterval: 60 * SEC, staleTime: 30 * SEC };
export const freshness = (family: string) => FRESHNESS[family] ?? DEFAULT_FRESHNESS;

/** Every query is namespaced by the active wallet so role switches never show stale data. */
function useQ<T>(key: unknown[], fn: () => Promise<T>, enabled = true) {
  const { address } = useSession();
  return useQuery({ queryKey: [address, ...key], queryFn: fn, enabled, placeholderData: (prev) => prev, structuralSharing: false, ...freshness(String(key[0])) });
}

export function useBalance() {
  const core = useCore();
  const { address } = useSession();
  return useQuery({ queryKey: [address, 'balance'], queryFn: () => core.getBalance(), refetchInterval: 60 * SEC, staleTime: 30 * SEC });
}

export const useLiveRuns = (zone: string) => {
  const core = useCore();
  return useQ(['runs', zone], () => core.getLiveRuns(zone));
};

export const useMyRuns = () => {
  const core = useCore();
  return useQ(['myRuns'], () => core.getMyRuns());
};

export const useRun = (key?: string) => {
  const core = useCore();
  return useQ(['run', key], () => core.getRun(key as EntityKey), !!key);
};

export const useProfile = (addr?: Address | null) => {
  const core = useCore();
  return useQ<Profile>(['profile', addr], () => core.getProfile(addr as Address), !!addr);
};

export const useShops = (zone5?: string) => {
  const core = useCore();
  return useQ(['shops', zone5], () => core.getShops(zone5 as string), !!zone5);
};

export const useReceipts = (addr?: Address | null) => {
  const core = useCore();
  return useQ<VerifiedReceipt[]>(['receipts', addr], () => core.getReceiptsFor(addr as Address), !!addr);
};

export const useMyIssued = () => {
  const core = useCore();
  return useQ(['issued'], () => core.getMyIssuedAttestations());
};

export const useInspect = (key: EntityKey | undefined, enabled: boolean) => {
  const core = useCore();
  return useQ(['inspect', key], () => core.inspect(key as EntityKey), enabled && !!key);
};

export const useShop = (key?: string | null) => {
  const core = useCore();
  return useQ<Shop | null>(['shop', key], () => core.getShop(key as EntityKey), !!key);
};

export const useAttestations = (addr?: Address | null) => {
  const core = useCore();
  return useQ<Attestation[]>(['attestations', addr], () => core.getAttestationsFor(addr as Address), !!addr);
};

/** posted → accepted → atGate (runner tapped "I'm at the gate") → delivered → rated. */
export type RequestStage = 'posted' | 'accepted' | 'atGate' | 'delivered' | 'rated';
/** StatusRoad index for a stage. */
export const STAGE_INDEX: Record<RequestStage, number> = { posted: 0, accepted: 1, atGate: 2, delivered: 3, rated: 4 };

export interface RequestStatus {
  request: Request | null;
  run: Run | null;
  accept: Accept | null;
  delivery: Delivery | null;
  receipt: Receipt | null;
  complaint: Complaint | null;
  decline: Decline | null;
  stage: RequestStage;
  /** Run expired (or the runner declined) before anyone accepted. */
  lapsed: boolean;
  declined: boolean;
}

/** Derived from getRequest + getAcceptForRequest + getDeliveryForRequest (+ receipt/complaint for "rated"). */
export function useRequestStatus(key?: string) {
  const core = useCore();
  return useQ<RequestStatus>(
    ['reqStatus', key],
    async () => {
      const request = await core.getRequest(key as EntityKey);
      const [run, accept, delivery, decline] = await Promise.all([
        request ? core.getRun(request.run) : null,
        core.getAcceptForRequest(key as EntityKey),
        core.getDeliveryForRequest(key as EntityKey),
        request ? core.getDeclineForRequest(key as EntityKey) : null,
      ]);
      let receipt: Receipt | null = null;
      let complaint: Complaint | null = null;
      if (delivery) {
        const [rs, cs] = await Promise.all([core.getReceiptsFor(delivery.rider), core.getComplaintsAgainst(delivery.rider)]);
        receipt = rs.find((r) => r.receipt.delivery === delivery.key)?.receipt ?? null;
        complaint = cs.find((c) => c.request === key) ?? null;
      }
      const stage: RequestStage = receipt || complaint ? 'rated' : delivery ? 'delivered' : accept ? (run?.atGateAt ? 'atGate' : 'accepted') : 'posted';
      const declined = !!decline && !accept;
      return { request, run, accept, delivery, receipt, complaint, decline, stage, declined, lapsed: !!request && !accept && (!run || declined) };
    },
    !!key,
  );
}

export interface RequestRow {
  request: Request;
  accept: Accept | null;
  delivery: Delivery | null;
  decline?: Decline | null;
}

async function rowsForRun(core: ReturnType<typeof useCore>, run: Run): Promise<RequestRow[]> {
  const requests = await core.getRequestsForRun(run.key);
  return Promise.all(
    requests.map(async (request) => {
      const [accept, delivery, decline] = await Promise.all([
        core.getAcceptForRequest(request.key),
        core.getDeliveryForRequest(request.key),
        core.getDeclineForRequest(request.key),
      ]);
      return { request, accept, delivery, decline };
    }),
  );
}

/** One run with its requests (runner summary C10, activity detail D2). */
export function useRunRows(runKey?: string | null) {
  const core = useCore();
  return useQ<{ run: Run | null; rows: RequestRow[] }>(
    ['runRows', runKey],
    async () => {
      const run = await core.getRun(runKey as EntityKey);
      return { run, rows: run ? await rowsForRun(core, run) : [] };
    },
    !!runKey,
  );
}

/** The runner's active run with its requests and their accept/delivery state. */
export function useRunnerBoard() {
  const core = useCore();
  return useQ<{ run: Run | null; rows: RequestRow[] }>(['runnerBoard'], async () => {
    const runs = await core.getMyRuns();
    const run = [...runs].sort((a, b) => b.eta - a.eta)[0] ?? null;
    if (!run) return { run: null, rows: [] };
    return { run, rows: await rowsForRun(core, run) };
  });
}

export function useMyRequests() {
  const core = useCore();
  return useQ<RequestRow[]>(['myRequests'], async () => {
    const reqs = await core.getMyRequests();
    const rows = await Promise.all(
      reqs.map(async (request) => {
        const [accept, delivery] = await Promise.all([core.getAcceptForRequest(request.key), core.getDeliveryForRequest(request.key)]);
        return { request, accept, delivery };
      }),
    );
    return rows.sort((a, b) => b.request.createdAt - a.request.createdAt);
  });
}

// ------------------------------------------------------------------ live location

/** Latest valid ping per run (trust-filtered in core). Refreshed by ping events + 5 s polling. */
export const usePings = (runKeys: string[]) => {
  const core = useCore();
  const keys = [...runKeys].sort();
  return useQ<Ping[]>(['pings', ...keys], () => core.getLatestPings(keys as EntityKey[]), keys.length > 0);
};

/** ≤ 2 min breadcrumb trail of one run. */
export const useRunTrail = (runKey?: string | null) => {
  const core = useCore();
  return useQ<Ping[]>(['pings', 'trail', runKey], () => core.getRunTrail(runKey as EntityKey), !!runKey);
};

/** Viewer-computed tiers for several wallets (shares the ['profile', addr] cache with useProfile). */
export function useTiers(addrs: Address[]) {
  const core = useCore();
  const { address } = useSession();
  const uniq = [...new Set(addrs)];
  const qs = useQueries({
    queries: uniq.map((a) => ({ queryKey: [address, 'profile', a], queryFn: () => core.getProfile(a), structuralSharing: false, ...freshness('profile') })),
  });
  const out: Record<string, Profile['tier']['name']> = {};
  uniq.forEach((a, i) => {
    const t = qs[i]?.data?.tier.name;
    if (t) out[a] = t;
  });
  return out;
}
