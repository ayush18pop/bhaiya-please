import { useEffect, useRef, useState } from 'react';
import { Platform, Pressable, View } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner-native';
import type { EntityKey, Hex } from '@bhaiya-please/core';
import { ArkivNote } from '@/components/ArkivNote';
import { EmptyState, Page } from '@/components/Bits';
import { SuccessBurst } from '@/components/Motion';
import { QrScanner } from '@/components/QrScanner';
import { RequestSummary } from '@/components/RequestSummary';
import { TxBanner } from '@/components/TxBanner';
import { TxButton } from '@/components/TxButton';
import { useCore, useSession } from '@/components/providers';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Input } from '@/components/ui/input';
import { Text } from '@/components/ui/text';
import { useReceipts, useRunnerBoard } from '@/hooks/queries';
import { copyText, pasteText } from '@/lib/clipboard';
import { decodeHandoffQR } from '@/lib/handoff';
import { S } from '@/lib/strings';
import { cn } from '@/lib/utils';

export default function RunnerScan() {
  const core = useCore();
  const qc = useQueryClient();
  const { address } = useSession();
  const board = useRunnerBoard();
  const receipts = useReceipts(address);

  const waiting = (board.data?.rows ?? []).filter((r) => r.accept && !r.delivery);
  const [manual, setManual] = useState(Platform.OS === 'web');
  const [text, setText] = useState('');
  const [reqKey, setReqKey] = useState<string>('');
  const [code, setCode] = useState('');
  const [salt, setSalt] = useState('');
  const [parseErr, setParseErr] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const baseline = useRef<number | null>(null);

  // Receipt for the handoff just recorded -> "+1 handoff".
  const count = receipts.data?.length ?? 0;
  useEffect(() => {
    if (done && baseline.current !== null && count > baseline.current) {
      toast.success('+1 handoff');
      baseline.current = count;
    }
  }, [count, done]);

  const applyText = (t: string) => {
    setText(t);
    setParseErr(null);
    if (!t.trim()) return;
    try {
      const s = decodeHandoffQR(t);
      setReqKey(s.requestKey);
      setCode(s.code);
      setSalt(s.salt);
    } catch {
      setParseErr(S.scan.badText);
    }
  };

  const onScan = (t: string) => {
    applyText(t);
    toast(S.scan.scanned);
  };

  const selected = reqKey || (waiting.length === 1 ? waiting[0].request.key : '');
  const saltHex = (salt.startsWith('0x') ? salt : `0x${salt}`) as Hex;
  const ready = /^\d{4}$/.test(code) && salt.replace(/^0x/, '').length >= 8 && !!selected;

  if (done)
    return (
      <Page className="items-center justify-center">
        <View className="w-full items-center gap-2 rounded-sheet border border-border/60 bg-card px-6 pb-8 pt-4 shadow-lift">
          <SuccessBurst />
          <Text className="text-center text-title font-extrabold">{S.scan.done}</Text>
          <Text variant="muted" className="text-center">{S.scan.doneBody}</Text>
        </View>
        <Button
          variant="outline"
          onPress={() => {
            setDone(false);
            setText('');
            setCode('');
            setSalt('');
            setReqKey('');
          }}>
          <Text>{S.scan.another}</Text>
        </Button>
        <Text variant="caption">{S.scan.anyone}</Text>
      </Page>
    );

  return (
    <Page
      footer={
        waiting.length === 0 ? undefined : (
        <TxButton
          size="lg"
          disabled={!ready}
          labels={{ idle: S.scan.confirm, pending: S.scan.confirming }}
          onTx={() => core.recordDelivery({ secret: { requestKey: selected as EntityKey, code, salt: saltHex } })}
          onDone={() => {
            baseline.current = count;
            setDone(true);
            qc.invalidateQueries();
          }}
        />
        )
      }>
      <Text variant="h2">{S.scan.title}</Text>
      {waiting.length === 0 && !board.isLoading ? (
        <EmptyState title={S.scan.nothing} body="Accept a request first, then scan at the gate." />
      ) : (
        <>
          <QrScanner onResult={onScan} hint={S.scan.point} />
          <Text variant="muted" className="text-center">{S.scan.point}</Text>

          {!manual && (
            <Button variant="outline" onPress={() => setManual(true)}>
              <Text>{S.scan.enterInstead}</Text>
            </Button>
          )}
          {manual && (
            <View className="gap-3 rounded-xl border border-border bg-card p-4">
              <Text className="font-semibold">{S.scan.pasteLabel}</Text>
              <View className="flex-row items-center gap-2">
                <View className="flex-1">
                  <Input value={text} onChangeText={applyText} placeholder={S.scan.pastePlaceholder} autoCapitalize="none" autoCorrect={false} />
                </View>
                <Button variant="outline" onPress={async () => applyText(await pasteText())}>
                  <Text>{S.scan.paste}</Text>
                </Button>
              </View>
              {parseErr ? <Text className="text-sm text-destructive">{parseErr}</Text> : null}
              <Text variant="caption">or type it</Text>
              <View className="flex-row gap-2">
                <View className="w-24">
                  <Input value={code} onChangeText={(v) => setCode(v.replace(/\D/g, '').slice(0, 4))} placeholder="4-digit" keyboardType="number-pad" maxLength={4} accessibilityLabel="4-digit code" />
                </View>
                <View className="flex-1">
                  <Input value={salt} onChangeText={setSalt} placeholder="salt" autoCapitalize="none" autoCorrect={false} accessibilityLabel="Salt" />
                </View>
              </View>
              <View className="gap-2">
                <Text variant="caption">Request</Text>
                {waiting.map(({ request }) => (
                  <Pressable key={request.key} onPress={() => setReqKey(request.key)} accessibilityRole="radio" accessibilityState={{ checked: selected === request.key }} className={cn('rounded-lg border-2 p-3', selected === request.key ? 'border-primary bg-accent/40' : 'border-border')}>
                    <RequestSummary request={request} />
                  </Pressable>
                ))}
              </View>
            </View>
          )}
        </>
      )}
      <ArkivNote text={S.scan.anyone} explainer="The runner checks the code against the fingerprint stored in your request before anything is written. The delivery record then carries the code and salt in public, so anyone can recheck it." />
    </Page>
  );
}
