import React, { useState, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { usePrivy } from '@privy-io/react-auth';
import { useQueryClient } from '@tanstack/react-query';
import { decodeEventLog, formatEther, parseEther } from 'viem';
import { useSkills } from '../hooks/use-agents';
import { usePrivyWallet } from '../hooks/use-privy-wallet';
import * as api from '../api';
import { IDENTITY_REGISTRY, IDENTITY_REGISTRY_ABI } from '../lib/contracts';
import { StepBasicInfo } from '../components/wizard/StepBasicInfo';
import { StepSkills } from '../components/wizard/StepSkills';
import { StepOnChain, type OnChainConfig } from '../components/wizard/StepOnChain';
import { StepReview, type DeployPhase } from '../components/wizard/StepReview';
import { StepSocial } from '../components/wizard/StepSocial';
import { cn } from '../utils';
const AUTO_TOPUP_BUFFER_WEI = parseEther('0.002');
const EXPLORERS = {
  mantle: 'https://mantlescan.xyz',
  mantleSepolia: 'https://sepolia.mantlescan.xyz',
} as const;

interface SocialSupport {
  any: boolean;
  telegram: boolean;
  discord: boolean;
}

const DEFAULT_SOCIAL_CONFIG: api.SocialConfigPayload = {
  base: {
    commandPrefix: '/',
    responseVisibility: 'public',
    enableDmFallback: true,
  },
  telegram: {
    enabled: true,
    botToken: '',
    allowedChatIds: '',
    defaultChatId: '',
    webhookMode: 'polling',
  },
  discord: {
    enabled: false,
    botToken: '',
    guildId: '',
    controlChannelId: '',
    notifyChannelId: '',
    adminRoleIds: '',
  },
};

function getSocialSupport(selectedSkills: string[]): SocialSupport {
  const hasSocial = selectedSkills.includes('social_apps_integration_base');
  return {
    any: hasSocial,
    telegram: hasSocial,
    discord: hasSocial,
  };
}

function splitCsv(value: string): string[] {
  return value
    .split(/[,\n]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function buildSocialSkillArgs(
  config: api.SocialConfigPayload,
  support: SocialSupport,
): Record<string, Record<string, string>> {
  if (!support.any) return {};

  const enabledPlatforms = [
    ...(config.telegram.enabled && support.telegram ? (['telegram'] as const) : []),
    ...(config.discord.enabled && support.discord ? (['discord'] as const) : []),
  ];

  return {
    social_apps_integration_base: {
      command_prefix: config.base.commandPrefix.trim() || '/',
      response_visibility: config.base.responseVisibility,
      enable_dm_fallback: String(config.base.enableDmFallback),
      enabled_platforms: enabledPlatforms.join(','),
      telegram_enabled: String(config.telegram.enabled && support.telegram),
      telegram_bot_token: config.telegram.botToken.trim(),
      telegram_allowed_chat_ids: splitCsv(config.telegram.allowedChatIds).join(','),
      telegram_default_chat_id: config.telegram.defaultChatId.trim(),
      telegram_webhook_mode: config.telegram.webhookMode,
      discord_enabled: String(config.discord.enabled && support.discord),
      discord_bot_token: config.discord.botToken.trim(),
      discord_guild_id: config.discord.guildId.trim(),
      discord_control_channel_id: config.discord.controlChannelId.trim(),
      discord_notify_channel_id: config.discord.notifyChannelId.trim(),
      discord_admin_role_ids: splitCsv(config.discord.adminRoleIds).join(','),
    },
  };
}

function validateSocialStep(
  config: api.SocialConfigPayload,
  support: SocialSupport,
): string[] {
  if (!support.any) return [];

  const errors: string[] = [];
  const telegramEnabled = support.telegram && config.telegram.enabled;
  const discordEnabled = support.discord && config.discord.enabled;

  if (!telegramEnabled && !discordEnabled) {
    errors.push('Enable at least one social platform.');
  }

  if (!config.base.commandPrefix.trim()) {
    errors.push('Command prefix is required.');
  }

  if (telegramEnabled) {
    if (!config.telegram.botToken.trim()) {
      errors.push('Telegram bot token is required.');
    }
  }

  if (discordEnabled) {
    if (!config.discord.botToken.trim()) {
      errors.push('Discord bot token is required.');
    }
    if (!config.discord.guildId.trim()) {
      errors.push('Discord guild ID is required.');
    }
  }

  return errors;
}

function networkLabel(network: 'mantle' | 'mantleSepolia'): string {
  return network === 'mantle' ? 'Mantle Mainnet' : 'Mantle Sepolia';
}

function toTxExplorerUrl(network: 'mantle' | 'mantleSepolia', txHash: string): string {
  return `${EXPLORERS[network]}/tx/${txHash}`;
}

function toDataUri(metadata: Record<string, unknown>): string {
  const json = JSON.stringify(metadata);
  const bytes = new TextEncoder().encode(json);
  let binary = '';
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return `data:application/json;base64,${window.btoa(binary)}`;
}

interface Erc8004Result {
  network: 'mantle' | 'mantleSepolia';
  txHash: string;
  agentId: string;
}

export const AgentWizard: React.FC = () => {
  const navigate = useNavigate();
  const { user } = usePrivy();
  const queryClient = useQueryClient();
  const { data: skills, isLoading: loadingSkills } = useSkills();
  const { address: userWalletAddress, getWalletClient, getPublicClient, sendMNT } =
    usePrivyWallet();

  const [step, setStep] = useState(0);
  const [name, setName] = useState('');
  const [persona, setPersona] = useState('');
  const [model, setModel] = useState('openrouter');
  const [selectedSkills, setSelectedSkills] = useState<string[]>([]);
  const [socialConfig, setSocialConfig] = useState<api.SocialConfigPayload>(
    DEFAULT_SOCIAL_CONFIG,
  );
  const [onChainConfig, setOnChainConfig] = useState<OnChainConfig>({
    enableErc8004: false,
    erc8004Network: 'mantleSepolia',
    enableToken: false,
    tokenName: '',
    tokenSymbol: '',
    tokenSupply: '1000000',
    fundAmount: '',
  });
  const [deployPhase, setDeployPhase] = useState<DeployPhase>('idle');
  const [deployError, setDeployError] = useState<string | null>(null);
  const [errorAtPhase, setErrorAtPhase] = useState<DeployPhase | null>(null);
  const [createdWalletAddress, setCreatedWalletAddress] = useState<string | null>(null);
  const [createdAgentId, setCreatedAgentId] = useState<string | null>(null);
  const [erc8004Result, setErc8004Result] = useState<Erc8004Result | null>(null);
  const socialSupport = getSocialSupport(selectedSkills);
  const steps = socialSupport.any
    ? ['Basic Info', 'Skills', 'Social Apps', 'On-Chain', 'Review']
    : ['Basic Info', 'Skills', 'On-Chain', 'Review'];
  const socialStepIndex = socialSupport.any ? 2 : -1;
  const onChainStepIndex = socialSupport.any ? 3 : 2;
  const reviewStepIndex = socialSupport.any ? 4 : 3;
  const socialValidationErrors = validateSocialStep(socialConfig, socialSupport);

  useEffect(() => {
    setSocialConfig((prev) => {
      const next = {
        ...prev,
        telegram: { ...prev.telegram, enabled: socialSupport.telegram ? prev.telegram.enabled : false },
        discord: { ...prev.discord, enabled: socialSupport.discord ? prev.discord.enabled : false },
      };
      if (socialSupport.any && !next.telegram.enabled && !next.discord.enabled) {
        if (socialSupport.telegram) next.telegram.enabled = true;
        else if (socialSupport.discord) next.discord.enabled = true;
      }
      return next;
    });
  }, [socialSupport.any, socialSupport.telegram, socialSupport.discord]);

  const canProceed = () => {
    if (step === 0) return name.trim() && persona.trim();
    if (step === socialStepIndex) {
      return socialValidationErrors.length === 0;
    }
    return true;
  };

  const handleDeploy = useCallback(async () => {
    if (deployPhase !== 'idle') return;
    const validationErrors = socialValidationErrors;
    if (validationErrors.length > 0) {
      if (socialStepIndex >= 0) setStep(socialStepIndex);
      return;
    }
    setDeployError(null);
    setErrorAtPhase(null);
    setErc8004Result(null);

    let lastPhase: DeployPhase = 'idle';
    let shouldRefreshWalletBalance = false;
    const socialSkillArgs = buildSocialSkillArgs(socialConfig, socialSupport);
    const advance = (phase: DeployPhase) => {
      lastPhase = phase;
      setDeployPhase(phase);
    };

    try {
      advance('creating');
      const agent = await api.createAgent({
        name: name.trim(),
        persona: persona.trim(),
        modelProvider: model,
        skills: selectedSkills,
        skillArgs: socialSkillArgs,
        creatorAddress: userWalletAddress || undefined,
      });
      setCreatedAgentId(agent.id);
      setCreatedWalletAddress(agent.walletAddress);

      const fundAmt = parseFloat(onChainConfig.fundAmount);
      if (fundAmt > 0) {
        advance('funding');
        await sendMNT(
          agent.walletAddress,
          onChainConfig.fundAmount,
          onChainConfig.erc8004Network,
        );
        shouldRefreshWalletBalance = true;
      }

      if (onChainConfig.enableErc8004) {
        advance('registering-8004');
        const network = onChainConfig.erc8004Network;
        const registryAddress = IDENTITY_REGISTRY[network];
        const walletClient = await getWalletClient(network);
        const publicClient = getPublicClient(network);

        const agentURI = toDataUri({
          type: 'agent',
          name: agent.name,
          description: persona.trim().slice(0, 200),
          walletAddress: agent.walletAddress,
          registrations: [
            {
              standard: 'ERC-8004',
              chainId: network === 'mantle' ? 5000 : 5003,
              registry: registryAddress,
            },
          ],
        });

        const hash = await walletClient.writeContract({
          address: registryAddress,
          abi: IDENTITY_REGISTRY_ABI,
          functionName: 'register',
          args: [agentURI],
        });
        shouldRefreshWalletBalance = true;

        const receipt = await publicClient.waitForTransactionReceipt({ hash });
        let registeredAgentId: string | null = null;
        for (const log of receipt.logs) {
          if (log.address.toLowerCase() !== registryAddress.toLowerCase()) continue;
          try {
            const decoded = decodeEventLog({
              abi: IDENTITY_REGISTRY_ABI,
              data: log.data,
              topics: log.topics,
            });
            if (decoded.eventName !== 'Registered') continue;
            const agentId = (decoded.args as { agentId: bigint }).agentId;
            registeredAgentId = agentId.toString();
            break;
          } catch {
            // Skip unrelated logs from this tx.
          }
        }

        if (!registeredAgentId) {
          throw new Error(
            `ERC-8004 registration tx confirmed but Registered event was not found. Verify on explorer: ${toTxExplorerUrl(network, hash)}`,
          );
        }

        await api.updateAgent(agent.id, {
          onChainMeta: {
            erc8004: {
              registered: true,
              registryAddress,
              agentId: registeredAgentId,
              txHash: hash,
              network,
            },
          },
        } as any);

        setErc8004Result({
          network,
          txHash: hash,
          agentId: registeredAgentId,
        });
      }

      if (onChainConfig.enableToken) {
        advance('deploying-token');
        const deployParams = {
          tokenName: onChainConfig.tokenName || `${name.trim()} Token`,
          tokenSymbol: onChainConfig.tokenSymbol || name.trim().slice(0, 4).toUpperCase(),
          initialSupply: onChainConfig.tokenSupply || '1000000',
          network: onChainConfig.erc8004Network,
        } as const;

        try {
          await api.deployToken(agent.id, deployParams);
        } catch (err) {
          if (!api.isInsufficientAgentGasError(err)) {
            throw err;
          }

          const { details } = err;
          const shortfallWei = parseEther(details.shortfallMnt);
          const topupAmount = formatEther(shortfallWei + AUTO_TOPUP_BUFFER_WEI);
          const chainName = networkLabel(details.network);

          if (!userWalletAddress) {
            throw new Error(
              `Agent wallet ${details.fundTo} has insufficient MNT on ${chainName}. Need at least ${details.shortfallMnt} MNT more for deployment gas.`,
            );
          }

          try {
            await sendMNT(details.fundTo, topupAmount, details.network);
            shouldRefreshWalletBalance = true;
          } catch (topupErr: any) {
            throw new Error(
              `Top-up to agent wallet was not completed on ${chainName}. Required shortfall: ${details.shortfallMnt} MNT to ${details.fundTo}. ${topupErr?.message || ''}`.trim(),
            );
          }

          await api.deployToken(agent.id, deployParams);
        }
      }

      advance('starting');
      await api.startAgent(agent.id);

      setDeployPhase('done');
      setTimeout(() => navigate(`/agents/${agent.id}`), 1500);
    } catch (err: any) {
      setErrorAtPhase(lastPhase);
      setDeployError(err.message || 'Deployment failed');
      setDeployPhase('error');
    } finally {
      await queryClient.invalidateQueries({ queryKey: ['walletBalance'] });
      if (shouldRefreshWalletBalance) {
        await queryClient.refetchQueries({ queryKey: ['walletBalance'] });
      }
    }
  }, [
    deployPhase,
    name,
    persona,
    model,
    selectedSkills,
    socialConfig,
    socialSupport,
    socialStepIndex,
    socialValidationErrors,
    onChainConfig,
    userWalletAddress,
    sendMNT,
    getWalletClient,
    getPublicClient,
    navigate,
    queryClient,
  ]);

  const isDeploying =
    deployPhase !== 'idle' && deployPhase !== 'done' && deployPhase !== 'error';

  return (
    <div className="mx-auto max-w-2xl px-6 py-8">
      <div className="mb-8">
        <h1 className="text-xl font-bold text-foreground">Create Agent</h1>
        <p className="text-sm text-muted-foreground">
          Configure your agent in {steps.length} steps
        </p>
      </div>

      {/* Step indicators */}
      <div className="mb-8 flex items-center gap-1">
        {steps.map((label, i) => (
          <React.Fragment key={label}>
            <button
              onClick={() => !isDeploying && i < step && setStep(i)}
              disabled={isDeploying || i > step}
              className={cn(
                'flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-medium transition-colors',
                i === step
                  ? 'bg-primary/15 text-primary'
                  : i < step
                    ? 'text-green-400 cursor-pointer hover:bg-muted'
                    : 'text-muted-foreground',
              )}
            >
              <span
                className={cn(
                  'flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold',
                  i === step
                    ? 'bg-primary text-primary-foreground'
                    : i < step
                      ? 'bg-green-500/20 text-green-400'
                      : 'bg-muted text-muted-foreground',
                )}
              >
                {i < step ? '\u2713' : i + 1}
              </span>
              <span className="hidden sm:inline">{label}</span>
            </button>
            {i < steps.length - 1 && (
              <div
                className={cn(
                  'h-px flex-1',
                  i < step ? 'bg-green-500/30' : 'bg-border',
                )}
              />
            )}
          </React.Fragment>
        ))}
      </div>

      {/* Step content */}
      <div className="mb-8">
        {step === 0 && (
          <StepBasicInfo
            name={name}
            persona={persona}
            model={model}
            onNameChange={setName}
            onPersonaChange={setPersona}
            onModelChange={setModel}
          />
        )}
        {step === 1 && (
          <StepSkills
            skills={skills || []}
            loadingSkills={loadingSkills}
            selectedSkills={selectedSkills}
            onSkillsChange={setSelectedSkills}
          />
        )}
        {step === socialStepIndex && socialSupport.any && (
          <StepSocial
            config={socialConfig}
            support={socialSupport}
            onChange={setSocialConfig}
            onTestConnection={async (platform, token) => {
              try {
                const result = await api.testSocialConnection(platform, token);
                const account = result.account as { username?: string; id?: string } | null;
                const label =
                  account?.username || account?.id
                    ? `Connected as ${account.username || account.id}.`
                    : 'Connection test succeeded.';
                return { ok: true, message: label };
              } catch (err) {
                const message =
                  err instanceof api.ApiError ? err.message : 'Connection test failed';
                return { ok: false, message };
              }
            }}
          />
        )}
        {step === onChainStepIndex && (
          <StepOnChain
            config={onChainConfig}
            onChange={setOnChainConfig}
            selectedSkills={selectedSkills}
            agentName={name}
          />
        )}
        {step === reviewStepIndex && (
          <StepReview
            name={name}
            persona={persona}
            model={model}
            selectedSkills={selectedSkills}
            skills={skills || []}
            onChainConfig={onChainConfig}
            socialConfig={socialConfig}
            socialSupport={socialSupport}
            deployPhase={deployPhase}
            deployError={deployError}
            errorAtPhase={errorAtPhase}
            createdWalletAddress={createdWalletAddress}
            erc8004Result={erc8004Result}
          />
        )}
      </div>

      {step === socialStepIndex && socialValidationErrors.length > 0 && (
        <div className="mb-4 rounded-lg border border-red-500/20 bg-red-500/5 p-3 text-sm text-red-400">
          {socialValidationErrors[0]}
        </div>
      )}

      {/* Navigation buttons */}
      <div className="flex gap-3">
        {step > 0 && !isDeploying && deployPhase !== 'done' && (
          <button
            type="button"
            onClick={() => setStep(step - 1)}
            className="rounded-lg border border-border px-6 py-2.5 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            Back
          </button>
        )}

        <div className="flex-1" />

        {step < steps.length - 1 && (
          <button
            type="button"
            onClick={() => setStep(step + 1)}
            disabled={!canProceed()}
            className={cn(
              'rounded-lg px-6 py-2.5 text-sm font-semibold transition-colors',
              canProceed()
                ? 'bg-primary text-primary-foreground hover:bg-primary/90'
                : 'bg-muted text-muted-foreground cursor-not-allowed',
            )}
          >
            Next
          </button>
        )}

        {step === steps.length - 1 && deployPhase === 'idle' && (
          <button
            type="button"
            onClick={handleDeploy}
            disabled={!name.trim() || !persona.trim()}
            className={cn(
              'rounded-lg px-8 py-2.5 text-sm font-semibold transition-colors',
              name.trim() && persona.trim()
                ? 'bg-primary text-primary-foreground hover:bg-primary/90'
                : 'bg-muted text-muted-foreground cursor-not-allowed',
            )}
          >
            Deploy Agent
          </button>
        )}

        {deployPhase === 'error' && (
          <button
            type="button"
            onClick={() => {
              setDeployPhase('idle');
              setDeployError(null);
              setErrorAtPhase(null);
            }}
            className="rounded-lg bg-primary px-6 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Retry
          </button>
        )}
      </div>
    </div>
  );
};
