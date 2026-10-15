import { z } from 'zod';
import { attr } from '../codec/attrs';
import { decode, encode } from '../codec/entities';
import { nameTagSchema, shopCategorySchema, zone5Schema, zone6Schema } from '../codec/schemas';
import { parseOrThrow } from '../codec/validate';
import { BhaiyaPleaseError } from '../types';
import type { EntityKey, ListShopInput, MutationResult, Shop, ShopCategory, Zone5 } from '../types';
import type { Predicate } from '../arkiv/port';
import { reader, requireSigner, TTL } from './context';
import type { ServiceContext } from './context';

const listShopSchema = z.object({ zone: zone6Schema, category: shopCategorySchema, nameTag: nameTagSchema });

export function shopService(ctx: ServiceContext) {
  const rd = () => reader(ctx.port, ctx.project, ctx.drop);
  return {
    async listShop(input: ListShopInput): Promise<MutationResult> {
      requireSigner(ctx);
      const i = parseOrThrow(listShopSchema, input, 'shop');
      const s = encode.shop(ctx.project, i);
      return ctx.port.write(async (w) => {
        const r = await w.create({ ...s, expiresInSeconds: TTL.shop });
        return { key: r.key, txHash: r.txHash };
      });
    },

    /** Any wallet may tap "still open": resets expiry to now + 30 d (extender pays gas). [verify on chain] non-owner extend. */
    async confirmShopOpen(shopKey: EntityKey): Promise<MutationResult> {
      requireSigner(ctx);
      const shop = await rd().one(shopKey, decode.shop);
      if (!shop) throw new BhaiyaPleaseError('NOT_FOUND', 'Shop not found or expired');
      return ctx.port.write(async (w) => ({ key: shop.key, txHash: (await w.extend(shop.key, TTL.shop)).txHash }));
    },

    async getShops(zone5: Zone5, category?: ShopCategory): Promise<Shop[]> {
      const where: Predicate[] = [{ op: 'eq', name: 'zone5', value: attr('zone5', parseOrThrow(zone5Schema, zone5, 'zone5')) }];
      if (category) where.push({ op: 'eq', name: 'category', value: attr('category', parseOrThrow(shopCategorySchema, category, 'category')) });
      const shops = await rd().list('shop', decode.shop, where);
      return shops.sort((a, b) => a.nameTag.localeCompare(b.nameTag));
    },

    getShop: (key: EntityKey) => rd().one(key, decode.shop),
  };
}
