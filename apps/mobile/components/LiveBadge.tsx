import { View } from 'react-native';
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
      className={cn('flex-row items-center gap-1.5 rounded-full bg-card/95 px-2.5 py-1.5 shadow-sm shadow-black/15', className)}
      accessibilityLabel={live ? 'Live' : 'Reconnecting'}>
      <View className="h-2.5 w-2.5 items-center justify-center">
        {live ? <View className="absolute h-2.5 w-2.5 animate-ping rounded-full bg-green-500/60" /> : null}
        <View className={cn('h-2 w-2 rounded-full', live ? 'bg-green-600' : 'bg-slate-400')} />
      </View>
      <Text className={cn('text-[11px] font-extrabold tracking-wide', live ? 'text-green-700' : 'text-muted-foreground')}>
        {live ? 'LIVE' : 'Reconnecting…'}
      </Text>
      {ago !== null ? <Text className="text-[11px] font-semibold text-muted-foreground">· updated {ago}s ago</Text> : null}
    </View>
  );
}
