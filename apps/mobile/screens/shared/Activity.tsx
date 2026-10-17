/**
 * D1 Activity (tab, Get things / Run errands). Active / Past, filter All · Requests · Runs (requests
 * first in Get things, runs first in Run errands). Live chain data merged with the device-local log,
 * since runs and unanswered requests expire on chain; rows seen on chain are written to the log so
 * Past keeps them after they expire.
 */
import { useEffect, useMemo, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useQueries } from '@tanstack/react-query';
import type { EntityKey, Run, VerifiedReceipt } from '@bhaiya-please/core';
import { Chip, ChipRow, Segmented, SkeletonCards, Sink, Text } from '@/components/bp';
import { useCore, useSession } from '@/components/providers';
import { useMyRequests, useMyRuns, useReceipts, useRequestStatus, useRunRows, useShop, type RequestRow } from '@/hooks/queries';
import { useNow } from '@/hooks/useNow';
import { aliasFor } from '@/lib/alias';
import { rupees } from '@/lib/format';
import { logActivity, useHistory, type RequestLog, type RunLog } from '@/lib/history';
import { fill, useCopy } from '@/lib/i18n';
import { placeName } from '@/lib/societies';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { sharedCopy } from './copy';
import { RowPlate, plural, shortDate, type PlateKind, Rise } from './parts';

type Seg = 'active' | 'past';
type Filter = 'all' | 'requests' | 'runs';

/** Runs by key, sharing the ['run', key] cache with useRun. */
function useRunsByKey(keys: string[]) {
  const core = useCore();
  const { address } = useSession();
  const uniq = [...new Set(keys)];
  const qs = useQueries({ queries: uniq.map((k) => ({ queryKey: [address, 'run', k], queryFn: () => core.getRun(k as EntityKey), structuralSharing: false })) });
  const map: Record<string, Run | null | undefined> = {};
  uniq.forEach((k, i) => (map[k] = qs[i]?.data));
  return { map, loading: qs.some((q) => q.isLoading) };
}

function Row({ title, meta, plate, onPress, index }: { title: string; meta: string; plate: { kind: PlateKind; label: string }; onPress: () => void; index: number }) {
  return (
    <Rise index={index}>
      <Sink onPress={onPress} shadow="none" accessibilityRole="link" accessibilityLabel={`${title}. ${plate.label.toLowerCase()}. ${meta}`} className="gap-1.5 rounded-block border-2 border-line bg-surface px-3.5 py-3">
        <View className="flex-row items-center justify-between gap-2.5">
          <Text numberOfLines={1} className="flex-shrink text-[16px] font-bold">
            {title}
          </Text>
          <RowPlate kind={plate.kind} label={plate.label} />
        </View>
        <Text numberOfLines={2} className="text-[14px] text-muted">
          {meta}
        </Text>
      </Sink>
    </Rise>
  );
}

// ------------------------------------------------------------------ requests

function ChainRequestRow({ row, run, active, index }: { row: RequestRow; run: Run | null | undefined; active: boolean; index: number }) {
  const router = useRouter();
  const c = useCopy(sharedCopy).activity;
  const now = useNow();
  const st = useRequestStatus(row.delivery ? row.request.key : undefined);
  const shop = useShop(row.request.shop);
  const runner = row.accept?.rider ?? run?.creator ?? row.delivery?.rider;
  const r = row.request;
  const rated = st.data?.receipt ? 'rated' : st.data?.complaint ? 'reported' : null;
  const outcome: RequestLog['outcome'] = row.delivery ? (rated ?? 'handed') : row.accept ? 'accepted' : run === null ? 'lapsed' : 'sent';

  // Keep the device log in step with what the chain says (so Past survives expiry).
  useEffect(() => {
    if (!runner || !shop.data) return;
    logActivity({ kind: 'request', key: r.key, runKey: r.run, runner, shop: shop.data.nameTag, items: r.items, maxPrice: r.maxPrice, tip: r.tip, at: r.createdAt, outcome });
  }, [runner, shop.data, outcome, r]);

  const name = runner ? aliasFor(runner) : '…';
  let plate: { kind: PlateKind; label: string };
  let meta: string;
  if (active) {
    const mins = run ? Math.max(0, Math.ceil((run.eta - now) / 60)) : 0;
    plate = row.accept ? (run?.atGateAt ? { kind: 'live', label: c.plate.atGate } : { kind: 'live', label: c.plate.accepted }) : { kind: 'live', label: c.plate.sent };
    meta = row.accept ? `${fill(c.via, { name })} · ${mins > 0 ? fill(c.arriving, { min: mins }) : c.arrivingNow}` : fill(c.waiting, { name });
  } else {
    plate = rated === 'rated' ? { kind: 'done', label: c.plate.receipt } : rated === 'reported' ? { kind: 'report', label: c.plate.reported } : row.delivery ? { kind: 'done', label: c.plate.handed } : { kind: 'ended', label: c.plate.expired };
    meta = row.delivery ? `${fill(c.via, { name })} · ${shortDate(r.createdAt)} · ${fill(c.paid, { amount: rupees(r.maxPrice + r.tip) })}` : `${shortDate(r.createdAt)} · ${c.noAccept}`;
  }
  return <Row index={index} title={r.items.join(' · ')} meta={meta} plate={plate} onPress={() => router.push(active ? `/request/${r.key}` : `/activity/request/${r.key}`)} />;
}

