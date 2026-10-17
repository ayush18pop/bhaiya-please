/** C5 Request detail (runner): full items, shop + Directions, money, resident; Accept / Decline if pending. */
import { View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { Check } from 'lucide-react-native';
import {
  Alert, Avatar, Board, Button, ListGroup, ListRow, Screen, SaveButton, SkeletonCards, StatusRoad, Text,
} from '@/components/bp';
import { useCore } from '@/components/providers';
import { STAGE_INDEX, useRequestStatus, useShop } from '@/hooks/queries';
import { useNow } from '@/hooks/useNow';
import { aliasFor } from '@/lib/alias';
import { appEvent } from '@/lib/events';
import { ago, rupees } from '@/lib/format';
import { fill, t, useCopy } from '@/lib/i18n';
import { runnerCopy } from '@/screens/runner/copy';
import { categoryLabel, DirectionsButton, Money, SunButton, societyName, Rise } from '@/screens/runner/parts';
import { getList, setList, tickId, useRunnerStore } from '@/screens/runner/store';

export default function RunnerRequest() {
  const { key } = useLocalSearchParams<{ key: string }>();
  const router = useRouter();
  const core = useCore();
  const qc = useQueryClient();
  const c = useCopy(runnerCopy);
  const now = useNow();
  const q = useRequestStatus(key);
  const shop = useShop(q.data?.request?.shop);
  useRunnerStore();
  const s = q.data;
  const r = s?.request;
  const pending = !!r && !s?.accept && !s?.decline && !!s?.run && now < (s?.run?.eta ?? 0) + 600;
  const accepted = !!s?.accept && !s?.delivery;
  const runKey = r?.run ?? '';
  const ticks = runKey ? getList(runKey).ticks : {};
  const allBought = !!r && r.items.every((_, i) => ticks[tickId(r.key, i)]);
  const refresh = () => void qc.invalidateQueries();

  let footer: React.ReactNode = null;
  if (r && pending) {
    footer = (
      <View className="flex-row items-start gap-3">
        <View className="w-[124px]">
          <SaveButton
            label={t('run.decline')}
            variant="secondary"
            size="xl"
            savedLabel="Declined"
            onSave={() => core.declineRequest(r.key)}
            onDone={() => {
              refresh();
              router.back();
            }}
          />
        </View>
        <View className="flex-1">
          <SaveButton
            label={t('run.accept')}
            size="xl"
            savedLabel={t('status.accepted')}
            onSave={() => core.acceptRequest(r.key)}
            onDone={() => {
              appEvent('request.accepted');
              refresh();
            }}
            sticky={false}
          />
        </View>
      </View>
    );
  } else if (r && accepted) {
    footer = (
      <>
        <Button
          label={allBought ? c.request.boughtDone : c.request.bought}
          icon={allBought ? Check : undefined}
          variant="secondary"
          size="lg"
          onPress={() => {
            const next = { ...getList(runKey).ticks };
            r.items.forEach((_, i) => (next[tickId(r.key, i)] = !allBought));
            setList(runKey, { ticks: next });
          }}
        />
        <Button label={c.request.openList} size="xl" onPress={() => router.push('/runner/list')} />
      </>
    );
  }

  return (
    <Screen runner title={c.request.title} right={<SunButton className="mr-1.5" />} footer={footer}>
      {q.isLoading ? (
        <SkeletonCards n={2} kind="row" />
      ) : !r ? (
        <Alert tone="expired" title={c.request.gone} actions={<Button label="Back to my run" size="sm" full={false} onPress={() => router.replace('/home')} />} />
      ) : (
        <>
          <Rise index={0} className="flex-row items-center gap-3">
            <Avatar seed={r.creator} size={48} />
            <View className="flex-1 gap-0.5">
              <View className="flex-row items-center gap-2">
                <Text className="text-[18px] font-bold">{aliasFor(r.creator)}</Text>
                {pending ? (
                  <View className="rounded-plate border-2 border-ink bg-yellow px-1.5 py-[2px]">
                    <Text className="font-display text-[10px] leading-[11px] text-ink">NEW</Text>
                  </View>
                ) : null}
              </View>
              <Text className="text-[14px] text-muted">{fill(c.request.sent, { society: societyName(r.destZone), ago: ago(r.createdAt, now) })}</Text>
            </View>
          </Rise>

          <Rise index={1} className="gap-1.5">
            {r.items.map((it, i) => (
              <Text key={i} className="text-[22px] font-bold leading-[28px]">
                {it}
              </Text>
            ))}
          </Rise>

          <Rise index={2}>
            <Board>
              <View className="flex-row items-center gap-3">
                <View className="flex-1 gap-0.5">
                  <Text numberOfLines={1} className="font-display text-[18px] text-ink">
                    {(shop.data?.nameTag ?? 'Shop').toUpperCase()}
                  </Text>
                  <Text className="text-[13px] font-bold text-ink">{fill(c.request.onRoute, { category: categoryLabel(shop.data?.category) })}</Text>
                </View>
                {shop.data ? (
                  <DirectionsButton zone6={shop.data.zone} label={c.request.directions} />
                ) : null}
              </View>
            </Board>
          </Rise>

          <Rise index={3}>
            <ListGroup>
              <ListRow label={c.request.maxPrice} right={<Text className="text-[16px] font-extrabold">{rupees(r.maxPrice)}</Text>} />
              <ListRow label={c.request.tip} right={<Text className="text-[16px] font-extrabold">{rupees(r.tip)}</Text>} last />
            </ListGroup>
          </Rise>

          <Rise index={4} className="flex-row items-center justify-between">
            <Text className="text-[17px] font-bold">{c.request.collect}</Text>
            <Money value={r.maxPrice + r.tip} size="lg" />
          </Rise>

          {s?.accept ? (
            <Rise index={5} className="gap-3">
              <StatusRoad current={STAGE_INDEX[s.stage]} />
              <Text className="text-[15px] text-muted">{s.delivery ? c.request.handed : c.request.accepted}</Text>
            </Rise>
          ) : s?.decline ? (
            <Alert tone="info" title={c.request.declined} />
          ) : !pending ? (
            <Alert tone="expired" title={c.request.gone} />
          ) : null}
        </>
      )}
    </Screen>
  );
}
