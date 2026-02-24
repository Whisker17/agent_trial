import React, { useRef, useEffect, useState, useCallback } from "react";
import { useParams, Link } from "react-router-dom";
import { useAgent } from "../hooks/use-agents";
import { useChat } from "../hooks/use-chat";
import { ChatMessage, TypingIndicator } from "../ChatMessage";
import { ChatInput } from "../ChatInput";
import { WalletDisplay } from "../components/WalletDisplay";
import { cn } from "../utils";

function formatSessionTime(ts: number): string {
  const diffMs = Date.now() - ts;
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;
  return new Date(ts).toLocaleDateString();
}

export const AgentChat: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const { data: agent, isLoading } = useAgent(id!);
  const {
    sessions,
    activeSessionId,
    messages,
    sendMessage,
    selectSession,
    startNewChat,
    deleteSession,
    isSending,
    isLoadingHistory,
    isLoadingSessions,
    isCreatingSession,
    deletingSessionId,
  } = useChat(id!);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);
  const [sessionActionError, setSessionActionError] = useState<string | null>(
    null,
  );

  useEffect(() => {
    if (autoScroll) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, isSending, autoScroll]);

  const handleScroll = useCallback(() => {
    const el = scrollAreaRef.current;
    if (!el) return;
    setAutoScroll(el.scrollHeight - el.scrollTop - el.clientHeight < 80);
  }, []);

  const handleDeleteSession = useCallback(
    async (sessionId: string, sessionTitle: string) => {
      const confirmed = window.confirm(
        `Delete "${sessionTitle}"? This cannot be undone.`,
      );
      if (!confirmed) return;

      setSessionActionError(null);
      try {
        await deleteSession(sessionId);
      } catch (error) {
        console.error("Failed to delete chat session", error);
        setSessionActionError("Failed to delete chat. Please try again.");
      }
    },
    [deleteSession],
  );

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

  const notRunning = agent.status !== "running";
  const noSessions = sessions.length === 0;

  return (
    <div className="flex h-full min-h-0 bg-background">
      <aside className="hidden w-72 shrink-0 flex-col border-r border-border bg-card/40 md:flex">
        <div className="flex items-center justify-between border-b border-border px-3 py-3">
          <Link
            to={`/agents/${agent.id}`}
            className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
              <path
                fillRule="evenodd"
                d="M17 10a.75.75 0 01-.75.75H5.612l4.158 3.96a.75.75 0 11-1.04 1.08l-5.5-5.25a.75.75 0 010-1.08l5.5-5.25a.75.75 0 111.04 1.08L5.612 9.25H16.25A.75.75 0 0117 10z"
                clipRule="evenodd"
              />
            </svg>
            Back
          </Link>
          <button
            type="button"
            onClick={startNewChat}
            disabled={isCreatingSession || isLoadingSessions}
            className="rounded-md bg-primary px-2.5 py-1.5 text-xs font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isCreatingSession ? "Creating..." : "New chat"}
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-2 py-2 scrollbar-thin">
          {isLoadingSessions && (
            <div className="flex items-center justify-center py-8">
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-muted border-t-primary" />
            </div>
          )}
          {!isLoadingSessions && noSessions && (
            <div className="rounded-lg border border-dashed border-border p-3 text-xs text-muted-foreground">
              No chats yet. Start a new one.
            </div>
          )}
          {sessions.map((session) => {
            const isDeleting = deletingSessionId === session.id;
            return (
              <div
                key={session.id}
                className={cn(
                  "group mb-1.5 flex items-center gap-1 rounded-lg border px-2 py-1.5 transition-colors",
                  session.id === activeSessionId
                    ? "border-primary/40 bg-primary/10"
                    : "border-transparent hover:border-border hover:bg-muted/60",
                )}
              >
                <button
                  type="button"
                  onClick={() => selectSession(session.id)}
                  className="min-w-0 flex-1 rounded-md px-1 py-0.5 text-left"
                >
                  <p className="truncate text-xs font-medium text-foreground">
                    {session.title}
                  </p>
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    {formatSessionTime(session.lastMessageAt)}
                  </p>
                </button>
                <button
                  type="button"
                  onClick={() => void handleDeleteSession(session.id, session.title)}
                  disabled={
                    isDeleting ||
                    isSending ||
                    isLoadingSessions ||
                    isLoadingHistory
                  }
                  className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-red-400 disabled:cursor-not-allowed disabled:opacity-50"
                  title={isDeleting ? "Deleting..." : "Delete chat"}
                  aria-label={`Delete chat ${session.title}`}
                >
                  {isDeleting ? (
                    <div className="h-3.5 w-3.5 animate-spin rounded-full border border-muted-foreground border-t-transparent" />
                  ) : (
                    <svg
                      viewBox="0 0 20 20"
                      fill="currentColor"
                      className="h-3.5 w-3.5"
                    >
                      <path
                        fillRule="evenodd"
                        d="M8.75 2.5a.75.75 0 00-.75.75V4H5.75a.75.75 0 000 1.5h.386l.656 9.192A2 2 0 008.787 16.5h2.426a2 2 0 001.995-1.808l.656-9.192h.386a.75.75 0 000-1.5H12V3.25a.75.75 0 00-.75-.75h-2.5zM10.5 4V3.5h-1V4h1zm-1.685 2.22a.75.75 0 10-1.495.11l.5 6.75a.75.75 0 001.495-.11l-.5-6.75zm4.055.11a.75.75 0 10-1.495-.11l-.5 6.75a.75.75 0 101.495.11l.5-6.75z"
                        clipRule="evenodd"
                      />
                    </svg>
                  )}
                </button>
              </div>
            );
          })}
        </div>
      </aside>

      <div className="flex min-h-0 flex-1 flex-col">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div className="flex items-center gap-2">
            <Link
              to={`/agents/${agent.id}`}
              className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground md:hidden"
            >
              <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
                <path
                  fillRule="evenodd"
                  d="M17 10a.75.75 0 01-.75.75H5.612l4.158 3.96a.75.75 0 11-1.04 1.08l-5.5-5.25a.75.75 0 010-1.08l5.5-5.25a.75.75 0 111.04 1.08L5.612 9.25H16.25A.75.75 0 0117 10z"
                  clipRule="evenodd"
                />
              </svg>
            </Link>
            <div>
              <h1 className="text-sm font-semibold text-foreground">
                {agent.name}
              </h1>
              <WalletDisplay address={agent.walletAddress} compact />
            </div>
          </div>
          <span
            className={`rounded-full px-2.5 py-0.5 text-[11px] font-medium ${
              agent.status === "running"
                ? "bg-green-500/15 text-green-400"
                : "bg-red-500/15 text-red-400"
            }`}
          >
            {agent.status}
          </span>
        </div>

        {sessionActionError && (
          <div className="border-b border-red-500/20 bg-red-500/5 px-4 py-2 text-xs text-red-400">
            {sessionActionError}
          </div>
        )}

        <div className="flex items-center gap-2 border-b border-border px-4 py-2 md:hidden">
          <select
            value={activeSessionId ?? ""}
            onChange={(event) => {
              const value = event.target.value;
              if (value) void selectSession(value);
            }}
            className="flex-1 rounded-md border border-border bg-card px-2 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary/50"
          >
            {!activeSessionId && <option value="">No active chat</option>}
            {sessions.map((session) => (
              <option key={session.id} value={session.id}>
                {session.title}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={startNewChat}
            disabled={isCreatingSession || isLoadingSessions}
            className="rounded-md bg-primary px-2.5 py-1.5 text-xs font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60"
          >
            New
          </button>
          <button
            type="button"
            onClick={() => {
              const activeSession = sessions.find(
                (session) => session.id === activeSessionId,
              );
              if (!activeSession) return;
              void handleDeleteSession(activeSession.id, activeSession.title);
            }}
            disabled={
              !activeSessionId ||
              isSending ||
              isLoadingHistory ||
              isLoadingSessions ||
              deletingSessionId === activeSessionId
            }
            className="rounded-md border border-border px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-red-400 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {deletingSessionId === activeSessionId ? "Deleting..." : "Delete"}
          </button>
        </div>

        <div
          ref={scrollAreaRef}
          onScroll={handleScroll}
          className="flex-1 overflow-y-auto scrollbar-thin"
        >
          <div className="mx-auto max-w-3xl py-4">
            {isLoadingHistory && (
              <div className="flex items-center justify-center py-12">
                <div className="h-5 w-5 animate-spin rounded-full border-2 border-muted border-t-primary" />
              </div>
            )}

            {!isLoadingHistory && noSessions && !notRunning && (
              <div className="flex flex-col items-center justify-center py-20 text-center">
                <p className="text-sm font-medium text-foreground">
                  No conversations yet
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Click New chat to start talking with {agent.name}.
                </p>
              </div>
            )}

            {messages.length === 0 &&
              !notRunning &&
              !isLoadingHistory &&
              !noSessions && (
                <div className="flex flex-col items-center justify-center py-20 text-center">
                  <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10">
                    <svg
                      viewBox="0 0 24 24"
                      fill="currentColor"
                      className="h-7 w-7 text-primary"
                    >
                      <path d="M4.913 2.658c2.075-.27 4.19-.408 6.337-.408 2.147 0 4.262.139 6.337.408 1.922.25 3.291 1.861 3.405 3.727a4.403 4.403 0 00-1.032-.211 50.89 50.89 0 00-8.42 0c-2.358.196-4.04 2.19-4.04 4.434v4.286a4.47 4.47 0 002.433 3.984L7.28 21.53A.75.75 0 016 21v-4.03a48.527 48.527 0 01-1.087-.128C2.905 16.58 1.5 14.833 1.5 12.862V6.638c0-1.97 1.405-3.718 3.413-3.979z" />
                      <path d="M15.75 7.5c-1.376 0-2.739.057-4.086.169C10.124 7.797 9 9.103 9 10.609v4.285c0 1.507 1.128 2.814 2.67 2.94 1.243.102 2.5.157 3.768.165l2.782 2.781a.75.75 0 001.28-.53v-2.39l.33-.026c1.542-.125 2.67-1.433 2.67-2.94v-4.286c0-1.505-1.125-2.811-2.664-2.94A49.392 49.392 0 0015.75 7.5z" />
                    </svg>
                  </div>
                  <p className="text-sm font-medium text-foreground">
                    Start a new conversation
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Ask about Mantle, deploy contracts, or check balances.
                  </p>
                </div>
              )}

            {notRunning && (
              <div className="flex flex-col items-center justify-center py-20 text-center">
                <p className="text-sm text-muted-foreground">
                  Agent is not running.{" "}
                  <Link
                    to={`/agents/${agent.id}`}
                    className="text-primary hover:underline"
                  >
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

        <div className="mx-auto w-full max-w-3xl">
          <ChatInput
            onSend={sendMessage}
            disabled={
              isSending ||
              notRunning ||
              isLoadingHistory ||
              isLoadingSessions ||
              isCreatingSession
            }
            placeholder={`Message ${agent.name}...`}
          />
        </div>
      </div>
    </div>
  );
};
