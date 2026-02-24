import { useState, useCallback, useEffect } from "react";
import {
  chatWithAgent,
  fetchChatHistory,
  fetchChatSessions,
  createChatSession,
  type ChatSession,
  type PersistedChatMessage,
} from "../api";

export interface ChatMessage {
  id: string;
  role: "user" | "agent" | "system";
  text: string;
  timestamp: number;
  actions?: string[];
  error?: boolean;
}

export function useChat(agentId: string) {
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isSending, setIsSending] = useState(false);
  const [isLoadingHistory, setIsLoadingHistory] = useState(true);
  const [isLoadingSessions, setIsLoadingSessions] = useState(true);
  const [isCreatingSession, setIsCreatingSession] = useState(false);

  const toUiMessage = useCallback(
    (message: PersistedChatMessage): ChatMessage => {
      return {
        id: message.id,
        role: message.role,
        text: message.text,
        timestamp: message.timestamp,
        actions: message.actions,
        error: message.error,
      };
    },
    [],
  );

  const upsertSession = useCallback((session: ChatSession) => {
    setSessions((prev) =>
      [session, ...prev.filter((item) => item.id !== session.id)].sort(
        (a, b) => b.lastMessageAt - a.lastMessageAt,
      ),
    );
  }, []);

  const loadSession = useCallback(
    async (sessionId: string) => {
      setIsLoadingHistory(true);
      const data = await fetchChatHistory(agentId, sessionId);
      setActiveSessionId(sessionId);
      setMessages(data.messages.map(toUiMessage));
      if (data.session) {
        upsertSession(data.session);
      }
      setIsLoadingHistory(false);
    },
    [agentId, toUiMessage, upsertSession],
  );

  useEffect(() => {
    let cancelled = false;
    setSessions([]);
    setActiveSessionId(null);
    setMessages([]);
    setIsLoadingSessions(true);
    setIsLoadingHistory(true);

    fetchChatSessions(agentId)
      .then(async (fetchedSessions) => {
        if (cancelled) return;

        const ordered = [...fetchedSessions].sort(
          (a, b) => b.lastMessageAt - a.lastMessageAt,
        );
        setSessions(ordered);
        setIsLoadingSessions(false);

        const first = ordered[0];
        if (!first) {
          setMessages([]);
          setIsLoadingHistory(false);
          return;
        }

        const history = await fetchChatHistory(agentId, first.id);
        if (cancelled) return;
        setActiveSessionId(first.id);
        setMessages(history.messages.map(toUiMessage));
      })
      .catch(() => {
        if (cancelled) return;
        setSessions([]);
        setActiveSessionId(null);
        setMessages([]);
        setIsLoadingSessions(false);
        setIsLoadingHistory(false);
      })
      .finally(() => {
        if (cancelled) return;
        setIsLoadingSessions(false);
        setIsLoadingHistory(false);
      });

    return () => {
      cancelled = true;
    };
  }, [agentId, toUiMessage]);

  const selectSession = useCallback(
    async (sessionId: string) => {
      if (sessionId === activeSessionId) return;
      try {
        await loadSession(sessionId);
      } catch {
        setMessages([]);
        setIsLoadingHistory(false);
      }
    },
    [activeSessionId, loadSession],
  );

  const startNewChat = useCallback(async () => {
    if (isCreatingSession) return;
    setIsCreatingSession(true);
    try {
      const session = await createChatSession(agentId);
      upsertSession(session);
      setActiveSessionId(session.id);
      setMessages([]);
    } finally {
      setIsCreatingSession(false);
      setIsLoadingHistory(false);
    }
  }, [agentId, isCreatingSession, upsertSession]);

  const sendMessage = useCallback(
    async (text: string) => {
      const normalizedText = text.trim();
      if (!normalizedText) return;

      let sessionId = activeSessionId;
      if (!sessionId) {
        setIsCreatingSession(true);
        try {
          const session = await createChatSession(agentId);
          upsertSession(session);
          setActiveSessionId(session.id);
          sessionId = session.id;
        } finally {
          setIsCreatingSession(false);
        }
      }
      if (!sessionId) return;

      const userMsg: ChatMessage = {
        id: crypto.randomUUID(),
        role: "user",
        text: normalizedText,
        timestamp: Date.now(),
      };
      setMessages((prev) => [...prev, userMsg]);
      setIsSending(true);

      try {
        const response = await chatWithAgent(
          agentId,
          normalizedText,
          sessionId,
        );
        const agentMsg: ChatMessage = {
          id: crypto.randomUUID(),
          role: "agent",
          text: response.text,
          timestamp: Date.now(),
          actions: response.actions,
        };
        setMessages((prev) => [...prev, agentMsg]);
        setActiveSessionId(response.sessionId);
        upsertSession(response.session);
      } catch (err: any) {
        const errorMsg: ChatMessage = {
          id: crypto.randomUUID(),
          role: "agent",
          text: `Error: ${err.message || "Failed to get response"}`,
          timestamp: Date.now(),
          error: true,
        };
        setMessages((prev) => [...prev, errorMsg]);
      } finally {
        setIsSending(false);
      }
    },
    [activeSessionId, agentId, upsertSession],
  );

  return {
    sessions,
    activeSessionId,
    messages,
    sendMessage,
    selectSession,
    startNewChat,
    isSending,
    isLoadingHistory,
    isLoadingSessions,
    isCreatingSession,
  };
}
