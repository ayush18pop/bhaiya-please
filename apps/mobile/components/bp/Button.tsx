/**
 * Buttons (design system "Controls"). Every save shows its state ON the button:
 * idle → Saving▮▮▮ → Saved ✓ (green) → or "Couldn't save · Retry" (coral) with an inline reason.
 */
import { useEffect } from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';
import { Check } from 'lucide-react-native';
import type { LucideIcon } from 'lucide-react-native';
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withDelay, withRepeat, withSequence, withTiming } from 'react-native-reanimated';
import { t } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { Sink, type ShadowTone } from './Sink';
import { Icon, Text, TextClass } from './Text';

export type ButtonVariant = 'primary' | 'secondary' | 'destructive' | 'ask' | 'go' | 'paper';
export type ButtonSize = 'sm' | 'md' | 'lg' | 'xl';
export type SaveState = 'idle' | 'saving' | 'saved' | 'failed';

const H: Record<ButtonSize, string> = { sm: 'min-h-[44px] px-4', md: 'min-h-[48px] px-5', lg: 'min-h-[56px] px-5', xl: 'min-h-[64px] px-6' };
const FS: Record<ButtonSize, string> = { sm: 'text-[15px]', md: 'text-[16px]', lg: 'text-[17px]', xl: 'text-[19px]' };

const V: Record<ButtonVariant, { face: string; text: string; shadow: ShadowTone; display: boolean }> = {
  primary: { face: 'bg-yellow border-3 border-ink', text: 'text-ink', shadow: 'edge', display: true },
  secondary: { face: 'bg-transparent border-2 border-edge', text: 'text-fg font-bold', shadow: 'none', display: false },
  destructive: { face: 'bg-bg border-2 border-mirchi', text: 'text-mirchi', shadow: 'mirchi', display: true },
  ask: { face: 'bg-bg border-2 border-yellow', text: 'text-yellow', shadow: 'yellow', display: true },
  go: { face: 'bg-go border-3 border-ink', text: 'text-ink', shadow: 'edge', display: true },
  /** Dark button on paper surfaces (posters, bills). Shadowed outline variants use an opaque face (pass bg-surface on cards). */
  paper: { face: 'bg-transparent border-2 border-ink', text: 'text-ink font-bold', shadow: 'none', display: false },
};

/** Three bars blinking in sequence (the "Saving" indicator). */
export function SavingDots({ className }: { className?: string }) {
  return (
    <View className="flex-row gap-1">
      {[0, 1, 2].map((i) => (
        <Bar key={i} i={i} className={className} />
      ))}
    </View>
  );
}
function Bar({ i, className }: { i: number; className?: string }) {
  const reduce = useReducedMotion();
  const o = useSharedValue(0.35);
  useEffect(() => {
    if (reduce) {
      o.value = 1;
      return;
    }
    o.value = withDelay(i * 300, withRepeat(withSequence(withTiming(1, { duration: 300 }), withTiming(0.35, { duration: 600 })), -1, false));
  }, [o, i, reduce]);
  const a = useAnimatedStyle(() => ({ opacity: o.value }));
  return <Animated.View style={[{ width: 6, height: 10 }, a]} className={cn('bg-ink', className)} />;
}

export interface ButtonProps {
  label: string;
  onPress?: () => void;
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: LucideIcon;
  iconRight?: LucideIcon;
  disabled?: boolean;
  state?: SaveState;
  /** Labels per save state. */
  savingLabel?: string;
  savedLabel?: string;
  failedLabel?: string;
  /** Stretch to the parent width (default true for lg/xl). */
  full?: boolean;
  className?: string;
  wrapClassName?: string;
  accessibilityLabel?: string;
  loading?: boolean;
}

