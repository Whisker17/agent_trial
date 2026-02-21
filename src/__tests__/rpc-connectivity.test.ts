import { describe, it, expect } from 'bun:test';
import { createPublicClient, http } from 'viem';
import { mantleSepoliaTestnet } from 'viem/chains';
import { noProxyFetch } from '../core/no-proxy-fetch.ts';

describe('RPC Connectivity (proxy bypass)', () => {
  it('should fetch chain ID from Mantle Sepolia via noProxyFetch', async () => {
    const client = createPublicClient({
      chain: mantleSepoliaTestnet,
      transport: http('https://rpc.sepolia.mantle.xyz', { fetchFn: noProxyFetch }),
    });
    const chainId = await client.getChainId();
    expect(chainId).toBe(5003);
  });

  it('should fetch block number without proxy error', async () => {
    const client = createPublicClient({
      chain: mantleSepoliaTestnet,
      transport: http('https://rpc.sepolia.mantle.xyz', { fetchFn: noProxyFetch }),
    });
    const blockNumber = await client.getBlockNumber();
    expect(blockNumber).toBeGreaterThan(0n);
  });
});
