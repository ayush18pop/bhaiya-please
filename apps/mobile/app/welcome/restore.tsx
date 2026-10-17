/** A6 Restore your account: scan the recovery QR or paste the key → found account → This is me. */
import { useState } from 'react';
import { ScrollView, View } from 'react-native';
import { useRouter } from 'expo-router';
import { KeyRound, ScanLine } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Avatar, Button, Field, Icon, NamePlate, Sink, Text, TextButton } from '@/components/bp';
import { QrScanner, type ScanFrame } from '@/components/QrScanner';
import { useSession } from '@/components/providers';
import { aliasFor } from '@/lib/alias';
import { pasteText } from '@/lib/clipboard';
import { useCopy, useT } from '@/lib/i18n';
import { walletFromKey, type Wallet } from '@/lib/session';
import { cn } from '@/lib/utils';
import { onboardingCopy } from '@/screens/onboarding/copy';
import { OnbHeader, Rise } from '@/screens/onboarding/parts';

type Step = 'choose' | 'scan' | 'key' | 'found';

/** Pull a 32-byte hex key out of whatever the QR / paste holds (raw key, 0x key, or a link with it). */
function extractKey(text: string): string | null {
  const m = text.match(/(?:0x)?([0-9a-fA-F]{64})(?![0-9a-fA-F])/);
  return m ? `0x${m[1]}` : null;
}

function OptionTile({ icon, title, sub, onPress, shadow }: { icon: typeof ScanLine; title: string; sub: string; onPress: () => void; shadow?: boolean }) {
  return (
    <Sink onPress={onPress} shadow={shadow ? 'yellow' : 'none'} radius={4} style={{ marginRight: 4, marginBottom: 4 }} accessibilityRole="button" accessibilityLabel={`${title}. ${sub}`} className="min-h-[96px] flex-row items-center gap-3.5 rounded-plate border-3 border-ink bg-paper p-4">
      <Icon as={icon} size={36} strokeWidth={2.4} className="text-ink" />
      <View className="flex-1">
        <Text variant="title" className="text-[18px] leading-[22px] text-ink">
          {title}
        </Text>
        <Text className="text-[14px] font-semibold text-ink">{sub}</Text>
      </View>
    </Sink>
  );
}

export default function Restore() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const t = useT();
  const all = useCopy(onboardingCopy);
  const c = all.restore;
  const { restoreAccount } = useSession();
  const [step, setStep] = useState<Step>('choose');
  const [key, setKey] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [frame, setFrame] = useState<ScanFrame>('searching');
  const [found, setFound] = useState<Wallet | null>(null);

  const tryKey = (raw: string): boolean => {
    try {
      const k = extractKey(raw) ?? raw;
      const w = walletFromKey(k);
      if (!/^0x[0-9a-fA-F]{64}$/.test(w.privateKey)) throw new Error('bad');
      setFound(w);
      setErr(null);
      setStep('found');
      return true;
    } catch {
      return false;
    }
  };

  const warning = `${t('backup.keyWarning').replace(/[.।]\s*$/, '')}, ${c.warnTail}`;

  return (
    <View className="flex-1 bg-bg">
      <OnbHeader title={c.title} sub={c.sub} backLabel={all.back} onBack={() => (step === 'choose' ? (router.canGoBack() ? router.back() : router.replace('/welcome')) : (setStep('choose'), setErr(null)))} className="pb-2" />
      <ScrollView className="flex-1" keyboardShouldPersistTaps="handled" contentContainerClassName="gap-3.5 px-4 pt-3" contentContainerStyle={{ flexGrow: 1, paddingBottom: insets.bottom + 20 }}>
        {step === 'choose' ? (
          <>
            <Rise index={0}>
              <OptionTile icon={ScanLine} title={c.scan} sub={c.scanSub} shadow onPress={() => (setFrame('searching'), setStep('scan'))} />
            </Rise>
            <Rise index={1}>
              <OptionTile icon={KeyRound} title={c.key} sub={c.keySub} onPress={() => setStep('key')} />
            </Rise>
          </>
        ) : null}

        {step === 'scan' ? (
          <Rise className="gap-2">
            <QrScanner
              height={360}
              state={frame}
              pill={frame === 'wrong' ? c.notKey : c.scanPill}
              onResult={(text) => {
                if (tryKey(text)) setFrame('detected');
                else setFrame('wrong');
              }}
            />
            <TextButton label={c.useKeyInstead} onPress={() => setStep('key')} />
          </Rise>
        ) : null}

        {step === 'key' ? (
          <Rise className="gap-2">
            <Field
              label={c.keyLabel}
              placeholder={c.keyPh}
              value={key}
              onChangeText={(v) => (setKey(v), setErr(null))}
              secureTextEntry
              autoCapitalize="none"
              autoCorrect={false}
              autoFocus
              error={err}
              onSubmitEditing={() => !tryKey(key) && setErr(c.invalid)}
            />
            <View className="flex-row justify-between">
              <TextButton label={c.paste} onPress={async () => setKey((await pasteText()).trim())} />
              <TextButton label={c.useScanInstead} onPress={() => (setFrame('searching'), setStep('scan'))} />
            </View>
          </Rise>
        ) : null}

        {step === 'found' && found ? (
          <Rise className="gap-3.5 rounded-block border-2 border-go bg-surface p-[18px]">
            <Text className="text-[14px] font-bold text-go">{c.found}</Text>
            <View className="flex-row items-center gap-3">
              <Avatar seed={found.address} size={56} ring="none" />
              <View className="flex-1 gap-1">
                <NamePlate name={aliasFor(found.address)} size={18} />
                <Text className="text-[14px] text-muted">{c.foundSub}</Text>
              </View>
            </View>
            <Button
              label={c.thisIsMe}
              onPress={() => {
                restoreAccount(found);
                router.replace('/home');
              }}
            />
            <TextButton
              label={c.notMe}
              className="self-center"
              onPress={() => {
                setFound(null);
                setKey('');
                setStep('key');
              }}
            />
          </Rise>
        ) : null}

        <View accessibilityRole="alert" className="flex-row overflow-hidden rounded-block border-2 border-mirchi bg-surface">
          <View className="w-1.5 bg-mirchi" />
          <Text className="flex-1 px-3.5 py-3 text-[14px] font-bold leading-[20px]">{warning}</Text>
        </View>

        {step === 'key' ? (
          <View className={cn('mt-auto pt-2')}>
            <Button label={c.restore} disabled={!key.trim()} onPress={() => !tryKey(key) && setErr(c.invalid)} />
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}
