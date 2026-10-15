import { cn } from '@/lib/utils';
import { View } from 'react-native';

/** 0..100 bar. Plain Views: no animation cost on low-end phones. */
function Progress({ value, className, indicatorClassName }: { value: number; className?: string; indicatorClassName?: string }) {
  const pct = Math.max(0, Math.min(100, value));
  return (
    <View
      role="progressbar"
      aria-valuenow={Math.round(pct)}
      aria-valuemin={0}
      aria-valuemax={100}
      className={cn('h-2 w-full overflow-hidden rounded-full bg-muted', className)}>
      <View className={cn('h-full rounded-full bg-primary', indicatorClassName)} style={{ width: `${pct}%` }} />
    </View>
  );
}
export { Progress };
