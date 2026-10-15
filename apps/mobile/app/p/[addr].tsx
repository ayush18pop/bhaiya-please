import { useLocalSearchParams } from 'expo-router';
import type { Address } from '@bhaiya-please/core';
import { Page } from '@/components/Bits';
import { ProfileView } from '@/components/ProfileView';
import { useSession } from '@/components/providers';

export default function Profile() {
  const { addr } = useLocalSearchParams<{ addr: string }>();
  const { address } = useSession();
  const a = addr as Address;
  return (
    <Page>
      <ProfileView address={a} isMe={address?.toLowerCase() === a?.toLowerCase()} />
    </Page>
  );
}
