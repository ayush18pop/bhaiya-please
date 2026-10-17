/** Entry: signed in → Home; mock build without an account → sandbox start (F1); else → welcome (A2). */
import { Redirect } from 'expo-router';
import { useSession } from '@/components/providers';

export default function Index() {
  const { onboarded, mockBuild } = useSession();
  if (onboarded) return <Redirect href="/home" />;
  return <Redirect href={mockBuild ? '/sandbox' : '/welcome'} />;
}
