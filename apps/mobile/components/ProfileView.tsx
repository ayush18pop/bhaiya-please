import { useState } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { BadgeCheck, HelpCircle, QrCode } from 'lucide-react-native';
import type { Address } from '@bhaiya-please/core';
import { AliasChip } from '@/components/AliasChip';
import { ArkivNote } from '@/components/ArkivNote';
import { ComplaintRow } from '@/components/ComplaintRow';
import { QrDisplay } from '@/components/QrDisplay';
import { ReceiptCard } from '@/components/ReceiptCard';
import { TierBadge } from '@/components/TierBadge';
import { EmptyState, SkeletonCards } from '@/components/Bits';
import { AnimatedNumber } from '@/components/Motion';
import { useSession } from '@/components/providers';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Icon } from '@/components/ui/icon';
import { Separator } from '@/components/ui/separator';
import { Text } from '@/components/ui/text';
import { useProfile, useReceipts } from '@/hooks/queries';
import { copyText } from '@/lib/clipboard';
import { aliasFor } from '@/lib/alias';
import { fmt, monthYear, rupees } from '@/lib/format';
import { encodeAddressQR } from '@/lib/handoff';
import { S } from '@/lib/strings';

const TIER_ROWS = [
  { name: 'New', cap: 200, per: 1 },
  { name: 'Verified', cap: 500, per: 2 },
  { name: 'Trusted', cap: 1000, per: 3 },
];

export function ProfileView({ address, isMe }: { address: Address; isMe?: boolean }) {
  const router = useRouter();
  const { role } = useSession();
  const p = useProfile(address);
  const rc = useReceipts(address);
  const [qr, setQr] = useState(false);
  const d = p.data;

  if (!d) return <SkeletonCards kind="profile" />;
  const receipts = (rc.data ?? []).filter((r) => r.valid).slice(0, 5);
  const viewerIsRunner = !!isMe && role === 'runner';

  return (
    <View className="gap-4">
      <Card className="gap-3 px-4">
        <View className="flex-row items-center justify-between gap-2">
          <AliasChip address={address} link={false} size={36} />
          <TierBadge tier={d.tier} />
        </View>
        <Text variant="muted">Cap {rupees(d.tier.priceCap)} · {d.tier.requestsPerRun} request{d.tier.requestsPerRun > 1 ? 's' : ''}/run</Text>
        {d.receiptsTotal === 0 ? (
          <Text className="font-semibold">{S.profile.noHandoffs}</Text>
        ) : (
          <View className="gap-2">
            <View className="flex-row gap-3">
              <View className="flex-1 rounded-2xl bg-accent px-3 py-2.5">
                <AnimatedNumber value={d.receiptsTotal} className="text-3xl font-extrabold text-accent-foreground" />
                <Text variant="caption" className="font-semibold">{`handoff${d.receiptsTotal === 1 ? '' : 's'}`}</Text>
              </View>
              <View className="flex-1 rounded-2xl bg-muted px-3 py-2.5">
                <AnimatedNumber value={d.distinctResidents} className="text-3xl font-extrabold" />
                <Text variant="caption" className="font-semibold">{`resident${d.distinctResidents === 1 ? '' : 's'}`}</Text>
              </View>
            </View>
            <Text variant="muted">{fmt(S.profile.last30, { n: d.receipts30d, m: d.distinctResidents30d })}</Text>
          </View>
        )}
        {d.invalidReceipts > 0 && <Text variant="caption">{d.invalidReceipts} receipts failed checks and are not counted.</Text>}
      </Card>

      <View className="gap-2">
        <Text variant="h3">{S.profile.vouched}</Text>
        {d.attestations.length === 0 ? (
          <Text variant="muted">{S.profile.noVouch}</Text>
        ) : (
          d.attestations.map((a) => (
            <View key={a.key} className={a.trusted ? 'flex-row items-center gap-2' : 'flex-row items-center gap-2 opacity-50'}>
              <Icon as={a.trusted ? BadgeCheck : HelpCircle} size={18} className={a.trusted ? 'text-secondary' : 'text-muted-foreground'} />
              <View className="flex-1">
                <Text className="font-semibold">
                  {a.trusted ? aliasFor(a.creator) + ' (verifier)' : S.profile.unknownVerifier}
                </Text>
                <Text variant="caption">{a.level.replace('_', ' ')} · {fmt(S.profile.until, { d: monthYear(a.expiresAt) })}</Text>
              </View>
            </View>
          ))
        )}
      </View>

      <Separator />

      <View className="gap-2">
        <View className="flex-row items-center justify-between">
          <Text variant="h3">{S.profile.complaints}: {d.complaints30d}</Text>
        </View>
        {d.complaints.length === 0 ? (
          <Text variant="muted">None.</Text>
        ) : (
          d.complaints.map((c) => <ComplaintRow key={c.key} complaint={c} viewerIsRunner={viewerIsRunner} />)
        )}
      </View>

      <View className="gap-2">
        <Text variant="h3">{S.profile.receipts}</Text>
        {rc.isLoading && !rc.data ? (
          <SkeletonCards n={1} kind="row" />
        ) : receipts.length === 0 ? (
          <EmptyState title={S.profile.noReceipts} />
        ) : (
          receipts.map((r) => <ReceiptCard key={r.receipt.key} receipt={r.receipt} />)
        )}
      </View>

      <Card className="gap-2">
        <CardHeader><CardTitle>{S.profile.tiersTitle}</CardTitle></CardHeader>
        <CardContent className="gap-1.5">
          {TIER_ROWS.map((t) => (
            <View key={t.name} className="flex-row justify-between">
              <Text className="font-semibold">{t.name}</Text>
              <Text variant="muted">{rupees(t.cap)} · {t.per} per run</Text>
            </View>
          ))}
          <Text variant="caption" className="pt-1">Trusted needs 25 receipts from 15 different residents, and fewer than 3 complaints in 30 days.</Text>
        </CardContent>
      </Card>
      <ArkivNote text={S.profile.noScore} explainer="Nothing here is a stored score. Your app reads receipts, complaints and attestations from Arkiv and works the tier out itself, so any other app can apply its own rules to the same records." />

      {isMe && (
        <View className="gap-3">
          <Button variant="outline" onPress={() => setQr((q) => !q)}>
            <Icon as={QrCode} size={18} />
            <Text>{S.profile.showQr}</Text>
          </Button>
          {qr && (
            <View className="items-center gap-3">
              <QrDisplay value={encodeAddressQR(address)} caption={S.profile.qrCaption} />
              <Button variant="soft" onPress={() => copyText(address, 'Address copied')}>
                <Text className="font-mono text-xs">{address.slice(0, 10)}…{address.slice(-8)} · {S.common.copy}</Text>
              </Button>
            </View>
          )}
          <Button variant="ghost" onPress={() => router.push('/wallet')}>
            <Text>{S.profile.wallet}</Text>
          </Button>
        </View>
      )}
    </View>
  );
}
