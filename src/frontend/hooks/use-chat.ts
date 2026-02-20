import { useState, useCallback } from 'react';
import { chatWithAgent } from '../api';

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

  const sendMessage = useCallback(
    async (text: string) => {
      const userMsg: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'user',
        text,
        timestamp: Date.now(),
      };
      setMessages((prev) => [...prev, userMsg]);
      setIsSending(true);

      try {
        const response = await chatWithAgent(agentId, text);
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

  return { messages, sendMessage, isSending };
}
