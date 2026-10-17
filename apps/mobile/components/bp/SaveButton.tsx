/**
 * A Button bound to a write. Shows Saving / Saved / Couldn't save · Retry on itself, plus the
 * plain reason under it on failure. Disabled with a reason while offline (no queued writes).
 */
import { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import { describeError, useTx } from '@/hooks/useTx';
import { haptic } from '@/lib/haptics';
import { t } from '@/lib/i18n';
import { useOnline } from '@/lib/online';
import { cn } from '@/lib/utils';
import { Button, type ButtonProps } from './Button';
import { Text } from './Text';

export interface SaveButtonProps<R> extends Omit<ButtonProps, 'onPress' | 'state'> {
  onSave: () => Promise<R>;
  /** Called after the Saved state has been visible briefly (default 650ms). */
  onDone?: (r: R) => void;
  doneDelay?: number;
  /** Stay in Saved (e.g. "Sent ✓") instead of resetting to idle after onDone. */
  sticky?: boolean;
  /** Extra line under the button on failure (e.g. an alternative action). */
  onError?: (e: unknown) => void;
}

export function SaveButton<R>({ onSave, onDone, doneDelay = 650, sticky = true, onError, disabled, wrapClassName, ...rest }: SaveButtonProps<R>) {
  const online = useOnline();
  const tx = useTx(async () => ({ v: await onSave() }));
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => void (timer.current && clearTimeout(timer.current)), []);
  // A save that is still running after 15s is usually the network retrying: say so.
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    if (tx.state !== 'pending') return setSlow(false);
    const id = setTimeout(() => setSlow(true), 15_000);
    return () => clearTimeout(id);
  }, [tx.state]);
  useEffect(() => {
    if (tx.state !== 'failed') return;
    haptic.error();
    onError?.(tx.error);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tx.state]);
  const state = tx.state === 'pending' ? 'saving' : tx.state === 'confirmed' ? 'saved' : tx.state === 'failed' ? 'failed' : 'idle';
  const err = tx.state === 'failed' ? describeError(tx.error) : null;
  return (
    <View className={cn('gap-1.5', rest.full === false ? 'self-start' : 'self-stretch', wrapClassName)}>
      <Button
        {...rest}
        disabled={disabled || !online}
        state={state}
        onPress={async () => {
          const r = await tx.run();
          if (!r) return; // failed or already running
          haptic.success();
          timer.current = setTimeout(() => {
            onDone?.(r.v);
            if (!sticky) tx.reset();
          }, doneDelay);
        }}
      />
      {err ? (
        <Text accessibilityRole="alert" className="text-[13px] font-semibold text-mirchi">
          {err.message}
        </Text>
      ) : slow ? (
        <Text accessibilityLiveRegion="polite" className="text-[13px] font-semibold text-yellow">
          The network is slow. Still trying, keep this screen open.
        </Text>
      ) : !online ? (
        <Text className="text-[13px] font-semibold text-muted">{t('offline.writeDisabled')}</Text>
      ) : null}
    </View>
  );
}
