/**
 * Domain object ⇄ entity. Encoders build attribute maps + payloads; decoders validate a RawEntity
 * with zod and return null for anything malformed or foreign (wrong project/type).
 */
import type { z } from 'zod';
import type { AttrMap, RawEntity } from '../arkiv/port';
import type {
  Accept,
  Address,
  Attestation,
  AttestationLevel,
  ComplaintReason,
  Complaint,
  Decline,
  Delivery,
  EntityKey,
  EntityMeta,
  EntityType,
  Hex,
  Receipt,
  ReceiptTag,
  Request,
  Run,
  Shop,
  ShopCategory,
  TierLevel,
  UnixSeconds,
  Zone6,
} from '../types';
import { attr, baseAttrs, isEntityType } from './attrs';
import { attrSchemas, payloadSchemas } from './schemas';

export interface EntitySpec {
  attributes: AttrMap;
  /** JSON text. */
  payload: string;
  readonly: boolean;
  permissionlessExtension: boolean;
}

function spec(
  project: string,
  type: EntityType,
  attrs: AttrMap,
  payload: object,
  flags: { readonly?: boolean; permissionlessExtension?: boolean } = {},
): EntitySpec {
  return {
    attributes: { ...baseAttrs(project, type), ...attrs },
    payload: JSON.stringify(payload),
    readonly: flags.readonly ?? false,
    permissionlessExtension: flags.permissionlessExtension ?? false,
  };
}

// ------------------------------------------------------------------ encoders

export const encode = {
  shop(project: string, i: { zone: Zone6; category: ShopCategory; nameTag: string }): EntitySpec {
    return spec(
      project,
      'shop',
      {
        zone: attr('zone', i.zone),
        zone5: attr('zone5', i.zone.slice(0, 5)),
        category: attr('category', i.category),
        name_tag: attr('name_tag', i.nameTag),
      },
      {},
      { permissionlessExtension: true },
    );
  },

  run(
    project: string,
    i: { destZone: Zone6; fromZone: Zone6; eta: UnixSeconds; capacityLeft: number; claimedTier: TierLevel; note?: string },
  ): EntitySpec {
    return spec(
      project,
      'run',
      {
        dest_zone: attr('dest_zone', i.destZone),
        from_zone: attr('from_zone', i.fromZone),
        eta: attr('eta', BigInt(i.eta)),
        capacity_left: attr('capacity_left', i.capacityLeft),
        tier: attr('tier', i.claimedTier),
      },
      i.note ? { note: i.note } : {},
    );
  },

  request(
    project: string,
    i: { run: EntityKey; shop: EntityKey; destZone: Zone6; maxPrice: number; tip: number; codeCommit: Hex; items: string[] },
  ): EntitySpec {
    return spec(
      project,
      'request',
      {
        run: attr('run', i.run),
        shop: attr('shop', i.shop),
        dest_zone: attr('dest_zone', i.destZone),
        max_price: attr('max_price', i.maxPrice),
        tip: attr('tip', i.tip),
        code_commit: attr('code_commit', i.codeCommit),
      },
      { items: i.items },
      { readonly: true },
    );
  },

  accept(project: string, i: { request: EntityKey; run: EntityKey; rider: Address }): EntitySpec {
    return spec(project, 'accept', {
      request: attr('request', i.request),
      run: attr('run', i.run),
      rider: attr('rider', i.rider),
    }, {});
  },

  /** Readonly: the runner's "no" cannot be edited, only expire with the run. */
  decline(project: string, i: { request: EntityKey; run: EntityKey; rider: Address }): EntitySpec {
    return spec(
      project,
      'decline',
      {
        request: attr('request', i.request),
        run: attr('run', i.run),
        rider: attr('rider', i.rider),
      },
      {},
      { readonly: true },
    );
  },

  delivery(
    project: string,
    i: { request: EntityKey; rider: Address; resident: Address; zone: Zone6; code: string; salt: Hex },
  ): EntitySpec {
    return spec(
      project,
      'delivery',
      {
        request: attr('request', i.request),
        rider: attr('rider', i.rider),
        resident: attr('resident', i.resident),
        zone: attr('zone', i.zone),
      },
      { code: i.code, salt: i.salt.toLowerCase() },
      { readonly: true },
    );
  },

  receipt(
    project: string,
    i: { rider: Address; delivery: EntityKey; zone: Zone6; at: UnixSeconds; tags: ReceiptTag[] },
  ): EntitySpec {
    return spec(
      project,
      'receipt',
      {
        rider: attr('rider', i.rider),
        delivery: attr('delivery', i.delivery),
        zone: attr('zone', i.zone),
        at: attr('at', BigInt(i.at)),
      },
      { tags: i.tags },
      { readonly: true },
    );
  },

  complaint(
    project: string,
    i: { rider: Address; request: EntityKey; reason: ComplaintReason; at: UnixSeconds },
  ): EntitySpec {
    return spec(
      project,
      'complaint',
      {
        rider: attr('rider', i.rider),
        request: attr('request', i.request),
        reason: attr('reason', i.reason),
        at: attr('at', BigInt(i.at)),
      },
      {},
      { readonly: true },
    );
  },

  attestation(
    project: string,
    i: { subject: Address; level: AttestationLevel; prev?: Address; at: UnixSeconds },
  ): EntitySpec {
    const attrs: AttrMap = {
      subject: attr('subject', i.subject),
      level: attr('level', i.level),
      at: attr('at', BigInt(i.at)),
    };
    if (i.prev) attrs.prev = attr('prev', i.prev);
    return spec(project, 'attestation', attrs, {}, { readonly: true });
  },
};

// ------------------------------------------------------------------ decoders

