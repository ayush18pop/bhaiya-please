import { TextClassContext } from '@/components/ui/text';
import { cn } from '@/lib/utils';
import * as TabsPrimitive from '@rn-primitives/tabs';
import { Platform } from 'react-native';

const Tabs = TabsPrimitive.Root;

function TabsList({ className, ...props }: TabsPrimitive.ListProps) {
  return <TabsPrimitive.List className={cn('h-12 flex-row items-center justify-center rounded-lg bg-muted p-1', className)} {...props} />;
}
function TabsTrigger({ className, ...props }: TabsPrimitive.TriggerProps) {
  const { value } = TabsPrimitive.useRootContext();
  return (
    <TextClassContext.Provider value={cn('text-sm font-semibold', value === props.value ? 'text-foreground' : 'text-muted-foreground')}>
      <TabsPrimitive.Trigger
        className={cn(
          'h-full flex-1 flex-row items-center justify-center rounded-md px-3',
          Platform.select({ web: 'cursor-pointer outline-none' }),
          props.disabled && 'opacity-50',
          props.value === value && 'bg-card shadow-card',
          className,
        )}
        {...props}
      />
    </TextClassContext.Provider>
  );
}
function TabsContent({ className, ...props }: TabsPrimitive.ContentProps) {
  return <TabsPrimitive.Content className={cn(Platform.select({ web: 'outline-none' }), className)} {...props} />;
}
export { Tabs, TabsContent, TabsList, TabsTrigger };
