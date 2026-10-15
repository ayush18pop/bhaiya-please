import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import type { Address, AttestationLevel } from '@bhaiya-please/core';
import { ArkivNote } from '@/components/ArkivNote';
import { Page } from '@/components/Bits';
import { AliasChip } from '@/components/AliasChip';
import { QrScanner } from '@/components/QrScanner';
import { TierBadge } from '@/components/TierBadge';
import { TxButton } from '@/components/TxButton';
import { useCore, useSession } from '@/components/providers';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Text } from '@/components/ui/text';
import { useProfile } from '@/hooks/queries';
import { pasteText } from '@/lib/clipboard';
import { aliasFor } from '@/lib/alias';
import { decodeAddressQR } from '@/lib/handoff';
import { S } from '@/lib/strings';
import { cn } from '@/lib/utils';

const LEVELS: { id: AttestationLevel; label: string }[] = [
  { id: 'id_checked', label: S.verifier.idChecked },
  { id: 'resident', label: S.verifier.resident },
];

export default function VerifierConsole() {
  const core = useCore();
  const qc = useQueryClient();
  const { address: me } = useSession();
  const [text, setText] = useState('');
  const [subject, setSubject] = useState<Address | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [level, setLevel] = useState<AttestationLevel>('id_checked');
  const profile = useProfile(subject);

  const lookup = (t: string) => {
    setText(t);
    setErr(null);
    if (!t.trim()) return setSubject(null);
    try {
      setSubject(decodeAddressQR(t));
    } catch {
      setSubject(null);
      setErr(S.verifier.badAddr);
    }
  };

  const p = profile.data;
  const mine = p?.attestations.find((a) => a.creator.toLowerCase() === me?.toLowerCase() && a.level === level);

  return (
    <Page
      footer={
        subject ? (
          <TxButton
            size="lg"
            disabled={!!mine || !p}
            labels={{ idle: mine ? S.verifier.already : S.verifier.issue, pending: S.verifier.issuing, done: S.verifier.already }}
            onTx={() => core.issueAttestation({ subject, level })}
            onDone={() => qc.invalidateQueries()}
            toastDone={`${aliasFor(subject)} — attested`}
          />
        ) : undefined
      }>
      <Text variant="h2">{S.verifier.title}</Text>
      <QrScanner onResult={(t) => lookup(t)} />
      <View className="gap-2">
        <Text className="font-semibold">{S.verifier.paste}</Text>
        <View className="flex-row items-center gap-2">
          <View className="flex-1">
            <Input value={text} onChangeText={lookup} placeholder={S.verifier.pastePlaceholder} autoCapitalize="none" autoCorrect={false} />
          </View>
          <Button variant="outline" onPress={async () => lookup(await pasteText())}>
            <Text>{S.scan.paste}</Text>
          </Button>
        </View>
        {err ? <Text className="text-sm text-destructive">{err}</Text> : null}
      </View>

      {subject && (
        <Card className="gap-3 px-4">
          <AliasChip address={subject} />
          <View className="flex-row items-center gap-2">
            <Text variant="muted">Current:</Text>
            {p ? <TierBadge tier={p.tier} showCap /> : <Text variant="muted">…</Text>}
          </View>
          <Text className="font-semibold">{S.verifier.level}</Text>
          <View className="gap-2" accessibilityRole="radiogroup">
            {LEVELS.map((l) => (
              <Pressable key={l.id} onPress={() => setLevel(l.id)} accessibilityRole="radio" accessibilityState={{ checked: level === l.id }} className={cn('min-h-12 justify-center rounded-lg border-2 px-4', level === l.id ? 'border-primary bg-accent/40' : 'border-border')}>
                <Text className="font-semibold">{l.label}</Text>
              </Pressable>
            ))}
          </View>
          <Text variant="caption">{S.verifier.validity}</Text>
        </Card>
      )}
      <Text variant="muted">{S.verifier.checkIdNote}</Text>
      <ArkivNote text="You own this record, so you can revoke it. It expires on its own after 180 days." explainer="An attestation is a readonly record created by your wallet. The runner's tier rises only for apps that trust your address. You can delete it any time; it also expires by itself." />
    </Page>
  );
}
