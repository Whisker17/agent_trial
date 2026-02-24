export const SOCIAL_BASE_SKILL = 'social_apps_integration_base';
// Legacy keys are still parsed for backward compatibility with existing agents.
export const SOCIAL_TELEGRAM_SKILL = 'social_telegram';
export const SOCIAL_DISCORD_SKILL = 'social_discord';

const SOCIAL_SKILL_IDS = new Set([
  SOCIAL_BASE_SKILL,
  SOCIAL_TELEGRAM_SKILL,
  SOCIAL_DISCORD_SKILL,
]);

export type SkillArgsMap = Record<string, Record<string, string>>;
export type SocialPlatform = 'telegram' | 'discord';

export interface SocialSupport {
  any: boolean;
  telegram: boolean;
  discord: boolean;
}

export interface SocialBaseConfig {
  platforms: SocialPlatform[];
  commandPrefix: string;
  responseVisibility: 'public' | 'ephemeral';
  enableDmFallback: boolean;
}

export interface TelegramSocialConfig {
  enabled: boolean;
  botToken: string;
  allowedChatIds: string[];
  defaultChatId: string;
  webhookMode: 'polling' | 'webhook';
}

export interface DiscordSocialConfig {
  enabled: boolean;
  botToken: string;
  guildId: string;
  controlChannelId: string;
  notifyChannelId: string;
  adminRoleIds: string[];
}

export interface SocialConfig {
  base: SocialBaseConfig;
  telegram: TelegramSocialConfig;
  discord: DiscordSocialConfig;
}

export interface SocialTokenState {
  telegramConfigured: boolean;
  discordConfigured: boolean;
  telegramHint: string | null;
  discordHint: string | null;
}

export interface ValidationOptions {
  support?: SocialSupport;
  requireAnyEnabled?: boolean;
  tokenState?: SocialTokenState;
}

type ValidationResult = { ok: true } | { ok: false; errors: string[] };

type EncryptFn = (value: string) => string;
type DecryptFn = (value: string) => string;

function asObject(value: unknown): Record<string, unknown> {
  if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function coerceString(value: unknown): string {
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return '';
}

function pickString(
  source: Record<string, unknown>,
  keys: string[],
  fallback = '',
): string {
  for (const key of keys) {
    if (!(key in source)) continue;
    const value = coerceString(source[key]);
    if (value !== '') return value;
  }
  return fallback;
}

function parseBool(value: unknown, fallback = false): boolean {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  if (typeof value !== 'string') return fallback;
  const normalized = value.trim().toLowerCase();
  if (normalized === 'true' || normalized === '1' || normalized === 'yes') return true;
  if (normalized === 'false' || normalized === '0' || normalized === 'no') return false;
  return fallback;
}

function pickBool(
  source: Record<string, unknown>,
  keys: string[],
  fallback = false,
): boolean {
  for (const key of keys) {
    if (key in source) return parseBool(source[key], fallback);
  }
  return fallback;
}

function parseList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .map((item) => coerceString(item))
      .map((item) => item.trim())
      .filter(Boolean);
  }
  if (typeof value === 'string') {
    return value
      .split(/[,\n]/)
      .map((item) => item.trim())
      .filter(Boolean);
  }
  return [];
}

function pickList(source: Record<string, unknown>, keys: string[]): string[] {
  for (const key of keys) {
    if (!(key in source)) continue;
    const parsed = parseList(source[key]);
    if (parsed.length > 0) return parsed;
  }
  return [];
}

function uniq<T extends string>(items: T[]): T[] {
  return [...new Set(items)];
}

function isSnowflake(value: string): boolean {
  return /^\d{15,25}$/.test(value);
}

function isChatId(value: string): boolean {
  return /^-?\d{5,25}$/.test(value);
}

function isTelegramToken(value: string): boolean {
  return /^\d{6,}:[A-Za-z0-9_-]{20,}$/.test(value);
}

