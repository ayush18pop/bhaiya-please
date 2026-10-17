/** C10 Run summary: handoffs, receipts received/pending, tips from requests, compliments, level progress. */
import { useEffect, useMemo, useState } from 'react';
import { View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import type { Receipt, ReceiptTag } from '@bhaiya-please/core';
import { Button, DashRule, Empty, PlateFlip, Screen, SkeletonCards, Text, TornEdge, tagLabel } from '@/components/bp';
import { useSession } from '@/components/providers';
import { useProfile, useReceipts, useRunRows } from '@/hooks/queries';
import { aliasFor } from '@/lib/alias';
import { nowSec, rupees } from '@/lib/format';
import { findLog, useHistory, type RunLog } from '@/lib/history';
import { fill, useCopy } from '@/lib/i18n';
import { AREAS, placeName, SOCIETIES, societyByZone } from '@/lib/societies';
import { runnerCopy } from '@/screens/runner/copy';
import { LevelCard, SunButton, Rise } from '@/screens/runner/parts';
import { getLedger, getSnap, syncRunner, useRunnerStore } from '@/screens/runner/store';

const zoneForName = (n?: string) => SOCIETIES.find((s) => s.name === n)?.zone6 ?? AREAS.find((a) => a.name === n)?.zone6 ?? null;
const time = (u: number) => new Date(u * 1000).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' });

function Line({ k, v }: { k: string; v: string }) {
  return (
    <View className="flex-row items-baseline justify-between gap-3">
      <Text className="text-[16px] text-ink">{k}</Text>
      <Text numberOfLines={1} className="flex-shrink text-right text-[16px] font-extrabold text-ink">
        {v}
      </Text>
    </View>
  );
}

export default function RunSummary() {
  const { key } = useLocalSearchParams<{ key: string }>();
  const router = useRouter();
  const c = useCopy(runnerCopy);
  const { address } = useSession();
  const rr = useRunRows(key);
  const receipts = useReceipts(address);
  const profile = useProfile(address);
  useHistory();
  useRunnerStore();

  useEffect(() => {
    if (rr.data?.run) syncRunner(address, key, rr.data.rows);
  }, [address, key, rr.data]);

  const log = findLog(key ?? '') as RunLog | undefined;
  const run = rr.data?.run ?? null;
  const entries = address ? getLedger(address).filter((e) => e.run === key) : [];
  const byDelivery = useMemo(() => new Map<string, Receipt>((receipts.data ?? []).filter((r) => r.valid).map((r) => [r.receipt.delivery, r.receipt])), [receipts.data]);
  const received = entries.filter((e) => byDelivery.has(e.delivery));
  const pending = entries.filter((e) => !byDelivery.has(e.delivery));
  const tips = entries.reduce((s, e) => s + e.tip, 0);
  const tags = [...new Set(received.flatMap((e) => byDelivery.get(e.delivery)?.tags ?? []))] as ReceiptTag[];

  const destZone = run?.destZone ?? zoneForName(log?.dest);
  const fromZone = run?.fromZone ?? zoneForName(log?.from);
  const destName = log?.dest ?? placeName(destZone);
  const fromName = log?.from ?? placeName(fromZone);
  const startAt = run?.createdAt ?? log?.at;
  const endAt = run ? Math.min(run.eta, nowSec()) : entries[0]?.at;

  // Level progress since go-live (snapshot taken in C3).
  const snap = key ? getSnap(key) : null;
  const p = profile.data;
  const gainN = p && snap ? Math.max(0, p.receiptsTotal - snap.receipts) : 0;
  const levelUp = !!(p && snap && snap.tier !== p.tier.name);
  const [flipped, setFlipped] = useState(false);
  useEffect(() => {
    if (!levelUp) return;
    const id = setTimeout(() => setFlipped(true), 700);
    return () => clearTimeout(id);
  }, [levelUp]);

  // Reverse trip: back to where the runner came from (if that's a society), else the same trip again.
  const back = societyByZone(fromZone);
  const destSoc = societyByZone(destZone);
  const again = back && destZone ? { dest: back.id, from: destZone, label: `${destName} → ${back.name}` } : destSoc && fromZone ? { dest: destSoc.id, from: fromZone, label: `${fromName} → ${destName}` } : null;
  const mins = log?.minutes ?? 20;
  const cap = log?.capacity ?? 1;

  const loading = rr.isLoading || receipts.isLoading;
  return (
    <Screen
      runner
      bare
      footer={
        <>
          {again ? <Text className="text-center text-[14px] font-bold text-muted">{again.label}</Text> : null}
          <Button
            label={c.summary.another}
            size="xl"
            onPress={() => router.replace((again ? `/runner/start?dest=${again.dest}&from=${again.from}&min=${mins}&cap=${cap}` : '/runner/start') as never)}
          />
          <Button label={c.summary.done} variant="secondary" size="lg" onPress={() => router.replace('/home')} />
        </>
      }>
      <View className="flex-row items-start justify-between">
        <View className="gap-1">
          <Text variant="display">{c.summary.title}</Text>
          {entries.length ? <Text className="font-hindi text-[24px] leading-[30px] text-mirchi">{c.summary.kicker}</Text> : null}
        </View>
        <SunButton />
      </View>

      {loading && !entries.length ? (
        <SkeletonCards n={1} kind="row" />
      ) : (
        <>
          <Rise index={0}>
            <View className="gap-2.5 rounded-t-sheet border-2 border-b-0 border-ink bg-paper px-5 pb-4 pt-5">
              <View className="flex-row items-start justify-between gap-3">
                <Text className="flex-1 text-[18px] font-bold leading-[22px] text-ink">
                  {fromName} → {destName}
                </Text>
                {startAt ? (
                  <Text className="text-[13px] font-extrabold text-ink">
                    {time(startAt)}
                    {endAt ? `–${time(endAt)}` : ''}
                  </Text>
                ) : null}
              </View>
              <DashRule />
              <Line k={c.summary.handoffs} v={String(entries.length)} />
              <Line k={c.summary.received} v={String(received.length)} />
              <Line k={c.summary.pending} v={pending.length ? `${pending.length} · ${pending.map((e) => aliasFor(e.resident)).join(', ')}` : '0'} />
              <Line k={c.summary.tips} v={rupees(tips)} />
              <DashRule />
              <Text className="text-[15px] font-bold text-ink">{tags.length ? fill(c.summary.compliments, { list: tags.map(tagLabel).join(' · ') }) : c.summary.noCompliments}</Text>
            </View>
            <TornEdge />
          </Rise>

          {!entries.length ? <Empty title={c.summary.nothing} body={c.summary.nothingBody} /> : null}

          <Rise index={1}>
            {levelUp && snap && p ? (
              <View className="items-center gap-2 rounded-block border-2 border-line bg-surface py-5">
                <PlateFlip from={snap.tier} to={p.tier.name} flipped={flipped} />
              </View>
            ) : (
              <LevelCard profile={p} gain={p ? Math.min(gainN, p.receiptsTotal) / 25 : 0} gainText={gainN > 0 && p?.tier.name === 'verified' ? fill(gainN === 1 ? c.level.closer : c.level.closerMany, { n: gainN }) : null} />
            )}
          </Rise>
        </>
      )}
    </Screen>
  );
}
