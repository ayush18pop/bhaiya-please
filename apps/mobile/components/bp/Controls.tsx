/** Controls: chips, switches, segmented/mode toggle, steppers, slot picker, inputs, checklist rows, list rows. */
import { forwardRef, useEffect, useState } from 'react';
import { Pressable, TextInput, View, type TextInputProps } from 'react-native';
import { Check, ChevronRight, Minus, Plus } from 'lucide-react-native';
import type { LucideIcon } from 'lucide-react-native';
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated';
import { FONT } from '@/lib/fonts';
import { haptic } from '@/lib/haptics';
import { C, cn } from '@/lib/utils';
import { HardShadow, Sink } from './Sink';
import { Meter } from './Signatures';
import { Icon, Text } from './Text';
import { EASE } from './motion';

// ------------------------------------------------------------------ chips

/** Toggle chip: selected = green fill, ink border, paper hard shadow. */
export function Chip({ label, selected, onPress, icon, check, disabled, className }: { label: string; selected?: boolean; onPress?: () => void; icon?: LucideIcon; check?: boolean; disabled?: boolean; className?: string }) {
  return (
    <Sink
      onPress={onPress}
      disabled={disabled}
      haptics="select"
      shadow={selected ? 'edge' : 'none'}
      depth={3}
      radius={999}
      accessibilityRole={check ? 'checkbox' : 'button'}
      accessibilityState={{ selected: !!selected, checked: check ? !!selected : undefined, disabled }}
      className={cn('min-h-[44px] flex-row items-center gap-1.5 rounded-pill border-2 px-4', selected ? 'border-ink bg-go' : disabled ? 'border-line' : 'border-edge bg-transparent', className)}>
      {selected && check ? <Icon as={Check} size={16} strokeWidth={3} className="text-ink" /> : icon ? <Icon as={icon} size={16} className={selected ? 'text-ink' : 'text-fg'} /> : null}
      <Text className={cn('text-[15px]', selected ? 'font-extrabold text-ink' : disabled ? 'font-bold text-muted' : 'font-bold text-fg')}>{label}</Text>
    </Sink>
  );
}

export function ChipRow({ children, className }: { children: React.ReactNode; className?: string }) {
  return <View className={cn('flex-row flex-wrap gap-2.5', className)}>{children}</View>;
}

/** Read-only count chip ("On time 12"). */
export function CountChip({ label, count }: { label: string; count: number }) {
  return (
    <View className="h-10 flex-row items-center gap-2 self-start rounded-pill border-2 border-line bg-surface px-3.5">
      <Text className="text-[14px] font-semibold">{label}</Text>
      <Text style={{ fontFamily: FONT.meter, fontSize: 13, color: C.yellow }}>{count}</Text>
    </View>
  );
}

// ------------------------------------------------------------------ switch

export function Switch({ value, onChange, label, disabled }: { value: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }) {
  const reduce = useReducedMotion();
  const x = useSharedValue(value ? 26 : 0);
  useEffect(() => {
    x.value = reduce ? (value ? 26 : 0) : withTiming(value ? 26 : 0, { duration: 140, easing: EASE });
  }, [value, reduce, x]);
  const knob = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }] }));
  const track = (
    <View className={cn('h-[34px] w-[60px] rounded-pill border-2', value ? 'border-ink bg-go' : 'border-muted bg-ink', disabled && 'opacity-50')}>
      <Animated.View style={[{ position: 'absolute', top: 3, left: 3, width: 24, height: 24, borderRadius: 12, backgroundColor: value ? C.ink : C.muted }, knob]} />
    </View>
  );
  return (
    <Pressable
      onPress={() => {
        haptic.select();
        onChange(!value);
      }}
      disabled={disabled}
      accessibilityRole="switch"
      accessibilityState={{ checked: value, disabled }}
      accessibilityLabel={label}
      hitSlop={8}
      className="self-start">
      {value ? (
        <HardShadow shadow="edge" depth={3} radius={999}>
          {track}
        </HardShadow>
      ) : (
        track
      )}
    </Pressable>
  );
}

