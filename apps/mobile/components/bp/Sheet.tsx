/**
 * Bottom sheets (raised surface, 18px top radius, paper border, spring 380/36) and confirm sheets
 * (mela-light top edge for confirms that need a glance). Brutal toasts live here too.
 */
import { useEffect, useState, useSyncExternalStore } from 'react';
import { Modal, Pressable, ScrollView, View, useWindowDimensions } from 'react-native';
import { AlertCircle, Check, Info } from 'lucide-react-native';
import Animated, { FadeInDown, FadeOut, runOnJS, useAnimatedStyle, useReducedMotion, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { haptic } from '@/lib/haptics';
import { cn } from '@/lib/utils';
import { Button } from './Button';
import { MelaLights } from './Signatures';
import { HardShadow } from './Sink';
import { Icon, Text } from './Text';
import { DUR, EASE, SHEET_SPRING } from './motion';

export function Sheet({ open, onClose, children, lights, title, scroll, className }: { open: boolean; onClose: () => void; children: React.ReactNode; lights?: boolean; title?: string; scroll?: boolean; className?: string }) {
  const reduce = useReducedMotion();
  const { height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [mounted, setMounted] = useState(open);
  const y = useSharedValue(height);
  const fade = useSharedValue(0);
  useEffect(() => {
    if (open) {
      setMounted(true);
      fade.value = withTiming(1, { duration: DUR.base });
      y.value = reduce ? 0 : withSpring(0, SHEET_SPRING);
    } else if (mounted) {
      fade.value = withTiming(0, { duration: DUR.quick });
      y.value = withTiming(reduce ? 0 : height, { duration: DUR.base, easing: EASE }, (fin) => {
        if (fin) runOnJS(setMounted)(false);
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  const sheet = useAnimatedStyle(() => ({ transform: [{ translateY: y.value }] }));
  const back = useAnimatedStyle(() => ({ opacity: fade.value * 0.6 }));
  if (!mounted) return null;
  const Body = scroll ? ScrollView : View;
  return (
    <Modal transparent visible animationType="none" onRequestClose={onClose} statusBarTranslucent>
      <View className="flex-1 items-center justify-end">
        <Animated.View style={[{ position: 'absolute', inset: 0, backgroundColor: '#000' }, back]}>
          <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={onClose} style={{ flex: 1 }} />
        </Animated.View>
        <Animated.View style={[{ width: '100%', maxWidth: 480, maxHeight: '88%' }, sheet]} className={cn('overflow-hidden rounded-t-sheet border-2 border-b-0 border-edge bg-raised', className)}>
          {lights ? <MelaLights height={14} className="border-b-2 border-ink" /> : null}
          <View className="items-center pt-2.5">
            <View className="h-1.5 w-12 rounded-[2px] bg-fg" />
          </View>
          <Body className="px-5" contentContainerClassName={scroll ? 'gap-3.5 pt-3' : undefined} style={!scroll ? { paddingTop: 12, gap: 14, paddingBottom: insets.bottom + 20 } : undefined} contentContainerStyle={scroll ? { paddingBottom: insets.bottom + 20 } : undefined}>
            {title ? <Text variant="heading">{title}</Text> : null}
            {children}
          </Body>
        </Animated.View>
      </View>
    </Modal>
  );
}

/** Confirm sheet: question, consequence line, two buttons (or a custom confirm, e.g. a SaveButton). */
export function ConfirmSheet({
  open, onClose, title, body, confirmLabel, onConfirm, destructive, cancelLabel = 'Go back', confirm, lights = true, children,
}: {
  open: boolean; onClose: () => void; title: string; body?: string; confirmLabel?: string; onConfirm?: () => void; destructive?: boolean; cancelLabel?: string;
  confirm?: React.ReactNode; lights?: boolean; children?: React.ReactNode;
}) {
  return (
    <Sheet open={open} onClose={onClose} lights={lights}>
      <Text variant="heading">{title}</Text>
      {body ? <Text className="text-[15px] leading-[21px] text-muted">{body}</Text> : null}
      {children}
      {confirm ?? (
        <View className="flex-row gap-3 pt-1">
          <View className="flex-1">
            <Button label={cancelLabel} variant="secondary" size="lg" onPress={onClose} />
          </View>
          <View className="flex-1">
            <Button label={confirmLabel ?? 'Confirm'} variant={destructive ? 'destructive' : 'primary'} size="lg" onPress={onConfirm} />
          </View>
        </View>
      )}
    </Sheet>
  );
}

// ------------------------------------------------------------------ toasts

type ToastKind = 'success' | 'error' | 'info';
interface ToastItem {
  id: number;
  kind: ToastKind;
  text: string;
  action?: { label: string; onPress: () => void };
}
let items: ToastItem[] = [];
let nextId = 1;
const subs = new Set<() => void>();
const emit = () => subs.forEach((f) => f());
function push(kind: ToastKind, text: string, action?: ToastItem['action'], ms = 3200) {
  const id = nextId++;
  items = [...items.slice(-2), { id, kind, text, action }];
  emit();
  if (kind === 'success') haptic.success();
  else if (kind === 'error') haptic.error();
  setTimeout(() => dismiss(id), action ? ms + 2500 : ms);
}
function dismiss(id: number) {
  items = items.filter((x) => x.id !== id);
  emit();
}

export const toast = Object.assign((text: string) => push('info', text), {
  success: (text: string) => push('success', text),
  error: (text: string, action?: ToastItem['action']) => push('error', text, action),
  info: (text: string, action?: ToastItem['action']) => push('info', text, action),
});

/** Mount once at the root. Paper toasts with a coloured hard shadow drop in from the top (220ms). */
export function Toaster() {
  const list = useSyncExternalStore(
    (cb) => {
      subs.add(cb);
      return () => subs.delete(cb);
    },
    () => items,
    () => items,
  );
  const insets = useSafeAreaInsets();
  return (
    <View pointerEvents="box-none" style={{ position: 'absolute', top: insets.top + 10, left: 0, right: 0, alignItems: 'center', zIndex: 1000 }}>
      {list.map((x) => (
        <Animated.View key={x.id} entering={FadeInDown.duration(DUR.base).easing(EASE)} exiting={FadeOut.duration(DUR.quick)} style={{ width: '92%', maxWidth: 420, marginBottom: 8 }}>
          <HardShadow
            shadow={x.kind === 'success' ? 'go' : x.kind === 'error' ? 'mirchi' : 'ink'}
            className="flex-row items-center gap-3 rounded-block border-2 border-ink bg-paper px-4 py-3.5">
            <Icon as={x.kind === 'success' ? Check : x.kind === 'error' ? AlertCircle : Info} size={22} strokeWidth={x.kind === 'success' ? 3 : 2.6} className="text-ink" />
            <Text accessibilityRole={x.kind === 'error' ? 'alert' : 'text'} className="flex-1 text-[16px] font-bold text-ink">
              {x.text}
            </Text>
            {x.action ? (
              <Pressable
                onPress={() => {
                  x.action!.onPress();
                  dismiss(x.id);
                }}
                className="h-9 justify-center rounded-plate bg-ink px-2.5">
                <Text className="text-[14px] font-bold text-paper">{x.action.label}</Text>
              </Pressable>
            ) : null}
          </HardShadow>
        </Animated.View>
      ))}
    </View>
  );
}
