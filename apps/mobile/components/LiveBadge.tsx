import { View } from 'react-native';
import { Pulse } from '@/components/Motion';
import { Text } from '@/components/ui/text';
import { useNow } from '@/hooks/useNow';
import { liveness, useLastEventAt } from '@/lib/live';
import { cn } from '@/lib/utils';

/** "● LIVE · updated 3s ago" while the subscription/polling is healthy; grey "Reconnecting…" otherwise. */
export function LiveBadge({ dataUpdatedAt, isError = false, className }: { dataUpdatedAt: number; isError?: boolean; className?: string }) {
  const now = useNow();
  const eventAt = useLastEventAt();
  const { live, ago } = liveness(dataUpdatedAt, isError, now * 1000, eventAt);
  return (
    <View
      className={cn('flex-row items-center gap-1.5 rounded-full border border-border/50 bg-card/95 px-3 py-1.5 shadow-lift', className)}
      accessibilityLabel={live ? 'Live' : 'Reconnecting'}>
      {live ? <Pulse size={10} color="#16a34a" /> : <View className="h-2 w-2 rounded-full bg-slate-400" />}
      <Text className={cn('text-[11px] font-extrabold tracking-wide', live ? 'text-green-700 dark:text-green-400' : 'text-muted-foreground')}>
        {live ? 'LIVE' : 'Reconnecting…'}
      </Text>
      {ago !== null ? <Text className="text-[11px] font-semibold text-muted-foreground">· updated {ago}s ago</Text> : null}
    </View>
  );
}