/** Row with a label (and optional hint) and a switch on the right. */
export function SwitchRow({ label, hint, value, onChange, className }: { label: string; hint?: string; value: boolean; onChange: (v: boolean) => void; className?: string }) {
  return (
    <View className={cn('flex-row items-center justify-between gap-4 rounded-block border-2 border-line bg-surface px-4 py-3.5', className)}>
      <View className="flex-1 gap-0.5">
        <Text className="text-[16px] font-semibold">{label}</Text>
        {hint ? <Text className="text-[14px] text-muted">{hint}</Text> : null}
      </View>
      <Switch value={value} onChange={onChange} label={label} />
    </View>
  );
}

// ------------------------------------------------------------------ segmented / mode toggle

/** Two or three options in a paper-outlined tray; selected = paper fill with a yellow hard shadow. */
export function Segmented<T extends string>({ options, value, onChange, className, size = 'md' }: { options: { id: T; label: string }[]; value: T; onChange: (v: T) => void; className?: string; size?: 'sm' | 'md' }) {
  return (
    <View accessibilityRole="tablist" className={cn('flex-row rounded-block border-2 border-edge p-[3px]', size === 'md' ? 'h-12' : 'h-11', className)}>
      {options.map((o) => {
        const on = o.id === value;
        return (
          <Pressable
            key={o.id}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            onPress={() => {
              if (!on) haptic.select();
              onChange(o.id);
            }}
            className="flex-1">
            {on ? (
              <HardShadow shadow="yellow" depth={2} radius={9} wrapClassName="flex-1" className="flex-1 items-center justify-center rounded-[9px] bg-fg">
                <Text numberOfLines={1} className={cn('font-extrabold text-bg', options.length > 2 ? 'text-[15px]' : 'text-[16px]')}>{o.label}</Text>
              </HardShadow>
            ) : (
              <View className="flex-1 items-center justify-center">
                <Text numberOfLines={1} className={cn('font-bold', options.length > 2 ? 'text-[15px]' : 'text-[16px]')}>{o.label}</Text>
              </View>
            )}
          </Pressable>
        );
      })}
    </View>
  );
}

// ------------------------------------------------------------------ stepper

/** −  [meter]  +. At the cap the meter border turns yellow and + is disabled; caller shows why. */
export function Stepper({ value, onChange, min = 0, max, step = 10, prefix, unit, label, size = 56 }: { value: number; onChange: (v: number) => void; min?: number; max: number; step?: number; prefix?: string; unit?: string; label: string; size?: number }) {
  const atMax = value >= max;
  const atMin = value <= min;
  const btn = (icon: LucideIcon, disabled: boolean, delta: number, a11y: string) => (
    <Sink
      onPress={() => onChange(Math.max(min, Math.min(max, value + delta)))}
      disabled={disabled}
      haptics="select"
      shadow="none"
      accessibilityRole="button"
      accessibilityLabel={a11y}
      className={cn('items-center justify-center rounded-block border-2', disabled ? 'border-line' : 'border-edge')}
      style={undefined}>
      <View style={{ width: size - 4, height: size - 4 }} className="items-center justify-center">
        <Icon as={icon} size={24} strokeWidth={3} className={disabled ? 'text-muted' : 'text-fg'} />
      </View>
    </Sink>
  );
  return (
    <View accessibilityLabel={`${label}: ${prefix ?? ''}${value}${unit ? ` ${unit}` : ''}`} className="flex-row items-stretch gap-2">
      {btn(Minus, atMin, -step, `Decrease ${label}`)}
      <View className={cn('min-w-[128px] flex-row items-center justify-center gap-2 rounded-block border-2 bg-ink px-3', atMax ? 'border-yellow' : 'border-paper')}>
        {prefix ? <Text className="text-[14px] text-muted">{prefix}</Text> : null}
        <Meter value={value} size="md" className="border-0 bg-transparent px-0 py-0" />
        {unit ? <Text className="text-[14px] text-muted">{unit}</Text> : null}
      </View>
      {btn(Plus, atMax, step, `Increase ${label}`)}
    </View>
  );
}

