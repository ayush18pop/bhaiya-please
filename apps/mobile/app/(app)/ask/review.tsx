/** B7 Review and send: the commitment moment. Sending creates the handoff code on this phone only. */
import { useState } from 'react';
import type { EntityKey } from '@bhaiya-please/core';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { Alert, BillCard, Button, Empty, PrivacyLine, SaveButton, Screen, Text, TextButton } from '@/components/bp';
import { useCore } from '@/components/providers';
import { useProfile, useRun, useShop } from '@/hooks/queries';
import { useNow } from '@/hooks/useNow';
import { describeError } from '@/hooks/useTx';
import { aliasFor } from '@/lib/alias';
import { useDraft } from '@/lib/draft';
import { appEvent } from '@/lib/events';
import { saveSecret } from '@/lib/handoff';
import { logActivity } from '@/lib/history';
import { fill, useCopy, useT } from '@/lib/i18n';
import { residentCopy } from '@/screens/resident/copy';
import { minsTo, runOpen, useGuestGate, useInvalidate, Rise } from '@/screens/resident/parts';

export default function Review() {
  const router = useRouter();
  const core = useCore();
  const t = useT();
  const c = useCopy(residentCopy);
  const now = useNow();
  const draft = useDraft();
  const invalidate = useInvalidate();
  const { guest, guard, sheet } = useGuestGate();
  const run = useRun(draft.runKey ?? undefined);
  const shop = useShop(draft.shopKey);
  const r = run.data;
  const profile = useProfile(r?.creator);
  const [filled, setFilled] = useState<'full' | 'ended' | null>(null);
  const items = draft.items.map((x) => x.trim()).filter(Boolean);
  const name = r ? aliasFor(r.creator) : '';
  const closed = filled ?? ((!run.isLoading && !r) || (r && !runOpen(r, now)) ? (r && r.capacityLeft <= 0 ? 'full' : 'ended') : null);

  if (!draft.runKey || !draft.shopKey || items.length === 0)
    return (
      <Screen title={c.review.title}>
        <Empty title={c.review.missing} body={c.review.missingBody} action={{ label: c.common.seeOtherRuns, onPress: () => router.replace('/home') }} />
      </Screen>
    );

  const send = async () => {
    const res = await core.postRequest({ runKey: draft.runKey as EntityKey, shopKey: draft.shopKey as EntityKey, items, maxPrice: draft.maxPrice, tip: draft.tip });
    await saveSecret(res.secret);
    logActivity({
      kind: 'request', key: res.key, runKey: draft.runKey!, runner: r?.creator ?? '', shop: shop.data?.nameTag ?? '', items, maxPrice: draft.maxPrice, tip: draft.tip,
      at: Math.floor(Date.now() / 1000), outcome: 'sent',
    });
    appEvent('request.sent');
    void invalidate();
    return res;
  };

  const footer = closed ? (
    <>
      <Alert tone="expired" title={fill(closed === 'full' ? c.review.filled : c.review.ended, { name })} body={c.review.filledBody} />
      <Button label={c.common.seeOtherRuns} onPress={() => router.replace('/home')} />
      <TextButton label={c.review.edit} onPress={() => router.back()} className="self-center" />
    </>
  ) : (
    <>
      {guest ? (
        <Button label={t('request.send')} onPress={guard(() => undefined)} />
      ) : (
        <SaveButton
          label={t('request.send')}
          savingLabel={c.review.sending}
          savedLabel={c.review.sent}
          failedLabel="Couldn't send"
          disabled={!shop.data || !r}
          onSave={send}
          onError={(e) => {
            const code = describeError(e).code;
            if (code === 'CAPACITY_EXHAUSTED') setFilled('full');
            else if (code === 'EXPIRED' || code === 'NOT_FOUND') setFilled('ended');
          }}
          onDone={(res) => router.replace(`/request/${res.key}`)}
        />
      )}
      <TextButton label={c.review.edit} onPress={() => router.back()} className="self-center" />
    </>
  );

  return (
    <Screen title={c.review.title} footer={footer}>
      <Rise index={0}>
        <BillCard shop={shop.data?.nameTag ?? '…'} via={name ? `${name} · ${fill(c.review.arrives, { min: r ? minsTo(r.eta, now) : 0 })}` : undefined} items={items} maxPrice={draft.maxPrice} tip={draft.tip} />
      </Rise>
      <View className="gap-2.5">
        {c.review.how.map((line, i) => (
          <Rise key={i} index={i + 1} className="flex-row items-center gap-3">
            <View className="h-8 w-8 items-center justify-center rounded-plate border-2 border-edge">
              <Text className="font-display text-[14px]">{i + 1}</Text>
            </View>
            <Text className="flex-1 text-[15px] leading-[21px]">{fill(line, { name: name || 'The runner' })}</Text>
          </Rise>
        ))}
      </View>
      <PrivacyLine text={fill(c.review.privacy, { name: name || 'The runner' })} />
      {profile.data && draft.maxPrice > profile.data.tier.priceCap ? <Text className="text-[14px] text-mirchi">{t('request.capHint', { name, cap: profile.data.tier.priceCap })}</Text> : null}
      {sheet}
    </Screen>
  );
}
