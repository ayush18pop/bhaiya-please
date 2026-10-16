import { Text, TextClassContext } from '@/components/ui/text';
import { cn } from '@/lib/utils';
import { View, type ViewProps } from 'react-native';

function Card({ className, ...props }: ViewProps) {
  return (
    <TextClassContext.Provider value="text-card-foreground">
      <View className={cn('flex flex-col gap-3 rounded-card border border-border/70 bg-card py-4 shadow-card', className)} {...props} />
    </TextClassContext.Provider>
  );
}
function CardHeader({ className, ...props }: ViewProps) {
  return <View className={cn('flex flex-col gap-1.5 px-4', className)} {...props} />;
}
function CardTitle({ className, ...props }: React.ComponentProps<typeof Text>) {
  return <Text role="heading" aria-level={3} className={cn('text-lg font-semibold leading-none', className)} {...props} />;
}
function CardDescription({ className, ...props }: React.ComponentProps<typeof Text>) {
  return <Text className={cn('text-sm text-muted-foreground', className)} {...props} />;
}
function CardContent({ className, ...props }: ViewProps) {
  return <View className={cn('px-4', className)} {...props} />;
}
function CardFooter({ className, ...props }: ViewProps) {
  return <View className={cn('flex flex-row items-center px-4', className)} {...props} />;
}
export { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle };
