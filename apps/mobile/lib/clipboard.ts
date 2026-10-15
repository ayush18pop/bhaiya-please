import * as Clipboard from 'expo-clipboard';
import { toast } from 'sonner-native';
import { S } from './strings';

export async function copyText(text: string, message: string = S.common.copied) {
  try {
    await Clipboard.setStringAsync(text);
    toast.success(message);
  } catch {
    toast.error('Could not copy');
  }
}

export async function pasteText(): Promise<string> {
  try {
    return await Clipboard.getStringAsync();
  } catch {
    return '';
  }
}
