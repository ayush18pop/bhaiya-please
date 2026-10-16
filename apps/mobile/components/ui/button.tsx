import { TextClassContext } from '@/components/ui/text';
import { cn } from '@/lib/utils';
import { cva, type VariantProps } from 'class-variance-authority';
import { Platform } from 'react-native';
import { PressScale } from '@/components/ui/pressable-scale';
import { haptic } from '@/lib/haptics';

const buttonVariants = cva(
  cn(
    'group shrink-0 flex-row items-center justify-center gap-2 rounded-xl',
    Platform.select({ web: 'cursor-pointer outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring' }),
  ),
  {
    variants: {
      variant: {
        default: 'bg-primary shadow-cta active:opacity-90',
        destructive: 'bg-destructive active:opacity-90',
        outline: 'border border-input bg-card shadow-card active:bg-accent',
        secondary: 'bg-secondary active:opacity-90',
        soft: 'bg-accent active:opacity-80',
        ghost: 'active:bg-accent',
        link: '',
      },
      size: {
        default: 'min-h-12 px-5 py-2.5',
        sm: 'min-h-10 gap-1.5 rounded-lg px-3.5',
        lg: 'min-h-14 px-8',
        icon: 'h-11 w-11',
      },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  },
);

const buttonTextVariants = cva('text-base font-bold', {
  variants: {
    variant: {
      default: 'text-primary-foreground',
      destructive: 'text-destructive-foreground',
      outline: 'text-foreground',
      secondary: 'text-secondary-foreground',
      soft: 'text-accent-foreground',
      ghost: 'text-foreground',
      link: 'text-primary-ink underline',
    },
    size: { default: '', sm: 'text-sm', lg: 'text-lg', icon: '' },
  },
  defaultVariants: { variant: 'default', size: 'default' },
});

type ButtonProps = React.ComponentProps<typeof PressScale> & VariantProps<typeof buttonVariants>;

function Button({ className, variant, size, disabled, onPress, ...props }: ButtonProps) {
  return (
    <TextClassContext.Provider value={buttonTextVariants({ variant, size })}>
      <PressScale
        className={cn(disabled && 'opacity-50', buttonVariants({ variant, size }), className)}
        role="button"
        disabled={disabled}
        scaleTo={variant === 'link' || variant === 'ghost' ? 0.98 : 0.965}
        onPress={onPress ? (e) => { haptic.tap(); onPress(e); } : undefined}
        {...props}
      />
    </TextClassContext.Provider>
  );
}

export { Button, buttonTextVariants, buttonVariants };
export type { ButtonProps };
