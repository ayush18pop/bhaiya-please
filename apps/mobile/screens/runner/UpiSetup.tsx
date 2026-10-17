/** Optional runner UPI QR (C1, C9): text saved on this phone only, shown at the gate. */
import { useState } from 'react';
import { View } from 'react-native';
import { Check, ClipboardPaste, Plus, QrCode } from 'lucide-react-native';
import { Button, Field, Icon, Text } from '@/components/bp';
import { useSession } from '@/components/providers';
import { pasteText } from '@/lib/clipboard';
import { haptic } from '@/lib/haptics';
import { useCopy } from '@/lib/i18n';
import { runnerCopy } from './copy';
import { normalizeUpi, upiId } from './upi';

/** Optional: save the runner's UPI QR text on this phone only. */
export function UpiSetup() {
  const c = useCopy(runnerCopy);
  const { prefs, setPrefs } = useSession();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const saved = upiId(prefs.upi) ?? (prefs.upi ? 'UPI QR' : null);
  const save = (v: string) => {
    setText(v);
    const q = normalizeUpi(v);
    if (q) {
      setErr(null);
      setPrefs({ upi: q });
      setOpen(false);
      haptic.success();
    } else if (v.trim().length > 4) setErr(c.setup.upiInvalid);
  };
  return (
    <View className="gap-3 rounded-block border-2 border-dashed border-line p-4">
      <View className="flex-row items-center gap-3">
        <Icon as={QrCode} size={24} className="text-yellow" />
        <View className="flex-1">
          <Text className="text-[16px] font-bold">{c.setup.upiTitle}</Text>
          <Text className="text-[14px] text-muted">{c.setup.upiBody}</Text>
        </View>
      </View>
      {saved && !open ? (
        <View className="flex-row items-center gap-2.5">
          <Icon as={Check} size={18} strokeWidth={3} className="text-go" />
          <Text className="flex-1 text-[15px] font-bold">
            {saved} · {c.setup.upiSaved}
          </Text>
          <Button label={c.setup.upiRemove} variant="secondary" size="sm" full={false} onPress={() => setPrefs({ upi: null })} />
        </View>
      ) : open ? (
        <View className="gap-2.5">
          <Field label={c.setup.upiLabel} placeholder={c.setup.upiPlaceholder} value={text} onChangeText={save} autoCapitalize="none" autoCorrect={false} error={err} onSubmitEditing={() => save(text)} />
          <Button label={c.setup.upiPaste} icon={ClipboardPaste} variant="secondary" size="md" full={false} onPress={async () => save(await pasteText())} />
        </View>
      ) : (
        <Button label="Add UPI QR" icon={Plus} variant="secondary" size="md" full={false} onPress={() => setOpen(true)} />
      )}
    </View>
  );
}
