import { Bike, Croissant, House, PencilLine, Pill, ShoppingBasket, SprayCan } from 'lucide-react-native';
import type { LucideIcon } from 'lucide-react-native';
import type { ShopCategory } from '@bhaiya-please/core';

export const CATEGORY_ICON: Record<ShopCategory, LucideIcon> = {
  grocery: ShoppingBasket,
  bakery: Croissant,
  pharmacy_otc: Pill,
  stationery: PencilLine,
  household: SprayCan,
};

export { Bike as RunnerIcon, House as SocietyIcon };
