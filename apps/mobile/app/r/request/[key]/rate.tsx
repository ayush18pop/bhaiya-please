import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, ThumbsUp } from 'lucide-react-native';
import type { ComplaintReason, ReceiptTag } from '@bhaiya-please/core';
import { ArkivNote } from '@/components/ArkivNote';
import { EmptyState, Page, SkeletonCards } from '@/components/Bits';
import { ComplaintRow } from '@/components/ComplaintRow';
import { ReceiptCard } from '@/components/ReceiptCard';
import { TxButton } from '@/components/TxButton';
import { useCore } from '@/components/providers';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Text } from '@/components/ui/text';
import { useRequestStatus } from '@/hooks/queries';
import { aliasFor } from '@/lib/alias';
import { fmt } from '@/lib/format';
import { S } from '@/lib/strings';
import { cn } from '@/lib/utils';

const TAGS: ReceiptTag[] = ['on_time', 'exact_item', 'polite', 'good_price', 'careful_packing'];
const REASONS: ComplaintReason[] = ['no_show', 'wrong_item', 'rude'];

function Chip({ label, on, onPress }: { label: string; on: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="checkbox" accessibilityState={{ checked: on }} className={cn('min-h-10 justify-center rounded-full border-2 px-4', on ? 'border-primary bg-accent' : 'border-border bg-card')}>
      <Text className={cn('text-sm font-semibold', on && 'text-accent-foreground')}>{label}</Text>
    </Pressable>
  );
}

export default function Rate() {
  const { key } = useLocalSearchParams<{ key: string }>();
  const router = useRouter();
  const core = useCore();
  const qc = useQueryClient();
  const q = useRequestStatus(key);
  const s = q.data;
  const [mode, setMode] = useState<'good' | 'problem'>('good');
  const [tags, setTags] = useState<ReceiptTag[]>([]);
  const [reason, setReason] = useState<ComplaintReason>('no_show');

  if (q.isLoading && !s) return <Page><SkeletonCards n={1} /></Page>;
  if (!s?.request)
    return (
      <Page>
        <EmptyState title={S.request.lapsed} />
      </Page>
    );

  // Already rated (or just rated): show the record, read-only.
  if (s.receipt || s.complaint) {
    return (
      <Page footer={<Button size="lg" variant="outline" onPress={() => router.replace('/r')}><Text>{S.runs.title}</Text></Button>}>
        {s.receipt ? (
          <>
            <Text variant="h2">{S.rate.receiptDone}</Text>
            <ReceiptCard receipt={s.receipt} />
            <ArkivNote text={S.arkiv.receipt} explainer="A receipt is a record created by you and handed to the runner in one atomic step. It is marked readonly, so neither of you can change it later. The runner owns it, so it moves with them to any app." title="Why the runner owns it" />
          </>
        ) : (
          <>
            <Text variant="h2">Complaint filed</Text>
            <Text variant="muted">{fmt(S.rate.complaintDone, { who: aliasFor(s.complaint!.rider) })}</Text>
            <ComplaintRow complaint={s.complaint!} viewerIsResident />
          </>
        )}
      </Page>
    );
  }

  const delivery = s.delivery;
  const rider = delivery?.rider;
  const who = rider ? aliasFor(rider) : 'the runner';
  const toggle = (t: ReceiptTag) => setTags((xs) => (xs.includes(t) ? xs.filter((x) => x !== t) : [...xs, t]));

  return (
    <Page
      footer={
        !delivery ? (
          <Button size="lg" disabled><Text>{S.rate.waiting}</Text></Button>
        ) : mode === 'good' ? (
          <TxButton
            size="lg"
            labels={{ idle: fmt(S.rate.giveReceipt, { who }), pending: S.rate.giving, done: S.common.done }}
            onTx={() => core.issueReceipt({ deliveryKey: delivery.key, tags })}
            onDone={() => qc.invalidateQueries()}
          />
        ) : (
          <TxButton
            size="lg"
            variant="destructive"
            labels={{ idle: S.rate.file, pending: S.rate.filing, done: S.common.done }}
            onTx={() => core.fileComplaint({ requestKey: s.request!.key, rider: rider!, reason })}
            onDone={() => qc.invalidateQueries()}
          />
        )
      }>
      <Text variant="h2">{S.rate.title}</Text>
      <Tabs value={mode} onValueChange={(v) => setMode(v as 'good' | 'problem')}>
        <TabsList>
          <TabsTrigger value="good">
            <View className="flex-row items-center gap-1.5">
              <Icon as={ThumbsUp} size={16} />
              <Text className="font-semibold">{S.rate.good}</Text>
            </View>
          </TabsTrigger>
          <TabsTrigger value="problem">
            <View className="flex-row items-center gap-1.5">
              <Icon as={AlertTriangle} size={16} />
              <Text className="font-semibold">{S.rate.problem}</Text>
            </View>
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {mode === 'good' ? (
        <View className="gap-3">
          <View className="flex-row flex-wrap gap-2">
            {TAGS.map((t) => <Chip key={t} label={S.rate.tags[t]} on={tags.includes(t)} onPress={() => toggle(t)} />)}
          </View>
          <ArkivNote text={S.arkiv.receipt} explainer="You create the receipt, then it is handed to the runner. You stay its permanent creator, they hold it, and it is marked readonly so nobody can edit it." title="Receipt ownership" />
        </View>
      ) : (
        <View className="gap-3">
          <View className="flex-row flex-wrap gap-2">
            {REASONS.map((r) => <Chip key={r} label={S.rate.reasons[r]} on={reason === r} onPress={() => setReason(r)} />)}
          </View>
          <ArkivNote text="You will own this record. The runner can't delete it. It fades after 6 months." />
        </View>
      )}
    </Page>
  );
}
