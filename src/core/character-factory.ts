import type { Character } from '@elizaos/core';
import type { SkillRegistry } from './skill-registry.ts';
import type { AgentRecord } from '../shared/types.ts';

const MCP_SERVERS = {
  'eth-mcp': {
    type: 'stdio' as const,
    command: 'npx',
    args: ['-y', 'eth-mcp@latest'],
  },
  ens: {
    type: 'stdio' as const,
    command: 'npx',
    args: ['-y', 'mcp-server-ens'],
  },
  blockscout: {
    type: 'stdio' as const,
    command: 'npx',
    args: ['-y', '@blockscout/mcp-server'],
  },
};

function resolveModelPlugin(provider: string): string {
  switch (provider) {
    case 'openai':
      return '@elizaos/plugin-openai';
    case 'ollama':
      return '@elizaos/plugin-ollama';
    default:
      return '@elizaos/plugin-openrouter';
  }
}

export function buildCharacter(
  record: AgentRecord,
  decryptedPrivateKey: string,
  registry: SkillRegistry,
): Character {
  const skillIds: string[] = JSON.parse(record.skills);
  const systemContents = registry.getSystemContents();
  const selectedContents = registry.resolveSkillContents(skillIds);
  const selectedMetas = skillIds
    .map((id) => registry.getMetadata(id))
    .filter(Boolean);

  const skillSummary = selectedMetas
    .map((m) => `- [${m!.name}]: ${m!.description}`)
    .join('\n');
  const postgresUrl = process.env.POSTGRES_URL || process.env.DATABASE_URL;
  const sqlSettings = postgresUrl
    ? { POSTGRES_URL: postgresUrl }
    : { PGLITE_DATA_DIR: process.env.PGLITE_DATA_DIR || '.eliza/gateway-runtime-db' };

  const systemPrompt = [
    record.persona,
    '',
    `You are an autonomous AI agent on the Mantle blockchain network.`,
    `Your wallet address: ${record.walletAddress}`,
    `Networks: Mantle Mainnet (Chain ID 5000) / Mantle Sepolia Testnet (Chain ID 5003)`,
    `Native gas token: MNT`,
    '',
    skillSummary
      ? `Your capabilities:\n${skillSummary}`
      : 'You have no specialized skills enabled.',
    '',
    'Always confirm with the user before executing transactions that cost gas.',
    'Default to Mantle Sepolia Testnet unless explicitly told to use Mainnet.',
  ].join('\n');

  const knowledge = [...systemContents, ...selectedContents];

  return {
    name: record.name,
    system: systemPrompt,
    bio: [record.persona],
    knowledge,
    plugins: [
      '@elizaos/plugin-sql',
      '@elizaos/plugin-bootstrap',
      resolveModelPlugin(record.modelProvider),
      '@elizaos/plugin-evm',
      '@fleek-platform/eliza-plugin-mcp',
    ],
    settings: {
      ...sqlSettings,
      chains: { evm: ['mantle', 'mantleSepoliaTestnet'] },
      mcp: { servers: MCP_SERVERS },
    },
    secrets: {
      EVM_PRIVATE_KEY: decryptedPrivateKey,
    },
    topics: [
      'Mantle blockchain',
      'smart contracts',
      'token deployment',
      'on-chain transactions',
      'DeFi',
      ...selectedMetas.flatMap((m) => m!.tags),
    ],
    style: {
      all: [
        'Be concise and precise with blockchain data',
        'Always show addresses in full or clearly truncated form',
        'Warn about gas costs before transactions',
        'Default to testnet unless user specifies mainnet',
        'Be security-conscious and confirm destructive actions',
      ],
      chat: [
        'Respond directly to on-chain queries with data',
        'Present transaction details clearly before execution',
        'Ask for confirmation before spending gas',
      ],
    },
  };
}
