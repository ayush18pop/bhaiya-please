/**
 * D2 Activity detail: one finished (or running) request or run. Chain data when it still exists,
 * otherwise the device-local log. Request: bill, status road, timeline with times, runner, receipt /
 * report, Verified record link. Run: route, times, each handoff with its receipt status.
 */
import { Pressable, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ChevronRight, ReceiptText } from 'lucide-react-native';
import type { Address } from '@bhaiya-please/core';
import {
  Alert, BillCard, Button, Card, Icon, Paper, PersonChip, Poster, Screen, Section, SkeletonCards, StatusRoad, Text, TextButton, tagLabel,
} from '@/components/bp';
import { useSession } from '@/components/providers';
import { STAGE_INDEX, useReceipts, useRequestStatus, useRunRows, useShop } from '@/hooks/queries';
import { aliasFor } from '@/lib/alias';
import { dateTime, rupees } from '@/lib/format';
import { useHistory, type RequestLog, type RunLog } from '@/lib/history';
import { fill, useCopy } from '@/lib/i18n';
import { placeName } from '@/lib/societies';
import { cn } from '@/lib/utils';
import { sharedCopy } from '@/screens/shared/copy';
import { dayTime, shortDate, timeOf, Rise } from '@/screens/shared/parts';

export default function ActivityDetail() {
  const { kind, key } = useLocalSearchParams<{ kind: string; key: string }>();
  return kind === 'run' ? <RunDetail runKey={String(key)} /> : <RequestDetail requestKey={String(key)} />;
}

function Gone() {
  const router = useRouter();
  const c = useCopy(sharedCopy);
  return (
    <Screen title={c.activity.title}>
      <Poster kicker={c.system.kicker} title={c.detail.notFound} body={c.detail.notFoundBody} action={{ label: c.detail.goBack, onPress: () => (router.canGoBack() ? router.back() : router.replace('/activity')) }} />
    </Screen>
  );
}

// ------------------------------------------------------------------ timeline

interface Step {
  label: string;
  at?: number;
  tone?: 'done' | 'bad' | 'todo';
}

function Timeline({ steps }: { steps: Step[] }) {
  const c = useCopy(sharedCopy).detail;
  return (
    <View accessibilityRole="list" accessibilityLabel={c.timeline}>
      {steps.map((s, i) => {
        const tone = s.tone ?? (s.at ? 'done' : 'todo');
        return (
          <Rise key={`${s.label}${i}`} index={i} className="flex-row gap-3.5">
            <View className="items-center">
              <View className={cn('h-7 w-7 items-center justify-center rounded-plate border-2', tone === 'done' ? 'border-ink bg-go' : tone === 'bad' ? 'border-ink bg-mirchi' : 'border-line bg-surface')}>
                <Text className={cn('font-display text-[12px] leading-[14px]', tone === 'todo' ? 'text-muted' : 'text-ink')}>{i + 1}</Text>
              </View>
              <View className={cn('min-h-[18px] w-[2px] flex-1', i < steps.length - 1 ? 'bg-line' : 'bg-transparent')} />
            </View>
            <View className="flex-1 pb-4">
              <Text className={cn('text-[16px] font-bold', tone === 'todo' && 'text-muted')}>{s.label}</Text>
              <Text className="text-[13px] text-muted">{s.at ? (i === 0 ? dayTime(s.at) : timeOf(s.at)) : c.notYet}</Text>
            </View>
          </Rise>
        );
      })}
    </View>
  );
}

// ------------------------------------------------------------------ request

