import type { Address, BhaiyaPlease, MockBhaiyaPlease } from '@bhaiya-please/core';
import type { Wallet } from './session';
import { createMockBhaiyaPlease, mockAddressOf, PERSONA } from '@bhaiya-please/core/mock';

export const CORE_MODE = (process.env.EXPO_PUBLIC_CORE ?? 'mock') as 'mock' | 'real';

export const TRUSTED_VERIFIERS: Address[] = (process.env.EXPO_PUBLIC_TRUSTED_VERIFIERS ?? '')
  .split(',')
  .map((s: string) => s.trim())
  .filter(Boolean) as Address[];

export const FAUCET_URL = 'https://hub.arkiv.network/faucet';
export const EXPLORER_URL = process.env.EXPO_PUBLIC_EXPLORER_URL ?? 'https://explorer.tiramisu.db-chain.testnet.arkiv.network';
/** Production app URL, linked from the sandbox. */
export const REAL_APP_URL = process.env.EXPO_PUBLIC_REAL_APP_URL ?? 'https://bhaiya-please.vercel.app';
export const SANDBOX_URL = process.env.EXPO_PUBLIC_SANDBOX_URL ?? 'https://bhaiya-please-sandbox.vercel.app';

export type AnyCore = BhaiyaPlease & Partial<Pick<MockBhaiyaPlease, 'dev'>>;

/** Build the core instance for one wallet. Real core is loaded lazily so mock builds stay light. */
export async function createCore(wallet: Wallet, verifierAddress: Address | null): Promise<AnyCore> {
  const trustedVerifiers = [...TRUSTED_VERIFIERS, ...(verifierAddress ? [verifierAddress] : [])];
  if (CORE_MODE === 'real') {
    const { createBhaiyaPlease } = await import('@bhaiya-please/core');
    return createBhaiyaPlease({
      rpcUrl: process.env.EXPO_PUBLIC_ARKIV_RPC_URL ?? 'https://rpc.tiramisu.db-chain.testnet.arkiv.network',
      wsUrl: process.env.EXPO_PUBLIC_ARKIV_WS_URL,
      accessKey: process.env.EXPO_PUBLIC_ARKIV_ACCESS_KEY,
      explorerBaseUrl: process.env.EXPO_PUBLIC_EXPLORER_URL,
      signer: { kind: 'privateKey', privateKey: wallet.privateKey },
      trustedVerifiers,
    });
  }
  // The mock's own seeded verifier stays trusted so the seeded runners show their tiers.
  return createMockBhaiyaPlease({
    address: wallet.address,
    trustedVerifiers: [...trustedVerifiers, mockAddressOf(PERSONA.verifier)],
    store: 'localStorage',
    // Seeded runners move along a synthetic Whitefield route and publish coarse pings.
    simulateMovement: true,
  });
}
