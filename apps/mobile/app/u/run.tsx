import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { ArkivNote } from '@/components/ArkivNote';
import { EmptyState, Page, SkeletonCards } from '@/components/Bits';
import { PriceStepper } from '@/components/PriceStepper';
import { RunCard, runPhase } from '@/components/RunCard';
import { TierBadge } from '@/components/TierBadge';
import { TxButton } from '@/components/TxButton';
import { useCore, useSession } from '@/components/providers';
import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import { useProfile, useRunnerBoard } from '@/hooks/queries';
import { useNow } from '@/hooks/useNow';
import { fmt } from '@/lib/format';
import { S } from '@/lib/strings';
import { ZONES } from '@/lib/zones';
import { cn } from '@/lib/utils';

function ZoneChoice({ value, onChange, label }: { value: string; onChange: (z: string) => void; label: string }) {
  return (
    <View className="gap-2">
      <Text variant="h3">{label}</Text>
      <View className="gap-2" accessibilityRole="radiogroup">
        {ZONES.map((z) => {
          const on = z.zone6 === value;
          return (
            <Pressable key={z.id} onPress={() => onChange(z.zone6)} accessibilityRole="radio" accessibilityState={{ checked: on }} className={cn('min-h-12 flex-row items-center justify-between rounded-lg border-2 bg-card px-4', on ? 'border-primary' : 'border-border')}>
              <Text className="font-semibold">{z.label}</Text>
              <Text variant="caption" className="font-mono">{z.zone6}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

export default function RunnerRun() {
  const core = useCore();
  const router = useRouter();
  const qc = useQueryClient();
  const now = useNow();
  const { address, zoneId } = useSession();
  const profile = useProfile(address);
  const board = useRunnerBoard();
  const myZone = ZONES.find((z) => z.id === zoneId) ?? ZONES[0];
  const other = ZONES.find((z) => z.id !== myZone.id) ?? ZONES[1];
  const [dest, setDest] = useState(myZone.zone6);
  const [from, setFrom] = useState(other.zone6);
  const [mins, setMins] = useState(20);
  const [cap, setCap] = useState(2);

  const tier = profile.data?.tier;
  const maxCap = tier?.requestsPerRun ?? 1;
  const capacity = Math.min(cap, maxCap);
  const run = board.data?.run;
  const active = run && runPhase(run, now) !== 'ended' ? run : null;

  if (board.isLoading && !board.data) return <Page><SkeletonCards n={1} /></Page>;

  if (active) {
    const pending = (board.data?.rows ?? []).filter((r) => !r.accept).length;
    return (
      <Page>
        <Text variant="h2">{S.runner.activeTitle}</Text>
        <RunCard run={active} />
        <Pressable onPress={() => router.replace('/u/requests')} className="rounded-xl border border-border bg-card p-4">
          <Text className="font-bold">{fmt(S.runner.requestsCount, { n: board.data?.rows.length ?? 0 })}</Text>
          <Text variant="muted">{pending > 0 ? `${pending} waiting for you →` : 'Open Requests →'}</Text>
        </Pressable>
        <TxButton
          variant="outline"
          labels={{ idle: S.runner.endEarly, pending: 'Ending…', done: 'Ended' }}
          onTx={() => core.cancelRun(active.key)}
          onDone={() => qc.invalidateQueries()}
        />
        <ArkivNote text={S.runner.vanish} explainer={S.runs.whyVanishBody} />
      </Page>
    );
  }

  return (
    <Page
      footer={
        <>
          <TxButton
            size="lg"
            disabled={!tier || dest === from}
            labels={{ idle: S.runner.announce, pending: S.runner.announcing, done: S.common.done }}
            onTx={() => core.announceRun({ destZone: dest, fromZone: from, etaMinutes: mins, capacity })}
            onDone={() => qc.invalidateQueries()}
            toastDone="Run announced"
          />
          <Text variant="caption" className="text-center">{S.runner.vanish}</Text>
        </>
      }>
      {run && <Text className="font-semibold text-muted-foreground">{S.runner.ended}</Text>}
      <ZoneChoice label={S.runner.announceTitle} value={dest} onChange={setDest} />
      <ZoneChoice label={S.runner.from} value={from} onChange={setFrom} />
      {dest === from && <Text variant="caption" className="text-destructive">Pick two different places.</Text>}
      <View className="gap-2">
        <Text variant="h3">{S.runner.arriving}</Text>
        <PriceStepper value={mins} min={5} cap={60} step={5} onChange={setMins} format={(n) => fmt(S.runner.minutes, { n })} />
      </View>
      <View className="gap-2">
        <Text variant="h3">{S.runner.capacity}</Text>
        <PriceStepper value={capacity} min={1} cap={maxCap} step={1} onChange={setCap} format={(n) => String(n)} />
        <View className="flex-row items-center gap-2">
          <Text variant="muted">{S.runner.yourTier}:</Text>
          {tier ? <TierBadge tier={tier} showCap /> : null}
          <Text variant="caption">max {maxCap}</Text>
        </View>
      </View>
      <Text variant="muted">{S.runner.mustTrip}</Text>
      <Button variant="link" className="self-start" onPress={() => router.push('/me')}>
        <Text>{S.profile.tiersTitle}</Text>
      </Button>
      {board.isLoading ? null : !run && <EmptyState title="No active run" body="Announce one for a trip you're already making." />}
    </Page>
  );
}
