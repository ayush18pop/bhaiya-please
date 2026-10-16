import { View } from 'react-native';
import { MapPin, Package, Users } from 'lucide-react-native';
import type { Run } from '@bhaiya-please/core';
import { AliasChip } from '@/components/AliasChip';
import { AnimatedNumber, Shimmer } from '@/components/Motion';
import { Countdown } from '@/components/Countdown';
import { TierBadge } from '@/components/TierBadge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Icon } from '@/components/ui/icon';
import { Progress } from '@/components/ui/progress';
import { memo } from 'react';
import { Text } from '@/components/ui/text';
import { useProfile } from '@/hooks/queries';
import { useNow } from '@/hooks/useNow';
import { fmt } from '@/lib/format';
import { S } from '@/lib/strings';
import { zoneLabel } from '@/lib/zones';
import { cn } from '@/lib/utils';

export type RunPhase = 'upcoming' | 'atGate' | 'ended';
export const runPhase = (run: Run, now: number): RunPhase => (now >= run.expiresAt ? 'ended' : now >= run.eta ? 'atGate' : 'upcoming');

/** Tier shown is computed by the viewer from getProfile, never the run's claimedTier. */
export const RunCard = memo(function RunCard({ run, onAsk, showFrom = true }: { run: Run; onAsk?: () => void; showFrom?: boolean }) {
  const now = useNow();
  const profile = useProfile(run.creator);
  const phase = runPhase(run, now);
  const total = Math.max(60, run.eta - run.createdAt);
  const pct = phase === 'upcoming' ? ((now - run.createdAt) / total) * 100 : 100;
  const p = profile.data;
  const gate = phase === 'atGate';

  return (
    <Card className={cn('gap-3.5', phase === 'ended' && 'opacity-50')}>
      <View className="flex-row items-center justify-between gap-2 px-4">
        <View className="flex-1"><AliasChip address={run.creator} size={34} /></View>
        {p ? <TierBadge tier={p.tier} showCap /> : <Shimmer className="h-6 w-24 rounded-full" />}
      </View>

      {/* Primary info: the ETA. Big, tabular, on a tinted panel. */}
      <View className="mx-4 gap-2.5 rounded-2xl bg-accent/60 px-3.5 py-3">
        <View className="flex-row items-end justify-between">
          <Text className="pb-1 text-xs font-bold uppercase tracking-wider text-muted-foreground">{phase === 'ended' ? S.runs.ended : S.runs.arrives}</Text>
          {phase === 'ended' ? null : gate ? (
            <Text className="text-xl font-extrabold text-secondary">{S.runs.atGate}</Text>
          ) : (
            <Countdown to={run.eta} className="text-eta font-extrabold text-foreground" />
          )}
        </View>
        <Progress value={pct} className="h-1.5 bg-card" indicatorClassName={gate ? 'bg-secondary' : 'bg-primary'} />
      </View>

      <View className="flex-row flex-wrap items-center gap-x-2 gap-y-1.5 px-4">
        <View className="flex-row items-center gap-1.5 rounded-full bg-muted px-2.5 py-1">
          <Icon as={Package} size={13} className="text-foreground" />
          <AnimatedNumber value={run.capacityLeft} format={(n) => fmt(S.runs.slotsLeft, { n })} className="text-xs font-bold" />
        </View>
        {p ? (
          <View className="flex-row items-center gap-1.5 rounded-full bg-muted px-2.5 py-1">
            <Icon as={Users} size={13} className="text-foreground" />
            <AnimatedNumber value={p.receiptsTotal} format={(n) => fmt(S.runs.handoffs, { n })} className="text-xs font-bold" />
          </View>
        ) : null}
        {showFrom ? (
          <View className="flex-row items-center gap-1">
            <Icon as={MapPin} size={12} className="text-muted-foreground" />
            <Text variant="caption">{zoneLabel(run.fromZone)}</Text>
          </View>
        ) : null}
      </View>
      {onAsk && phase !== 'ended' ? (
        <View className="px-4">
          <Button onPress={onAsk} accessibilityLabel={`Ask ${run.creator}`}>
            <Text>{S.runs.ask} ▸</Text>
          </Button>
        </View>
      ) : null}
    </Card>
  );
});
