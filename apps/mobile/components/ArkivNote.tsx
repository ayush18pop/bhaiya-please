import { Pressable, View } from 'react-native';
import { Info } from 'lucide-react-native';
import { AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { S } from '@/lib/strings';

/** The small "what Arkiv is doing here" line with an explainer sheet. */
export function ArkivNote({ text, explainer, title = 'Behind the scenes' }: { text: string; explainer?: string; title?: string }) {
  const line = (
    <View className="flex-row items-start gap-1.5">
      <Icon as={Info} size={14} className="mt-0.5 text-muted-foreground" />
      <Text variant="caption" className="flex-1">{text}</Text>
    </View>
  );
  if (!explainer) return line;
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Pressable accessibilityRole="button" accessibilityLabel={`${title}: ${text}`}>{line}</Pressable>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{explainer}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>
            <Text>{S.common.close}</Text>
          </AlertDialogCancel>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
