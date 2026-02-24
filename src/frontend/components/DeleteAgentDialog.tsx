import React, { useEffect } from 'react';

interface DeleteAgentDialogProps {
  open: boolean;
  agentName: string;
  pending?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

export const DeleteAgentDialog: React.FC<DeleteAgentDialogProps> = ({
  open,
  agentName,
  pending = false,
  onCancel,
  onConfirm,
}) => {
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !pending) onCancel();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, pending, onCancel]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <button
        aria-label="Close delete dialog"
        className="absolute inset-0 bg-black/60 backdrop-blur-[1px]"
        onClick={() => !pending && onCancel()}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="delete-agent-title"
        className="relative w-full max-w-lg rounded-xl border border-border bg-card p-5 shadow-2xl"
      >
        <p className="text-[11px] font-semibold uppercase tracking-wider text-red-400">
          Destructive Action
        </p>
        <h2 id="delete-agent-title" className="mt-1 text-lg font-semibold text-foreground">
          Delete & sweep assets
        </h2>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
          Agent <span className="font-semibold text-foreground">&quot;{agentName}&quot;</span> will be
          deleted. Before deletion, the server will attempt to sweep this agent wallet&apos;s assets
          (MNT and configured ERC20 tokens on Mantle Mainnet and Sepolia) to your creator address.
        </p>
        <div className="mt-3 rounded-lg border border-border bg-background/60 p-3 text-xs text-muted-foreground">
          Deletion is blocked if any transfer fails.
        </div>

        <div className="mt-5 flex items-center justify-end gap-2">
          <button
            onClick={onCancel}
            disabled={pending}
            className="rounded-lg border border-border px-4 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={pending}
            className="rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-2 text-sm font-medium text-red-300 transition-colors hover:bg-red-500/15 disabled:opacity-50"
          >
            {pending ? 'Deleting...' : 'Delete Agent'}
          </button>
        </div>
      </div>
    </div>
  );
};