export function Button({
  label, onPress, variant = 'primary', size = 'lg', icon, iconRight, disabled, state = 'idle', savingLabel, savedLabel, failedLabel,
  full, className, wrapClassName, accessibilityLabel, loading,
}: ButtonProps) {
  const failed = state === 'failed';
  const saved = state === 'saved';
  const saving = state === 'saving' || loading;
  const isFull = full ?? (size === 'lg' || size === 'xl');
  const v = saved && variant === 'primary' ? V.go : V[variant];
  const off = disabled && !saving && !saved;
  const face = off
    ? variant === 'secondary' || variant === 'paper'
      ? 'bg-transparent border-2 border-line'
      : 'bg-surface border-3 border-line'
    : failed
      ? 'bg-surface border-3 border-mirchi'
      : saved && variant === 'secondary'
        ? 'bg-transparent border-2 border-go'
        : v.face;
  const textCls = off ? 'text-muted' : failed ? 'text-mirchi' : saved && variant === 'secondary' ? 'text-go' : v.text;
  const text = failed ? `${failedLabel ?? t('save.failed')} · ${t('save.retry')}` : saving ? (savingLabel ?? t('save.saving').replace('…', '')) : saved ? (savedLabel ?? t('save.saved')) : label;
  const fontCls = v.display || failed ? 'font-display' : 'font-bold';
  const dotsCls = variant === 'primary' ? 'bg-ink' : variant === 'destructive' ? 'bg-mirchi' : 'bg-yellow';
  return (
    <Sink
      onPress={saving || saved ? undefined : onPress}
      disabled={off}
      shadow={off || failed ? 'none' : v.shadow}
      haptics={variant === 'primary' ? 'press' : 'tap'}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? text}
      accessibilityState={{ disabled: !!off, busy: !!saving }}
      wrapClassName={cn(isFull ? 'self-stretch' : 'self-start', wrapClassName)}
      className={cn('flex-row items-center justify-center gap-2.5 rounded-block', H[size], face, className)}>
      <TextClass.Provider value={cn(textCls, FS[size], fontCls)}>
        {icon && !saving && !saved ? <Icon as={icon} size={size === 'sm' ? 18 : 20} className={textCls} /> : null}
        <Text numberOfLines={1} className={cn(textCls, FS[size], fontCls, failed && 'text-[15px]')}>{text}</Text>
        {saving ? <SavingDots className={dotsCls} /> : null}
        {saved ? <Icon as={Check} size={20} strokeWidth={3} className={variant === 'secondary' ? 'text-go' : 'text-ink'} /> : null}
        {iconRight && !saving && !saved ? <Icon as={iconRight} size={20} className={textCls} /> : null}
      </TextClass.Provider>
    </Sink>
  );
}

/** Underlined text button ("Edit request", "Paste handoff link"). */
export function TextButton({ label, onPress, tone = 'fg', className, icon }: { label: string; onPress?: () => void; tone?: 'fg' | 'yellow' | 'ink' | 'mirchi' | 'muted'; className?: string; icon?: LucideIcon }) {
  const col = { fg: 'text-fg', yellow: 'text-yellow', ink: 'text-ink', mirchi: 'text-mirchi', muted: 'text-muted' }[tone];
  return (
    <Pressable onPress={onPress} accessibilityRole="button" hitSlop={8} className={cn('min-h-[48px] flex-row items-center gap-1.5 self-start px-1 active:opacity-70', className)}>
      {icon ? <Icon as={icon} size={18} className={col} /> : null}
      <Text className={cn('text-[16px] font-bold underline', col)} style={{ textDecorationLine: 'underline' }}>
        {label}
      </Text>
    </Pressable>
  );
}

/** Square icon button (48px), optionally glass (over maps/camera). */
export function IconButton({ icon, onPress, label, glass, size = 48, badge, className, tone = 'fg' }: { icon: LucideIcon; onPress?: () => void; label: string; glass?: boolean; size?: number; badge?: number; className?: string; tone?: 'fg' | 'ink' }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={badge ? `${label}, ${badge} unread` : label}
      hitSlop={4}
      style={{ width: size, height: size }}
      className={cn('items-center justify-center rounded-block active:opacity-70', glass && 'border-2 border-paper/85 bg-surface/80', className)}>
      <Icon as={icon} size={24} strokeWidth={2.2} className={tone === 'ink' ? 'text-ink' : 'text-fg'} />
      {badge ? (
        <View className="absolute right-1 top-1.5 min-w-[18px] items-center rounded-pill border-2 border-ink bg-mirchi px-1">
          <Text className="font-display text-[10px] leading-[13px] text-ink">{badge > 9 ? '9+' : String(badge)}</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

export function Spinner({ className }: { className?: string }) {
  return <ActivityIndicator color="#FFB400" className={className} />;
}
