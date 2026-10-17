/** Activity tab: D1 (requests and runs), or E3 vouches issued in Society desk mode. */
import { useSession } from '@/components/providers';
import Issued from '@/screens/desk/Issued';
import Activity from '@/screens/shared/Activity';

export default function ActivityTab() {
  const { mode } = useSession();
  return mode === 'desk' ? <Issued /> : <Activity />;
}
