/**
 * @bhaiya-please/core public entry. createBhaiyaPlease = real (Arkiv SDK); createMockBhaiyaPlease =
 * same services over an in-memory chain (also at '@bhaiya-please/core/mock', which avoids the SDK).
 */
import { createArkivAdapter } from './arkiv/adapter';
import { computeCodeCommit, decodeAddressQR, decodeHandoffQR, encodeAddressQR, encodeHandoffQR } from './codec/handoff';
import type { CoreHelpers, CreateBhaiyaPlease } from './interface';
import { createDomain } from './services';
import { PROJECT_TAG } from './types';
import type { Address } from './types';
import { DEMO_ZONES, zoneFromGeohash, zoneFromLatLng } from './zones';

export * from './types';
export type * from './interface';
export { computeCodeCommit, decodeAddressQR, decodeHandoffQR, encodeAddressQR, encodeHandoffQR } from './codec/handoff';
export { DEMO_ZONES, zoneFromGeohash, zoneFromLatLng } from './zones';
export { addressOfKey, decodeKeyExport, encodeKeyExport, generateBurnerKey } from './wallet';
export {
  buildFixturePlan,
  createMockBhaiyaPlease,
  DEFAULT_MOCK_LATENCY_MS,
  MOCK_PERSONAS,
  mockAddressOf,
  PERSONA,
  runFixturePlan,
} from './mock';
export type { FixtureEnv, FixturePersona, FixturePlan, MockPersona } from './mock';
export { DEFAULT_RPC_URL } from './arkiv/adapter';
export * from './geo';

export const coreHelpers: CoreHelpers = {
  computeCodeCommit,
  encodeHandoffQR,
  decodeHandoffQR,
  encodeAddressQR,
  decodeAddressQR,
  zoneFromLatLng,
  zoneFromGeohash,
  DEMO_ZONES,
};

export const createBhaiyaPlease: CreateBhaiyaPlease = async (config) => {
  const port = await createArkivAdapter(config);
  const onError = config.onSdkError;
  return createDomain(
    {
      port,
      project: config.projectTag ?? PROJECT_TAG,
      trustedVerifiers: new Set(config.trustedVerifiers.map((a) => a.toLowerCase() as Address)),
      receiptMode: config.receiptMode ?? 'auto',
      ...(config.explorerBaseUrl ? { explorerBaseUrl: config.explorerBaseUrl } : {}),
      ...(onError ? { drop: (key, reason) => onError('decode', new Error(`dropped ${key}: ${reason}`)) } : {}),
    },
    // ≤10 watcher gets/s against the public RPC.
    onError ? { resolveIntervalMs: 100, onError } : { resolveIntervalMs: 100 },
  );
};
