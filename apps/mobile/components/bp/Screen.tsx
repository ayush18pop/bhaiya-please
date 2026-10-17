/**
 * Screen scaffolding: top bar (back + title), scrollable body, sticky bottom CTA bar, Sunlight scope.
 * Task screens are calm: no decoration, one primary action in the footer.
 */
import { Platform, ScrollView, View, type ScrollViewProps } from 'react-native';
import { useRouter } from 'expo-router';
import { ChevronLeft, X } from 'lucide-react-native';
import { vars } from 'nativewind';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useSession } from '@/components/providers';
import { cn } from '@/lib/utils';
import { IconButton } from './Button';
import { Text } from './Text';
import { Animated, DUR, EASE, FadeIn, FadeInDown, useReducedMotion } from './motion';

/** Sunlight palette (runner road screens): paper background, black ink, white cards. */
export const SUNLIGHT = vars({
  '--c-bg': '245 242 236',
  '--c-fg': '20 20 18',
  '--c-surface': '255 255 255',
  '--c-raised': '255 255 255',
  '--c-line': '20 20 18',
  '--c-muted': '74 72 66',
  '--c-edge': '20 20 18',
});

/** Wrap runner screens: applies Sunlight when the runner turned it on. */
export function SunlightScope({ children, className, force }: { children: React.ReactNode; className?: string; force?: boolean }) {
  const { prefs } = useSession();
  const on = force ?? prefs.sunlight;
  return (
    <View style={on ? SUNLIGHT : undefined} className={cn('flex-1 bg-bg', className)}>
      {children}
    </View>
  );
}

export function TopBar({ title, back = true, close, right, onBack, className, transparent }: { title?: string; back?: boolean; close?: boolean; right?: React.ReactNode; onBack?: () => void; className?: string; transparent?: boolean }) {
  const router = useRouter();
  const goBack = () => {
    if (onBack) return onBack();
    if (router.canGoBack()) router.back();
    else router.replace('/home');
  };
  return (
    <View className={cn('min-h-[56px] flex-row items-center gap-1 px-1.5', !transparent && 'border-b-2 border-line bg-bg', className)}>
      {back || close ? <IconButton icon={close ? X : ChevronLeft} label={close ? 'Close' : 'Back'} onPress={goBack} /> : <View className="w-3" />}
      <Text variant="heading" numberOfLines={1} className="flex-1">
        {title ?? ''}
      </Text>
      {right ? <View className="flex-row items-center">{right}</View> : null}
    </View>
  );
}

export interface ScreenProps {
  title?: string;
  back?: boolean;
  close?: boolean;
  right?: React.ReactNode;
  onBack?: () => void;
  /** Hide the top bar entirely (full-bleed screens). */
  bare?: boolean;
  footer?: React.ReactNode;
  scroll?: boolean;
  children: React.ReactNode;
  className?: string;
  contentClassName?: string;
  /** Runner road screen: honours Sunlight and uses roomier spacing. */
  runner?: boolean;
  /** Extra node above the body (e.g. an alert band). */
  banner?: React.ReactNode;
  scrollProps?: ScrollViewProps;
  /** Top safe-area padding (true when the screen is not under the tab shell header). */
  safeTop?: boolean;
}

export function Screen({ title, back = true, close, right, onBack, bare, footer, scroll = true, children, className, contentClassName, runner, banner, scrollProps, safeTop = true }: ScreenProps) {
  const insets = useSafeAreaInsets();
  const reduce = useReducedMotion();
  const body = (
    <Animated.View
      entering={Platform.OS === 'web' && !reduce ? FadeInDown.duration(DUR.base).easing(EASE) : reduce ? FadeIn.duration(DUR.quick) : undefined}
      className={cn('gap-4 px-4 pb-6 pt-4', runner && 'gap-5', contentClassName)}>
      {children}
    </Animated.View>
  );
  const inner = (
    <View className={cn('flex-1 bg-bg', className)} style={{ paddingTop: safeTop ? insets.top : 0 }}>
      {!bare ? <TopBar title={title} back={back} close={close} right={right} onBack={onBack} /> : null}
      {banner}
      {scroll ? (
        <ScrollView className="flex-1" keyboardShouldPersistTaps="handled" contentContainerStyle={{ flexGrow: 1 }} {...scrollProps}>
          {body}
        </ScrollView>
      ) : (
        <View className="flex-1">{body}</View>
      )}
      {footer ? <Footer runner={runner}>{footer}</Footer> : null}
    </View>
  );
  return runner ? <SunlightScope>{inner}</SunlightScope> : inner;
}

/** Sticky bottom action bar (one primary action, bottom third). */
export function Footer({ children, runner, className }: { children: React.ReactNode; runner?: boolean; className?: string }) {
  return <View className={cn('gap-2.5 border-t-2 border-line bg-bg px-4 pb-4 pt-3', runner && 'pb-5', className)}>{children}</View>;
}

/** Section heading inside a screen. */
export function Section({ title, action, children, className }: { title?: string; action?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <View className={cn('gap-3', className)}>
      {title || action ? (
        <View className="flex-row items-baseline justify-between gap-3">
          {title ? <Text variant="heading">{title}</Text> : <View />}
          {action}
        </View>
      ) : null}
      {children}
    </View>
  );
}
