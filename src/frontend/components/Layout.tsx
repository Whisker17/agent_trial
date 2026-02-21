import React, { useState, useRef, useEffect } from 'react';
import { Outlet, Link, useLocation } from 'react-router-dom';
import { usePrivy, useWallets, useFundWallet } from '@privy-io/react-auth';
import { createPublicClient, http, formatEther } from 'viem';
import { mantle, mantleSepoliaTestnet } from 'viem/chains';
import { cn } from '../utils';

type NetworkKey = 'mantleSepolia' | 'mantle';

const CHAINS = {
  mantleSepolia: mantleSepoliaTestnet,
  mantle: mantle,
} as const;

const NETWORK_LABELS: Record<NetworkKey, string> = {
  mantleSepolia: 'Sepolia',
  mantle: 'Mainnet',
};

const FAUCET_URL = 'https://faucet.sepolia.mantle.xyz';

function AccountMenu() {
  const { logout } = usePrivy();
  const { wallets } = useWallets();
  const { fundWallet } = useFundWallet();
  const userWallet = wallets[0];
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [network, setNetwork] = useState<NetworkKey>('mantleSepolia');
  const [balance, setBalance] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  useEffect(() => {
    if (!userWallet) return;
    setBalance(null);
    const chain = CHAINS[network];
    const client = createPublicClient({ chain, transport: http() });
    let cancelled = false;
    client
      .getBalance({ address: userWallet.address as `0x${string}` })
      .then((b) => {
        if (!cancelled) {
          const raw = formatEther(b);
          const truncated = parseFloat(raw).toFixed(4);
          setBalance(truncated);
        }
      })
      .catch(() => {
        if (!cancelled) setBalance(null);
      });
    return () => {
      cancelled = true;
    };
  }, [userWallet?.address, network]);

  if (!userWallet) {
    return (
      <button
        onClick={logout}
        className="rounded-md px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      >
        Logout
      </button>
    );
  }

  const addr = userWallet.address;

  async function handleCopy() {
    await navigator.clipboard.writeText(addr);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  async function handleFund() {
    setOpen(false);
    if (network === 'mantleSepolia') {
      window.open(FAUCET_URL, '_blank');
      return;
    }
    try {
      await fundWallet({ address: addr, options: { chain: mantle } });
    } catch {
      // user closed the funding modal
    }
  }

  function handleLogout() {
    setOpen(false);
    logout();
  }

  return (
    <div className="relative" ref={menuRef}>
      <button
        onClick={() => setOpen(!open)}
        className={cn(
          'flex items-center gap-2 rounded-md px-2.5 py-1.5 transition-colors',
          open ? 'bg-muted' : 'hover:bg-muted',
        )}
      >
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/15 text-[10px] font-bold text-primary">
          {addr.slice(2, 4).toUpperCase()}
        </span>
        <span className="font-mono text-[11px] text-muted-foreground">
          {addr.slice(0, 6)}...{addr.slice(-4)}
        </span>
        {balance !== null && (
          <span className="text-[11px] font-medium text-foreground">{balance} MNT</span>
        )}
        <svg
          viewBox="0 0 20 20"
          fill="currentColor"
          className={cn(
            'h-3.5 w-3.5 text-muted-foreground transition-transform',
            open && 'rotate-180',
          )}
        >
          <path
            fillRule="evenodd"
            d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z"
            clipRule="evenodd"
          />
        </svg>
      </button>

      {open && (
        <div className="absolute right-0 top-full z-50 mt-1 w-56 overflow-hidden rounded-lg border border-border bg-background shadow-lg">
          {/* Network selector */}
          <div className="border-b border-border px-3 py-2">
            <p className="mb-1.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
              Network
            </p>
            <div className="flex gap-1.5">
              {(['mantleSepolia', 'mantle'] as const).map((net) => (
                <button
                  key={net}
                  onClick={() => setNetwork(net)}
                  className={cn(
                    'flex-1 rounded-md px-2 py-1 text-[11px] font-medium transition-colors',
                    network === net
                      ? 'bg-primary/15 text-primary'
                      : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                  )}
                >
                  {NETWORK_LABELS[net]}
                </button>
              ))}
            </div>
          </div>

          {/* Wallet info */}
          <div className="border-b border-border px-3 py-2">
            <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
              Wallet
            </p>
            <p className="mt-0.5 truncate font-mono text-xs text-foreground">{addr}</p>
            {balance !== null && (
              <p className="mt-0.5 text-xs font-medium text-foreground">{balance} MNT</p>
            )}
          </div>

          <div className="py-1">
            <MenuButton onClick={handleCopy}>
              <ClipboardIcon />
              {copied ? 'Copied!' : 'Copy Address'}
            </MenuButton>

            <MenuButton onClick={handleFund}>
              <FundIcon />
              {network === 'mantleSepolia' ? 'Get Testnet MNT' : 'Fund Wallet'}
            </MenuButton>
          </div>

          <div className="border-t border-border py-1">
            <MenuButton onClick={handleLogout} variant="danger">
              <LogoutIcon />
              Logout
            </MenuButton>
          </div>
        </div>
      )}
    </div>
  );
}

function MenuButton({
  onClick,
  children,
  variant,
}: {
  onClick: () => void;
  children: React.ReactNode;
  variant?: 'danger';
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm transition-colors',
        variant === 'danger'
          ? 'text-red-400 hover:bg-red-500/10'
          : 'text-muted-foreground hover:bg-muted hover:text-foreground',
      )}
    >
      {children}
    </button>
  );
}

function ClipboardIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4 shrink-0">
      <path
        fillRule="evenodd"
        d="M13.887 3.182c.396.037.79.08 1.183.128C16.194 3.45 17 4.414 17 5.517V16.75A2.25 2.25 0 0114.75 19h-9.5A2.25 2.25 0 013 16.75V5.517c0-1.103.806-2.068 1.93-2.207.393-.048.787-.09 1.183-.128A3.001 3.001 0 019 1h2c1.373 0 2.531.923 2.887 2.182zM7.5 4A1.5 1.5 0 019 2.5h2A1.5 1.5 0 0112.5 4v.5h-5V4z"
        clipRule="evenodd"
      />
    </svg>
  );
}

function FundIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4 shrink-0">
      <path d="M1 4.25a3.733 3.733 0 012.25-.75h13.5c.844 0 1.623.279 2.25.75A2.25 2.25 0 0016.75 2H3.25A2.25 2.25 0 001 4.25zM1 7.25a3.733 3.733 0 012.25-.75h13.5c.844 0 1.623.279 2.25.75A2.25 2.25 0 0016.75 5H3.25A2.25 2.25 0 001 7.25zM7 8a1 1 0 011 1 2 2 0 104 0 1 1 0 011-1h3.75A2.25 2.25 0 0119 10.25v5.5A2.25 2.25 0 0116.75 18H3.25A2.25 2.25 0 011 15.75v-5.5A2.25 2.25 0 013.25 8H7z" />
    </svg>
  );
}

function LogoutIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4 shrink-0">
      <path
        fillRule="evenodd"
        d="M3 4.25A2.25 2.25 0 015.25 2h5.5A2.25 2.25 0 0113 4.25v2a.75.75 0 01-1.5 0v-2a.75.75 0 00-.75-.75h-5.5a.75.75 0 00-.75.75v11.5c0 .414.336.75.75.75h5.5a.75.75 0 00.75-.75v-2a.75.75 0 011.5 0v2A2.25 2.25 0 0110.75 18h-5.5A2.25 2.25 0 013 15.75V4.25z"
        clipRule="evenodd"
      />
      <path
        fillRule="evenodd"
        d="M19 10a.75.75 0 00-.75-.75H8.704l1.048-.943a.75.75 0 10-1.004-1.114l-2.5 2.25a.75.75 0 000 1.114l2.5 2.25a.75.75 0 101.004-1.114l-1.048-.943h9.546A.75.75 0 0019 10z"
        clipRule="evenodd"
      />
    </svg>
  );
}

export const Layout: React.FC = () => {
  const { pathname } = useLocation();

  return (
    <div className="flex h-screen flex-col bg-background">
      <header className="flex items-center justify-between border-b border-border px-6 py-3">
        <Link to="/dashboard" className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/15">
            <svg viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5 text-primary">
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z" />
            </svg>
          </div>
          <span className="text-sm font-semibold text-foreground">Mantle AaaS</span>
        </Link>

        <nav className="flex items-center gap-1">
          <NavLink to="/dashboard" current={pathname === '/dashboard'}>
            My Agents
          </NavLink>
          <NavLink to="/agents/new" current={pathname === '/agents/new'}>
            + New Agent
          </NavLink>
        </nav>

        <AccountMenu />
      </header>

      <main className="flex-1 overflow-y-auto">
        <Outlet />
      </main>
    </div>
  );
};

function NavLink({
  to,
  current,
  children,
}: {
  to: string;
  current: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      to={to}
      className={cn(
        'rounded-md px-3 py-1.5 text-sm transition-colors',
        current
          ? 'bg-primary/10 text-primary font-medium'
          : 'text-muted-foreground hover:text-foreground hover:bg-muted',
      )}
    >
      {children}
    </Link>
  );
}