/** Slots 1/2/3 capped by level: chosen = green; locked = dashed. */
export function SlotPicker({ value, onChange, max, total = 3, lockedHint }: { value: number; onChange: (v: number) => void; max: number; total?: number; lockedHint?: string }) {
  return (
    <View accessibilityRole="radiogroup" className="flex-row flex-wrap items-center gap-3">
      {Array.from({ length: total }, (_, i) => i + 1).map((n) => {
        const locked = n > max;
        const on = n === value;
        return (
          <Sink
            key={n}
            onPress={() => onChange(n)}
            disabled={locked}
            haptics="select"
            shadow={on ? 'edge' : 'none'}
            accessibilityRole="radio"
            accessibilityState={{ checked: on, disabled: locked }}
            className={cn('h-16 w-[72px] items-center justify-center rounded-block', on ? 'border-3 border-ink bg-go' : locked ? 'border-2 border-dashed border-line' : 'border-2 border-edge')}>
            <Text className={cn('font-display text-[22px]', on ? 'text-ink' : locked ? 'text-muted' : 'text-fg')}>{n}</Text>
          </Sink>
        );
      })}
      {lockedHint && max < total ? <Text className="max-w-[160px] text-[14px] text-muted">{lockedHint}</Text> : null}
    </View>
  );
}

// ------------------------------------------------------------------ inputs

export interface FieldProps extends TextInputProps {
  label?: string;
  error?: string | null;
  hint?: string;
  className?: string;
  inputClassName?: string;
}

/** Text field: 52px, paper border; focus = 3px yellow + yellow hard shadow; error = coral. */
export const Field = forwardRef<React.ElementRef<typeof TextInput>, FieldProps>(function Field({ label, error, hint, className, inputClassName, editable = true, onFocus, onBlur, ...props }, ref) {
  const [focus, setFocus] = useState(false);
  const input = (
    <TextInput
      ref={ref}
      editable={editable}
      placeholderTextColor={C.muted}
      onFocus={(e) => {
        setFocus(true);
        onFocus?.(e);
      }}
      onBlur={(e) => {
        setFocus(false);
        onBlur?.(e);
      }}
      aria-invalid={!!error}
      className={cn(
        'min-h-[52px] rounded-block px-3.5 text-[16px] text-fg',
        !editable ? 'border-2 border-dashed border-line bg-bg text-muted' : error ? 'border-2 border-mirchi bg-surface' : focus ? 'border-3 border-yellow bg-surface' : 'border-2 border-edge bg-surface',
        inputClassName,
      )}
      style={[{ fontFamily: FONT.body('medium'), outlineStyle: 'none' } as object, props.multiline ? { paddingTop: 14, paddingBottom: 14, textAlignVertical: 'top' } : null]}
      {...props}
    />
  );
  return (
    <View className={cn('gap-2', className)}>
      {label ? <Text className={cn('text-[14px] font-semibold', !editable && 'text-muted')}>{label}</Text> : null}
      {focus && !error ? (
        <HardShadow shadow="yellow" radius={12}>
          {input}
        </HardShadow>
      ) : (
        input
      )}
      {error ? (
        <Text accessibilityRole="alert" className="text-[14px] text-mirchi">
          {error}
        </Text>
      ) : hint ? (
        <Text className="text-[14px] text-muted">{hint}</Text>
      ) : null}
    </View>
  );
});

// ------------------------------------------------------------------ list rows

