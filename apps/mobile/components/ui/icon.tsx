import { cn } from '@/lib/utils';
import type { LucideIcon, LucideProps } from 'lucide-react-native';
import { cssInterop } from 'nativewind';

const seen = new WeakSet<object>();

type IconProps = LucideProps & { as: LucideIcon; className?: string };

/** Lucide icon that accepts Tailwind classes (e.g. text-primary). */
function Icon({ as: IconComponent, className, size = 16, ...props }: IconProps) {
  if (!seen.has(IconComponent)) {
    cssInterop(IconComponent, { className: { target: 'style', nativeStyleToProp: { color: true, opacity: true } } });
    seen.add(IconComponent);
  }
  return <IconComponent className={cn('text-foreground', className)} size={size} {...props} />;
}
export { Icon };
