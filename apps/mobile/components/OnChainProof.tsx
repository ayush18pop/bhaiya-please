import { useState } from 'react';
import { Linking, Pressable, View } from 'react-native';
import { ChevronDown, ChevronUp, ExternalLink, Fingerprint } from 'lucide-react-native';
import type { EntityKey } from '@bhaiya-please/core';
import { AliasChip } from '@/components/AliasChip';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { useInspect } from '@/hooks/queries';
import { dateTime } from '@/lib/format';
import { S } from '@/lib/strings';

function Row({ k, children }: { k: string; children: React.ReactNode }) {
  return (
    <View className="flex-row items-start justify-between gap-3 py-1.5">
      <Text variant="caption" className="w-28 font-mono">{k}</Text>
      <View className="flex-1 items-end">{children}</View>
    </View>
  );
}

/** What judges must see: raw $creator / $owner / readonly / expiresAt straight from core.inspect(key). */
export function OnChainProof({ entityKey }: { entityKey: EntityKey }) {
  const [open, setOpen] = useState(false);
  const q = useInspect(entityKey, open);
  const d = q.data;
  return (
    <View className="rounded-lg border border-dashed border-border bg-muted/50">
      <Pressable onPress={() => setOpen((o) => !o)} className="flex-row items-center justify-between p-3" accessibilityRole="button">
        <View className="flex-row items-center gap-2">
          <Icon as={Fingerprint} size={16} className="text-secondary" />
          <Text className="text-sm font-semibold">{open ? S.proof.hide : S.proof.open}</Text>
        </View>
        <Icon as={open ? ChevronUp : ChevronDown} size={16} className="text-muted-foreground" />
      </Pressable>
      {open && (
        <View className="border-t border-dashed border-border px-3 pb-3">
          {q.isLoading && <Text variant="muted" className="py-2">{S.proof.loading}</Text>}
          {!q.isLoading && !d && <Text variant="muted" className="py-2">{S.proof.missing}</Text>}
          {d && (
            <>
              <Row k={S.proof.type}><Text className="font-mono text-sm">{d.type}</Text></Row>
              <Row k={S.proof.creator}><AliasChip address={d.creator} showHandle={false} size={20} /></Row>
              <Row k={S.proof.owner}><AliasChip address={d.owner} showHandle={false} size={20} /></Row>
              <Row k={S.proof.readonly}>
                <Text className={d.readonly ? 'text-sm font-semibold text-secondary' : 'text-sm'}>{d.readonly ? S.proof.yes : S.proof.no}</Text>
              </Row>
              <Row k={S.proof.expiresAt}><Text className="text-sm">{dateTime(d.expiresAt)}</Text></Row>
              <Row k={S.proof.key}><Text variant="caption" className="font-mono" selectable>{d.key.slice(0, 10)}…{d.key.slice(-6)}</Text></Row>
              {Object.entries(d.attributes).slice(0, 6).map(([k, v]) => (
                <Row key={k} k={k}><Text variant="caption" className="font-mono" numberOfLines={1}>{String(v).length > 22 ? `${String(v).slice(0, 12)}…${String(v).slice(-6)}` : String(v)}</Text></Row>
              ))}
              {d.explorerUrl ? (
                <Pressable onPress={() => Linking.openURL(d.explorerUrl!)} className="mt-1 flex-row items-center gap-1">
                  <Text variant="caption" className="font-semibold text-primary-ink underline">{S.common.explorer}</Text>
                  <Icon as={ExternalLink} size={12} className="text-primary-ink" />
                </Pressable>
              ) : null}
            </>
          )}
        </View>
      )}
    </View>
  );
}
