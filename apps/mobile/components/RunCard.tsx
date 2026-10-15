import { View } from 'react-native';
import { Package, Users } from 'lucide-react-native';
import type { Run } from '@bhaiya-please/core';
import { AliasChip } from '@/components/AliasChip';
import { Countdown } from '@/components/Countdown';
import { TierBadge } from '@/components/TierBadge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Icon } from '@/components/ui/icon';
import { Progress } from '@/components/ui/progress';
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
export function RunCard({ run, onAsk, showFrom = true }: { run: Run; onAsk?: () => void; showFrom?: boolean }) {
  const now = useNow();
  const profile = useProfile(run.creator);
  const phase = runPhase(run, now);
  const total = Math.max(60, run.eta - run.createdAt);
  const pct = phase === 'upcoming' ? ((now - run.createdAt) / total) * 100 : 100;
  const p = profile.data;

  return (
    <Card className={cn('gap-3', phase === 'ended' && 'opacity-50')}>
      <View className="flex-row items-center justify-between gap-2 px-4">
        <View className="flex-1"><AliasChip address={run.creator} /></View>
        {p ? <TierBadge tier={p.tier} showCap /> : <View className="h-6 w-24 animate-pulse rounded-md bg-muted" />}
      </View>
      <View className="gap-2 px-4">
        <View className="flex-row items-baseline justify-between">
          <Text variant="muted">{phase === 'ended' ? S.runs.ended : S.runs.arrives}</Text>
          {phase === 'ended' ? null : phase === 'atGate' ? (
            <Text className="text-xl font-extrabold text-secondary">{S.runs.atGate}</Text>
          ) : (
            <Countdown to={run.eta} className="text-3xl font-extrabold text-foreground" />
          )}
        </View>
        <Progress value={pct} indicatorClassName={phase === 'atGate' ? 'bg-secondary' : 'bg-primary'} />
      </View>
      <View className="flex-row flex-wrap items-center gap-x-4 gap-y-1 px-4">
        <View className="flex-row items-center gap-1.5">
          <Icon as={Package} size={14} className="text-muted-foreground" />
          <Text className="text-sm font-semibold" accessibilityLabel="slots left">{fmt(S.runs.slotsLeft, { n: run.capacityLeft })}</Text>
        </View>
        {p ? (
          <View className="flex-row items-center gap-1.5">
            <Icon as={Users} size={14} className="text-muted-foreground" />
            <Text className="text-sm text-muted-foreground">{fmt(S.runs.handoffs, { n: p.receiptsTotal })}</Text>
          </View>
        ) : null}
        {showFrom ? <Text variant="caption">from {zoneLabel(run.fromZone)}</Text> : null}
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
}
