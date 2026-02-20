import React from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useAgent, useStartAgent, useStopAgent, useDeleteAgent } from '../hooks/use-agents';
import { WalletDisplay } from '../components/WalletDisplay';
import { cn } from '../utils';

const STATUS_COLORS: Record<string, string> = {
  running: 'bg-green-500/15 text-green-400',
  created: 'bg-blue-500/15 text-blue-400',
  stopped: 'bg-muted text-muted-foreground',
  error: 'bg-red-500/15 text-red-400',
};

export const AgentDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: agent, isLoading, error } = useAgent(id!);
  const startAgent = useStartAgent();
  const stopAgent = useStopAgent();
  const deleteAgent = useDeleteAgent();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-muted border-t-primary" />
      </div>
    );
  }

  if (error || !agent) {
    return (
      <div className="mx-auto max-w-2xl px-6 py-8">
        <div className="rounded-lg border border-red-500/20 bg-red-500/5 p-4 text-sm text-red-400">
          Agent not found
        </div>
      </div>
    );
  }

  const isRunning = agent.status === 'running';
  const canStart = agent.status === 'created' || agent.status === 'stopped' || agent.status === 'error';

  const handleDelete = async () => {
    if (!confirm(`Delete agent "${agent.name}"? This cannot be undone.`)) return;
    await deleteAgent.mutateAsync(agent.id);
    navigate('/');
  };

  return (
    <div className="mx-auto max-w-2xl px-6 py-8 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary text-xl font-bold">
            {agent.name.charAt(0).toUpperCase()}
          </div>
          <div>
            <h1 className="text-xl font-bold text-foreground">{agent.name}</h1>
            <div className="flex items-center gap-2 mt-1">
              <span
                className={cn(
                  'rounded-full px-2.5 py-0.5 text-[11px] font-medium',
                  STATUS_COLORS[agent.status] || STATUS_COLORS.stopped,
                )}
              >
                {agent.status}
              </span>
              <span className="text-xs text-muted-foreground">{agent.modelProvider}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-2">
        {canStart && (
          <button
            onClick={() => startAgent.mutate(agent.id)}
            disabled={startAgent.isPending}
            className="rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50 transition-colors"
          >
            {startAgent.isPending ? 'Starting...' : 'Start'}
          </button>
        )}
        {isRunning && (
          <>
            <Link
              to={`/agents/${agent.id}/chat`}
              className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
            >
              Chat
            </Link>
            <button
              onClick={() => stopAgent.mutate(agent.id)}
              disabled={stopAgent.isPending}
              className="rounded-lg border border-border px-4 py-2 text-sm text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50 transition-colors"
            >
              {stopAgent.isPending ? 'Stopping...' : 'Stop'}
            </button>
          </>
        )}
        <button
          onClick={handleDelete}
          disabled={deleteAgent.isPending}
          className="rounded-lg border border-red-500/30 px-4 py-2 text-sm text-red-400 hover:bg-red-500/10 disabled:opacity-50 transition-colors ml-auto"
        >
          Delete
        </button>
      </div>

      {startAgent.isError && (
        <div className="rounded-lg border border-red-500/20 bg-red-500/5 p-3 text-sm text-red-400">
          Failed to start agent. Check server logs for details.
        </div>
      )}

      {/* Wallet */}
      <WalletDisplay address={agent.walletAddress} balance={agent.balance} />

      {/* Config */}
      <div className="space-y-4">
        <h2 className="text-sm font-semibold text-foreground uppercase tracking-wider">
          Configuration
        </h2>

        <div className="rounded-lg border border-border bg-card p-4 space-y-3">
          <div>
            <p className="text-[10px] text-muted-foreground uppercase">Persona</p>
            <p className="text-sm text-foreground mt-1">{agent.persona}</p>
          </div>

          <div>
            <p className="text-[10px] text-muted-foreground uppercase">Skills</p>
            {agent.skills.length > 0 ? (
              <div className="flex flex-wrap gap-1.5 mt-1">
                {agent.skills.map((s) => (
                  <span
                    key={s}
                    className="rounded bg-primary/10 px-2 py-0.5 text-xs text-primary font-medium"
                  >
                    {s}
                  </span>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground mt-1">No skills selected</p>
            )}
          </div>

          {agent.creatorAddress && (
            <div>
              <p className="text-[10px] text-muted-foreground uppercase">Creator</p>
              <p className="font-mono text-sm text-foreground mt-1">{agent.creatorAddress}</p>
            </div>
          )}

          <div>
            <p className="text-[10px] text-muted-foreground uppercase">Created</p>
            <p className="text-sm text-muted-foreground mt-1">
              {new Date(agent.createdAt).toLocaleString()}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
