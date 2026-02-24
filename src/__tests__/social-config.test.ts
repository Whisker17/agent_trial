import { describe, expect, it } from 'bun:test';
import {
  normalizeSocialConfigInput,
  readSocialConfigFromSkillArgs,
  validateSocialConfig,
  writeSocialSkillArgs,
} from '../server/social-config';

describe('social config utilities', () => {
  it('validates required fields for enabled platforms', () => {
    const normalized = normalizeSocialConfigInput({
      telegram: { enabled: true },
      discord: { enabled: true, botToken: 'abc' },
    });

    const result = validateSocialConfig(normalized);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors).toContain('Telegram bot token is required when Telegram is enabled.');
      expect(result.errors).toContain('Discord guild ID is required when Discord is enabled.');
    }
  });

  it('writes encrypted token fields and returns masked token state', () => {
    const normalized = normalizeSocialConfigInput({
      base: { commandPrefix: '/', responseVisibility: 'public' },
      telegram: {
        enabled: true,
        botToken: '123456:abcdefghijklmnopqrstuvwxyz',
        allowedChatIds: ['-100123', '10001'],
      },
      discord: {
        enabled: true,
        botToken: 'discord-token-value',
        guildId: '123456789012345678',
        controlChannelId: '223456789012345678',
        notifyChannelId: '323456789012345678',
        adminRoleIds: ['423456789012345678'],
      },
    });

    const written = writeSocialSkillArgs({}, normalized, {
      encrypt: (value) => `enc(${value})`,
    });

    expect(written.social_apps_integration_base.telegram_bot_token_enc).toBe(
      'enc(123456:abcdefghijklmnopqrstuvwxyz)',
    );
    expect(written.social_apps_integration_base.discord_bot_token_enc).toBe(
      'enc(discord-token-value)',
    );

    const read = readSocialConfigFromSkillArgs(written, {
      decrypt: (value) => value.replace(/^enc\(/, '').replace(/\)$/, ''),
    });

    expect(read.tokenState.telegramConfigured).toBe(true);
    expect(read.tokenState.discordConfigured).toBe(true);
    expect(read.tokenState.telegramHint).toContain('...');
    expect(read.tokenState.discordHint).toContain('...');
    expect(read.config.telegram.allowedChatIds).toEqual(['-100123', '10001']);
  });
});
