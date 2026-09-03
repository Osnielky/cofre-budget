'use client';

import { useState, useEffect, useCallback } from 'react';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3333/api';

export interface SavingsTrendWidgetData {
  months: { month: string; net: number }[];
  projected: number;
  sixMonthAvg: number;
  transactionCount: number;
  accountCount: number;
}

export interface SafeToSpendWidgetData {
  month: string;
  income: number;
  plannedSpending: number;
  safetyBuffer: number;
  safeAmount: number;
}

export type AiMessageWidget =
  | { type: 'proposal'; actionId: string; status?: 'pending' | 'confirmed' | 'rejected' }
  | { type: 'savings_trend'; data: SavingsTrendWidgetData }
  | { type: 'safe_to_spend'; data: SafeToSpendWidgetData };

export interface AiMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  widget: AiMessageWidget | null;
  createdAt: string;
}

export interface AiConversation {
  id: string;
  title: string | null;
  updatedAt: string;
}

export interface RecentAction {
  id: string;
  label: string;
  createdAt: string;
}

/** A message being streamed in, before the server's `done` event finalizes it. */
interface StreamingMessage { id: 'streaming'; role: 'assistant'; text: string; widget: null; createdAt: string }

export function useAiChat() {
  const [conversations, setConversations] = useState<AiConversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<(AiMessage | StreamingMessage)[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [recentActions, setRecentActions] = useState<RecentAction[]>([]);

  const reloadConversations = useCallback(async () => {
    const res = await fetch(`${API}/ai/conversations`, { credentials: 'include' });
    const data = await res.json();
    setConversations(Array.isArray(data) ? data : []);
    return Array.isArray(data) ? data : [];
  }, []);

  const reloadRecent = useCallback(async () => {
    const res = await fetch(`${API}/ai/actions/recent`, { credentials: 'include' });
    const data = await res.json();
    setRecentActions(Array.isArray(data) ? data : []);
  }, []);

  const loadMessages = useCallback(async (conversationId: string) => {
    const res = await fetch(`${API}/ai/conversations/${conversationId}/messages`, { credentials: 'include' });
    const data = await res.json();
    setMessages(Array.isArray(data) ? data : []);
  }, []);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const list = await reloadConversations();
      await reloadRecent();
      if (list.length > 0) {
        setActiveId(list[0].id);
        await loadMessages(list[0].id);
      }
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const startNewConversation = useCallback(async () => {
    const res = await fetch(`${API}/ai/conversations`, { method: 'POST', credentials: 'include' });
    const conversation: AiConversation = await res.json();
    setConversations((prev) => [conversation, ...prev]);
    setActiveId(conversation.id);
    setMessages([]);
    return conversation.id;
  }, []);

  const switchConversation = useCallback(async (id: string) => {
    setActiveId(id);
    await loadMessages(id);
  }, [loadMessages]);

  const sendMessage = useCallback(async (content: string, month?: string) => {
    let conversationId = activeId;
    if (!conversationId) conversationId = await startNewConversation();

    const userMessage: AiMessage = { id: `local-${Date.now()}`, role: 'user', text: content, widget: null, createdAt: new Date().toISOString() };
    setMessages((prev) => [...prev, userMessage, { id: 'streaming', role: 'assistant', text: '', widget: null, createdAt: new Date().toISOString() }]);
    setSending(true);

    try {
      const res = await fetch(`${API}/ai/conversations/${conversationId}/messages`, {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content, month }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        setMessages((prev) => [...prev.slice(0, -1), {
          id: `err-${Date.now()}`, role: 'assistant',
          text: typeof body?.message === 'string' ? body.message : 'Something went wrong. Please try again.',
          widget: null, createdAt: new Date().toISOString(),
        }]);
        return;
      }
      const reader = res.body?.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      while (reader) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split('\n\n');
        buffer = parts.pop() ?? '';
        for (const part of parts) {
          if (!part.startsWith('data: ')) continue;
          const event = JSON.parse(part.slice('data: '.length));
          if (event.type === 'text_delta') {
            setMessages((prev) => {
              const next = [...prev];
              const last = next[next.length - 1];
              if (last && last.id === 'streaming') last.text += event.text;
              return next;
            });
          } else if (event.type === 'done') {
            setMessages((prev) => [...prev.slice(0, -1), event.message]);
            reloadConversations();
            if (event.message.widget?.type === 'proposal') reloadRecent();
          } else if (event.type === 'error') {
            setMessages((prev) => [...prev.slice(0, -1), { id: `err-${Date.now()}`, role: 'assistant', text: event.message, widget: null, createdAt: new Date().toISOString() }]);
          }
        }
      }
    } finally {
      setSending(false);
    }
  }, [activeId, startNewConversation, reloadConversations, reloadRecent]);

  const confirmAction = useCallback(async (actionId: string) => {
    await fetch(`${API}/ai/actions/${actionId}/confirm`, { method: 'POST', credentials: 'include' });
    await reloadRecent();
  }, [reloadRecent]);

  const rejectAction = useCallback(async (actionId: string) => {
    await fetch(`${API}/ai/actions/${actionId}/reject`, { method: 'POST', credentials: 'include' });
  }, []);

  const undoAction = useCallback(async (actionId: string): Promise<{ reverted: number; skipped: number } | null> => {
    const res = await fetch(`${API}/ai/actions/${actionId}/undo`, { method: 'POST', credentials: 'include' });
    await reloadRecent();
    if (!res.ok) return null;
    return res.json();
  }, [reloadRecent]);

  return {
    conversations, activeId, setActiveId: switchConversation, startNewConversation,
    messages, loading, sending, sendMessage,
    confirmAction, rejectAction, undoAction,
    recentActions, reloadRecent,
  };
}