/** Optional sink for dropped entities (debug log / friction evidence). */
export type DropSink = (key: EntityKey, reason: string) => void;

export function metaOf(raw: RawEntity): EntityMeta {
  return {
    key: raw.key,
    creator: raw.creator,
    owner: raw.owner,
    createdAt: raw.createdAt,
    expiresAt: raw.expiresAt,
    readonly: raw.readonly,
    permissionlessExtension: raw.permissionlessExtension,
  };
}

/** The entity's declared type if it belongs to `project`, else null. */
export function typeOf(raw: RawEntity, project: string): EntityType | null {
  const p = raw.attributes.project;
  const t = raw.attributes.type;
  if (p?.type !== 'str' || p.value !== project || t?.type !== 'str') return null;
  return isEntityType(t.value) ? t.value : null;
}

function parsePayload(text: string): unknown {
  if (text === '') return {};
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

function decodeWith<A extends z.ZodType, P extends z.ZodType, T>(
  raw: RawEntity,
  project: string,
  type: EntityType,
  attrsSchema: A,
  payloadSchema: P,
  build: (a: z.output<A>, p: z.output<P>, meta: EntityMeta) => T,
  drop?: DropSink,
): T | null {
  if (typeOf(raw, project) !== type) return null;
  const a = attrsSchema.safeParse(raw.attributes);
  if (!a.success) {
    drop?.(raw.key, `${type} attrs: ${a.error.issues[0]?.message ?? 'invalid'}`);
    return null;
  }
  const p = payloadSchema.safeParse(parsePayload(raw.payload));
  if (!p.success) {
    drop?.(raw.key, `${type} payload: ${p.error.issues[0]?.message ?? 'invalid'}`);
    return null;
  }
  return build(a.data, p.data, metaOf(raw));
}

export const decode = {
  shop: (raw: RawEntity, project: string, drop?: DropSink): Shop | null =>
    decodeWith(raw, project, 'shop', attrSchemas.shop, payloadSchemas.none, (a, _p, m) => {
      // zone5 is derived; a mismatch means a hand-crafted entity.
      if (a.zone5.value !== a.zone.value.slice(0, 5)) return null;
      return { ...m, zone: a.zone.value, zone5: a.zone5.value, category: a.category.value, nameTag: a.name_tag.value };
    }, drop),

  run: (raw: RawEntity, project: string, drop?: DropSink): Run | null =>
    decodeWith(raw, project, 'run', attrSchemas.run, payloadSchemas.run, (a, p, m) => {
      const run: Run = {
        ...m,
        destZone: a.dest_zone.value,
        fromZone: a.from_zone.value,
        eta: a.eta.value,
        capacityLeft: a.capacity_left.value,
        claimedTier: a.tier.value,
      };
      if (p.note) run.note = p.note;
      if (a.at_gate) run.atGateAt = a.at_gate.value;
      return run;
    }, drop),

  request: (raw: RawEntity, project: string, drop?: DropSink): Request | null =>
    decodeWith(raw, project, 'request', attrSchemas.request, payloadSchemas.request, (a, p, m) => ({
      ...m,
      run: a.run.value,
      shop: a.shop.value,
      destZone: a.dest_zone.value,
      maxPrice: a.max_price.value,
      tip: a.tip.value,
      codeCommit: a.code_commit.value,
      items: p.items,
    }), drop),

  accept: (raw: RawEntity, project: string, drop?: DropSink): Accept | null =>
    decodeWith(raw, project, 'accept', attrSchemas.accept, payloadSchemas.none, (a, _p, m) => ({
      ...m,
      request: a.request.value,
      run: a.run.value,
      rider: a.rider.value,
    }), drop),

  decline: (raw: RawEntity, project: string, drop?: DropSink): Decline | null =>
    decodeWith(raw, project, 'decline', attrSchemas.decline, payloadSchemas.none, (a, _p, m) => ({
      ...m,
      request: a.request.value,
      run: a.run.value,
      rider: a.rider.value,
    }), drop),

  delivery: (raw: RawEntity, project: string, drop?: DropSink): Delivery | null =>
    decodeWith(raw, project, 'delivery', attrSchemas.delivery, payloadSchemas.delivery, (a, p, m) => ({
      ...m,
      request: a.request.value,
      rider: a.rider.value,
      resident: a.resident.value,
      zone: a.zone.value,
      code: p.code,
      salt: p.salt,
    }), drop),

  receipt: (raw: RawEntity, project: string, drop?: DropSink): Receipt | null =>
    decodeWith(raw, project, 'receipt', attrSchemas.receipt, payloadSchemas.receipt, (a, p, m) => ({
      ...m,
      rider: a.rider.value,
      delivery: a.delivery.value,
      zone: a.zone.value,
      at: a.at.value,
      tags: p.tags,
    }), drop),

  complaint: (raw: RawEntity, project: string, drop?: DropSink): Complaint | null =>
    decodeWith(raw, project, 'complaint', attrSchemas.complaint, payloadSchemas.none, (a, _p, m) => ({
      ...m,
      rider: a.rider.value,
      request: a.request.value,
      reason: a.reason.value,
      at: a.at.value,
    }), drop),

  /** `trusted` is false here; services set it from the viewer's verifier list. */
  attestation: (raw: RawEntity, project: string, drop?: DropSink): Attestation | null =>
    decodeWith(raw, project, 'attestation', attrSchemas.attestation, payloadSchemas.none, (a, _p, m) => {
      if ((a.level.value === 'successor') !== (a.prev !== undefined)) return null;
      const att: Attestation = { ...m, subject: a.subject.value, level: a.level.value, at: a.at.value, trusted: false };
      if (a.prev) att.prev = a.prev.value;
      return att;
    }, drop),
};
