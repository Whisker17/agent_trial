import { useState, useCallback, useEffect } from 'react';
import { chatWithAgent, fetchChatHistory } from '../api';

export interface ChatMessage {
  id: string;
  role: 'user' | 'agent' | 'system';
  text: string;
  timestamp: number;
  actions?: string[];
  error?: boolean;
}

export function useChat(agentId: string) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isSending, setIsSending] = useState(false);
  const [isLoadingHistory, setIsLoadingHistory] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setMessages([]);
    setIsLoadingHistory(true);

    fetchChatHistory(agentId)
      .then((history) => {
        if (cancelled) return;
        setMessages(
          history.map((message) => ({
            id: message.id,
            role: message.role,
            text: message.text,
            timestamp: message.timestamp,
            actions: message.actions,
            error: message.error,
          })),
        );
      })
      .catch(() => {
        if (cancelled) return;
        setMessages([]);
      })
      .finally(() => {
        if (cancelled) return;
        setIsLoadingHistory(false);
      });

    return () => {
      cancelled = true;
    };
  }, [agentId]);

  const sendMessage = useCallback(
    async (text: string) => {
      const normalizedText = text.trim();
      if (!normalizedText) return;

      const userMsg: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'user',
        text: normalizedText,
        timestamp: Date.now(),
      };
      setMessages((prev) => [...prev, userMsg]);
      setIsSending(true);

      try {
        const response = await chatWithAgent(agentId, normalizedText);
        const agentMsg: ChatMessage = {
          id: crypto.randomUUID(),
          role: 'agent',
          text: response.text,
          timestamp: Date.now(),
          actions: response.actions,
        };
        setMessages((prev) => [...prev, agentMsg]);
      } catch (err: any) {
        const errorMsg: ChatMessage = {
          id: crypto.randomUUID(),
          role: 'agent',
          text: `Error: ${err.message || 'Failed to get response'}`,
          timestamp: Date.now(),
          error: true,
        };
        setMessages((prev) => [...prev, errorMsg]);
      } finally {
        setIsSending(false);
      }
    },
    [agentId],
  );

  return { messages, sendMessage, isSending, isLoadingHistory };
}
