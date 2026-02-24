import { Hono } from 'hono';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import {
  createPublicClient,
  createWalletClient,
  http,
  formatUnits,
  encodeDeployData,
  isAddress,
  zeroAddress,
} from 'viem';
import { mantle, mantleSepoliaTestnet } from 'viem/chains';
import type { Chain } from 'viem';
import { encrypt, decrypt } from '../../core/crypto.ts';
import { noProxyFetch } from '../../core/no-proxy-fetch.ts';
import { compileSolidity } from '../../contracts/compiler.ts';
import { ERC20_SOURCE } from '../../contracts/erc20.ts';
import type { AgentManager } from '../../core/agent-manager.ts';
import * as repo from '../../db/repository.ts';
import { toAgentPublic, type AgentRecord } from '../../shared/types.ts';
import {
  getSocialSupport,
  hasSocialArgs,
  normalizeSocialConfigInput,
  readSocialConfigFromSkillArgs,
  stripSocialArgs,
  toSkillArgsMap,
  validateSocialConfig,
  writeSocialSkillArgs,
  SOCIAL_BASE_SKILL,
  SOCIAL_DISCORD_SKILL,
  SOCIAL_TELEGRAM_SKILL,
} from '../social-config.ts';
import {
  validateTransferTokenConfig,
  type AssetNetwork,
} from '../../config/transfer-tokens.ts';

function rpcTransport(chain: Chain) {
  const url = chain.rpcUrls.default.http[0];
  return http(url, { fetchFn: noProxyFetch });
}

type DeployNetwork = 'mantle' | 'mantleSepolia';
type SweepNetwork = AssetNetwork;

function toMntUnits(value: bigint): string {
  return formatUnits(value, 18);
}

