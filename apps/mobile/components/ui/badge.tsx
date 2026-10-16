import { TextClassContext } from '@/components/ui/text';
import { cn } from '@/lib/utils';
import * as Slot from '@rn-primitives/slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { View, type ViewProps } from 'react-native';

const badgeVariants = cva('flex-row items-center gap-1 rounded-full border border-transparent px-2.5 py-1', {
  variants: {
    variant: {
      default: 'bg-primary',
      secondary: 'bg-secondary',
      destructive: 'bg-destructive',
      outline: 'border-border bg-transparent',
      muted: 'bg-muted',
      accent: 'bg-accent',
      warning: 'bg-warning',
    },
  },
  defaultVariants: { variant: 'default' },
});

const badgeTextVariants = cva('text-xs font-bold', {
  variants: {
    variant: {
      default: 'text-primary-foreground',
      secondary: 'text-secondary-foreground',
      destructive: 'text-destructive-foreground',
      outline: 'text-foreground',
      muted: 'text-muted-foreground',
      accent: 'text-accent-foreground',
      warning: 'text-warning-foreground',
    },
  },
  defaultVariants: { variant: 'default' },
});

type BadgeProps = ViewProps & { asChild?: boolean } & VariantProps<typeof badgeVariants>;

function Badge({ className, variant, asChild, ...props }: BadgeProps) {
  const Component = asChild ? Slot.View : View;
  return (
    <TextClassContext.Provider value={badgeTextVariants({ variant })}>
      <Component className={cn(badgeVariants({ variant }), className)} {...props} />
    </TextClassContext.Provider>
  );
}
export { Badge, badgeTextVariants, badgeVariants };
