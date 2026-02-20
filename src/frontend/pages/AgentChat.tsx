import React, { useRef, useEffect, useState, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useAgent } from '../hooks/use-agents';
import { useChat } from '../hooks/use-chat';
import { ChatMessage, TypingIndicator } from '../ChatMessage';
import { ChatInput } from '../ChatInput';
import { WalletDisplay } from '../components/WalletDisplay';

export const AgentChat: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const { data: agent, isLoading } = useAgent(id!);
  const { messages, sendMessage, isSending } = useChat(id!);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);

  useEffect(() => {
    if (autoScroll) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isSending, autoScroll]);

  const handleScroll = useCallback(() => {
    const el = scrollAreaRef.current;
    if (!el) return;
    setAutoScroll(el.scrollHeight - el.scrollTop - el.clientHeight < 80);
  }, []);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-muted border-t-primary" />
      </div>
    );
  }

  if (!agent) {
    return (
      <div className="mx-auto max-w-2xl px-6 py-8">
        <div className="rounded-lg border border-red-500/20 bg-red-500/5 p-4 text-sm text-red-400">
          Agent not found
        </div>
      </div>
    );
  }

  const notRunning = agent.status !== 'running';

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div className="flex items-center gap-3">
          <Link
            to={`/agents/${agent.id}`}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          >
            <svg viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5">
              <path fillRule="evenodd" d="M17 10a.75.75 0 01-.75.75H5.612l4.158 3.96a.75.75 0 11-1.04 1.08l-5.5-5.25a.75.75 0 010-1.08l5.5-5.25a.75.75 0 111.04 1.08L5.612 9.25H16.25A.75.75 0 0117 10z" clipRule="evenodd" />
            </svg>
          </Link>
          <div>
            <h1 className="text-sm font-semibold text-foreground">{agent.name}</h1>
            <WalletDisplay address={agent.walletAddress} compact />
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span
            className={`rounded-full px-2.5 py-0.5 text-[11px] font-medium ${
              agent.status === 'running'
                ? 'bg-green-500/15 text-green-400'
                : 'bg-red-500/15 text-red-400'
            }`}
          >
            {agent.status}
          </span>
        </div>
      </div>

      {/* Messages */}
      <div ref={scrollAreaRef} onScroll={handleScroll} className="flex-1 overflow-y-auto scrollbar-thin">
        <div className="mx-auto max-w-3xl py-4">
          {messages.length === 0 && !notRunning && (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10">
                <svg viewBox="0 0 24 24" fill="currentColor" className="h-7 w-7 text-primary">
                  <path d="M4.913 2.658c2.075-.27 4.19-.408 6.337-.408 2.147 0 4.262.139 6.337.408 1.922.25 3.291 1.861 3.405 3.727a4.403 4.403 0 00-1.032-.211 50.89 50.89 0 00-8.42 0c-2.358.196-4.04 2.19-4.04 4.434v4.286a4.47 4.47 0 002.433 3.984L7.28 21.53A.75.75 0 016 21v-4.03a48.527 48.527 0 01-1.087-.128C2.905 16.58 1.5 14.833 1.5 12.862V6.638c0-1.97 1.405-3.718 3.413-3.979z" />
                  <path d="M15.75 7.5c-1.376 0-2.739.057-4.086.169C10.124 7.797 9 9.103 9 10.609v4.285c0 1.507 1.128 2.814 2.67 2.94 1.243.102 2.5.157 3.768.165l2.782 2.781a.75.75 0 001.28-.53v-2.39l.33-.026c1.542-.125 2.67-1.433 2.67-2.94v-4.286c0-1.505-1.125-2.811-2.664-2.94A49.392 49.392 0 0015.75 7.5z" />
                </svg>
              </div>
              <p className="text-sm font-medium text-foreground">Chat with {agent.name}</p>
              <p className="text-xs text-muted-foreground mt-1">
                Ask about Mantle, deploy contracts, check balances...
              </p>
            </div>
          )}

          {notRunning && (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <p className="text-sm text-muted-foreground">
                Agent is not running.{' '}
                <Link to={`/agents/${agent.id}`} className="text-primary hover:underline">
                  Start it first
                </Link>
              </p>
            </div>
          )}

          {messages.map((msg) => (
            <ChatMessage key={msg.id} message={msg} agentName={agent.name} />
          ))}

          {isSending && <TypingIndicator />}
          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Input */}
      <div className="mx-auto w-full max-w-3xl">
        <ChatInput
          onSend={sendMessage}
          disabled={isSending || notRunning}
          placeholder={`Message ${agent.name}...`}
        />
      </div>
    </div>
  );
};
