/**
 * Materials (design system "Cards and records"): hierarchy comes from material.
 * Surface = lists · Paper = things you hold (your run, bills, receipts, boards) · Glass = only over
 * the map, camera or crowd art (with a solid fallback) · Plates = status.
 */
import { Platform, View, type ViewProps } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { C, cn } from '@/lib/utils';
import { HardShadow, Sink, type ShadowTone } from './Sink';

type CardTone = 'default' | 'calm' | 'selected' | 'dashed' | 'error' | 'muted';
const CARD: Record<CardTone, string> = {
  default: 'bg-surface border-2 border-edge',
  calm: 'bg-surface border-2 border-line',
  selected: 'bg-surface border-3 border-yellow',
  dashed: 'bg-bg border-2 border-dashed border-line',
  error: 'bg-surface border-2 border-mirchi',
  muted: 'bg-surface border-2 border-line opacity-60',
};

export function Card({ tone = 'default', className, children, onPress, shadow, ...rest }: ViewProps & { tone?: CardTone; className?: string; onPress?: () => void; shadow?: ShadowTone }) {
  const cls = cn('rounded-block p-4 gap-3', CARD[tone], className);
  const sh: ShadowTone = shadow ?? (tone === 'selected' ? 'yellow' : 'none');
  if (onPress) {
    return (
      <Sink onPress={onPress} shadow={sh} className={cls} accessibilityRole="button" {...(rest as object)}>
        {children}
      </Sink>
    );
  }
  if (sh !== 'none') {
    return (
      <HardShadow shadow={sh} className={cls}>
        {children}
      </HardShadow>
    );
  }
  return (
    <View className={cls} {...rest}>
      {children}
    </View>
  );
}

/** Paper object on dark: ink text, ink border, optional hard shadow (yellow for "yours"). */
export function Paper({ className, children, shadow = 'none', onPress }: { className?: string; children: React.ReactNode; shadow?: ShadowTone; onPress?: () => void }) {
  const cls = cn('rounded-block border-2 border-ink bg-paper p-4 gap-3', className);
  if (onPress)
    return (
      <Sink onPress={onPress} shadow={shadow} className={cls}>
        {children}
      </Sink>
    );
  return (
    <HardShadow shadow={shadow} className={cls}>
      {children}
    </HardShadow>
  );
}

/** Brutal glass: translucent with blur on web; solid raised fallback on native / reduced transparency. */
export function Glass({ className, children, light, style, ...rest }: ViewProps & { className?: string; light?: boolean }) {
  const web = Platform.OS === 'web';
  const webStyle = web ? ({ backdropFilter: 'blur(16px) saturate(140%)', WebkitBackdropFilter: 'blur(16px) saturate(140%)' } as object) : null;
  return (
    <View
      className={cn(
        'rounded-block border-2',
        light ? (web ? 'border-ink bg-paper/60' : 'border-ink bg-paper') : web ? 'border-paper/85 bg-surface/55' : 'border-paper bg-raised',
        className,
      )}
      style={[webStyle, style]}
      {...rest}>
      {children}
    </View>
  );
}

/** Hand-painted signboard: paper, double frame (shop boards, the gate). */
export function Board({ className, children, dashed, selected }: { className?: string; children: React.ReactNode; dashed?: boolean; selected?: boolean }) {
  return (
    <HardShadow shadow={selected ? 'paper' : 'none'} depth={6} radius={4} className={cn('rounded-plate border-3 p-[3px]', selected ? 'border-ink bg-go' : 'border-ink bg-paper', dashed && 'border-dashed opacity-80')}>
      <View className={cn('rounded-[2px] border-2 px-3.5 py-3 gap-1.5', dashed ? 'border-transparent' : 'border-ink')}>{children}</View>
    </HardShadow>
  );
}

/** Torn bottom edge for bills and receipts (zigzag), drawn in SVG so it works everywhere. */
export function TornEdge({ color = C.paper, stroke = C.ink, height = 12 }: { color?: string; stroke?: string; height?: number }) {
  const teeth = 20;
  const w = 400;
  const step = w / teeth;
  let d = `M0 0 `;
  for (let i = 0; i < teeth; i++) d += `L${i * step + step / 2} ${height - 2} L${(i + 1) * step} 0 `;
  return (
    <Svg width="100%" height={height} viewBox={`0 0 ${w} ${height}`} preserveAspectRatio="none" style={{ marginTop: -1 }}>
      <Path d={`${d} Z`} fill={color} />
      <Path d={d} fill="none" stroke={stroke} strokeWidth={2} />
    </Svg>
  );
}

/** Dashed rule used inside bills and receipts. */
export function DashRule({ className }: { className?: string }) {
  return <View className={cn('border-t-2 border-dashed border-ink', className)} />;
}

/** Thin calm divider on dark. */
export function Rule({ className }: { className?: string }) {
  return <View className={cn('h-[2px] bg-line', className)} />;
}
