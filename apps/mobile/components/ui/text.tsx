import * as Slot from '@rn-primitives/slot';
import { cva, type VariantProps } from 'class-variance-authority';
import * as React from 'react';
import { Platform, Text as RNText, type Role } from 'react-native';
import { cn } from '@/lib/utils';
import { fontStyleFor } from '@/lib/fonts';

const textVariants = cva(
  cn('text-base text-foreground', Platform.select({ web: 'select-text' })),
  {
    variants: {
      variant: {
        default: '',
        h1: cn('text-3xl font-extrabold tracking-tight', Platform.select({ web: 'scroll-m-20 text-balance' })),
        h2: cn('text-xl font-bold tracking-tight', Platform.select({ web: 'scroll-m-20' })),
        h3: 'text-lg font-semibold',
        p: 'text-base leading-6',
        small: 'text-sm font-medium leading-none',
        muted: 'text-sm text-muted-foreground',
        caption: 'text-xs text-muted-foreground',
        mono: cn('text-base font-semibold', Platform.select({ web: 'font-mono', default: 'font-mono' })),
      },
    },
    defaultVariants: { variant: 'default' },
  },
);

type TextVariantProps = VariantProps<typeof textVariants>;
type TextVariant = NonNullable<TextVariantProps['variant']>;

const ROLE: Partial<Record<TextVariant, Role>> = { h1: 'heading', h2: 'heading', h3: 'heading' };
const ARIA_LEVEL: Partial<Record<TextVariant, string>> = { h1: '1', h2: '2', h3: '3' };

const TextClassContext = React.createContext<string | undefined>(undefined);

function Text({
  className,
  asChild = false,
  variant = 'default',
  ...props
}: React.ComponentProps<typeof RNText> & TextVariantProps & { asChild?: boolean }) {
  const textClass = React.useContext(TextClassContext);
  const Component = asChild ? Slot.Text : RNText;
  const cls = cn(textVariants({ variant }), textClass, className);
  const isMono = /(?:^|\s)font-mono(?=\s|$)/.test(cls);
  return (
    <Component
      className={cls}
      role={variant ? ROLE[variant] : undefined}
      aria-level={variant ? ARIA_LEVEL[variant] : undefined}
      {...props}
      style={[isMono ? null : fontStyleFor(cls), props.style]}
    />
  );
}

export { Text, TextClassContext };