function LogRequestRow({ log, index }: { log: RequestLog; index: number }) {
  const router = useRouter();
  const c = useCopy(sharedCopy).activity;
  const o = log.outcome;
  const plate: { kind: PlateKind; label: string } =
    o === 'rated' ? { kind: 'done', label: c.plate.receipt } : o === 'reported' ? { kind: 'report', label: c.plate.reported } : o === 'handed' ? { kind: 'done', label: c.plate.handed } : o === 'cancelled' ? { kind: 'ended', label: c.plate.cancelled } : o === 'declined' ? { kind: 'ended', label: c.plate.declined } : { kind: 'ended', label: c.plate.expired };
  const handed = o === 'rated' || o === 'reported' || o === 'handed';
  const meta = handed ? `${fill(c.via, { name: aliasFor(log.runner) })} · ${shortDate(log.at)} · ${fill(c.paid, { amount: rupees(log.maxPrice + log.tip) })}` : `${shortDate(log.at)} · ${o === 'cancelled' || o === 'declined' ? fill(c.via, { name: aliasFor(log.runner) }) : c.noAccept}`;
  return <Row index={index} title={log.items.join(' · ')} meta={meta} plate={plate} onPress={() => router.push(`/activity/request/${log.key}`)} />;
}

// ------------------------------------------------------------------ runs

function ActiveRunRow({ run, index }: { run: Run; index: number }) {
  const router = useRouter();
  const { mode, setMode } = useSession();
  const c = useCopy(sharedCopy).activity;
  const now = useNow();
  const rows = useRunRows(run.key);
  const taken = (rows.data?.rows ?? []).filter((r) => r.accept).length;
  const total = taken + run.capacityLeft;
  useEffect(() => {
    if (!rows.data) return;
    logActivity({ kind: 'run', key: run.key, dest: run.destZone, from: run.fromZone, minutes: Math.max(1, Math.round((run.eta - run.createdAt) / 60)), capacity: total, at: run.createdAt, handoffs: (rows.data.rows ?? []).filter((r) => r.delivery).length });
  }, [rows.data, run, total]);
  const mins = Math.max(0, Math.ceil((run.expiresAt - now) / 60));
  return (
    <Row
      index={index}
      title={fill(c.runTo, { place: placeName(run.destZone) })}
      meta={`${fill(c.slots, { taken, total })} · ${fill(c.endsIn, { min: mins })}`}
      plate={{ kind: 'live', label: c.plate.live }}
      onPress={() => {
        if (mode !== 'run') setMode('run');
        router.push('/home');
      }}
    />
  );
}

function PastRunRow({ log, receipts, index }: { log: RunLog; receipts: VerifiedReceipt[]; index: number }) {
  const router = useRouter();
  const c = useCopy(sharedCopy).activity;
  const end = log.at + (log.minutes + 70) * 60;
  const got = receipts.filter((r) => r.receipt.createdAt >= log.at && r.receipt.createdAt <= end).length;
  const n = Math.max(log.handoffs ?? 0, got);
  const meta = [shortDate(log.at), fill(c.handoffs, { n, s: plural(n) }), got ? fill(c.receipts, { n: got, s: plural(got) }) : null].filter(Boolean).join(' · ');
  return (
    <Row
      index={index}
      title={`${placeName(log.from)} → ${placeName(log.dest)}`}
      meta={meta}
      plate={n > 0 ? { kind: 'done', label: c.plate.done } : { kind: 'ended', label: c.plate.ended }}
      onPress={() => router.push(`/activity/run/${log.key}`)}
    />
  );
}

// ------------------------------------------------------------------ screen

