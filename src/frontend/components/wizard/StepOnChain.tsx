import React from 'react';
import { cn } from '../../utils';

export interface OnChainConfig {
  enableErc8004: boolean;
  erc8004Network: 'mantleSepolia' | 'mantle';
  enableToken: boolean;
  tokenName: string;
  tokenSymbol: string;
  tokenSupply: string;
  fundAmount: string;
}

interface StepOnChainProps {
  config: OnChainConfig;
  onChange: (config: OnChainConfig) => void;
  selectedSkills: string[];
  agentName: string;
}

export const StepOnChain: React.FC<StepOnChainProps> = ({
  config,
  onChange,
  selectedSkills,
  agentName,
}) => {
  const has8004 = selectedSkills.includes('mantle_8004_base');
  const hasAssetDeploy = selectedSkills.includes('asset_deploy');

  const update = (partial: Partial<OnChainConfig>) =>
    onChange({ ...config, ...partial });

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-sm font-semibold text-foreground uppercase tracking-wider">
          On-Chain Initialization
        </h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Optional on-chain actions during creation. ERC-8004 uses your connected wallet; token deployment uses the agent wallet.
        </p>
      </div>

      {/* ERC-8004 Registration */}
      {has8004 && (
        <div className="rounded-lg border border-border bg-card p-4 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-foreground">ERC-8004 Registration</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Register agent identity on-chain for reputation and discovery
              </p>
            </div>
            <Toggle
              checked={config.enableErc8004}
              onChange={(v) => update({ enableErc8004: v })}
            />
          </div>

          {config.enableErc8004 && (
            <div>
              <label className="mb-1.5 block text-xs text-muted-foreground">Network</label>
              <div className="flex gap-2">
                {(['mantleSepolia', 'mantle'] as const).map((net) => (
                  <button
                    key={net}
                    type="button"
                    onClick={() => update({ erc8004Network: net })}
                    className={cn(
                      'rounded-lg border px-3 py-1.5 text-xs transition-colors',
                      config.erc8004Network === net
                        ? 'border-primary bg-primary/10 text-primary font-medium'
                        : 'border-border text-muted-foreground hover:border-muted-foreground/30',
                    )}
                  >
                    {net === 'mantleSepolia' ? 'Sepolia (Testnet)' : 'Mainnet'}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Governance Token */}
      {hasAssetDeploy && (
        <div className="rounded-lg border border-border bg-card p-4 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-foreground">Governance Token</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Deploy an ERC-20 token during creation
              </p>
              <p className="text-[10px] text-muted-foreground mt-1">
                Gas is paid by the agent wallet. If balance is low, the wizard can top up MNT from your connected wallet and retry.
              </p>
            </div>
            <Toggle
              checked={config.enableToken}
              onChange={(v) => update({ enableToken: v })}
            />
          </div>

          {config.enableToken && (
            <div className="space-y-3">
              <div>
                <label className="mb-1.5 block text-xs text-muted-foreground">Token Name</label>
                <input
                  type="text"
                  value={config.tokenName}
                  onChange={(e) => update({ tokenName: e.target.value })}
                  placeholder={`${agentName || 'Agent'} Token`}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/50"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1.5 block text-xs text-muted-foreground">Symbol</label>
                  <input
                    type="text"
                    value={config.tokenSymbol}
                    onChange={(e) => update({ tokenSymbol: e.target.value.toUpperCase() })}
                    placeholder="TKN"
                    maxLength={6}
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/50"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-xs text-muted-foreground">Initial Supply</label>
                  <input
                    type="text"
                    value={config.tokenSupply}
                    onChange={(e) => update({ tokenSupply: e.target.value.replace(/[^0-9]/g, '') })}
                    placeholder="1000000"
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/50"
                  />
                </div>
              </div>
              <p className="text-[10px] text-muted-foreground">
                You can also deploy tokens later by chatting with your agent.
              </p>
            </div>
          )}
        </div>
      )}

      {/* Fund Agent Wallet */}
      <div className="rounded-lg border border-border bg-card p-4 space-y-3">
        <div>
          <p className="text-sm font-medium text-foreground">Fund Agent Wallet</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Send MNT to your agent's wallet for gas fees
          </p>
        </div>
        <div>
          <label className="mb-1.5 block text-xs text-muted-foreground">Amount (MNT)</label>
          <input
            type="text"
            value={config.fundAmount}
            onChange={(e) => update({ fundAmount: e.target.value.replace(/[^0-9.]/g, '') })}
            placeholder="0"
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/50"
          />
          <p className="mt-1 text-[10px] text-muted-foreground">
            Leave 0 to skip. This MNT is used for agent-initiated transactions like token deployment gas.
          </p>
        </div>
      </div>

      {!has8004 && !hasAssetDeploy && (
        <div className="rounded-lg border border-dashed border-border p-6 text-center">
          <p className="text-sm text-muted-foreground">
            Select ERC-8004 or Asset Deploy skills in the previous step to enable on-chain initialization options.
          </p>
        </div>
      )}
    </div>
  );
};

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={cn(
        'relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors',
        checked ? 'bg-primary' : 'bg-muted',
      )}
    >
      <span
        className={cn(
          'pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow-sm transition-transform',
          checked ? 'translate-x-5' : 'translate-x-0',
        )}
      />
    </button>
  );
}
