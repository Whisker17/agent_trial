import React from 'react';
import { Link } from 'react-router-dom';
import { cn } from '../utils';
import type { AgentPublic } from '../api';

const STATUS_STYLES: Record<string, string> = {
  running: 'bg-green-500/15 text-green-400',
  created: 'bg-blue-500/15 text-blue-400',
  stopped: 'bg-muted text-muted-foreground',
  error: 'bg-red-500/15 text-red-400',
};

export const AgentCard: React.FC<{ agent: AgentPublic }> = ({ agent }) => {
  const short = `${agent.walletAddress.slice(0, 6)}...${agent.walletAddress.slice(-4)}`;

  return (
    <Link
      to={`/agents/${agent.id}`}
      className="group flex flex-col gap-3 rounded-xl border border-border bg-card p-5 transition-colors hover:border-primary/30"
    >
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary text-lg font-bold">
            {agent.name.charAt(0).toUpperCase()}
          </div>
          <div>
            <h3 className="text-sm font-semibold text-foreground group-hover:text-primary transition-colors">
              {agent.name}
            </h3>
            <p className="text-xs text-muted-foreground">{agent.modelProvider}</p>
          </div>
        </div>
        <span
          className={cn(
            'rounded-full px-2.5 py-0.5 text-[11px] font-medium',
            STATUS_STYLES[agent.status] || STATUS_STYLES.stopped,
          )}
        >
          {agent.status}
        </span>
      </div>

      <p className="line-clamp-2 text-xs text-muted-foreground leading-relaxed">
        {agent.persona}
      </p>

      <div className="flex items-center justify-between border-t border-border pt-3">
        <div className="flex items-center gap-1.5">
          <svg viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5 text-muted-foreground">
            <path d="M10 8a3 3 0 100-6 3 3 0 000 6zM3.465 14.493a1.23 1.23 0 00.41 1.412A9.957 9.957 0 0010 18c2.31 0 4.438-.784 6.131-2.1.43-.333.604-.903.408-1.41a7.002 7.002 0 00-13.074.003z" />
          </svg>
          <span className="font-mono text-xs text-muted-foreground" title={agent.walletAddress}>
            {short}
          </span>
        </div>
        {agent.skills.length > 0 && (
          <div className="flex gap-1">
            {agent.skills.slice(0, 2).map((s) => (
              <span key={s} className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                {s}
              </span>
            ))}
            {agent.skills.length > 2 && (
              <span className="text-[10px] text-muted-foreground">+{agent.skills.length - 2}</span>
            )}
          </div>
        )}
      </div>
    </Link>
  );
};
