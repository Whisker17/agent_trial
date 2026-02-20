import React from 'react';
import { cn } from './utils';
import type { ChatMessage as ChatMessageType } from './hooks/use-chat';

interface ChatMessageProps {
  message: ChatMessageType;
  agentName?: string;
}

function formatRelativeTime(ts: number): string {
  const diff = Math.floor((Date.now() - ts) / 1000);
  if (diff < 10) return 'just now';
  if (diff < 60) return `${diff}s ago`;
  const mins = Math.floor(diff / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return new Date(ts).toLocaleDateString();
}

/** Highlight 0x addresses in text as monospace truncated spans. */
function renderText(text: string): React.ReactNode[] {
  const parts = text.split(/(0x[a-fA-F0-9]{40})/g);
  return parts.map((part, i) => {
    if (/^0x[a-fA-F0-9]{40}$/.test(part)) {
      const short = `${part.slice(0, 6)}...${part.slice(-4)}`;
      return (
        <span
          key={i}
          className="inline-block rounded bg-muted px-1 py-0.5 font-mono text-xs text-primary"
          title={part}
        >
          {short}
        </span>
      );
    }
    // Handle code blocks (triple backtick)
    if (part.includes('```')) {
      const segments = part.split(/(```[\s\S]*?```)/g);
      return segments.map((seg, j) => {
        if (seg.startsWith('```') && seg.endsWith('```')) {
          const code = seg.slice(3, -3).replace(/^\w*\n/, '');
          return (
            <pre
              key={`${i}-${j}`}
              className="my-2 overflow-x-auto rounded-md bg-muted p-3 font-mono text-xs"
            >
              {code}
            </pre>
          );
        }
        return <span key={`${i}-${j}`}>{seg}</span>;
      });
    }
    return <span key={i}>{part}</span>;
  });
}

export const ChatMessage: React.FC<ChatMessageProps> = ({
  message,
  agentName = 'MantleAgent',
}) => {
  const isUser = message.role === 'user';
  const isSystem = message.role === 'system';

  if (isSystem) {
    return (
      <div className="flex justify-center px-4 py-2">
        <div className="max-w-lg rounded-lg bg-muted/50 px-4 py-2 text-center text-xs text-muted-foreground">
          {message.text}
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        'flex w-full gap-3 px-4 py-2',
        isUser ? 'justify-end' : 'justify-start'
      )}
    >
      {/* Agent avatar */}
      {!isUser && (
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary text-xs font-bold">
          M
        </div>
      )}

      <div
        className={cn(
          'max-w-[75%] rounded-2xl px-4 py-2.5',
          isUser
            ? 'rounded-br-md bg-primary text-primary-foreground'
            : message.error
              ? 'rounded-bl-md bg-red-950/40 text-red-300'
              : 'rounded-bl-md bg-card text-card-foreground'
        )}
      >
        {/* Sender label */}
        {!isUser && (
          <div className="mb-1 text-xs font-semibold text-primary">
            {agentName}
          </div>
        )}

        {/* Message text - preserve newlines */}
        <div className="whitespace-pre-wrap break-words text-sm leading-relaxed">
          {renderText(message.text)}
        </div>

        {/* Actions badge */}
        {message.actions && message.actions.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1">
            {message.actions.map((action, i) => (
              <span
                key={i}
                className="inline-block rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary"
              >
                {action}
              </span>
            ))}
          </div>
        )}

        {/* Timestamp */}
        <div
          className={cn(
            'mt-1 text-[10px]',
            isUser ? 'text-primary-foreground/60' : 'text-muted-foreground'
          )}
        >
          {formatRelativeTime(message.timestamp)}
        </div>
      </div>

      {/* User avatar */}
      {isUser && (
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground text-xs font-bold">
          U
        </div>
      )}
    </div>
  );
};

/** Typing indicator shown while agent is processing */
export const TypingIndicator: React.FC = () => (
  <div className="flex w-full gap-3 px-4 py-2">
    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary text-xs font-bold">
      M
    </div>
    <div className="rounded-2xl rounded-bl-md bg-card px-4 py-3">
      <div className="flex items-center gap-1">
        <span className="typing-dot h-2 w-2 rounded-full bg-muted-foreground" />
        <span className="typing-dot animation-delay-200 h-2 w-2 rounded-full bg-muted-foreground" />
        <span className="typing-dot animation-delay-400 h-2 w-2 rounded-full bg-muted-foreground" />
      </div>
    </div>
  </div>
);
