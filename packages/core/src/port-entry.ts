/**
 * '@bhaiya-please/core/port': the low-level Arkiv port for companion protocols (Arkiv Triggers).
 * The BhaiyaPlease interface stays the app surface; this entry gives a worker the same validated
 * transport (retries, pagination pinned to a block, write queue, 2 s block rounding) without the domain.
 * Importing this entry pulls in @arkiv-network/sdk (createArkivAdapter); the mock entry does not.
 */
export { createArkivAdapter, DEFAULT_RPC_URL, rpcTransport, rpcUrlWithKey } from './arkiv/adapter';
export { lifetimeSeconds } from './arkiv/port';
export type {
  ArkivPort,
  AttrMap,
  AttrType,
  AttrValue,
  BatchOps,
  CreateSpec,
  PredictedKey,
  Predicate,
  QueryAst,
  RangeOp,
  RawAttr,
  RawEntity,
  RawEvent,
  RawEventKind,
  ReadPort,
  Writer,
} from './arkiv/port';
export { addrV, attr, bytes32V, i32V, keyV, strV, u64V } from './codec/attrs';
export { buildNoShowEvidence, verifyNoShowEvidence } from './services/noshow';
export type { NoShowEvidence, NoShowOptions } from './services/noshow';
