import * as React from 'react';
import { Platform, Text as RNText, type Role } from 'react-native';
import { cssInterop } from 'nativewind';
import type { LucideIcon, LucideProps } from 'lucide-react-native';
import { fontStyleFor } from '@/lib/fonts';
import { cn } from '@/lib/utils';

/**
 * Type scale from the design system. display* / title use Archivo Black; the rest Baloo 2.
 * Sentence case everywhere; capitals only on signage (plates, boards, stamps).
 */
const VARIANT = {
  'display-xl': 'font-display text-display-xl',
  display: 'font-display text-display',
  title: 'font-display text-title',
  heading: 'text-heading font-bold',
  body: 'text-body font-medium',
  label: 'text-label font-semibold',
  caption: 'text-caption font-semibold',
  meter: 'font-meter text-meter text-yellow',
  'meter-xl': 'font-meter text-meter-xl text-yellow',
  hindi: 'font-hindi text-title',
} as const;
export type TextVariant = keyof typeof VARIANT;

const TONE = {
  fg: 'text-fg',
  muted: 'text-muted',
  yellow: 'text-yellow',
  go: 'text-go',
  mirchi: 'text-mirchi',
  ink: 'text-ink',
  paper: 'text-paper',
} as const;
export type Tone = keyof typeof TONE;

const ROLE: Partial<Record<TextVariant, Role>> = { 'display-xl': 'heading', display: 'heading', title: 'heading', heading: 'heading' };

/** Lets a parent (e.g. a Button) set the text colour/size of its children. */
export const TextClass = React.createContext<string | undefined>(undefined);

export interface TextProps extends React.ComponentProps<typeof RNText> {
  variant?: TextVariant;
  tone?: Tone;
  className?: string;
}

export function Text({ variant = 'body', tone, className, style, ...props }: TextProps) {
  const inherited = React.useContext(TextClass);
  const cls = cn(VARIANT[variant], tone ? TONE[tone] : !inherited ? 'text-fg' : undefined, inherited, className, Platform.OS === 'web' && 'select-text');
  return <RNText role={ROLE[variant]} className={cls} {...props} style={[fontStyleFor(cls), style]} />;
}

const seen = new WeakSet<object>();
/** Lucide icon that accepts colour classes (text-yellow etc.). Default stroke is bolder for brutal UI. */
export function Icon({ as: C, className, size = 20, strokeWidth = 2.4, ...props }: LucideProps & { as: LucideIcon; className?: string }) {
  if (!seen.has(C)) {
    cssInterop(C, { className: { target: 'style', nativeStyleToProp: { color: true, opacity: true } } });
    seen.add(C);
  }
  return <C className={cn('text-fg', className)} size={size} strokeWidth={strokeWidth} {...props} />;
}