/** Checklist row (shopping list): ticked = paper box with check + yellow shadow, text struck in green. */
export function CheckRow({ label, sub, checked, onToggle, last }: { label: string; sub?: string; checked: boolean; onToggle: () => void; last?: boolean }) {
  return (
    <Pressable
      onPress={() => {
        haptic.select();
        onToggle();
      }}
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
      className={cn('min-h-[56px] flex-row items-center gap-3.5 px-4 py-2 active:bg-raised', !last && 'border-b-2 border-line')}>
      {checked ? (
        <HardShadow shadow="yellow" depth={2} radius={10} className="h-8 w-8 items-center justify-center rounded-[10px] border-2 border-ink bg-paper">
          <Icon as={Check} size={20} strokeWidth={3.5} className="text-ink" />
        </HardShadow>
      ) : (
        <View className="h-8 w-8 rounded-plate border-2 border-edge" />
      )}
      <View className="flex-1">
        <Text className={cn('text-[17px] font-bold', checked && 'text-muted line-through')} style={checked ? { textDecorationLine: 'line-through', textDecorationColor: C.go } : undefined}>
          {label}
        </Text>
        {sub ? <Text className="text-[14px] text-muted">{sub}</Text> : null}
      </View>
    </Pressable>
  );
}

/** Settings-style navigation row. */
export function ListRow({ label, hint, icon, onPress, right, tone = 'fg', last, chevron = true }: { label: string; hint?: string; icon?: LucideIcon; onPress?: () => void; right?: React.ReactNode; tone?: 'fg' | 'mirchi'; last?: boolean; chevron?: boolean }) {
  return (
    <Pressable onPress={onPress} disabled={!onPress} accessibilityRole={onPress ? 'button' : undefined} className={cn('min-h-[56px] flex-row items-center gap-3.5 px-4 py-3 active:bg-raised', !last && 'border-b-2 border-line')}>
      {icon ? <Icon as={icon} size={22} strokeWidth={2.2} className={tone === 'mirchi' ? 'text-mirchi' : 'text-fg'} /> : null}
      <View className="flex-1 gap-0.5">
        <Text className={cn('text-[16px] font-semibold', tone === 'mirchi' && 'text-mirchi')}>{label}</Text>
        {hint ? <Text className="text-[14px] text-muted">{hint}</Text> : null}
      </View>
      {right}
      {onPress && chevron ? <Icon as={ChevronRight} size={20} className="text-muted" /> : null}
    </Pressable>
  );
}

/** Group of ListRows / CheckRows in one calm bordered block. */
export function ListGroup({ children, className, title }: { children: React.ReactNode; className?: string; title?: string }) {
  return (
    <View className={cn('gap-2', className)}>
      {title ? <Text className="px-1 text-[14px] font-semibold text-muted">{title}</Text> : null}
      <View className="overflow-hidden rounded-block border-2 border-line bg-surface">{children}</View>
    </View>
  );
}

/** Big selectable option card (A3 use, A4 society, radio lists). Selected = yellow border + shadow. */
export function OptionCard({ title, body, selected, onPress, right, left, className }: { title: string; body?: string; selected?: boolean; onPress: () => void; right?: React.ReactNode; left?: React.ReactNode; className?: string }) {
  return (
    <Sink
      onPress={onPress}
      haptics="select"
      shadow={selected ? 'yellow' : 'none'}
      accessibilityRole="radio"
      accessibilityState={{ checked: !!selected }}
      className={cn('flex-row items-center gap-3.5 rounded-block px-4 py-4', selected ? 'border-3 border-yellow bg-surface' : 'border-2 border-line bg-surface', className)}>
      {left}
      <View className="flex-1 gap-0.5">
        <Text className="text-[18px] font-bold">{title}</Text>
        {body ? <Text className="text-[14px] text-muted">{body}</Text> : null}
      </View>
      {right ?? (
        <View className={cn('h-6 w-6 items-center justify-center rounded-pill border-2', selected ? 'border-ink bg-yellow' : 'border-muted')}>
          {selected ? <Icon as={Check} size={14} strokeWidth={3.5} className="text-ink" /> : null}
        </View>
      )}
    </Sink>
  );
}
