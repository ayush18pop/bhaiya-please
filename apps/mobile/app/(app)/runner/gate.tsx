/** C7 At the gate: tell residents "I'm here", then hand over one by one (Scan code → C8). */
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { Check, ScanLine } from 'lucide-react-native';
import {
  Avatar, Button, Empty, Icon, MelaLights, Poster, SaveButton, Screen, Section, SkeletonCards, SlideInCard, Text, useReducedMotion, useThump,
  Animated,
} from '@/components/bp';
import { useCore } from '@/components/providers';
import { aliasFor } from '@/lib/alias';
import { appEvent } from '@/lib/events';
import { fill, t, useCopy } from '@/lib/i18n';
import { runnerCopy } from '@/screens/runner/copy';
import { Money, RowCard, SunButton, societyName, useActiveRun, type RequestRow, Rise } from '@/screens/runner/parts';

export default function AtTheGate() {
  const router = useRouter();
  const core = useCore();
  const qc = useQueryClient();
  const c = useCopy(runnerCopy);
  const a = useActiveRun();
  const run = a.run;
  const marked = !!run?.atGateAt;
  const names = a.waiting.map((r) => aliasFor(r.request.creator));

  if (a.board.isLoading && !a.board.data)
    return (
      <Screen runner title={c.gate.title.replace('{society}', '')}>
        <SkeletonCards n={2} kind="row" />
      </Screen>
    );
  if (!run)
    return (
      <Screen runner title={c.gate.noRun}>
        <Poster title={c.gate.noRun} body={c.gate.noRunBody} action={{ label: t('run.start'), onPress: () => router.replace('/runner/start') }} minHeight={460} />
      </Screen>
    );

  return (
    <Screen runner title={fill(c.gate.title, { society: societyName(run.destZone) })} right={<SunButton className="mr-1.5" />}>
      <Rise index={0} className="gap-1.5 rounded-block border-2 border-line bg-surface px-4 py-3.5">
        <Text className="text-[18px] font-bold">{a.waiting.length === 1 ? c.gate.waitingOne : fill(c.gate.waitingTitle, { n: a.waiting.length })}</Text>
        <Text className="text-[15px] leading-[21px] text-muted">{c.gate.rules}</Text>
      </Rise>

      {a.waiting.length ? (
        <Rise index={1} className="gap-3">
          {!marked ? (
            <Text className="text-center text-[15px] text-muted">
              {names.length === 1 ? fill(c.gate.notifyOne, { name: names[0]! }) : fill(c.gate.notify, { names: names.join(' and ') })}
            </Text>
          ) : null}
          <GateButton
            marked={marked}
            onSave={() => core.markAtGate(run.key)}
            onDone={() => {
              appEvent('runner.atGate');
              void qc.invalidateQueries();
            }}
            againLabel={c.gate.again}
          />
          {marked ? <NotifiedPlate label={c.gate.notified} /> : null}
        </Rise>
      ) : null}

      {a.waiting.length ? (
        <Section title={c.gate.waiting}>
          <View className="gap-3">
            {a.waiting.map((r, i) => (
              <SlideInCard key={r.request.key}>
                <WaitingCard row={r} primary={i === 0} onScan={() => router.push(`/runner/scan?request=${r.request.key}`)} />
              </SlideInCard>
            ))}
          </View>
        </Section>
      ) : (
        <Empty title={c.gate.none} body={c.gate.noneBody} action={a.delivered.length ? { label: c.run.seeSummary, onPress: () => router.push(`/runner/summary/${run.key}`) } : undefined} />
      )}

      <Section title={fill(c.gate.done, { n: a.delivered.length })}>
        <View className="gap-2">
          {a.delivered.map((r) => (
            <RowCard key={r.request.key} row={r} state="handed" onPress={() => router.push(`/runner/done?request=${r.request.key}`)} />
          ))}
        </View>
      </Section>
    </Screen>
  );
}

/** The big "I'm at the gate" button. Once saved, mela lights chase along both edges. */
function GateButton({ marked, onSave, onDone, againLabel }: { marked: boolean; onSave: () => Promise<unknown>; onDone: () => void; againLabel: string }) {
  if (marked) {
    return (
      <View className="gap-0 overflow-hidden rounded-block border-2 border-ink">
        <MelaLights height={16} marquee />
        <View className="bg-ink p-2">
          <SaveButton label={againLabel} variant="secondary" size="lg" savedLabel="Sent again" sticky={false} onSave={onSave} onDone={onDone} className="bg-ink" />
        </View>
        <MelaLights height={16} marquee />
      </View>
    );
  }
  return <SaveButton label={t('run.atGate')} size="xl" savedLabel="Residents notified" onSave={onSave} onDone={onDone} doneDelay={300} className="min-h-[104px]" />;
}

function NotifiedPlate({ label }: { label: string }) {
  const reduce = useReducedMotion();
  const style = useThump('notified', -2);
  return (
    <Animated.View style={reduce ? undefined : style} className="self-start">
      <View className="flex-row items-center gap-2 rounded-plate border-2 border-ink bg-go px-3 py-2">
        <Icon as={Check} size={18} strokeWidth={3} className="text-ink" />
        <Text className="font-display text-[14px] text-ink">{label}</Text>
      </View>
    </Animated.View>
  );
}

function WaitingCard({ row, primary, onScan }: { row: RequestRow; primary: boolean; onScan: () => void }) {
  const r = row.request;
  return (
    <View className="gap-3 rounded-block border-2 border-edge bg-surface p-4">
      <View className="flex-row items-center gap-3">
        <Avatar seed={r.creator} size={44} />
        <View className="flex-1">
          <Text className="text-[18px] font-bold">{aliasFor(r.creator)}</Text>
          <Text numberOfLines={1} className="text-[14px] text-muted">
            {r.items.join(' · ')}
          </Text>
        </View>
        <Money value={r.maxPrice + r.tip} size="sm" />
      </View>
      <Button label={t('run.scan')} icon={ScanLine} size="xl" variant={primary ? 'primary' : 'secondary'} onPress={onScan} />
    </View>
  );
}
