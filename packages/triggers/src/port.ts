/**
 * The one place this package touches core: TYPES ONLY (no runtime import), so the triggers codec,
 * client and engine stay SDK-free and run unchanged in Node and in the browser. Every ArkivPort
 * implementation (core's real SDK adapter, core's mock chain, or any compatible port) works.
 */
export type { Address, EntityKey, Hex, UnixSeconds } from '@bhaiya-please/core';
export type {
  ArkivPort,
  AttrMap,
  AttrValue,
  BatchOps,
  CreateSpec,
  Predicate,
  QueryAst,
  RawAttr,
  RawEntity,
  ReadPort,
  Writer,
} from '@bhaiya-please/core/port';
