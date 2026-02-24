import { afterEach, describe, expect, it } from 'bun:test';
import { buildCharacter } from '../core/character-factory';
import { encrypt } from '../core/crypto';
import type { AgentRecord } from '../shared/types';
import type { SkillRegistry } from '../core/skill-registry';

const TEST_KEY = '11'.repeat(32);

type MinimalRegistry = Pick<SkillRegistry, 'getSystemContents' | 'resolveSkillContents' | 'getMetadata'>;

const registry: MinimalRegistry = {
  getSystemContents: () => [],
  resolveSkillContents: () => [],
  getMetadata: () => undefined,
};

function makeRecord(skillArgs: Record<string, Record<string, string>>): AgentRecord {
  return {
    id: 'agent-1',
    name: 'Social Agent',
    persona: 'A social-ready Mantle assistant',
    modelProvider: 'openrouter',
    skills: JSON.stringify(['social_apps_integration_base']),
    skillArgs: JSON.stringify(skillArgs),
    walletAddress: '0x1234567890123456789012345678901234567890',
    encryptedPrivateKey: 'unused-in-build-character',
    creatorAddress: null,
    userId: null,
    onChainMeta: '{}',
    status: 'created',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

afterEach(() => {
  delete process.env.PLATFORM_ENCRYPTION_KEY;
});

describe('buildCharacter social app wiring', () => {
  it('adds discord plugin and token settings when discord social config is enabled', () => {
    process.env.PLATFORM_ENCRYPTION_KEY = TEST_KEY;

    const token = 'discord-token-for-test-1234567890';
    const record = makeRecord({
      social_apps_integration_base: {
        discord_enabled: 'true',
        discord_bot_token_enc: encrypt(token),
        discord_guild_id: '123456789012345678',
        discord_control_channel_id: '223456789012345678',
        discord_notify_channel_id: '323456789012345678',
      },
    });

    const character = buildCharacter(record, '0xprivate-key', registry as SkillRegistry);

    expect(character.plugins).toContain('@elizaos/plugin-discord');
    expect((character.secrets as Record<string, string>)?.DISCORD_API_TOKEN).toBe(token);
    expect((character.settings as Record<string, string>)?.CHANNEL_IDS).toBe(
      '223456789012345678,323456789012345678',
    );
  });

  it('does not add discord plugin when social discord is disabled', () => {
    const record = makeRecord({
      social_apps_integration_base: {
        discord_enabled: 'false',
      },
    });

    const character = buildCharacter(record, '0xprivate-key', registry as SkillRegistry);

    expect(character.plugins).not.toContain('@elizaos/plugin-discord');
    expect((character.secrets as Record<string, string>)?.DISCORD_API_TOKEN).toBeUndefined();
  });

  it('adds telegram plugin and allowed chats when telegram social config is enabled', () => {
    process.env.PLATFORM_ENCRYPTION_KEY = TEST_KEY;

    const token = '123456:abcdefghijklmnopqrstuvwxyz';
    const record = makeRecord({
      social_apps_integration_base: {
        telegram_enabled: 'true',
        telegram_bot_token_enc: encrypt(token),
        telegram_allowed_chat_ids: '-100123456,10002',
        telegram_default_chat_id: '10002',
      },
    });

    const character = buildCharacter(record, '0xprivate-key', registry as SkillRegistry);

    expect(character.plugins).toContain('@elizaos/plugin-telegram');
    expect((character.secrets as Record<string, string>)?.TELEGRAM_BOT_TOKEN).toBe(token);
    expect((character.settings as Record<string, string>)?.TELEGRAM_ALLOWED_CHATS).toBe(
      '-100123456,10002',
    );
  });
});
