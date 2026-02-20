import type { Plugin } from '@elizaos/core';
import {
  type Action,
  type ActionResult,
  type HandlerCallback,
  type IAgentRuntime,
  type Memory,
  type Provider,
  type ProviderResult,
  type State,
  logger,
} from '@elizaos/core';
import {
  createPublicClient,
  createWalletClient,
  http,
  formatUnits,
  type Chain,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { mantle, mantleSepoliaTestnet } from 'viem/chains';
import { ERC20_SOURCE } from '../contracts/erc20.ts';
import { ERC721_SOURCE } from '../contracts/erc721.ts';
import { compileSolidity } from '../contracts/compiler.ts';

function getPrivateKey(runtime: IAgentRuntime): `0x${string}` {
  const key =
    runtime.getSetting('EVM_PRIVATE_KEY') || process.env.EVM_PRIVATE_KEY;
  if (!key) throw new Error('EVM_PRIVATE_KEY is not configured');
  return (key.startsWith('0x') ? key : `0x${key}`) as `0x${string}`;
}

function resolveChain(text: string): Chain {
  const lower = text.toLowerCase();
  if (lower.includes('mainnet') && !lower.includes('testnet')) return mantle;
  return mantleSepoliaTestnet;
}

function chainLabel(chain: Chain): string {
  return chain.id === mantle.id ? 'Mantle Mainnet' : 'Mantle Sepolia Testnet';
}

function getRpcUrl(chain: Chain): string {
  if (chain.id === mantle.id)
    return process.env.ETHEREUM_PROVIDER_MANTLE || 'https://rpc.mantle.xyz';
  return (
    process.env.ETHEREUM_PROVIDER_MANTLE_SEPOLIA_TESTNET ||
    'https://rpc.sepolia.mantle.xyz'
  );
}

function publicClient(chain: Chain) {
  return createPublicClient({ chain, transport: http(getRpcUrl(chain)) });
}

function walletClient(runtime: IAgentRuntime, chain: Chain) {
  return createWalletClient({
    account: privateKeyToAccount(getPrivateKey(runtime)),
    chain,
    transport: http(getRpcUrl(chain)),
  });
}

function explorerUrl(chain: Chain): string {
  return chain.blockExplorers?.default?.url || 'https://explorer.sepolia.mantle.xyz';
}

const mantleChainProvider: Provider = {
  name: 'MANTLE_CHAIN_PROVIDER',
  description: 'Provides wallet address and MNT balances on Mantle chains',

  get: async (runtime: IAgentRuntime): Promise<ProviderResult> => {
    try {
      const account = privateKeyToAccount(getPrivateKey(runtime));
      const addr = account.address;

      const [mainBal, testBal] = await Promise.all([
        publicClient(mantle)
          .getBalance({ address: addr })
          .then((b) => formatUnits(b, 18))
          .catch(() => 'unavailable'),
        publicClient(mantleSepoliaTestnet)
          .getBalance({ address: addr })
          .then((b) => formatUnits(b, 18))
          .catch(() => 'unavailable'),
      ]);

      const text = [
        `Wallet: ${addr}`,
        `Mantle Mainnet: ${mainBal} MNT`,
        `Mantle Sepolia: ${testBal} MNT`,
      ].join('\n');

      return { text, values: { addr, mainBal, testBal }, data: { addr } };
    } catch {
      return {
        text: 'Wallet not configured. Set EVM_PRIVATE_KEY in .env',
        values: {},
        data: {},
      };
    }
  },
};

const deployErc20Action: Action = {
  name: 'DEPLOY_ERC20',
  similes: ['CREATE_TOKEN', 'DEPLOY_TOKEN', 'CREATE_ERC20', 'LAUNCH_TOKEN'],
  description:
    'Deploy an ERC20 token on Mantle with a given name, symbol, and initial supply.',

  validate: async (_rt: IAgentRuntime, msg: Memory): Promise<boolean> => {
    const t = msg.content.text.toLowerCase();
    return (
      (t.includes('deploy') || t.includes('create') || t.includes('launch')) &&
      (t.includes('erc20') || t.includes('token'))
    );
  },

  handler: async (
    runtime: IAgentRuntime,
    message: Memory,
    _state: State,
    _opts: any,
    callback: HandlerCallback,
  ): Promise<ActionResult> => {
    try {
      const text = message.content.text;
      const { name, symbol, initialSupply } = parseErc20(text);

      if (!name || !symbol) {
        await callback({
          text: 'Please provide token name, symbol, and supply.\nExample: "Deploy an ERC20 token called MantleCoin with symbol MNTC and 1000000 supply"',
        });
        return { text: 'Missing params', success: false, values: {}, data: {} };
      }

      const chain = resolveChain(text);
      const label = chainLabel(chain);

      await callback({
        text: `Compiling & deploying ERC20 on ${label}...\n- Name: ${name}\n- Symbol: ${symbol}\n- Supply: ${initialSupply.toLocaleString()}\n\nPlease wait...`,
      });

      const compiled = compileSolidity(ERC20_SOURCE, 'SimpleERC20');
      const wc = walletClient(runtime, chain);
      const pc = publicClient(chain);

      const hash = await wc.deployContract({
        abi: compiled.abi,
        bytecode: compiled.bytecode,
        args: [name, symbol, BigInt(initialSupply)],
      });

      const receipt = await pc.waitForTransactionReceipt({ hash });
      const addr = receipt.contractAddress!;

      await callback({
        text: [
          `ERC20 deployed on ${label}!`,
          `Contract: ${addr}`,
          `Name: ${name} | Symbol: ${symbol} | Supply: ${initialSupply.toLocaleString()}`,
          `Tx: ${hash}`,
          `Explorer: ${explorerUrl(chain)}/address/${addr}`,
        ].join('\n'),
      });

      return {
        text: `Deployed ${symbol} at ${addr}`,
        success: true,
        values: { addr, hash, name, symbol },
        data: { actionName: 'DEPLOY_ERC20', addr, hash },
      };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      logger.error('DEPLOY_ERC20 error:', error);
      await callback({ text: `Deploy failed: ${msg}` });
      return {
        text: msg,
        success: false,
        error: error instanceof Error ? error : new Error(msg),
        values: {},
        data: {},
      };
    }
  },

  examples: [
    [
      { name: '{{name1}}', content: { text: 'Deploy an ERC20 token called MantleCoin with symbol MNTC and 1000000 supply' } },
      { name: '{{name2}}', content: { text: 'Compiling & deploying ERC20 on Mantle Sepolia Testnet...', actions: ['DEPLOY_ERC20'] } },
    ],
  ],
};

function parseErc20(text: string) {
  const nameM = text.match(/(?:called|named|name)\s+["']?([A-Za-z][A-Za-z0-9 ]*?)["']?\s+(?:with|symbol|and)/i);
  const symM = text.match(/symbol\s+["']?([A-Z][A-Z0-9]{1,10})["']?/i);
  const supM = text.match(/(\d[\d,_]*)\s*(?:supply|tokens?|initial)/i) ||
    text.match(/(?:supply|initial\s*supply)\s*(?:of\s+)?(\d[\d,_]*)/i);
  return {
    name: nameM?.[1]?.trim() || '',
    symbol: symM?.[1]?.toUpperCase() || '',
    initialSupply: supM ? parseInt(supM[1].replace(/[,_]/g, ''), 10) : 1_000_000,
  };
}

const deployErc721Action: Action = {
  name: 'DEPLOY_ERC721',
  similes: ['CREATE_NFT', 'DEPLOY_NFT', 'CREATE_ERC721', 'LAUNCH_NFT'],
  description: 'Deploy an ERC721 NFT contract on Mantle with a given name and symbol.',

  validate: async (_rt: IAgentRuntime, msg: Memory): Promise<boolean> => {
    const t = msg.content.text.toLowerCase();
    return (
      (t.includes('deploy') || t.includes('create') || t.includes('launch')) &&
      (t.includes('erc721') || t.includes('nft'))
    );
  },

  handler: async (
    runtime: IAgentRuntime,
    message: Memory,
    _state: State,
    _opts: any,
    callback: HandlerCallback,
  ): Promise<ActionResult> => {
    try {
      const text = message.content.text;
      const { name, symbol } = parseErc721(text);

      if (!name || !symbol) {
        await callback({
          text: 'Please provide the NFT name and symbol.\nExample: "Deploy an ERC721 NFT called MantlePunks with symbol MPUNK"',
        });
        return { text: 'Missing params', success: false, values: {}, data: {} };
      }

      const chain = resolveChain(text);
      const label = chainLabel(chain);

      await callback({
        text: `Compiling & deploying ERC721 on ${label}...\n- Name: ${name}\n- Symbol: ${symbol}\n\nPlease wait...`,
      });

      const compiled = compileSolidity(ERC721_SOURCE, 'SimpleERC721');
      const wc = walletClient(runtime, chain);
      const pc = publicClient(chain);

      const hash = await wc.deployContract({
        abi: compiled.abi,
        bytecode: compiled.bytecode,
        args: [name, symbol],
      });

      const receipt = await pc.waitForTransactionReceipt({ hash });
      const addr = receipt.contractAddress!;
      const owner = (wc.account as any).address;

      await callback({
        text: [
          `ERC721 deployed on ${label}!`,
          `Contract: ${addr}`,
          `Name: ${name} | Symbol: ${symbol}`,
          `Owner (can mint): ${owner}`,
          `Tx: ${hash}`,
          `Explorer: ${explorerUrl(chain)}/address/${addr}`,
        ].join('\n'),
      });

      return {
        text: `Deployed ${symbol} at ${addr}`,
        success: true,
        values: { addr, hash, name, symbol },
        data: { actionName: 'DEPLOY_ERC721', addr, hash },
      };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      logger.error('DEPLOY_ERC721 error:', error);
      await callback({ text: `Deploy failed: ${msg}` });
      return {
        text: msg,
        success: false,
        error: error instanceof Error ? error : new Error(msg),
        values: {},
        data: {},
      };
    }
  },

  examples: [
    [
      { name: '{{name1}}', content: { text: 'Deploy an ERC721 NFT called MantlePunks with symbol MPUNK' } },
      { name: '{{name2}}', content: { text: 'Compiling & deploying ERC721 on Mantle Sepolia Testnet...', actions: ['DEPLOY_ERC721'] } },
    ],
  ],
};

function parseErc721(text: string) {
  const nameM = text.match(/(?:called|named|name)\s+["']?([A-Za-z][A-Za-z0-9 ]*?)["']?\s+(?:with|symbol|and)/i);
  const symM = text.match(/symbol\s+["']?([A-Z][A-Z0-9]{1,10})["']?/i);
  return { name: nameM?.[1]?.trim() || '', symbol: symM?.[1]?.toUpperCase() || '' };
}

const mantlePlugin: Plugin = {
  name: 'mantle',
  description:
    'Mantle blockchain plugin for contract deployment (ERC20, ERC721) and wallet context. On-chain data queries are handled by MCP servers (eth-mcp, ENS, Blockscout).',
  actions: [deployErc20Action, deployErc721Action],
  providers: [mantleChainProvider],
};

export default mantlePlugin;