export default function Activity() {
  const insets = useSafeAreaInsets();
  const { mode, address } = useSession();
  const c = useCopy(sharedCopy).activity;
  const now = useNow();
  const [seg, setSeg] = useState<Seg>('active');
  const [filter, setFilter] = useState<Filter>('all');
  const requests = useMyRequests();
  const runs = useMyRuns();
  const receipts = useReceipts(address);
  const history = useHistory();
  const runKeys = useMemo(() => (requests.data ?? []).map((r) => r.request.run), [requests.data]);
  const runsByKey = useRunsByKey(runKeys);
  const runsFirst = mode === 'run';

  const model = useMemo(() => {
    const reqRows = requests.data ?? [];
    const chainReqKeys = new Set<string>(reqRows.map((r) => r.request.key));
    const activeReq = reqRows.filter((r) => {
      const run = runsByKey.map[r.request.run];
      return !r.delivery && !!run && run.expiresAt > now;
    });
    const activeReqKeys = new Set(activeReq.map((r) => r.request.key));
    const pastReqChain = reqRows.filter((r) => !activeReqKeys.has(r.request.key) && runsByKey.map[r.request.run] !== undefined);
    const pastReqLog = history.filter((h): h is RequestLog => h.kind === 'request' && !chainReqKeys.has(h.key));
    const liveRuns = (runs.data ?? []).filter((r) => r.expiresAt > now);
    const liveRunKeys = new Set<string>(liveRuns.map((r) => r.key));
    const pastRuns = history.filter((h): h is RunLog => h.kind === 'run' && !liveRunKeys.has(h.key));
    return { activeReq, pastReqChain, pastReqLog, liveRuns, pastRuns };
  }, [requests.data, runs.data, runsByKey.map, history, now]);

  const loading = (requests.isLoading || runs.isLoading) && !requests.data && !runs.data;
  const allReceipts = receipts.data ?? [];
  let i = 0;
  const reqNodes =
    seg === 'active'
      ? model.activeReq.map((r) => <ChainRequestRow key={r.request.key} row={r} run={runsByKey.map[r.request.run]} active index={i++} />)
      : [
          ...model.pastReqChain.map((r) => ({ at: r.request.createdAt, node: <ChainRequestRow key={r.request.key} row={r} run={runsByKey.map[r.request.run]} active={false} index={0} /> })),
          ...model.pastReqLog.map((l) => ({ at: l.at, node: <LogRequestRow key={l.key} log={l} index={0} /> })),
        ]
          .sort((a, b) => b.at - a.at)
          .map((x) => x.node);
  const runNodes =
    seg === 'active'
      ? model.liveRuns.map((r) => <ActiveRunRow key={r.key} run={r} index={i++} />)
      : [...model.pastRuns].sort((a, b) => b.at - a.at).map((l) => <PastRunRow key={l.key} log={l} receipts={allReceipts} index={0} />);
  const groups = filter === 'requests' ? [reqNodes] : filter === 'runs' ? [runNodes] : runsFirst ? [runNodes, reqNodes] : [reqNodes, runNodes];
  const nodes = groups.flat();
  const filters: { id: Filter; label: string }[] = runsFirst
    ? [{ id: 'all', label: c.all }, { id: 'runs', label: c.runs }, { id: 'requests', label: c.requests }]
    : [{ id: 'all', label: c.all }, { id: 'requests', label: c.requests }, { id: 'runs', label: c.runs }];

  return (
    <View className="flex-1 bg-bg" style={{ paddingTop: insets.top }}>
      <View className="gap-3 px-4 pb-3 pt-4">
        <Text variant="title" className="text-[28px] leading-[30px]">
          {c.title}
        </Text>
        <Segmented options={[{ id: 'active', label: c.active }, { id: 'past', label: c.past }]} value={seg} onChange={setSeg} />
        <ChipRow className="flex-nowrap gap-2">
          {filters.map((f) => (
            <Chip key={f.id} label={f.label} selected={filter === f.id} onPress={() => setFilter(f.id)} />
          ))}
        </ChipRow>
      </View>
      <ScrollView className="flex-1" contentContainerClassName="gap-2.5 px-4 pb-8 pt-1">
        {loading ? (
          <SkeletonCards n={4} kind="row" />
        ) : nodes.length ? (
          nodes.map((n, k) => <View key={(n as { key?: string }).key ?? k}>{n}</View>)
        ) : (
          <Rise>
            <View className="rounded-[14px] border-2 border-paper">
              <View className="items-center gap-3 rounded-block border-2 border-ink bg-paper px-4 py-8">
                <Text className="text-center font-display text-[22px] leading-[25px] text-ink">{c.emptyTitle}</Text>
                <Text className="text-center text-[15px] font-semibold text-ink">{history.length || (requests.data?.length ?? 0) ? (seg === 'active' ? c.emptyActive : c.emptyPast) : c.emptyBody}</Text>
              </View>
            </View>
          </Rise>
        )}
      </ScrollView>
    </View>
  );
}