function maskToken(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return '';
  if (trimmed.length <= 8) return `${trimmed.slice(0, 2)}...`;
  return `${trimmed.slice(0, 4)}...${trimmed.slice(-4)}`;
}

function normalizeResponseVisibility(value: string): 'public' | 'ephemeral' {
  return value === 'ephemeral' ? 'ephemeral' : 'public';
}

function normalizeWebhookMode(value: string): 'polling' | 'webhook' {
  return value === 'webhook' ? 'webhook' : 'polling';
}

function toPlatform(value: string): SocialPlatform | null {
  if (value === 'telegram' || value === 'discord') return value;
  return null;
}

function joinList(values: string[]): string {
  return uniq(values.map((item) => item.trim()).filter(Boolean)).join(',');
}

function cloneSkillArgs(input: SkillArgsMap): SkillArgsMap {
  const cloned: SkillArgsMap = {};
  for (const [key, value] of Object.entries(input)) {
    cloned[key] = { ...value };
  }
  return cloned;
}

export function getSocialSupport(selectedSkills: string[]): SocialSupport {
  const hasTelegramSkill =
    selectedSkills.includes(SOCIAL_TELEGRAM_SKILL) || selectedSkills.includes(SOCIAL_BASE_SKILL);
  const hasDiscordSkill =
    selectedSkills.includes(SOCIAL_DISCORD_SKILL) || selectedSkills.includes(SOCIAL_BASE_SKILL);
  return {
    any: hasTelegramSkill || hasDiscordSkill,
    telegram: hasTelegramSkill,
    discord: hasDiscordSkill,
  };
}

export function isSocialSkillId(id: string): boolean {
  return SOCIAL_SKILL_IDS.has(id);
}

export function toSkillArgsMap(input: unknown): SkillArgsMap {
  const output: SkillArgsMap = {};
  const root = asObject(input);
  for (const [skillId, maybeArgs] of Object.entries(root)) {
    const skillArgsObj = asObject(maybeArgs);
    const normalized: Record<string, string> = {};
    for (const [argKey, value] of Object.entries(skillArgsObj)) {
      if (typeof value === 'string') {
        normalized[argKey] = value;
        continue;
      }
      if (typeof value === 'number' || typeof value === 'boolean') {
        normalized[argKey] = String(value);
        continue;
      }
      if (Array.isArray(value)) {
        normalized[argKey] = value.map((item) => coerceString(item)).filter(Boolean).join(',');
        continue;
      }
      if (value && typeof value === 'object') {
        normalized[argKey] = JSON.stringify(value);
      }
    }
    output[skillId] = normalized;
  }
  return output;
}

export function hasSocialArgs(skillArgs: SkillArgsMap): boolean {
  return (
    !!skillArgs[SOCIAL_BASE_SKILL] ||
    !!skillArgs[SOCIAL_TELEGRAM_SKILL] ||
    !!skillArgs[SOCIAL_DISCORD_SKILL]
  );
}

export function stripSocialArgs(skillArgs: SkillArgsMap): SkillArgsMap {
  const output = cloneSkillArgs(skillArgs);
  delete output[SOCIAL_BASE_SKILL];
  delete output[SOCIAL_TELEGRAM_SKILL];
  delete output[SOCIAL_DISCORD_SKILL];
  return output;
}

