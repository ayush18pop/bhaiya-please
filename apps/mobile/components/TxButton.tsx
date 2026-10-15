import { useEffect, useRef } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { Check } from 'lucide-react-native';
import { toast } from 'sonner-native';
import { Button, type ButtonProps } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { TxBanner } from '@/components/TxBanner';
import { useTx } from '@/hooks/useTx';

interface Props<T> extends Omit<ButtonProps, 'onPress' | 'children'> {
  onTx: () => Promise<T>;
  onDone?: (r: T) => void;
  labels: { idle: string; pending: string; done?: string };
  toastDone?: string;
  /** Return to idle after N ms (for repeatable actions). Default: stay confirmed. */
  resetAfterMs?: number;
  /** Hide the inline failure banner (caller renders its own). */
  hideBanner?: boolean;
}

/** idle -> pending -> confirmed | failed. Disabled while pending, so it never double-submits. */
export function TxButton<T>({ onTx, onDone, labels, toastDone, resetAfterMs, hideBanner, disabled, className, ...rest }: Props<T>) {
  const { state, error, run, reset } = useTx(onTx);
  const done = useRef(onDone);
  done.current = onDone;
  useEffect(() => {
    if (state === 'confirmed' && resetAfterMs) {
      const t = setTimeout(reset, resetAfterMs);
      return () => clearTimeout(t);
    }
  }, [state, resetAfterMs, reset]);

  const onPress = async () => {
    const r = await run();
    if (r !== undefined) {
      if (toastDone) toast.success(toastDone);
      done.current?.(r);
    }
  };

  const pending = state === 'pending';
  const label = pending ? labels.pending : state === 'confirmed' ? (labels.done ?? labels.idle) : labels.idle;
  return (
    <View className="gap-2">
      <Button {...rest} className={className} disabled={disabled || pending || (state === 'confirmed' && !resetAfterMs)} onPress={onPress} accessibilityState={{ busy: pending }}>
        {pending && <ActivityIndicator size="small" color={['outline', 'ghost', 'soft', 'link'].includes(rest.variant ?? 'default') ? '#8a8f98' : '#ffffff'} />}
        {state === 'confirmed' && <Icon as={Check} size={18} className="text-primary-foreground" />}
        <Text>{label}</Text>
      </Button>
      {state === 'failed' && !hideBanner && <TxBanner error={error} onRetry={onPress} />}
    </View>
  );
}
