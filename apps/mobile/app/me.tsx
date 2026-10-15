import { Page } from '@/components/Bits';
import { ProfileView } from '@/components/ProfileView';
import { useSession } from '@/components/providers';

export default function Me() {
  const { address } = useSession();
  return <Page>{address ? <ProfileView address={address} isMe /> : null}</Page>;
}
