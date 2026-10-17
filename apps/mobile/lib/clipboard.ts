import * as Clipboard from 'expo-clipboard';
import { toast } from '@/components/bp/Sheet';

export async function copyText(text: string, message = 'Copied') {
  try {
    await Clipboard.setStringAsync(text);
    toast.success(message);
  } catch {
    toast.error("Couldn't copy");
  }
}

export async function pasteText(): Promise<string> {
  try {
    return await Clipboard.getStringAsync();
  } catch {
    return '';
  }
}
