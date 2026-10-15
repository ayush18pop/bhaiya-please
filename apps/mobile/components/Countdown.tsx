import { useEffect, useRef } from 'react';
import { Text } from '@/components/ui/text';
import { useNow } from '@/hooks/useNow';
import { countdownLabel } from '@/lib/format';

/** `to` = unix seconds. Shares the one app-wide ticker. */
export function Countdown({ to, onEnd, endLabel = '00:00', className }: { to: number; onEnd?: () => void; endLabel?: string; className?: string }) {
  const now = useNow();
  const left = to - now;
  const fired = useRef(false);
  useEffect(() => {
    if (left <= 0 && !fired.current) {
      fired.current = true;
      onEnd?.();
    }
  }, [left, onEnd]);
  return (
    <Text className={className} style={{ fontVariant: ['tabular-nums'] }}>
      {left <= 0 ? endLabel : countdownLabel(left)}
    </Text>
  );
}
