import { Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import type { Address } from '@bhaiya-please/core';
import { Avatar } from '@/components/ui/avatar';
import { Text } from '@/components/ui/text';
import { aliasFor, hueFor, initials, shortAddr } from '@/lib/alias';
import { useSession } from '@/components/providers';

export function AliasChip({ address, showHandle = true, link = true, size = 28 }: { address: Address; showHandle?: boolean; link?: boolean; size?: number }) {
  const router = useRouter();
  const { address: me } = useSession();
  const alias = aliasFor(address);
  const isMe = me?.toLowerCase() === address.toLowerCase();
  const body = (
    <View className="flex-row items-center gap-2">
      <Avatar label={initials(alias)} hue={hueFor(address)} size={size} />
      <Text className="shrink font-semibold" numberOfLines={1}>
        {alias}
        {isMe ? ' (you)' : ''}
      </Text>
      {showHandle && <Text variant="caption" className="shrink-0 font-mono" numberOfLines={1}>{shortAddr(address)}</Text>}
    </View>
  );
  if (!link) return body;
  return (
    <Pressable onPress={() => router.push(`/p/${address}`)} accessibilityRole="link" accessibilityLabel={`Profile of ${alias}`}>
      {body}
    </Pressable>
  );
}
