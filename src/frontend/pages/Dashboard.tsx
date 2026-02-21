import React from 'react';
import { Link } from 'react-router-dom';
import { usePrivy } from '@privy-io/react-auth';
import { useAgents } from '../hooks/use-agents';
import { AgentCard } from '../components/AgentCard';

export const Dashboard: React.FC = () => {
  const { data: agents, isLoading, error } = useAgents();
  const { user } = usePrivy();

  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground">My Agents</h1>
          <p className="text-sm text-muted-foreground">
            Manage your autonomous AI agents on Mantle
          </p>
        </div>
        <Link
          to="/agents/new"
          className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
        >
          + New Agent
        </Link>
      </div>

      {isLoading && (
        <div className="flex items-center justify-center py-20">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-muted border-t-primary" />
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-red-500/20 bg-red-500/5 p-4 text-sm text-red-400">
          Failed to load agents: {(error as Error).message}
        </div>
      )}

      {agents && agents.length === 0 && (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border py-20">
          <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10">
            <svg viewBox="0 0 24 24" fill="currentColor" className="h-8 w-8 text-primary">
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm5 11h-4v4h-2v-4H7v-2h4V7h2v4h4v2z" />
            </svg>
          </div>
          <p className="mb-1 text-sm font-medium text-foreground">No agents yet</p>
          <p className="mb-4 text-xs text-muted-foreground">
            Create your first AI agent on Mantle
          </p>
          <Link
            to="/agents/new"
            className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            Create Agent
          </Link>
        </div>
      )}

      {agents && agents.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {agents.map((agent) => (
            <AgentCard key={agent.id} agent={agent} />
          ))}
        </div>
      )}
    </div>
  );
};