function RequestDetail({ requestKey }: { requestKey: string }) {
  const router = useRouter();
  const { address } = useSession();
  const c = useCopy(sharedCopy);
  const st = useRequestStatus(requestKey);
  const log = useHistory().find((h): h is RequestLog => h.kind === 'request' && h.key === requestKey);
  const d = st.data;
  const req = d?.request ?? null;
  const shop = useShop(req?.shop);
  if (st.isLoading && !log) {
    return (
      <Screen title={c.activity.title}>
        <SkeletonCards n={2} />
      </Screen>
    );
  }
  if (!req && !log) return <Gone />;

  const items = req?.items ?? log!.items;
  const at = req?.createdAt ?? log!.at;
  const runner = (d?.accept?.rider ?? d?.run?.creator ?? d?.delivery?.rider ?? log?.runner) as Address | undefined;
  const name = runner ? aliasFor(runner) : '';
  const mine = !req || req.creator === address;
  const shopName = shop.data?.nameTag ?? log?.shop ?? '…';
  const maxPrice = req?.maxPrice ?? log!.maxPrice;
  const tip = req?.tip ?? log!.tip;

  const steps: Step[] = [{ label: name ? fill(c.detail.sentTo, { name }) : c.detail.sent, at }];
  if (d && req) {
    if (d.declined) steps.push({ label: fill(c.detail.declined, { name }), at: d.decline?.createdAt, tone: 'bad' });
    else if (d.lapsed) steps.push({ label: c.detail.lapsed, at: d.run?.expiresAt, tone: 'bad' });
    else {
      steps.push({ label: fill(c.detail.acceptedBy, { name }), at: d.accept?.createdAt });
      steps.push({ label: fill(c.detail.atGate, { name }), at: d.accept ? d.run?.atGateAt : undefined });
      steps.push({ label: c.detail.handed, at: d.delivery?.createdAt });
      if (d.complaint) steps.push({ label: c.detail.report, at: d.complaint.createdAt, tone: 'bad' });
      else steps.push({ label: c.detail.receipt, at: d.receipt?.createdAt });
    }
  } else if (log) {
    const o = log.outcome;
    if (o === 'lapsed' || o === 'sent' || o === 'accepted') steps.push({ label: c.detail.lapsed, tone: 'bad', at: undefined });
    if (o === 'declined') steps.push({ label: fill(c.detail.declined, { name }), tone: 'bad' });
    if (o === 'handed' || o === 'rated' || o === 'reported') steps.push({ label: c.detail.handed, tone: 'done' }, { label: o === 'reported' ? c.detail.report : c.detail.receipt, tone: o === 'reported' ? 'bad' : o === 'rated' ? 'done' : 'todo' });
  }

  return (
    <Screen title={fill(c.detail.requestTitle, { date: shortDate(at) })}>
      {!req && log ? <Alert tone="info" title={c.detail.fromLog} /> : null}
      <Rise index={0}>
        <BillCard shop={shopName} via={name || undefined} items={items} maxPrice={maxPrice} tip={tip} />
      </Rise>
      {d && req && !d.lapsed && !d.declined ? (
        <Rise index={1}>
          <StatusRoad current={STAGE_INDEX[d.stage]} />
        </Rise>
      ) : null}
      <Section title={c.detail.timeline}>
        <Timeline steps={steps} />
      </Section>
      {runner ? (
        <Section title={mine ? c.detail.runner : c.detail.resident}>
          <PersonChip address={mine ? runner : (req?.creator ?? runner)} />
        </Section>
      ) : null}
      {d?.receipt ? (
        <Rise index={3}>
          <Card onPress={() => router.push(`/receipt/${d.receipt!.key}`)} shadow="none" className="flex-row items-center gap-3 border-paper p-3.5">
            <Icon as={ReceiptText} size={24} className="text-go" />
            <View className="flex-1">
              <Text className="text-[16px] font-bold">{mine ? fill(c.detail.yourReceipt, { name }) : fill(c.detail.receiptFor, { name: aliasFor(req?.creator) })}</Text>
              <Text className="text-[13px] text-muted">{[...d.receipt.tags.map(tagLabel), c.detail.verifiedRecord].join(' · ')}</Text>
            </View>
            <Icon as={ChevronRight} size={20} />
          </Card>
        </Rise>
      ) : null}
      {d?.delivery && !d.receipt && !d.complaint && mine ? <Button label={c.detail.giveReceipt} onPress={() => router.push(`/request/${requestKey}/rate`)} /> : null}
      {d?.complaint ? <Alert tone="error" title={fill(c.detail.reported, { reason: c.reasons[d.complaint.reason] })} /> : null}
      {d?.delivery && !d.complaint && mine ? <TextButton label={c.detail.reportProblem} onPress={() => router.push(`/request/${requestKey}/report`)} /> : null}
      <Text className="text-[13px] text-muted">{`${rupees(maxPrice + tip)} · ${dateTime(at)}`}</Text>
    </Screen>
  );
}

// ------------------------------------------------------------------ run

function Line({ k, v }: { k: string; v: string }) {
  return (
    <View className="flex-row justify-between gap-3">
      <Text className="text-[15px] text-ink">{k}</Text>
      <Text className="flex-shrink text-right text-[15px] font-bold text-ink">{v}</Text>
    </View>
  );
}

