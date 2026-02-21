import { useWallets } from '@privy-io/react-auth';
import { createWalletClient, createPublicClient, custom, http, parseEther } from 'viem';
import { mantle, mantleSepoliaTestnet } from 'viem/chains';

const CHAINS = {
  mantle,
  mantleSepolia: mantleSepoliaTestnet,
} as const;

export function usePrivyWallet() {
  const { wallets, ready } = useWallets();
  const wallet = wallets[0];

  async function getWalletClient(network: 'mantle' | 'mantleSepolia') {
    if (!wallet) throw new Error('No wallet connected');
    const chain = CHAINS[network];
    await wallet.switchChain(chain.id);
    const provider = await wallet.getEthereumProvider();
    return createWalletClient({
      account: wallet.address as `0x${string}`,
      chain,
      transport: custom(provider),
    });
  }

  function getPublicClient(network: 'mantle' | 'mantleSepolia') {
    const chain = CHAINS[network];
    return createPublicClient({ chain, transport: http() });
  }

  async function sendMNT(to: string, amount: string, network: 'mantle' | 'mantleSepolia') {
    const client = await getWalletClient(network);
    const value = parseEther(amount);
    const hash = await client.sendTransaction({
      to: to as `0x${string}`,
      value,
    });
    const publicClient = getPublicClient(network);
    await publicClient.waitForTransactionReceipt({ hash });
    return hash;
  }

  return {
    wallet,
    ready,
    address: wallet?.address || null,
    getWalletClient,
    getPublicClient,
    sendMNT,
  };
}