export function normalizeSocialConfigInput(input: unknown): SocialConfig {
  const root = asObject(input);
  const baseObj = asObject(root.base ?? root[SOCIAL_BASE_SKILL]);
  const telegramObjLegacy = asObject(root.telegram ?? root[SOCIAL_TELEGRAM_SKILL]);
  const discordObjLegacy = asObject(root.discord ?? root[SOCIAL_DISCORD_SKILL]);

  const telegramEnabled = pickBool(
    baseObj,
    ['telegram_enabled'],
    pickBool(telegramObjLegacy, ['enabled', 'is_enabled'], false),
  );
  const discordEnabled = pickBool(
    baseObj,
    ['discord_enabled'],
    pickBool(discordObjLegacy, ['enabled', 'is_enabled'], false),
  );

  const requestedPlatforms = pickList(baseObj, ['platforms', 'enabled_platforms'])
    .map((value) => value.toLowerCase())
    .map((value) => toPlatform(value))
    .filter((value): value is SocialPlatform => value !== null);

  const derivedPlatforms =
    requestedPlatforms.length > 0
      ? requestedPlatforms
      : [
          ...(telegramEnabled ? (['telegram'] as const) : []),
          ...(discordEnabled ? (['discord'] as const) : []),
        ];

  return {
    base: {
      platforms: uniq(derivedPlatforms),
      commandPrefix: pickString(baseObj, ['commandPrefix', 'command_prefix'], '/'),
      responseVisibility: normalizeResponseVisibility(
        pickString(baseObj, ['responseVisibility', 'response_visibility'], 'public'),
      ),
      enableDmFallback: pickBool(baseObj, ['enableDmFallback', 'enable_dm_fallback'], true),
    },
    telegram: {
      enabled: telegramEnabled,
      botToken: pickString(
        baseObj,
        ['telegram_bot_token', 'telegram_token'],
        pickString(telegramObjLegacy, ['botToken', 'bot_token', 'token'], ''),
      ),
      allowedChatIds: uniq(
        pickList(
          baseObj,
          ['telegram_allowed_chat_ids'],
        )
          .concat(pickList(telegramObjLegacy, ['allowedChatIds', 'allowed_chat_ids']))
          .map((item) => item.trim())
          .filter(Boolean),
      ),
      defaultChatId: pickString(
        baseObj,
        ['telegram_default_chat_id'],
        pickString(telegramObjLegacy, ['defaultChatId', 'default_chat_id'], ''),
      ),
      webhookMode: normalizeWebhookMode(
        pickString(
          baseObj,
          ['telegram_webhook_mode'],
          pickString(telegramObjLegacy, ['webhookMode', 'webhook_mode'], 'polling'),
        ),
      ),
    },
    discord: {
      enabled: discordEnabled,
      botToken: pickString(
        baseObj,
        ['discord_bot_token', 'discord_token'],
        pickString(discordObjLegacy, ['botToken', 'bot_token', 'token'], ''),
      ),
      guildId: pickString(
        baseObj,
        ['discord_guild_id'],
        pickString(discordObjLegacy, ['guildId', 'guild_id'], ''),
      ),
      controlChannelId: pickString(
        baseObj,
        ['discord_control_channel_id'],
        pickString(discordObjLegacy, ['controlChannelId', 'control_channel_id'], ''),
      ),
      notifyChannelId: pickString(
        baseObj,
        ['discord_notify_channel_id'],
        pickString(discordObjLegacy, ['notifyChannelId', 'notify_channel_id'], ''),
      ),
      adminRoleIds: uniq(
        pickList(baseObj, ['discord_admin_role_ids'])
          .concat(pickList(discordObjLegacy, ['adminRoleIds', 'admin_role_ids']))
          .map((item) => item.trim())
          .filter(Boolean),
      ),
    },
  };
}

