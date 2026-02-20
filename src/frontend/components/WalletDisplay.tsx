import React, { useState } from 'react';
import { cn } from '../utils';

interface WalletDisplayProps {
  address: string;
  balance?: { mantle: string; mantleSepolia: string };
  compact?: boolean;
}

export const WalletDisplay: React.FC<WalletDisplayProps> = ({ address, balance, compact }) => {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    await navigator.clipboard.writeText(address);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const short = `${address.slice(0, 6)}...${address.slice(-4)}`;

  if (compact) {
    return (
      <button
        onClick={copy}
        className="flex items-center gap-1.5 rounded bg-muted px-2 py-1 font-mono text-xs text-muted-foreground hover:text-foreground transition-colors"
        title={`Click to copy: ${address}`}
      >
        {short}
        <CopyIcon copied={copied} />
      </button>
    );
  }

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
          Agent Wallet
        </span>
        <button
          onClick={copy}
          className="flex items-center gap-1 rounded px-2 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
        >
          {copied ? 'Copied!' : 'Copy'}
          <CopyIcon copied={copied} />
        </button>
      </div>

      <p className="font-mono text-sm text-foreground break-all mb-3">{address}</p>

      {balance && (
        <div className="flex gap-4 border-t border-border pt-3">
          <div>
            <p className="text-[10px] text-muted-foreground uppercase">Mainnet</p>
            <p className="text-sm font-medium text-foreground">
              {formatBal(balance.mantle)} <span className="text-muted-foreground">MNT</span>
            </p>
          </div>
          <div>
            <p className="text-[10px] text-muted-foreground uppercase">Sepolia</p>
            <p className="text-sm font-medium text-foreground">
              {formatBal(balance.mantleSepolia)} <span className="text-muted-foreground">MNT</span>
            </p>
          </div>
        </div>
      )}

      <p className="mt-3 text-[11px] text-muted-foreground">
        Send MNT to this address to fund your agent's on-chain actions.
      </p>
    </div>
  );
};

function formatBal(v: string): string {
  if (v === 'unavailable') return '--';
  const n = parseFloat(v);
  if (isNaN(n)) return v;
  return n.toFixed(4);
}

function CopyIcon({ copied }: { copied: boolean }) {
  if (copied) {
    return (
      <svg viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5 text-green-400">
        <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z" clipRule="evenodd" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5">
      <path d="M7 3.5A1.5 1.5 0 018.5 2h3.879a1.5 1.5 0 011.06.44l3.122 3.12A1.5 1.5 0 0117 6.622V12.5a1.5 1.5 0 01-1.5 1.5h-1v-3.379a3 3 0 00-.879-2.121L10.5 5.379A3 3 0 008.379 4.5H7v-1z" />
      <path d="M4.5 6A1.5 1.5 0 003 7.5v9A1.5 1.5 0 004.5 18h7a1.5 1.5 0 001.5-1.5v-5.879a1.5 1.5 0 00-.44-1.06L9.44 6.439A1.5 1.5 0 008.378 6H4.5z" />
    </svg>
  );
}
