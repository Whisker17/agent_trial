import React from 'react';
import type { SkillMeta, SocialConfigPayload } from '../../api';
import type { OnChainConfig } from './StepOnChain';

export type DeployPhase =
  | 'idle'
  | 'creating'
  | 'funding'
  | 'registering-8004'
  | 'deploying-token'
  | 'starting'
  | 'done'
  | 'error';

interface StepReviewProps {
  name: string;
  persona: string;
  model: string;
  selectedSkills: string[];
  skills: SkillMeta[];
  onChainConfig: OnChainConfig;
  socialConfig: SocialConfigPayload;
  socialSupport: { any: boolean; telegram: boolean; discord: boolean };
  deployPhase: DeployPhase;
  deployError: string | null;
  errorAtPhase: DeployPhase | null;
  createdWalletAddress: string | null;
  erc8004Result: {
    network: 'mantle' | 'mantleSepolia';
    txHash: string;
    agentId: string;
  } | null;
}

const PHASE_LABELS: Record<DeployPhase, string> = {
  idle: '',
  creating: 'Creating agent...',
  funding: 'Funding agent wallet...',
  'registering-8004': 'Registering ERC-8004 identity...',
  'deploying-token': 'Deploying governance token...',
  starting: 'Starting agent runtime...',
  done: 'Agent deployed successfully!',
  error: 'Deployment failed',
};

const PHASE_ORDER: DeployPhase[] = [
  'creating',
  'funding',
  'registering-8004',
  'deploying-token',
  'starting',
];

