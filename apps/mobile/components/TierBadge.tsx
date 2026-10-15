import { ShieldCheck, Sparkles, User } from 'lucide-react-native';
import type { TierLimits } from '@bhaiya-please/core';
import { Badge } from '@/components/ui/badge';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { rupees } from '@/lib/format';
import { S } from '@/lib/strings';

const CFG = {
  new: { icon: User, variant: 'muted' as const, iconCls: 'text-muted-foreground' },
  verified: { icon: ShieldCheck, variant: 'secondary' as const, iconCls: 'text-secondary-foreground' },
  trusted: { icon: Sparkles, variant: 'default' as const, iconCls: 'text-primary-foreground' },
};

/** Colour + icon + text, never colour only. */
export function TierBadge({ tier, showCap = false }: { tier: TierLimits; showCap?: boolean }) {
  const c = CFG[tier.name];
  return (
    <Badge variant={c.variant}>
      <Icon as={c.icon} size={12} className={c.iconCls} />
      <Text>{S.tiers[tier.name].toUpperCase()}</Text>
      {showCap && <Text className="font-medium opacity-90">· {rupees(tier.priceCap)}</Text>}
    </Badge>
  );
}