const ERC20_TRANSFER_ABI = [
  {
    inputs: [{ name: 'owner', type: 'address' }],
    name: 'balanceOf',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [
      { name: 'to', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    name: 'transfer',
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'nonpayable',
    type: 'function',
  },
] as const;

interface SweepTransferResult {
  network: SweepNetwork;
  assetType: 'NATIVE' | 'ERC20';
  symbol: string;
  amount: string;
  txHash: string;
}

interface SweepSummary {
  from: string;
  destination: string;
  transfers: SweepTransferResult[];
}

type SweepResult =
  | { ok: true; summary: SweepSummary }
  | { ok: false; status: number; payload: { error: string; code: string; details: unknown } };

interface SweepContext {
  destination: `0x${string}`;
  config: Extract<ReturnType<typeof validateTransferTokenConfig>, { ok: true }>;
}
type SweepFailure = Extract<SweepResult, { ok: false }>;

function chainFromNetwork(network: SweepNetwork): Chain {
  return network === 'mantle' ? mantle : mantleSepoliaTestnet;
}

function sweepError(
  status: number,
  code:
    | 'MISSING_CREATOR_ADDRESS'
    | 'INVALID_CREATOR_ADDRESS'
    | 'TOKEN_CONFIG_MISSING'
    | 'INSUFFICIENT_SWEEP_GAS'
    | 'ASSET_TRANSFER_FAILED',
  error: string,
  details: unknown,
): SweepResult {
  return { ok: false, status, payload: { error, code, details } };
}

async function sweepAgentAssets(record: AgentRecord): Promise<SweepResult> {
  const preflight = preflightSweep(record);
  if (!preflight.ok) return preflight;
  const { destination, config } = preflight.context;

  const privateKey = decrypt(record.encryptedPrivateKey) as `0x${string}`;
  const account = privateKeyToAccount(privateKey);

  const summary: SweepSummary = {
    from: account.address,
    destination,
    transfers: [],
  };

  for (const network of ['mantle', 'mantleSepolia'] as const) {
    const chain = chainFromNetwork(network);
    const pc = createPublicClient({ chain, transport: rpcTransport(chain) });
    const wc = createWalletClient({
      account,
      chain,
      transport: rpcTransport(chain),
    });

    for (const token of config.tokensByNetwork[network]) {
      let balance: bigint;
      try {
        balance = (await pc.readContract({
          address: token.address,
          abi: ERC20_TRANSFER_ABI,
          functionName: 'balanceOf',
          args: [account.address],
        })) as bigint;
      } catch (err: any) {
        return sweepError(
          409,
          'ASSET_TRANSFER_FAILED',
          `Failed to check ${token.symbol} balance on ${network}.`,
          {
            network,
            symbol: token.symbol,
            stage: 'BALANCE_CHECK',
            message: err?.message || String(err),
          },
        );
      }

      if (balance === 0n) continue;

      let hash: `0x${string}`;
      try {
        hash = await wc.writeContract({
          address: token.address,
          abi: ERC20_TRANSFER_ABI,
          functionName: 'transfer',
          args: [destination, balance],
        });
      } catch (err: any) {
        return sweepError(
          409,
          'ASSET_TRANSFER_FAILED',
          `Failed to submit ${token.symbol} transfer on ${network}.`,
          {
            network,
            symbol: token.symbol,
            stage: 'TRANSFER_SUBMIT',
            message: err?.message || String(err),
          },
        );
      }

      try {
        const receipt = await pc.waitForTransactionReceipt({ hash });
        if (receipt.status !== 'success') {
          return sweepError(
            409,
            'ASSET_TRANSFER_FAILED',
            `${token.symbol} transfer reverted on ${network}.`,
            {
              network,
              symbol: token.symbol,
              stage: 'TRANSFER_RECEIPT',
              txHash: hash,
              receiptStatus: receipt.status,
            },
          );
        }
      } catch (err: any) {
        return sweepError(
          409,
          'ASSET_TRANSFER_FAILED',
          `Failed to confirm ${token.symbol} transfer on ${network}.`,
          {
            network,
            symbol: token.symbol,
            stage: 'TRANSFER_RECEIPT',
            txHash: hash,
            message: err?.message || String(err),
          },
        );
      }

      summary.transfers.push({
        network,
        assetType: 'ERC20',
        symbol: token.symbol,
        amount: formatUnits(balance, token.decimals),
        txHash: hash,
      });
    }

    let nativeBalance: bigint;
    try {
      nativeBalance = await pc.getBalance({ address: account.address });
    } catch (err: any) {
      return sweepError(
        409,
        'ASSET_TRANSFER_FAILED',
        `Failed to read native balance on ${network}.`,
        {
          network,
          symbol: 'MNT',
          stage: 'NATIVE_BALANCE',
          message: err?.message || String(err),
        },
      );
    }

    if (nativeBalance === 0n) continue;

    let gasPriceWei: bigint;
    try {
      const feeEstimate = await pc.estimateFeesPerGas();
      gasPriceWei = feeEstimate.maxFeePerGas ?? feeEstimate.gasPrice ?? 0n;
      if (!gasPriceWei) gasPriceWei = await pc.getGasPrice();
    } catch (err: any) {
      return sweepError(
        409,
        'ASSET_TRANSFER_FAILED',
        `Failed to estimate gas price for native transfer on ${network}.`,
        {
          network,
          symbol: 'MNT',
          stage: 'NATIVE_GAS_PRICE',
          message: err?.message || String(err),
        },
      );
    }

    let gasEstimate: bigint;
    try {
      gasEstimate = await pc.estimateGas({
        account: account.address,
        to: destination,
        value: 0n,
      });
    } catch (err: any) {
      return sweepError(
        409,
        'ASSET_TRANSFER_FAILED',
        `Failed to estimate native transfer gas on ${network}.`,
        {
          network,
          symbol: 'MNT',
          stage: 'NATIVE_GAS_ESTIMATE',
          message: err?.message || String(err),
        },
      );
    }

    const reserveWei = ((gasEstimate * gasPriceWei) * 12n) / 10n;
    if (nativeBalance <= reserveWei) {
      return sweepError(
        409,
        'INSUFFICIENT_SWEEP_GAS',
        `Insufficient MNT on ${network} to complete native asset sweep.`,
        {
          network,
          balanceMnt: toMntUnits(nativeBalance),
          requiredMnt: toMntUnits(reserveWei),
          shortfallMnt: toMntUnits(reserveWei - nativeBalance),
          destination,
        },
      );
    }

    const sendValue = nativeBalance - reserveWei;
    let nativeHash: `0x${string}`;
    try {
      nativeHash = await wc.sendTransaction({
        to: destination,
        value: sendValue,
      });
    } catch (err: any) {
      return sweepError(
        409,
        'ASSET_TRANSFER_FAILED',
        `Failed to submit native transfer on ${network}.`,
        {
          network,
          symbol: 'MNT',
          stage: 'NATIVE_TRANSFER_SUBMIT',
          message: err?.message || String(err),
        },
      );
    }

    try {
      const nativeReceipt = await pc.waitForTransactionReceipt({ hash: nativeHash });
      if (nativeReceipt.status !== 'success') {
        return sweepError(
          409,
          'ASSET_TRANSFER_FAILED',
          `Native transfer reverted on ${network}.`,
          {
            network,
            symbol: 'MNT',
            stage: 'NATIVE_TRANSFER_RECEIPT',
            txHash: nativeHash,
            receiptStatus: nativeReceipt.status,
          },
        );
      }
    } catch (err: any) {
      return sweepError(
        409,
        'ASSET_TRANSFER_FAILED',
        `Failed to confirm native transfer on ${network}.`,
        {
          network,
          symbol: 'MNT',
          stage: 'NATIVE_TRANSFER_RECEIPT',
          txHash: nativeHash,
          message: err?.message || String(err),
        },
      );
    }

    summary.transfers.push({
      network,
      assetType: 'NATIVE',
      symbol: 'MNT',
      amount: toMntUnits(sendValue),
      txHash: nativeHash,
    });
  }

  return { ok: true, summary };
}

function preflightSweep(
  record: AgentRecord,
): { ok: true; context: SweepContext } | SweepFailure {
  if (!record.creatorAddress) {
    return sweepError(
      400,
      'MISSING_CREATOR_ADDRESS',
      'Creator address is required before deleting an agent with asset sweep enabled.',
      { agentId: record.id, reason: 'CREATOR_ADDRESS_MISSING' },
    );
  }
  if (
    !isAddress(record.creatorAddress) ||
    record.creatorAddress.toLowerCase() === zeroAddress
  ) {
    return sweepError(
      400,
      'INVALID_CREATOR_ADDRESS',
      'Creator address is invalid. Cannot sweep assets before deletion.',
      { agentId: record.id, creatorAddress: record.creatorAddress },
    );
  }

  const configValidation = validateTransferTokenConfig();
  if (!configValidation.ok) {
    return { ok: false, status: 409, payload: configValidation.configError };
  }

  return {
    ok: true,
    context: { destination: record.creatorAddress as `0x${string}`, config: configValidation },
  };
}

type SkillArgsMap = Record<string, Record<string, string>>;
type SocialTestPlatform = 'telegram' | 'discord';

function normalizeSkillIds(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  return input.filter((item): item is string => typeof item === 'string');
}

function parseRecordSkillIds(record: AgentRecord): string[] {
  try {
    return normalizeSkillIds(JSON.parse(record.skills));
  } catch {
    return [];
  }
}

function parseRecordSkillArgs(record: AgentRecord): SkillArgsMap {
  try {
    return toSkillArgsMap(JSON.parse(record.skillArgs || '{}'));
  } catch {
    return {};
  }
}

function mergeSkillArgs(existing: SkillArgsMap, incoming: SkillArgsMap): SkillArgsMap {
  const merged: SkillArgsMap = { ...existing };
  for (const [skillId, args] of Object.entries(incoming)) {
    merged[skillId] = { ...(merged[skillId] || {}), ...args };
  }
  return merged;
}

function prepareSkillArgsForPersist(params: {
  selectedSkills: string[];
  existingSkillArgs?: SkillArgsMap;
  incomingSkillArgs: unknown;
}):
  | { ok: true; skillArgs: SkillArgsMap }
  | { ok: false; errors: string[] } {
  const existing = params.existingSkillArgs || {};
  const incoming = toSkillArgsMap(params.incomingSkillArgs || {});
  let merged = mergeSkillArgs(existing, incoming);

  const support = getSocialSupport(params.selectedSkills);
  if (!support.any) {
    return { ok: true, skillArgs: stripSocialArgs(merged) };
  }

  if (!hasSocialArgs(merged)) {
    return {
      ok: false,
      errors: ['Social skills are selected, but social configuration is missing.'],
    };
  }

  const { config: currentConfig, tokenState } = readSocialConfigFromSkillArgs(existing);
  const normalized = normalizeSocialConfigInput({
    [SOCIAL_BASE_SKILL]: merged[SOCIAL_BASE_SKILL],
    [SOCIAL_TELEGRAM_SKILL]: {
      ...merged[SOCIAL_TELEGRAM_SKILL],
      bot_token: merged[SOCIAL_TELEGRAM_SKILL]?.bot_token || currentConfig.telegram.botToken,
    },
    [SOCIAL_DISCORD_SKILL]: {
      ...merged[SOCIAL_DISCORD_SKILL],
      bot_token: merged[SOCIAL_DISCORD_SKILL]?.bot_token || currentConfig.discord.botToken,
    },
  });

  const validation = validateSocialConfig(normalized, {
    support,
    requireAnyEnabled: true,
    tokenState,
  });
  if (!validation.ok) {
    return { ok: false, errors: validation.errors };
  }

  merged = writeSocialSkillArgs(merged, normalized, { encrypt });
  return { ok: true, skillArgs: merged };
}

async function testTelegramToken(token: string): Promise<{
  ok: boolean;
  payload: Record<string, unknown>;
}> {
  const response = await noProxyFetch(`https://api.telegram.org/bot${token}/getMe`, {
    method: 'POST',
  });
  const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok || payload.ok !== true) {
    return {
      ok: false,
      payload: {
        error: 'Telegram token verification failed.',
        code: 'SOCIAL_TEST_FAILED',
        details: payload,
      },
    };
  }
  return {
    ok: true,
    payload: {
      success: true,
      platform: 'telegram',
      account: payload.result || null,
    },
  };
}

async function testDiscordToken(token: string): Promise<{
  ok: boolean;
  payload: Record<string, unknown>;
}> {
  const response = await noProxyFetch('https://discord.com/api/v10/users/@me', {
    method: 'GET',
    headers: {
      Authorization: `Bot ${token}`,
    },
  });
  const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok) {
    return {
      ok: false,
      payload: {
        error: 'Discord token verification failed.',
        code: 'SOCIAL_TEST_FAILED',
        details: payload,
      },
    };
  }
  return {
    ok: true,
    payload: {
      success: true,
      platform: 'discord',
      account: payload,
    },
  };
}

