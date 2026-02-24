import type { Character } from '@elizaos/core';
import type { SkillRegistry } from './skill-registry.ts';
import type { AgentRecord } from '../shared/types.ts';
import { decrypt } from './crypto.ts';
import { readSocialConfigFromSkillArgs, toSkillArgsMap } from '../server/social-config.ts';

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

function parseSkillArgs(rawSkillArgs: string): Record<string, Record<string, string>> {
  if (!rawSkillArgs) return {};
  try {
    return toSkillArgsMap(JSON.parse(rawSkillArgs));
  } catch {
    return {};
  }
}

function toCsv(values: string[]): string {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))].join(',');
}

export function buildCharacter(
  record: AgentRecord,
  decryptedPrivateKey: string,
  registry: SkillRegistry,
): Character {
  const skillIds: string[] = JSON.parse(record.skills);
  const skillArgs = parseSkillArgs(record.skillArgs);
  const { config: socialConfig } = readSocialConfigFromSkillArgs(skillArgs, { decrypt });
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
  const plugins = [
    '@elizaos/plugin-sql',
    '@elizaos/plugin-bootstrap',
    resolveModelPlugin(record.modelProvider),
  ];
  const settings: Record<string, unknown> = {
    ...sqlSettings,
    chains: { evm: ['mantle', 'mantleSepoliaTestnet'] },
    mcp: { servers: MCP_SERVERS },
  };
  const secrets: Record<string, string> = {
    EVM_PRIVATE_KEY: decryptedPrivateKey,
  };

  if (socialConfig.discord.enabled) {
    const discordToken = socialConfig.discord.botToken.trim();
    if (discordToken) {
      plugins.push('@elizaos/plugin-discord');
      secrets.DISCORD_API_TOKEN = discordToken;

      const allowedChannelIds = toCsv([
        socialConfig.discord.controlChannelId,
        socialConfig.discord.notifyChannelId,
      ]);
      if (allowedChannelIds) {
        settings.CHANNEL_IDS = allowedChannelIds;
      }
      if (socialConfig.discord.guildId) {
        settings.DISCORD_GUILD_ID = socialConfig.discord.guildId;
      }
      settings.discord = {
        shouldIgnoreBotMessages: true,
        shouldIgnoreDirectMessages: false,
        shouldRespondOnlyToMentions: true,
        ...(allowedChannelIds
          ? { allowedChannelIds: allowedChannelIds.split(',') }
          : {}),
      };
    }
  }

  if (socialConfig.telegram.enabled) {
    const telegramToken = socialConfig.telegram.botToken.trim();
    if (telegramToken) {
      plugins.push('@elizaos/plugin-telegram');
      secrets.TELEGRAM_BOT_TOKEN = telegramToken;

      const allowedChats = toCsv(
        socialConfig.telegram.defaultChatId
          ? [...socialConfig.telegram.allowedChatIds, socialConfig.telegram.defaultChatId]
          : socialConfig.telegram.allowedChatIds,
      );
      if (allowedChats) {
        settings.TELEGRAM_ALLOWED_CHATS = allowedChats;
      }
    }
  }
  plugins.push('@elizaos/plugin-evm', '@fleek-platform/eliza-plugin-mcp');

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
    plugins,
    settings,
    secrets,
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