export function validateSocialConfig(
  config: SocialConfig,
  options: ValidationOptions = {},
): ValidationResult {
  const errors: string[] = [];
  const support = options.support;
  const tokenState = options.tokenState;

  if (!config.base.commandPrefix.trim()) {
    errors.push('Command prefix is required.');
  } else if (config.base.commandPrefix.length > 8) {
    errors.push('Command prefix must be 8 characters or fewer.');
  }

  if (support && !support.telegram && config.telegram.enabled) {
    errors.push('Telegram cannot be enabled because telegram skill is not selected.');
  }
  if (support && !support.discord && config.discord.enabled) {
    errors.push('Discord cannot be enabled because discord skill is not selected.');
  }

  if (options.requireAnyEnabled && !config.telegram.enabled && !config.discord.enabled) {
    errors.push('Enable at least one social platform (Telegram or Discord).');
  }

  if (config.telegram.enabled) {
    const telegramTokenProvided = !!config.telegram.botToken.trim();
    const telegramHasExisting = !!tokenState?.telegramConfigured;
    if (!telegramTokenProvided && !telegramHasExisting) {
      errors.push('Telegram bot token is required when Telegram is enabled.');
    }
    if (telegramTokenProvided && !isTelegramToken(config.telegram.botToken.trim())) {
      errors.push('Telegram bot token format looks invalid.');
    }
    for (const chatId of config.telegram.allowedChatIds) {
      if (!isChatId(chatId)) {
        errors.push(`Telegram chat ID "${chatId}" is invalid.`);
      }
    }
    if (config.telegram.defaultChatId && !isChatId(config.telegram.defaultChatId)) {
      errors.push('Telegram default chat ID is invalid.');
    }
  }

  if (config.discord.enabled) {
    const discordTokenProvided = !!config.discord.botToken.trim();
    const discordHasExisting = !!tokenState?.discordConfigured;
    if (!discordTokenProvided && !discordHasExisting) {
      errors.push('Discord bot token is required when Discord is enabled.');
    }
    if (discordTokenProvided && config.discord.botToken.trim().length < 20) {
      errors.push('Discord bot token format looks invalid.');
    }
    if (!config.discord.guildId) {
      errors.push('Discord guild ID is required when Discord is enabled.');
    } else if (!isSnowflake(config.discord.guildId)) {
      errors.push('Discord guild ID is invalid.');
    }
    if (config.discord.controlChannelId && !isSnowflake(config.discord.controlChannelId)) {
      errors.push('Discord control channel ID is invalid.');
    }
    if (config.discord.notifyChannelId && !isSnowflake(config.discord.notifyChannelId)) {
      errors.push('Discord notify channel ID is invalid.');
    }
    for (const roleId of config.discord.adminRoleIds) {
      if (!isSnowflake(roleId)) {
        errors.push(`Discord admin role ID "${roleId}" is invalid.`);
      }
    }
  }

  if (errors.length > 0) return { ok: false, errors };
  return { ok: true };
}

export function readSocialConfigFromSkillArgs(
  skillArgs: SkillArgsMap,
  opts?: { decrypt?: DecryptFn },
): { config: SocialConfig; tokenState: SocialTokenState } {
  const baseObj = asObject(skillArgs[SOCIAL_BASE_SKILL]);
  const telegramObjLegacy = asObject(skillArgs[SOCIAL_TELEGRAM_SKILL]);
  const discordObjLegacy = asObject(skillArgs[SOCIAL_DISCORD_SKILL]);

  const telegramEnc = pickString(
    baseObj,
    ['telegram_bot_token_enc'],
    pickString(telegramObjLegacy, ['bot_token_enc'], ''),
  );
  const discordEnc = pickString(
    baseObj,
    ['discord_bot_token_enc'],
    pickString(discordObjLegacy, ['bot_token_enc'], ''),
  );

  let telegramToken = pickString(
    baseObj,
    ['telegram_bot_token', 'telegram_token'],
    pickString(telegramObjLegacy, ['bot_token', 'token'], ''),
  );
  let discordToken = pickString(
    baseObj,
    ['discord_bot_token', 'discord_token'],
    pickString(discordObjLegacy, ['bot_token', 'token'], ''),
  );

  if (!telegramToken && telegramEnc && opts?.decrypt) {
    try {
      telegramToken = opts.decrypt(telegramEnc);
    } catch {
      telegramToken = '';
    }
  }
  if (!discordToken && discordEnc && opts?.decrypt) {
    try {
      discordToken = opts.decrypt(discordEnc);
    } catch {
      discordToken = '';
    }
  }

  const config = normalizeSocialConfigInput({
    [SOCIAL_BASE_SKILL]: {
      ...baseObj,
      telegram_bot_token: telegramToken,
      discord_bot_token: discordToken,
    },
    [SOCIAL_TELEGRAM_SKILL]: {
      ...telegramObjLegacy,
      bot_token: telegramToken,
    },
    [SOCIAL_DISCORD_SKILL]: {
      ...discordObjLegacy,
      bot_token: discordToken,
    },
  });

  const tokenState: SocialTokenState = {
    telegramConfigured: !!(telegramEnc || telegramToken),
    discordConfigured: !!(discordEnc || discordToken),
    telegramHint: pickString(
      baseObj,
      ['telegram_bot_token_hint'],
      pickString(telegramObjLegacy, ['bot_token_hint'], ''),
    ) || (telegramToken ? maskToken(telegramToken) : null),
    discordHint: pickString(
      baseObj,
      ['discord_bot_token_hint'],
      pickString(discordObjLegacy, ['bot_token_hint'], ''),
    ) || (discordToken ? maskToken(discordToken) : null),
  };

  return { config, tokenState };
}

