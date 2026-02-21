import React from 'react';
import { usePrivy } from '@privy-io/react-auth';
import { Navigate } from 'react-router-dom';

export const Landing: React.FC = () => {
  const { ready, authenticated, login } = usePrivy();

  if (!ready) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-muted border-t-primary" />
      </div>
    );
  }

  if (authenticated) {
    return <Navigate to="/dashboard" replace />;
  }

  return (
    <div className="flex h-screen flex-col items-center justify-center bg-background px-4">
      <div className="mb-8 flex flex-col items-center text-center">
        <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/15">
          <svg viewBox="0 0 24 24" fill="currentColor" className="h-8 w-8 text-primary">
            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z" />
          </svg>
        </div>
        <h1 className="text-3xl font-bold text-foreground">Mantle AaaS</h1>
        <p className="mt-2 text-base text-muted-foreground">Agent-as-a-Service on Mantle</p>
        <p className="mt-4 max-w-md text-sm leading-relaxed text-muted-foreground">
          Deploy autonomous AI agents with on-chain identity, composable skills,
          and built-in token economics. Powered by ERC-8004 and ElizaOS.
        </p>
      </div>

      <button
        onClick={login}
        className="rounded-lg bg-primary px-8 py-3 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
      >
        Get Started
      </button>
      <p className="mt-4 text-xs text-muted-foreground">
        Connect with email, social account, or wallet
      </p>
    </div>
  );
};
