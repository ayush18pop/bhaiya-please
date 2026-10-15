import { useQuery } from '@tanstack/react-query';
import type { Accept, Address, Complaint, Delivery, EntityKey, Profile, Receipt, Request, Run, VerifiedReceipt } from '@bhaiya-please/core';
import { useCore, useSession } from '@/components/providers';

/** Every query is namespaced by the active wallet so role switches never show stale data. */
function useQ<T>(key: unknown[], fn: () => Promise<T>, enabled = true) {
  const { address } = useSession();
  return useQuery({ queryKey: [address, ...key], queryFn: fn, enabled, placeholderData: (prev) => prev, structuralSharing: false });
}

export function useBalance() {
  const core = useCore();
  const { address } = useSession();
  return useQuery({ queryKey: [address, 'balance'], queryFn: () => core.getBalance(), refetchInterval: 3000 });
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

export type RequestStage = 'posted' | 'accepted' | 'delivered' | 'rated';

export interface RequestStatus {
  request: Request | null;
  run: Run | null;
  accept: Accept | null;
  delivery: Delivery | null;
  receipt: Receipt | null;
  complaint: Complaint | null;
  stage: RequestStage;
  /** Run expired before anyone accepted. */
  lapsed: boolean;
}

/** Derived from getRequest + getAcceptForRequest + getDeliveryForRequest (+ receipt/complaint for "rated"). */
export function useRequestStatus(key?: string) {
  const core = useCore();
  return useQ<RequestStatus>(
    ['reqStatus', key],
    async () => {
      const request = await core.getRequest(key as EntityKey);
      const [run, accept, delivery] = await Promise.all([
        request ? core.getRun(request.run) : null,
        core.getAcceptForRequest(key as EntityKey),
        core.getDeliveryForRequest(key as EntityKey),
      ]);
      let receipt: Receipt | null = null;
      let complaint: Complaint | null = null;
      if (delivery) {
        const [rs, cs] = await Promise.all([core.getReceiptsFor(delivery.rider), core.getComplaintsAgainst(delivery.rider)]);
        receipt = rs.find((r) => r.receipt.delivery === delivery.key)?.receipt ?? null;
        complaint = cs.find((c) => c.request === key) ?? null;
      }
      const stage: RequestStage = receipt || complaint ? 'rated' : delivery ? 'delivered' : accept ? 'accepted' : 'posted';
      return { request, run, accept, delivery, receipt, complaint, stage, lapsed: !!request && !run && !accept };
    },
    !!key,
  );
}

export interface RequestRow {
  request: Request;
  accept: Accept | null;
  delivery: Delivery | null;
}

/** The runner's active run with its requests and their accept/delivery state. */
export function useRunnerBoard() {
  const core = useCore();
  return useQ<{ run: Run | null; rows: RequestRow[] }>(['runnerBoard'], async () => {
    const runs = await core.getMyRuns();
    const run = [...runs].sort((a, b) => b.eta - a.eta)[0] ?? null;
    if (!run) return { run: null, rows: [] };
    const requests = await core.getRequestsForRun(run.key);
    const rows = await Promise.all(
      requests.map(async (request) => {
        const [accept, delivery] = await Promise.all([core.getAcceptForRequest(request.key), core.getDeliveryForRequest(request.key)]);
        return { request, accept, delivery };
      }),
    );
    return { run, rows };
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
