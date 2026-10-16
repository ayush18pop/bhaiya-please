import { cn } from '@/lib/utils';
import { fontStyleFor } from '@/lib/fonts';
import { Platform, TextInput, type TextInputProps } from 'react-native';

function Input({ className, editable, ...props }: TextInputProps) {
  return (
    <TextInput
      className={cn(
        'min-h-12 w-full min-w-0 flex-row items-center rounded-lg border border-input bg-card px-3 py-2 text-base text-foreground',
        editable === false && 'opacity-50',
        Platform.select({ web: 'outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40' }),
        className,
      )}
      placeholderTextColor="#8a8f98"
      editable={editable}
      {...props}
      style={[fontStyleFor('font-medium'), props.style]}
    />
  );
}
function Textarea({ className, ...props }: TextInputProps) {
  return <Input multiline numberOfLines={3} textAlignVertical="top" className={cn('min-h-20', className)} {...props} />;
}
export { Input, Textarea };
