/** B4 Shop sheet: neighbours keep the directory accurate (Still open), or pick this shop. */
import { View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Check } from 'lucide-react-native';
import { Alert, Button, Icon, SaveButton, Skeleton, Text, toast } from '@/components/bp';
import { CATEGORY_ICON } from '@/components/map/icons';
import { MapView } from '@/components/map/MapView';
import { useCore, useSession } from '@/components/providers';
import { useShop } from '@/hooks/queries';
import { useNow } from '@/hooks/useNow';
import { aliasFor } from '@/lib/alias';
import { setDraft, useDraft } from '@/lib/draft';
import { fill, useCopy } from '@/lib/i18n';
import { shopPins } from '@/lib/mapModel';
import { placeName } from '@/lib/societies';
import { HardShadow } from '@/components/bp';
import { residentCopy } from '@/screens/resident/copy';
import { InfoRows, SheetScreen, shopAge, useGuestGate, useInvalidate, Rise } from '@/screens/resident/parts';

export default function ShopSheet() {
  const { key } = useLocalSearchParams<{ key: string }>();
  const router = useRouter();
  const core = useCore();
  const c = useCopy(residentCopy);
  const now = useNow();
  const { society } = useSession();
  const draft = useDraft();
  const invalidate = useInvalidate();
  const { guest, guard, sheet } = useGuestGate();
  const q = useShop(key);
  const s = q.data;
  const missing = !q.isLoading && !s;
  const age = s ? shopAge(s, now) : null;
  const pins = s ? shopPins([s], s.key) : [];
  const CatIcon = s ? CATEGORY_ICON[s.category] : null;

  const footer = s ? (
    <View className="flex-row items-start gap-3">
      <View className="flex-1">
        {guest ? (
          <Button label={c.shop.stillOpen} variant="secondary" icon={Check} onPress={guard(() => undefined)} />
        ) : (
          <SaveButton
            label={c.shop.stillOpen}
            savedLabel={c.shop.confirmedLabel}
            variant="secondary"
            icon={Check}
            onSave={() => core.confirmShopOpen(s.key)}
            onDone={() => {
              toast.success(c.shop.confirmedToast);
              void invalidate();
            }}
          />
        )}
      </View>
      {draft.runKey ? (
        <View className="flex-1">
          <Button
            label={c.shop.select}
            onPress={() => {
              setDraft({ shopKey: s.key });
              if (router.canGoBack()) router.back();
              else router.replace(`/run/${draft.runKey}/shops`);
            }}
          />
        </View>
      ) : null}
    </View>
  ) : missing ? (
    <Button label={c.common.back} variant="secondary" onPress={() => (router.canGoBack() ? router.back() : router.replace('/home'))} />
  ) : null;

  return (
    <SheetScreen footer={footer}>
      {missing ? (
        <Alert tone="expired" title={c.shop.gone} body={c.shop.goneBody} />
      ) : !s || !age || !CatIcon ? (
        <View className="gap-3" aria-busy>
          <Skeleton className="h-20 rounded-plate" />
          <Skeleton className="h-[130px] rounded-block" />
          <Skeleton className="h-36 rounded-block" />
        </View>
      ) : (
        <>
          <Rise index={0} className="pr-10">
            <HardShadow shadow="yellow" depth={6} radius={4} className="rounded-plate border-3 border-ink bg-paper p-[3px]">
              <View className="gap-1 rounded-[2px] border-2 border-ink px-3.5 py-3">
                <View className="flex-row items-center gap-2">
                  <Icon as={CatIcon} size={24} className="text-ink" />
                  <Text className="flex-shrink font-display text-[24px] leading-[27px] text-ink">{s.nameTag.toUpperCase()}</Text>
                </View>
                <Text className="text-[15px] font-bold text-ink">
                  {c.shops.cat[s.category]} · {placeName(s.zone)}
                </Text>
              </View>
            </HardShadow>
          </Rise>
          <Rise index={1} className="h-[130px] overflow-hidden rounded-block border-2 border-line">
            <MapView
              style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
              society={{ pos: society.gate, label: fill(c.home.gate, { society: society.name }) }}
              shops={pins}
              fit={[society.gate, ...pins.map((p) => p.pos)]}
              fitKey={s.key}
              padding={{ top: 24, bottom: 24, left: 32, right: 32 }}
            />
          </Rise>
          <Rise index={2}>
            <InfoRows
              rows={[
                { k: c.shop.lastConfirmed, v: age.confirmedDays === 0 ? c.shops.today : age.confirmedDays === 1 ? c.shops.dayAgo : fill(c.shops.daysAgo, { n: age.confirmedDays }) },
                { k: c.shop.disappears, v: age.leftDays <= 1 ? c.shop.disappearsTomorrow : fill(c.shop.disappearsIn, { n: age.leftDays }) },
                { k: c.shop.listedBy, v: aliasFor(s.creator) },
              ]}
            />
          </Rise>
          <Text className="text-[14px] leading-[20px] text-muted">{c.shop.note}</Text>
        </>
      )}
      {sheet}
    </SheetScreen>
  );
}