export function writeSocialSkillArgs(
  existingSkillArgs: SkillArgsMap,
  config: SocialConfig,
  opts: { encrypt: EncryptFn },
): SkillArgsMap {
  const next = cloneSkillArgs(existingSkillArgs);
  const current = readSocialConfigFromSkillArgs(existingSkillArgs);

  const platforms: SocialPlatform[] = uniq([
    ...(config.base.platforms || []),
    ...(config.telegram.enabled ? (['telegram'] as const) : []),
    ...(config.discord.enabled ? (['discord'] as const) : []),
  ]);

  const prevBase = next[SOCIAL_BASE_SKILL] || {};
  const prevTelegram = next[SOCIAL_TELEGRAM_SKILL] || {};
  const prevDiscord = next[SOCIAL_DISCORD_SKILL] || {};

  const telegramToken = config.telegram.botToken.trim();
  const discordToken = config.discord.botToken.trim();

  const telegramEnc = telegramToken
    ? opts.encrypt(telegramToken)
    : prevBase.telegram_bot_token_enc || prevTelegram.bot_token_enc || '';
  const discordEnc = discordToken
    ? opts.encrypt(discordToken)
    : prevBase.discord_bot_token_enc || prevDiscord.bot_token_enc || '';

  const telegramHint =
    telegramToken
      ? maskToken(telegramToken)
      : prevBase.telegram_bot_token_hint ||
        prevTelegram.bot_token_hint ||
        current.tokenState.telegramHint ||
        '';
  const discordHint =
    discordToken
      ? maskToken(discordToken)
      : prevBase.discord_bot_token_hint ||
        prevDiscord.bot_token_hint ||
        current.tokenState.discordHint ||
        '';

  next[SOCIAL_BASE_SKILL] = {
    enabled_platforms: joinList(platforms),
    command_prefix: config.base.commandPrefix || '/',
    response_visibility: config.base.responseVisibility,
    enable_dm_fallback: String(config.base.enableDmFallback),
    telegram_enabled: String(config.telegram.enabled),
    telegram_bot_token_enc: telegramEnc,
    telegram_bot_token_hint: telegramHint || '',
    telegram_allowed_chat_ids: joinList(config.telegram.allowedChatIds),
    telegram_default_chat_id: config.telegram.defaultChatId,
    telegram_webhook_mode: config.telegram.webhookMode,
    discord_enabled: String(config.discord.enabled),
    discord_bot_token_enc: discordEnc,
    discord_bot_token_hint: discordHint || '',
    discord_guild_id: config.discord.guildId,
    discord_control_channel_id: config.discord.controlChannelId,
    discord_notify_channel_id: config.discord.notifyChannelId,
    discord_admin_role_ids: joinList(config.discord.adminRoleIds),
  };

  delete next[SOCIAL_TELEGRAM_SKILL];
  delete next[SOCIAL_DISCORD_SKILL];

  return next;
}
