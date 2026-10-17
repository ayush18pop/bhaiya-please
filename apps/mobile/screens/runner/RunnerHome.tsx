/**
 * Home tab in Run errands mode. No live run → C2 (start fast, see progress). Live run → C4 (the
 * runner's dashboard: own run, map, incoming requests, location chip, one Next-step button).
 */
import { useMemo, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { ChevronRight, Route } from 'lucide-react-native';
import type { RunLog } from '@/lib/history';
import {
  Alert, Button, Card, ConfirmSheet, Empty, Footer, Icon, OwnRunCard, Paper, RequestCard, SaveButton, Section, SkeletonCards,
  SlideInCard, SunlightScope, SwitchRow, Text, TextButton,
} from '@/components/bp';
import { HomeHeader } from '@/components/shell/HomeHeader';
import { useCore, useSession } from '@/components/providers';
import { useProfile, useReceipts } from '@/hooks/queries';
import { appEvent } from '@/lib/events';
import { ago } from '@/lib/format';
import { logActivity, useHistory } from '@/lib/history';
import { fill, t, useCopy } from '@/lib/i18n';
import { placeName, societyById } from '@/lib/societies';
import { runnerCopy } from './copy';
import {
  LevelCard, MoreButton, Rise, RowCard, RunnerMap, SharingSheet, SharingStatus, StatBox, SunButton, slotsLabel, societyName, useActiveRun, useShopName,
  type RequestRow,
} from './parts';
import { getLedger, getList, useRunnerStore } from './store';

export default function RunnerHome() {
  const a = useActiveRun();
  return (
    <SunlightScope>
      <HomeHeader />
      {a.board.isLoading && !a.board.data ? (
        <View className="flex-1 gap-4 p-4">
          <SkeletonCards n={2} kind="map" />
        </View>
      ) : a.run ? (
        <ActiveRun a={a} />
      ) : (
        <Idle a={a} />
      )}
    </SunlightScope>
  );
}

type Active = ReturnType<typeof useActiveRun>;

// ====================================================================== C2

function Idle({ a }: { a: Active }) {
  const router = useRouter();
  const c = useCopy(runnerCopy);
  const { address, prefs, setPrefs } = useSession();
  const profile = useProfile(address);
  const receipts = useReceipts(address);
  const history = useHistory();
  useRunnerStore();
  const setupDone = !!(address && prefs.runnerSetup[address]);
  const weekAgo = a.now - 7 * 86400;
  const ledger = address ? getLedger(address) : [];
  const week = ledger.filter((e) => e.at >= weekAgo);
  const weekReceipts = (receipts.data ?? []).filter((r) => r.valid && r.receipt.createdAt >= weekAgo).length;
  const lastRun = useMemo(() => history.find((h): h is RunLog => h.kind === 'run' && a.now - h.at < 24 * 3600), [history, a.now]);
  const lastRunHandoffs = lastRun ? ledger.filter((e) => e.run === lastRun.key).length : 0;
  const start = (q = '') => router.push((setupDone ? `/runner/start${q}` : '/runner/setup') as never);

  return (
    <ScrollView className="flex-1" contentContainerClassName="gap-[18px] px-4 pb-8 pt-4">
      {a.board.isError ? <Alert title="Couldn't load your runs." body="Showing what this phone remembers. Pull down or wait a moment." /> : null}
      {!setupDone ? (
        <Rise index={0}>
          <Card className="gap-2.5">
            <Text className="text-[18px] font-bold">{c.home.setupTitle}</Text>
            <Text className="text-[15px] leading-[21px] text-muted">{c.home.setupBody}</Text>
            <Button label={c.home.setupCta} variant="secondary" size="lg" iconRight={ChevronRight} onPress={() => router.push('/runner/setup')} />
          </Card>
        </Rise>
      ) : null}

      <Rise index={1}>
        <Paper shadow="yellow" className="gap-3.5 p-[18px]">
          <View className="gap-1">
            <Text className="font-display text-[28px] leading-[30px] text-ink">{c.home.goingTitle}</Text>
            <Text className="text-[15px] font-semibold text-ink">{c.home.goingBody}</Text>
          </View>
          <Button label={t('run.start')} size="xl" onPress={() => start()} />
        </Paper>
      </Rise>

      {lastRun ? (
        <Rise index={2}>
          <Card tone="calm" onPress={() => router.push(`/runner/summary/${lastRun.key}`)} className="min-h-[56px] flex-row items-center gap-3 px-3.5 py-3">
            <Icon as={Route} size={22} className="text-yellow" />
            <View className="flex-1">
              <Text className="text-[16px] font-bold">{c.home.lastRun}</Text>
              <Text className="text-[13px] text-muted">
                {lastRun.from} → {lastRun.dest} · {lastRunHandoffs} handoff{lastRunHandoffs === 1 ? '' : 's'} · {ago(lastRun.at, a.now)}
              </Text>
            </View>
            <Text className="text-[14px] font-extrabold text-yellow">{c.home.seeSummary}</Text>
          </Card>
        </Rise>
      ) : null}

      {prefs.recentTrips.length ? (
        <Rise index={3}>
          <Section title={c.home.recent}>
            <View className="gap-2">
              {prefs.recentTrips.map((tr) => {
                const dest = societyById(tr.dest);
                return (
                  <Card
                    key={`${tr.from}-${tr.dest}`}
                    tone="calm"
                    onPress={() => start(`?dest=${tr.dest}&from=${tr.from}&min=${tr.minutes}&cap=${tr.capacity}`)}
                    accessibilityLabel={`Start ${placeName(tr.from)} to ${dest.name}, ${tr.minutes} minutes`}
                    className="min-h-[56px] flex-row items-center gap-3 px-3.5 py-2.5">
                    <View className="flex-1">
                      <Text className="text-[16px] font-bold">
                        {placeName(tr.from)} → {dest.name}
                      </Text>
                      <Text className="text-[13px] text-muted">{fill(c.home.tripMeta, { min: tr.minutes, slots: slotsLabel(tr.capacity, c) })}</Text>
                    </View>
                    <Icon as={ChevronRight} size={20} strokeWidth={2.6} />
                  </Card>
                );
              })}
            </View>
          </Section>
        </Rise>
      ) : null}

      <Rise index={4}>
        <LevelCard profile={profile.data} />
      </Rise>

      <Rise index={5}>
        <Section title={c.home.week}>
          <View className="flex-row gap-2.5">
            <StatBox value={week.length} label={c.home.handoffs} />
            <StatBox value={weekReceipts} label={c.home.receipts} />
            <StatBox value={week.reduce((s, e) => s + e.tip, 0)} label={c.home.tips} money />
          </View>
          <Text className="text-[13px] leading-[18px] text-muted">{c.home.tipsNote}</Text>
        </Section>
      </Rise>

      <Rise index={6}>
        <SwitchRow label={c.sunlight} hint={c.sunlightHint} value={prefs.sunlight} onChange={(v) => setPrefs({ sunlight: v })} />
      </Rise>
    </ScrollView>
  );
}

// ====================================================================== C4

function ActiveRun({ a }: { a: Active }) {
  const router = useRouter();
  const core = useCore();
  const qc = useQueryClient();
  const c = useCopy(runnerCopy);
  const [sheet, setSheet] = useState(false);
  const [endOpen, setEndOpen] = useState(false);
  useRunnerStore();
  const run = a.run!;
  const society = societyName(run.destZone);
  const ending = a.now >= run.eta;
  const minsToEta = Math.max(0, Math.ceil((run.eta - a.now) / 60));
  const minsToEnd = Math.max(0, Math.ceil((run.expiresAt - a.now) / 60));
  const list = getList(run.key);

  let next: { label: string; href: string; variant?: 'primary' | 'secondary' } | null = null;
  if (a.waiting.length) {
    if (run.atGateAt) next = { label: c.run.scanNext, href: '/runner/gate' };
    else if (!list.done) next = { label: c.run.openList, href: '/runner/list' };
    else next = { label: c.run.atGate, href: '/runner/gate' };
  } else if (a.delivered.length) next = { label: c.run.seeSummary, href: `/runner/summary/${run.key}`, variant: 'secondary' };

  return (
    <View className="flex-1">
      <ScrollView className="flex-1" contentContainerClassName="gap-4 px-4 pb-6 pt-4">
        <Rise index={0}>
          <OwnRunCard
            title={fill(c.run.title, { society })}
            minutesLeft={ending ? minsToEnd : minsToEta}
            taken={a.taken}
            total={a.total}
            ending={ending}
            endingText={t('run.endingSoon', { min: minsToEnd })}
          />
        </Rise>
        <Rise index={1}>
          <RunnerMap run={run} />
        </Rise>
        <View className="flex-row items-center gap-1.5">
          <View className="flex-1">
            <SharingStatus onOpen={() => setSheet(true)} />
          </View>
          <SunButton />
          <MoreButton onPress={() => setEndOpen(true)} />
        </View>

        {a.full && a.pending.length ? <Text className="text-[14px] font-semibold text-muted">{c.run.full}</Text> : null}

        {a.pending.length ? (
          <View className="gap-3">
            {a.pending.map((r) => (
              <SlideInCard key={r.request.key}>
                <IncomingCard row={r} full={a.full} now={a.now} />
              </SlideInCard>
            ))}
          </View>
        ) : !a.accepted.length ? (
          <Empty title={c.run.noRequestsTitle} body={fill(c.run.noRequests, { society })} />
        ) : null}

        {a.waiting.length ? (
          <Section title={fill(c.run.accepted, { n: a.waiting.length })}>
            <View className="gap-2.5">
              {a.waiting.map((r) => (
                <SlideInCard key={r.request.key}>
                  <RowCard row={r} state="accepted" onPress={() => router.push(`/runner/request/${r.request.key}`)} />
                </SlideInCard>
              ))}
            </View>
          </Section>
        ) : null}

        {a.delivered.length ? (
          <Section title={fill(c.run.handed, { n: a.delivered.length })}>
            <View className="gap-2">
              {a.delivered.map((r) => (
                <RowCard key={r.request.key} row={r} state="handed" onPress={() => router.push(`/runner/done?request=${r.request.key}`)} />
              ))}
            </View>
          </Section>
        ) : null}

        {a.declined.length ? (
          <Section title={c.run.closed}>
            <View className="gap-2">
              {a.declined.map((r) => (
                <RowCard key={r.request.key} row={r} state="declined" />
              ))}
            </View>
          </Section>
        ) : null}
      </ScrollView>

      {next ? (
        <Footer runner>
          <Button label={next.label} size="xl" variant={next.variant ?? 'primary'} onPress={() => router.push(next!.href as never)} />
        </Footer>
      ) : null}

      <SharingSheet open={sheet} onClose={() => setSheet(false)} />
      <ConfirmSheet
        open={endOpen}
        onClose={() => setEndOpen(false)}
        title={c.run.endTitle}
        body={a.waiting.length ? c.run.endBody : c.run.endBodyNone}
        confirm={
          <View className="gap-2.5 pt-1">
            <SaveButton
              label={c.run.endConfirm}
              variant="destructive"
              size="xl"
              onSave={() => core.cancelRun(run.key)}
              onDone={() => {
                logActivity({ kind: 'run', key: run.key, ended: true, handoffs: a.delivered.length });
                setEndOpen(false);
                void qc.invalidateQueries();
                if (a.delivered.length) router.push(`/runner/summary/${run.key}`);
              }}
            />
            <Button label="Go back" variant="secondary" size="lg" onPress={() => setEndOpen(false)} />
          </View>
        }
      />
    </View>
  );
}

/** New request with Decline / Accept (or greyed when the run is full). */
function IncomingCard({ row, full, now }: { row: RequestRow; full: boolean; now: number }) {
  const core = useCore();
  const qc = useQueryClient();
  const router = useRouter();
  const shop = useShopName(row.request.shop);
  const r = row.request;
  const refresh = () => void qc.invalidateQueries();
  if (full) return <RequestCard resident={r.creator} items={r.items} shop={shop} maxPrice={r.maxPrice} tip={r.tip} ago={ago(r.createdAt, now)} state="full" />;
  return (
    <RequestCard
      resident={r.creator}
      items={r.items}
      shop={shop}
      maxPrice={r.maxPrice}
      tip={r.tip}
      ago={ago(r.createdAt, now)}
      state="new"
      actions={
        <View className="gap-1">
        <TextButton label="See full request" tone="muted" onPress={() => router.push(`/runner/request/${r.key}`)} />
        <View className="flex-row items-start gap-3">
          <View className="w-[124px]">
            <SaveButton label={t('run.decline')} variant="secondary" size="xl" savingLabel="…" savedLabel="Declined" onSave={() => core.declineRequest(r.key)} onDone={refresh} doneDelay={500} />
          </View>
          <View className="flex-1">
            <SaveButton
              label={t('run.accept')}
              size="xl"
              savedLabel={t('status.accepted')}
              onSave={() => core.acceptRequest(r.key)}
              onDone={() => {
                appEvent('request.accepted');
                refresh();
              }}
              doneDelay={500}
            />
          </View>
        </View>
        </View>
      }
    />
  );
}