export function createAgentRoutes(manager: AgentManager) {
  const app = new Hono();

  app.post('/agents', async (c) => {
    const userId: string | undefined = c.get('userId');
    const body = await c.req.json();
    const { name, persona, modelProvider, skills, skillArgs, creatorAddress, autoStart } = body;

    if (!name || !persona) {
      return c.json({ error: 'name and persona are required' }, 400);
    }

    const privateKey = generatePrivateKey();
    const account = privateKeyToAccount(privateKey);
    const walletAddress = account.address;
    const encryptedPrivateKey = encrypt(privateKey);
    const selectedSkills = normalizeSkillIds(skills);
    const preparedSkillArgs = prepareSkillArgsForPersist({
      selectedSkills,
      incomingSkillArgs: skillArgs || {},
    });
    if (!preparedSkillArgs.ok) {
      return c.json(
        {
          error: 'Invalid social configuration.',
          code: 'INVALID_SOCIAL_CONFIG',
          details: { errors: preparedSkillArgs.errors },
        },
        400,
      );
    }

    const id = crypto.randomUUID();
    const record = repo.createAgent({
      id,
      name,
      persona,
      modelProvider: modelProvider || 'openrouter',
      skills: selectedSkills,
      skillArgs: preparedSkillArgs.skillArgs,
      walletAddress,
      encryptedPrivateKey,
      creatorAddress: creatorAddress || null,
      userId: userId || null,
    });

    const agent = toAgentPublic(record);

    if (autoStart) {
      try {
        await manager.start(id);
        agent.status = 'running';
      } catch {
        agent.status = 'error';
      }
    }

    return c.json({ agent }, 201);
  });

  app.get('/agents', (c) => {
    const userId: string | undefined = c.get('userId');
    const records = repo.listAgents(userId);
    const agents = records.map((r) => {
      const pub = toAgentPublic(r);
      if (manager.isRunning(r.id) && r.status !== 'running') {
        pub.status = 'running';
      }
      return pub;
    });
    return c.json({ agents });
  });

  app.post('/agents/social/test', async (c) => {
    const body = await c.req.json();
    const platform = body?.platform as SocialTestPlatform | undefined;
    const token = typeof body?.token === 'string' ? body.token.trim() : '';

    if ((platform !== 'telegram' && platform !== 'discord') || !token) {
      return c.json(
        {
          error: 'platform and token are required',
          code: 'INVALID_SOCIAL_TEST_PAYLOAD',
        },
        400,
      );
    }

    if (platform === 'telegram') {
      const result = await testTelegramToken(token);
      return c.json(result.payload, result.ok ? 200 : 400);
    }

    const result = await testDiscordToken(token);
    return c.json(result.payload, result.ok ? 200 : 400);
  });

  app.get('/agents/:id', async (c) => {
    const id = c.req.param('id');
    const userId: string | undefined = c.get('userId');
    const record = repo.getAgent(id, userId);
    if (!record) return c.json({ error: 'Agent not found' }, 404);

    const agent = toAgentPublic(record);

    try {
      const [mantleBal, sepoliaBal] = await Promise.all([
        fetchBalance(record.walletAddress, mantle),
        fetchBalance(record.walletAddress, mantleSepoliaTestnet),
      ]);
      agent.balance = { mantle: mantleBal, mantleSepolia: sepoliaBal };
    } catch {
      agent.balance = { mantle: 'unavailable', mantleSepolia: 'unavailable' };
    }

    return c.json({ agent });
  });

  app.get('/agents/:id/social', (c) => {
    const id = c.req.param('id');
    const userId: string | undefined = c.get('userId');
    const record = repo.getAgent(id, userId);
    if (!record) return c.json({ error: 'Agent not found' }, 404);

    const selectedSkills = parseRecordSkillIds(record);
    const skillArgs = parseRecordSkillArgs(record);
    const { config, tokenState } = readSocialConfigFromSkillArgs(skillArgs);

    return c.json({
      social: {
        support: getSocialSupport(selectedSkills),
        config: {
          ...config,
          telegram: { ...config.telegram, botToken: '' },
          discord: { ...config.discord, botToken: '' },
        },
        tokenState,
      },
    });
  });

  app.patch('/agents/:id/social', async (c) => {
    const id = c.req.param('id');
    const userId: string | undefined = c.get('userId');
    const existing = repo.getAgent(id, userId);
    if (!existing) return c.json({ error: 'Agent not found' }, 404);

    if (manager.isRunning(id)) {
      return c.json({ error: 'Cannot update social config while agent is running.' }, 409);
    }

    const body = await c.req.json();
    const selectedSkills = parseRecordSkillIds(existing);
    const currentSkillArgs = parseRecordSkillArgs(existing);
    const socialPayload = body?.social ?? body;
    const normalized = normalizeSocialConfigInput(socialPayload);
    const incomingSkillArgs = {
      [SOCIAL_BASE_SKILL]: {
        command_prefix: normalized.base.commandPrefix,
        response_visibility: normalized.base.responseVisibility,
        enable_dm_fallback: String(normalized.base.enableDmFallback),
        enabled_platforms: normalized.base.platforms.join(','),
        telegram_enabled: String(normalized.telegram.enabled),
        telegram_bot_token: normalized.telegram.botToken,
        telegram_allowed_chat_ids: normalized.telegram.allowedChatIds.join(','),
        telegram_default_chat_id: normalized.telegram.defaultChatId,
        telegram_webhook_mode: normalized.telegram.webhookMode,
        discord_enabled: String(normalized.discord.enabled),
        discord_bot_token: normalized.discord.botToken,
        discord_guild_id: normalized.discord.guildId,
        discord_control_channel_id: normalized.discord.controlChannelId,
        discord_notify_channel_id: normalized.discord.notifyChannelId,
        discord_admin_role_ids: normalized.discord.adminRoleIds.join(','),
      },
    };
    const prepared = prepareSkillArgsForPersist({
      selectedSkills,
      existingSkillArgs: currentSkillArgs,
      incomingSkillArgs,
    });
    if (!prepared.ok) {
      return c.json(
        {
          error: 'Invalid social configuration.',
          code: 'INVALID_SOCIAL_CONFIG',
          details: { errors: prepared.errors },
        },
        400,
      );
    }

    const updated = repo.updateAgent(id, { skillArgs: prepared.skillArgs });
    const read = readSocialConfigFromSkillArgs(prepared.skillArgs);
    return c.json({
      social: {
        support: getSocialSupport(selectedSkills),
        config: {
          ...read.config,
          telegram: { ...read.config.telegram, botToken: '' },
          discord: { ...read.config.discord, botToken: '' },
        },
        tokenState: read.tokenState,
      },
      agent: updated ? toAgentPublic(updated) : null,
    });
  });

  app.post('/agents/:id/social/test', async (c) => {
    const id = c.req.param('id');
    const userId: string | undefined = c.get('userId');
    const record = repo.getAgent(id, userId);
    if (!record) return c.json({ error: 'Agent not found' }, 404);

    const body = await c.req.json();
    const platform = body?.platform as SocialTestPlatform | undefined;
    if (platform !== 'telegram' && platform !== 'discord') {
      return c.json(
        { error: 'platform must be telegram or discord', code: 'INVALID_SOCIAL_TEST_PAYLOAD' },
        400,
      );
    }

    const providedToken = typeof body?.token === 'string' ? body.token.trim() : '';
    const skillArgs = parseRecordSkillArgs(record);
    const current = readSocialConfigFromSkillArgs(skillArgs, { decrypt });
    const resolvedToken =
      providedToken ||
      (platform === 'telegram'
        ? current.config.telegram.botToken
        : current.config.discord.botToken);

    if (!resolvedToken) {
      return c.json(
        {
          error: `No ${platform} token configured.`,
          code: 'SOCIAL_TOKEN_MISSING',
        },
        400,
      );
    }

    if (platform === 'telegram') {
      const result = await testTelegramToken(resolvedToken);
      return c.json(result.payload, result.ok ? 200 : 400);
    }

    const result = await testDiscordToken(resolvedToken);
    return c.json(result.payload, result.ok ? 200 : 400);
  });

  app.patch('/agents/:id', async (c) => {
    const id = c.req.param('id');
    const userId: string | undefined = c.get('userId');
    const existing = repo.getAgent(id, userId);
    if (!existing) return c.json({ error: 'Agent not found' }, 404);

    if (manager.isRunning(id)) {
      return c.json({ error: 'Cannot update a running agent. Stop it first.' }, 409);
    }

    const body = await c.req.json();
    const hasSkillMutation = body.skills !== undefined || body.skillArgs !== undefined;
    let nextSkillArgs: SkillArgsMap | undefined;
    if (hasSkillMutation) {
      const selectedSkills =
        body.skills !== undefined ? normalizeSkillIds(body.skills) : parseRecordSkillIds(existing);
      const prepared = prepareSkillArgsForPersist({
        selectedSkills,
        existingSkillArgs: parseRecordSkillArgs(existing),
        incomingSkillArgs: body.skillArgs || {},
      });
      if (!prepared.ok) {
        return c.json(
          {
            error: 'Invalid social configuration.',
            code: 'INVALID_SOCIAL_CONFIG',
            details: { errors: prepared.errors },
          },
          400,
        );
      }
      nextSkillArgs = prepared.skillArgs;
    }

    const updated = repo.updateAgent(id, {
      name: body.name,
      persona: body.persona,
      modelProvider: body.modelProvider,
      skills: body.skills !== undefined ? normalizeSkillIds(body.skills) : undefined,
      skillArgs: nextSkillArgs,
      onChainMeta: body.onChainMeta,
    });

    return c.json({ agent: updated ? toAgentPublic(updated) : null });
  });

  app.delete('/agents/:id', async (c) => {
    const id = c.req.param('id');
    const userId: string | undefined = c.get('userId');
    const existing = repo.getAgent(id, userId);
    if (!existing) return c.json({ error: 'Agent not found' }, 404);

    const sweepPreflight = preflightSweep(existing);
    if (!sweepPreflight.ok) {
      return c.json(sweepPreflight.payload, sweepPreflight.status);
    }

    if (manager.isRunning(id)) {
      await manager.stop(id);
    }

    const sweepResult = await sweepAgentAssets(existing);
    if (!sweepResult.ok) {
      return c.json(sweepResult.payload, sweepResult.status);
    }

    repo.deleteAgent(id);
    return c.json({ success: true, sweep: sweepResult.summary });
  });

  app.post('/agents/:id/start', async (c) => {
    const id = c.req.param('id');
    const userId: string | undefined = c.get('userId');
    const record = repo.getAgent(id, userId);
    if (!record) return c.json({ error: 'Agent not found' }, 404);

    if (manager.isRunning(id)) {
      return c.json({ error: 'Agent is already running' }, 409);
    }

    try {
      await manager.start(id);
      return c.json({ status: 'running' });
    } catch (err: any) {
      return c.json({ error: `Failed to start: ${err.message}` }, 500);
    }
  });

  app.post('/agents/:id/stop', async (c) => {
    const id = c.req.param('id');
    if (!manager.isRunning(id)) {
      return c.json({ error: 'Agent is not running' }, 409);
    }

    await manager.stop(id);
    return c.json({ status: 'stopped' });
  });

  app.post('/agents/:id/deploy-token', async (c) => {
    const id = c.req.param('id');
    const userId: string | undefined = c.get('userId');
    const record = repo.getAgent(id, userId);
    if (!record) return c.json({ error: 'Agent not found' }, 404);

    const body = await c.req.json();
    const { tokenName, tokenSymbol, initialSupply, network } = body;
    if (!tokenName || !tokenSymbol) {
      return c.json({ error: 'tokenName and tokenSymbol are required' }, 400);
    }

    const networkKey: DeployNetwork =
      network === 'mantle' ? 'mantle' : 'mantleSepolia';
    const chain = networkKey === 'mantle' ? mantle : mantleSepoliaTestnet;
    const supply = BigInt(initialSupply || 1000000);

    try {
      const privateKey = decrypt(record.encryptedPrivateKey) as `0x${string}`;
      const account = privateKeyToAccount(privateKey);
      const wc = createWalletClient({
        account,
        chain,
        transport: rpcTransport(chain),
      });
      const pc = createPublicClient({ chain, transport: rpcTransport(chain) });

      const compiled = compileSolidity(ERC20_SOURCE, 'SimpleERC20');
      const deployData = encodeDeployData({
        abi: compiled.abi,
        bytecode: compiled.bytecode,
        args: [tokenName, tokenSymbol, supply],
      });
      const [gasEstimate, feeEstimate, balanceWei] = await Promise.all([
        pc.estimateGas({
          data: deployData,
        }),
        pc.estimateFeesPerGas(),
        pc.getBalance({ address: account.address }),
      ]);

      let gasPriceWei = feeEstimate.maxFeePerGas ?? feeEstimate.gasPrice;
      if (!gasPriceWei) {
        gasPriceWei = await pc.getGasPrice();
      }
      // Keep a safety margin for fee fluctuation between estimate and send.
      const requiredWei = ((gasEstimate * gasPriceWei) * 12n) / 10n;

      if (balanceWei < requiredWei) {
        const shortfallWei = requiredWei - balanceWei;
        return c.json(
          {
            error: 'Agent wallet has insufficient MNT for token deployment gas.',
            code: 'INSUFFICIENT_AGENT_GAS',
            details: {
              requiredMnt: toMntUnits(requiredWei),
              balanceMnt: toMntUnits(balanceWei),
              shortfallMnt: toMntUnits(shortfallWei),
              fundTo: account.address,
              network: networkKey,
            },
          },
          400,
        );
      }

      const hash = await wc.deployContract({
        abi: compiled.abi,
        bytecode: compiled.bytecode,
        args: [tokenName, tokenSymbol, supply],
      });

      const receipt = await pc.waitForTransactionReceipt({ hash });
      const contractAddress = receipt.contractAddress!;

      repo.updateAgent(id, {
        onChainMeta: {
          ...(record.onChainMeta ? JSON.parse(record.onChainMeta) : {}),
          governanceToken: {
            address: contractAddress,
            name: tokenName,
            symbol: tokenSymbol,
            supply: supply.toString(),
            txHash: hash,
            network: networkKey,
          },
        },
      });

      return c.json({
        success: true,
        token: { address: contractAddress, txHash: hash },
      });
    } catch (err: any) {
      return c.json({ error: `Token deployment failed: ${err.message}` }, 500);
    }
  });

  return app;
}

async function fetchBalance(address: string, chain: typeof mantle): Promise<string> {
  const client = createPublicClient({ chain, transport: rpcTransport(chain) });
  const balance = await client.getBalance({ address: address as `0x${string}` });
  return formatUnits(balance, 18);
}
