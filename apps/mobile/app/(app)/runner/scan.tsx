/**
 * C8 Scan handoff code: full-screen camera (or paste the handoff link). The code is checked against
 * this run's requests BEFORE anything is saved; then "Hand over to <name>?" → Confirm handoff → C9.
 */
import { useMemo, useState } from 'react';
import { Platform, ScrollView, useWindowDimensions, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { Check, ClipboardPaste, Link2, X } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  Button, Empty, Field, Glass, Icon, IconButton, SaveButton, Sheet, SunlightScope, Text, TextButton,
} from '@/components/bp';
import { QrScanner, type ScanFrame } from '@/components/QrScanner';
import { useCore } from '@/components/providers';
import { aliasFor } from '@/lib/alias';
import { pasteText } from '@/lib/clipboard';
import { appEvent } from '@/lib/events';
import { haptic } from '@/lib/haptics';
import { fill, t, useCopy } from '@/lib/i18n';
import { runnerCopy } from '@/screens/runner/copy';
import { checkHandoff, type HandoffCheck } from '@/screens/runner/handoffCheck';
import { useActiveRun } from '@/screens/runner/parts';

export default function ScanHandoff() {
  const router = useRouter();
  const core = useCore();
  const qc = useQueryClient();
  const c = useCopy(runnerCopy);
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const params = useLocalSearchParams<{ request?: string }>();
  const a = useActiveRun();
  const web = Platform.OS === 'web';

  const [target, setTarget] = useState<string | null>(params.request ?? null);
  const [result, setResult] = useState<HandoffCheck | null>(null);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [text, setText] = useState('');

  const targetRow = useMemo(() => a.rows.find((r) => r.request.key === target) ?? (a.waiting.length === 1 ? a.waiting[0] : undefined), [a.rows, a.waiting, target]);
  const name = targetRow ? aliasFor(targetRow.request.creator) : null;
  const frame: ScanFrame = !result ? 'searching' : result.kind === 'ok' ? 'detected' : 'wrong';

  const check = (raw: string) => {
    if (!raw.trim()) return;
    const r = checkHandoff(raw, a.rows, targetRow?.request.key ?? null);
    setResult(r);
    if (r.kind === 'ok') {
      haptic.success();
      setTarget(r.row.request.key);
      setPasteOpen(false);
    } else haptic.error();
  };
  const reset = () => {
    setResult(null);
    setText('');
  };

  const okRow = result?.kind === 'ok' ? result.row : null;
  const wrongText =
    result?.kind === 'other'
      ? fill(c.scan.otherRequest, { name: aliasFor(result.row.request.creator) })
      : result?.kind === 'nomatch'
        ? c.scan.noMatch
        : result?.kind === 'bad'
          ? c.scan.bad
          : result?.kind === 'already'
            ? c.scan.already
            : null;
  const wrongBody = result?.kind === 'nomatch' ? c.scan.noMatchBody : result?.kind === 'already' ? c.scan.alreadyBody : null;

  const pastePanel = (
    <View className="gap-3">
      <Field label={c.scan.pasteField} value={text} onChangeText={setText} placeholder="https://…/h#…" autoCapitalize="none" autoCorrect={false} multiline inputClassName="min-h-[72px]" />
      <View className="flex-row gap-2.5">
        <View className="flex-1">
          <Button
            label={c.scan.pasteBtn}
            icon={ClipboardPaste}
            variant="secondary"
            size="lg"
            onPress={async () => {
              const v = await pasteText();
              setText(v);
              check(v);
            }}
          />
        </View>
      </View>
      <Button label={c.scan.check} size="xl" disabled={!text.trim()} onPress={() => check(text)} />
    </View>
  );

  if (!a.board.isLoading && !a.waiting.length && !okRow) {
    return (
      <SunlightScope>
        <View className="flex-1 gap-4 bg-bg px-4" style={{ paddingTop: insets.top + 12 }}>
          <IconButton icon={X} label={c.scan.close} onPress={() => (router.canGoBack() ? router.back() : router.replace('/home'))} />
          <Empty title={c.scan.nothing} body={c.scan.nothingBody} action={{ label: 'Back to my run', onPress: () => router.replace('/home') }} />
        </View>
      </SunlightScope>
    );
  }

  const camHeight = Math.max(300, height - insets.top - insets.bottom - (web ? 380 : 170));

  return (
    <View className="flex-1 bg-[#0D0D0B]" style={{ paddingTop: insets.top }}>
      <ScrollView className="flex-1" contentContainerStyle={{ paddingBottom: insets.bottom + 16 }} keyboardShouldPersistTaps="handled">
        <QrScanner
          onResult={check}
          active={!okRow}
          state={frame}
          pill={!result ? c.scan.point : undefined}
          height={camHeight}
          className="rounded-none border-0"
          top={
            <View className="flex-row items-center gap-2.5">
              <IconButton icon={X} label={c.scan.close} glass size={56} onPress={() => (router.canGoBack() ? router.back() : router.replace('/home'))} />
              {name ? (
                <Glass className="flex-1 justify-center px-3.5 py-2.5">
                  <Text numberOfLines={2} className="text-[16px] font-bold leading-[20px] text-paper">
                    {fill(result && result.kind !== 'ok' ? c.scan.wrongLabel : c.scan.handingTo, { name })}
                  </Text>
                </Glass>
              ) : null}
            </View>
          }
        />

        <View className="gap-3 px-4 pt-4">
          {wrongText ? (
            <View accessibilityRole="alert" className="gap-2.5 rounded-block border-2 border-mirchi bg-surface p-4">
              <Text className="text-[18px] font-bold text-mirchi">{wrongText}</Text>
              {wrongBody ? <Text className="text-[15px] leading-[21px] text-muted">{wrongBody}</Text> : null}
              <View className="flex-row flex-wrap gap-2.5">
                {result?.kind === 'other' ? (
                  <Button
                    label={fill(c.scan.switchTo, { name: aliasFor(result.row.request.creator) })}
                    size="lg"
                    full={false}
                    onPress={() => {
                      setTarget(result.row.request.key);
                      setResult({ kind: 'ok', secret: result.secret, row: result.row });
                      haptic.success();
                    }}
                  />
                ) : null}
                {result?.kind === 'already' ? (
                  <Button label="See handoff" size="lg" full={false} onPress={() => router.replace(`/runner/done?request=${result.row.request.key}`)} />
                ) : null}
                <Button label={c.scan.again} variant="secondary" size="lg" full={false} onPress={reset} />
              </View>
            </View>
          ) : null}

          {web ? (
            <View className="gap-2 rounded-block border-2 border-line bg-surface p-4">
              <View className="flex-row items-center gap-2">
                <Icon as={Link2} size={20} className="text-yellow" />
                <Text className="text-[17px] font-bold">{c.scan.pasteTitle}</Text>
              </View>
              <Text className="text-[14px] leading-[20px] text-muted">{c.scan.pasteBody}</Text>
              {pastePanel}
            </View>
          ) : (
            <TextButton label={c.scan.paste} icon={Link2} tone="yellow" className="self-center" onPress={() => setPasteOpen(true)} />
          )}
        </View>
      </ScrollView>

      <Sheet open={pasteOpen} onClose={() => setPasteOpen(false)} title={c.scan.pasteTitle}>
        <Text className="text-[15px] leading-[21px] text-muted">{c.scan.pasteBody}</Text>
        {pastePanel}
      </Sheet>

      <Sheet open={!!okRow} onClose={reset}>
        {okRow && result?.kind === 'ok' ? (
          <>
            <View className="flex-row items-center gap-2">
              <Icon as={Check} size={18} strokeWidth={3} className="text-go" />
              <Text className="text-[15px] font-bold text-go">{c.scan.matches}</Text>
            </View>
            <Text variant="title">{fill(c.scan.confirmTitle, { name: aliasFor(okRow.request.creator) })}</Text>
            <Text className="text-[16px] text-muted">{okRow.request.items.join(' · ')}</Text>
            <SaveButton
              label={t('run.confirmHandoff')}
              size="xl"
              savedLabel={t('run.handoffSaved')}
              onSave={() => core.recordDelivery({ secret: result.secret })}
              onDone={() => {
                appEvent('handoff.saved');
                void qc.invalidateQueries();
                router.replace(`/runner/done?request=${okRow.request.key}`);
              }}
              doneDelay={350}
            />
            <Button label={c.scan.again} variant="secondary" size="lg" onPress={reset} />
          </>
        ) : null}
      </Sheet>
    </View>
  );
}