export const StepReview: React.FC<StepReviewProps> = ({
  name,
  persona,
  model,
  selectedSkills,
  skills,
  onChainConfig,
  socialConfig,
  socialSupport,
  deployPhase,
  deployError,
  errorAtPhase,
  createdWalletAddress,
  erc8004Result,
}) => {
  const isDeploying = deployPhase !== 'idle' && deployPhase !== 'done' && deployPhase !== 'error';
  const skillNames = selectedSkills
    .map((id) => skills.find((s) => s.id === id)?.name || id)
    .join(', ');
  const enabledSocialPlatforms = [
    ...(socialSupport.telegram && socialConfig.telegram.enabled ? ['Telegram'] : []),
    ...(socialSupport.discord && socialConfig.discord.enabled ? ['Discord'] : []),
  ];

  const activePhases = PHASE_ORDER.filter((p) => {
    if (p === 'funding') return parseFloat(onChainConfig.fundAmount) > 0;
    if (p === 'registering-8004') return onChainConfig.enableErc8004;
    if (p === 'deploying-token') return onChainConfig.enableToken;
    return true;
  });

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-sm font-semibold text-foreground uppercase tracking-wider">
          Review & Deploy
        </h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Confirm your agent configuration before deploying
        </p>
      </div>

      <div className="rounded-lg border border-border bg-card p-4 space-y-3">
        <Row label="Name" value={name} />
        <Row label="Persona" value={persona.length > 120 ? persona.slice(0, 120) + '...' : persona} />
        <Row label="Model" value={model} />
        <Row label="Skills" value={skillNames || 'None selected (system skills only)'} />
        {socialSupport.any && (
          <Row
            label="Social"
            value={
              enabledSocialPlatforms.length > 0
                ? `${enabledSocialPlatforms.join(' + ')} (${socialConfig.base.commandPrefix} commands)`
                : 'Configured but disabled'
            }
          />
        )}
        {onChainConfig.enableErc8004 && (
          <Row
            label="ERC-8004"
            value={`Register on ${onChainConfig.erc8004Network === 'mantleSepolia' ? 'Sepolia' : 'Mainnet'}`}
          />
        )}
        {onChainConfig.enableToken && (
          <Row
            label="Token"
            value={`${onChainConfig.tokenName || name + ' Token'} (${onChainConfig.tokenSymbol || '???'}) — ${onChainConfig.tokenSupply || '1000000'} supply`}
          />
        )}
        {parseFloat(onChainConfig.fundAmount) > 0 && (
          <Row label="Fund" value={`${onChainConfig.fundAmount} MNT`} />
        )}
        {createdWalletAddress && <Row label="Agent Wallet" value={createdWalletAddress} mono />}
      </div>

      {/* Deploy progress */}
      {deployPhase !== 'idle' && (
        <div className="rounded-lg border border-border bg-card p-4 space-y-3">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Deploy Progress
          </p>
          <div className="space-y-2">
            {activePhases.map((phase) => {
              const phaseIdx = activePhases.indexOf(phase);
              let status: 'pending' | 'active' | 'done' | 'error' = 'pending';
              if (deployPhase === 'error' && errorAtPhase) {
                const errorIdx = activePhases.indexOf(errorAtPhase as any);
                if (phaseIdx < errorIdx) status = 'done';
                else if (phaseIdx === errorIdx) status = 'error';
              } else if (deployPhase === 'done') {
                status = 'done';
              } else {
                const currentIdx = activePhases.indexOf(deployPhase as any);
                if (phaseIdx < currentIdx) status = 'done';
                else if (phaseIdx === currentIdx) status = 'active';
              }

              return (
                <div key={phase} className="flex items-center gap-3">
                  <PhaseIcon status={status} />
                  <span
                    className={`text-sm ${
                      status === 'active'
                        ? 'text-primary font-medium'
                        : status === 'done'
                          ? 'text-green-400'
                          : status === 'error'
                            ? 'text-red-400'
                            : 'text-muted-foreground'
                    }`}
                  >
                    {PHASE_LABELS[phase]}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {deployError && (
        <div className="max-h-40 overflow-y-auto overflow-x-auto break-words whitespace-pre-wrap rounded-lg border border-red-500/20 bg-red-500/5 p-3 text-sm text-red-400">
          {deployError}
        </div>
      )}

      {erc8004Result && (
        <div className="rounded-lg border border-green-500/20 bg-green-500/5 p-3 text-sm text-green-400">
          <p>ERC-8004 registration confirmed on {erc8004Result.network === 'mantle' ? 'Mantle Mainnet' : 'Mantle Sepolia'}.</p>
          <p className="mt-1 font-mono text-[11px] break-all">Agent ID: {erc8004Result.agentId}</p>
          <p className="mt-0.5 font-mono text-[11px] break-all">Tx: {erc8004Result.txHash}</p>
        </div>
      )}

      {deployPhase === 'done' && (
        <div className="rounded-lg border border-green-500/20 bg-green-500/5 p-3 text-sm text-green-400">
          Agent deployed and running! Redirecting...
        </div>
      )}
    </div>
  );
};

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex justify-between gap-4">
      <span className="text-xs text-muted-foreground uppercase shrink-0">{label}</span>
      <span
        className={`text-sm text-foreground text-right ${mono ? 'font-mono text-xs break-all' : ''}`}
      >
        {value}
      </span>
    </div>
  );
}

function PhaseIcon({ status }: { status: 'pending' | 'active' | 'done' | 'error' }) {
  if (status === 'active') {
    return (
      <div className="h-4 w-4 animate-spin rounded-full border-2 border-muted border-t-primary" />
    );
  }
  if (status === 'done') {
    return (
      <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4 text-green-400">
        <path
          fillRule="evenodd"
          d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z"
          clipRule="evenodd"
        />
      </svg>
    );
  }
  if (status === 'error') {
    return (
      <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4 text-red-400">
        <path
          fillRule="evenodd"
          d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.28 7.22a.75.75 0 00-1.06 1.06L8.94 10l-1.72 1.72a.75.75 0 101.06 1.06L10 11.06l1.72 1.72a.75.75 0 101.06-1.06L11.06 10l1.72-1.72a.75.75 0 00-1.06-1.06L10 8.94 8.28 7.22z"
          clipRule="evenodd"
        />
      </svg>
    );
  }
  return <div className="h-4 w-4 rounded-full border-2 border-muted" />;
}
