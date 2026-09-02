'use client';

import { useState, useRef, useEffect } from 'react';
import Sidebar from '@/components/Sidebar';
import { useAiChat } from '@/hooks/useAiChat';
import ProposalCard from './ProposalCard';

const SUGGESTED_PROMPTS = [
  'How much am I saving this month?',
  'Which subscriptions can I cancel?',
  'Categorize my uncategorized transactions',
  'Can I afford a $500 purchase this month?',
];

function currentMonth() { return new Date().toISOString().slice(0, 7); }
function monthLabel(m: string) {
  const [y, mo] = m.split('-');
  return new Date(Number(y), Number(mo) - 1).toLocaleString('default', { month: 'long', year: 'numeric' });
}

export default function AskCofrePage() {
  const {
    conversations, activeId, setActiveId, startNewConversation,
    messages, loading, sending, sendMessage,
    confirmAction, rejectAction, recentActions, undoAction,
  } = useAiChat();
  const [input, setInput] = useState('');
  const [month, setMonth] = useState(currentMonth());
  const [showHistory, setShowHistory] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  async function handleSend(text: string) {
    if (!text.trim() || sending) return;
    setInput('');
    await sendMessage(text.trim(), month);
  }

  return (
    <div className="flex h-dvh overflow-hidden">
      <Sidebar />
      <main className="flex-1 overflow-hidden pt-14 md:pt-0 flex">
        <div className="flex-1 flex flex-col min-w-0 px-6 md:px-8 py-6 gap-4">
          {/* Header */}
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-3">
              <span className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                style={{ background: 'linear-gradient(135deg, var(--color-primary), var(--color-indigo))', color: 'white' }}>⚡</span>
              <div>
                <h1 className="font-bold" style={{ fontSize: 22 }}>Ask Cofre</h1>
                <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>Reads your whole account. Asks before it changes anything.</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => setShowHistory((s) => !s)}
                className="px-3 py-2 rounded-xl text-xs font-semibold cursor-pointer"
                style={{ background: 'var(--color-elevated)', border: '1px solid var(--color-border)' }}>
                History
              </button>
              <button onClick={() => startNewConversation()}
                className="px-3 py-2 rounded-xl text-xs font-semibold cursor-pointer"
                style={{ background: 'var(--color-elevated)', border: '1px solid var(--color-border)' }}>
                New chat
              </button>
            </div>
          </div>

          {showHistory && (
            <div className="flex flex-col gap-1 p-2 rounded-xl max-h-40 overflow-y-auto"
              style={{ background: 'var(--color-elevated)', border: '1px solid var(--color-border)' }}>
              {conversations.length === 0 && <p className="text-xs px-2 py-1" style={{ color: 'var(--color-text-muted)' }}>No conversations yet.</p>}
              {conversations.map((c) => (
                <button key={c.id} onClick={() => { setActiveId(c.id); setShowHistory(false); }}
                  className="text-left text-xs px-2 py-1.5 rounded-lg cursor-pointer truncate"
                  style={{ background: c.id === activeId ? 'var(--color-surface)' : 'transparent' }}>
                  {c.title ?? 'New conversation'}
                </button>
              ))}
            </div>
          )}

          {/* Messages */}
          <div className="flex-1 overflow-y-auto flex flex-col gap-4 min-h-0">
            {loading ? (
              <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>Loading…</p>
            ) : messages.length === 0 ? (
              <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>Ask a question or tell Cofre what to change.</p>
            ) : (
              messages.map((m) => (
                <div key={m.id} className={m.role === 'user' ? 'self-end max-w-[75%]' : 'self-start max-w-[85%]'}>
                  {m.role === 'user' ? (
                    <div className="px-4 py-2.5 rounded-2xl text-sm" style={{ background: 'var(--color-primary)', color: 'white' }}>
                      {m.text}
                    </div>
                  ) : (
                    <div className="text-sm whitespace-pre-wrap" style={{ color: 'var(--color-text-primary)' }}>
                      {m.text || (sending && m.id === 'streaming' ? '…' : '')}
                      {m.widget && m.widget.type === 'proposal' && (() => {
                        const actionId = m.widget.actionId;
                        return (
                          <ProposalCard
                            summary={m.text || 'A change was proposed.'}
                            onConfirm={() => confirmAction(actionId)}
                            onReject={() => rejectAction(actionId)}
                          />
                        );
                      })()}
                    </div>
                  )}
                </div>
              ))
            )}
            <div ref={bottomRef} />
          </div>

          {/* Suggested prompts */}
          <div className="flex flex-wrap gap-2">
            {SUGGESTED_PROMPTS.map((p) => (
              <button key={p} onClick={() => setInput(p)}
                className="px-3 py-1.5 rounded-full text-xs cursor-pointer"
                style={{ background: 'var(--color-elevated)', border: '1px solid var(--color-border)', color: 'var(--color-text-secondary)' }}>
                {p}
              </button>
            ))}
          </div>

          {/* Input bar */}
          <form onSubmit={(e) => { e.preventDefault(); handleSend(input); }}
            className="flex items-center gap-2 p-2 rounded-2xl"
            style={{ background: 'var(--color-elevated)', border: '1px solid var(--color-border)' }}>
            <input value={input} onChange={(e) => setInput(e.target.value)}
              placeholder="Ask anything, or tell me what to change…"
              className="flex-1 bg-transparent outline-none text-sm px-2" />
            <input type="month" value={month} onChange={(e) => setMonth(e.target.value)}
              className="text-xs bg-transparent outline-none px-2 py-1 rounded-lg"
              style={{ border: '1px solid var(--color-border)' }} title={monthLabel(month)} />
            <button type="submit" disabled={sending || !input.trim()}
              className="w-9 h-9 rounded-xl flex items-center justify-center cursor-pointer disabled:opacity-40"
              style={{ background: 'var(--color-primary)', color: 'white' }}>↑</button>
          </form>
        </div>

        {/* Right column: Tasks 11 fills this in with the permissions panel and recent-changes log. */}
        <aside className="hidden lg:flex flex-col gap-4 w-80 shrink-0 border-l overflow-y-auto p-6"
          style={{ borderColor: 'var(--color-border)' }}>
          <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>{recentActions.length} recent change(s) tracked.</p>
        </aside>
      </main>
    </div>
  );
}