function RunDetail({ runKey }: { runKey: string }) {
  const router = useRouter();
  const { address } = useSession();
  const c = useCopy(sharedCopy);
  const rr = useRunRows(runKey);
  const receipts = useReceipts(address);
  const log = useHistory().find((h): h is RunLog => h.kind === 'run' && h.key === runKey);
  const run = rr.data?.run ?? null;
  if (rr.isLoading && !log) {
    return (
      <Screen title={c.activity.title}>
        <SkeletonCards n={2} />
      </Screen>
    );
  }
  if (!run && !log) return <Gone />;
  const at = run?.createdAt ?? log!.at;
  const from = run?.fromZone ?? log!.from;
  const dest = run?.destZone ?? log!.dest;
  const eta = run?.eta ?? log!.at + log!.minutes * 60;
  const end = run?.expiresAt ?? eta + 600;
  const rows = rr.data?.rows ?? [];
  const taken = rows.filter((r) => r.accept).length;
  const total = run ? taken + run.capacityLeft : (log?.capacity ?? 0);
  const all = receipts.data ?? [];
  const byDelivery = new Map(all.map((r) => [r.receipt.delivery, r]));
  const during = all.filter((r) => r.receipt.createdAt >= at && r.receipt.createdAt <= end + 3600);
  const handoffs = rows.filter((r) => r.delivery).length || log?.handoffs || during.length;

  return (
    <Screen title={fill(c.detail.runTitle, { date: shortDate(at) })}>
      {!run && log ? <Alert tone="info" title={c.detail.fromLog} /> : null}
      <Rise index={0}>
        <Paper className="gap-2.5 p-[18px]">
          <Text className="font-display text-[19px] leading-[23px] text-ink">{`${placeName(from)} → ${placeName(dest)}`}</Text>
          <View className="border-t-2 border-dashed border-ink" />
          <Line k={c.detail.started} v={dayTime(at)} />
          <Line k={c.detail.eta} v={timeOf(eta)} />
          <Line k={c.detail.endedAt} v={timeOf(end)} />
          {total ? <Line k={c.detail.slots} v={`${taken || handoffs} of ${total}`} /> : null}
          <Line k={c.detail.handoffs} v={String(handoffs)} />
        </Paper>
      </Rise>
      <Section title={c.detail.handoffs}>
        {rows.length ? (
          <View className="overflow-hidden rounded-block border-2 border-line bg-surface">
            {rows.map((r, i) => {
              const vr = r.delivery ? byDelivery.get(r.delivery.key) : undefined;
              const status = r.delivery ? (vr ? `${c.detail.receiptReceived} · ${vr.receipt.tags.map(tagLabel).join(' · ') || aliasFor(vr.receipt.creator)}` : c.detail.waitingReceipt) : r.decline ? c.detail.youDeclined : r.accept ? c.detail.notHanded : c.detail.newRequest;
              const go = () => router.push(vr ? `/receipt/${vr.receipt.key}` : `/activity/request/${r.request.key}`);
              return (
                <Rise key={r.request.key} index={i}>
                  <Pressable onPress={go} accessibilityRole="link" className={cn('gap-1 px-4 py-3 active:bg-raised', i < rows.length - 1 && 'border-b-2 border-line')}>
                    <View className="flex-row items-center justify-between gap-2">
                      <Text numberOfLines={1} className="flex-shrink text-[16px] font-bold">
                        {r.request.items.join(' · ')}
                      </Text>
                      <Text className="text-[13px] font-bold text-muted">{aliasFor(r.request.creator)}</Text>
                    </View>
                    <Text className={cn('text-[14px]', vr ? 'text-go' : r.delivery ? 'text-yellow' : 'text-muted')}>{status}</Text>
                  </Pressable>
                </Rise>
              );
            })}
          </View>
        ) : during.length ? (
          <View className="gap-2">
            <Text className="text-[14px] text-muted">{c.detail.receiptsDuring}</Text>
            <View className="overflow-hidden rounded-block border-2 border-line bg-surface">
              {during.map((r, i) => (
                <Pressable key={r.receipt.key} onPress={() => router.push(`/receipt/${r.receipt.key}`)} accessibilityRole="link" className={cn('flex-row items-center gap-3 px-4 py-3 active:bg-raised', i < during.length - 1 && 'border-b-2 border-line')}>
                  <Icon as={ReceiptText} size={22} className="text-go" />
                  <View className="flex-1">
                    <Text className="text-[16px] font-bold">{fill(c.profile.from, { name: aliasFor(r.receipt.creator) })}</Text>
                    <Text className="text-[13px] text-muted">{[timeOf(r.receipt.createdAt), ...r.receipt.tags.map(tagLabel)].join(' · ')}</Text>
                  </View>
                  <Icon as={ChevronRight} size={20} />
                </Pressable>
              ))}
            </View>
          </View>
        ) : (
          <Text className="text-[15px] text-muted">{c.detail.noHandoffs}</Text>
        )}
      </Section>
    </Screen>
  );
}
