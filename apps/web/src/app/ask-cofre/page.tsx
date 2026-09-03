'use client';

import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import Sidebar from '@/components/Sidebar';
import { useAiChat } from '@/hooks/useAiChat';
import { useUser } from '@/components/UserProvider';
import ProposalCard from './ProposalCard';
import SavingsTrendWidget from './SavingsTrendWidget';
import SafeToSpendWidget from './SafeToSpendWidget';
import FinancialSnapshotPanel from './FinancialSnapshotPanel';

const SUGGESTED_PROMPTS = [
  {
    text: 'How much can I safely spend this month?',
    icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>,
  },
  {
    text: 'How much am I saving this month?',
    icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M7 14l5-5 3 3 5-6M7 8h13v13H4"/></svg>,
  },
  {
    text: 'Which subscriptions can I cancel?',
    icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 8h12l-1 12H7L6 8Z"/><path d="M9 8V6a3 3 0 0 1 6 0v2"/></svg>,
  },
  {
    text: 'Categorize my uncategorized transactions',
    icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 7h18M6 12h12M9 17h6"/></svg>,
  },
];

function currentMonth() { return new Date().toISOString().slice(0, 7); }
function monthLabel(m: string) {
  const [y, mo] = m.split('-');
  return new Date(Number(y), Number(mo) - 1).toLocaleString('default', { month: 'long', year: 'numeric' });
}

function AiAvatar() {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- fixed-color brand asset, not a themed vector icon
    <img src="/ask-cofre-logo.png" alt="" width={28} height={28} className="rounded-full shrink-0" style={{ objectFit: 'contain' }} />
  );
}

function UserAvatar({ name }: { name?: string | null }) {
  const initial = (name ?? 'U').trim().charAt(0).toUpperCase();
  return (
    <span className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
      style={{ background: 'var(--color-primary)', color: 'white' }}>
      {initial}
    </span>
  );
}

export default function AskCofrePage() {
  const {
    conversations, activeId, setActiveId, startNewConversation,
    messages, loading, sending, sendMessage,
    confirmAction, rejectAction,
  } = useAiChat();
  const { user } = useUser();
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

  if (user && user.plan === 'free') {
    return (
      <div className="flex h-dvh overflow-hidden">
        <Sidebar />
        <main className="flex-1 flex items-center justify-center p-6">
          <div className="max-w-md text-center rounded-2xl p-8 flex flex-col items-center gap-4"
            style={{ background: 'var(--color-surface)', backdropFilter: 'var(--glass-blur)', WebkitBackdropFilter: 'var(--glass-blur)', border: 'var(--glass-border)', boxShadow: 'var(--glass-shadow)' }}>
            {/* eslint-disable-next-line @next/next/no-img-element -- fixed-color brand asset, not a themed vector icon */}
            <img src="/ask-cofre-logo.png" alt="" className="w-12 h-12" style={{ objectFit: 'contain' }} />
            <h2 className="text-lg font-bold" style={{ color: 'var(--color-text-primary)' }}>Ask Cofre is a Pro & Elite feature</h2>
            <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
              Your personal AI finance coach — get straight answers, spending analysis, and hands-on help getting to $1,000,000 faster.
            </p>
            <Link href="/settings?tab=billing" className="btn-gold px-5 py-2.5 rounded-full font-semibold text-sm">
              Upgrade to unlock
            </Link>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="flex h-dvh overflow-hidden">
      <Sidebar />
      <main className="flex-1 overflow-hidden pt-14 md:pt-0 flex">
        <div className="flex-1 flex flex-col min-w-0 px-6 md:px-8 py-6 gap-4">
          {/* Header */}
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-3">
              <span className="relative shrink-0">
                {/* eslint-disable-next-line @next/next/no-img-element -- fixed-color brand asset, not a themed vector icon */}
                <img src="/ask-cofre-logo.png" alt="" className="w-10 h-10" style={{ objectFit: 'contain' }} />
                <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2"
                  style={{ background: 'var(--color-green)', borderColor: 'var(--color-bg)' }} />
              </span>
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="font-bold" style={{ fontSize: 22 }}>Ask Cofre</h1>
                  <span className="text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full"
                    style={{ background: 'var(--color-card-violet)', color: 'white' }}>
                    {user?.plan === 'elite' ? 'Elite' : 'Pro'}
                  </span>
                </div>
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
              <div className="flex-1 flex flex-col items-center justify-center text-center gap-2 py-10">
                {/* eslint-disable-next-line @next/next/no-img-element -- fixed-color brand asset, not a themed vector icon */}
                <img src="/ask-cofre-logo.png" alt="" className="w-14 h-14 mb-1" style={{ objectFit: 'contain' }} />
                <p className="text-sm font-semibold" style={{ color: 'var(--color-text-primary)' }}>What do you want to know?</p>
                <p className="text-xs max-w-sm" style={{ color: 'var(--color-text-muted)' }}>
                  Ask about your spending, budgets, or net worth — or pick a prompt below to get started.
                </p>
              </div>
            ) : (
              messages.map((m) => (
                <div key={m.id} className={`flex gap-2.5 ${m.role === 'user' ? 'flex-row-reverse self-end max-w-[80%]' : 'self-start max-w-[88%]'}`}>
                  {m.role === 'user' ? <UserAvatar name={user?.name} /> : <AiAvatar />}
                  {m.role === 'user' ? (
                    <div className="px-4 py-2.5 rounded-2xl text-sm" style={{ background: 'var(--color-primary)', color: 'white' }}>
                      {m.text}
                    </div>
                  ) : (
                    <div className="text-sm whitespace-pre-wrap pt-1" style={{ color: 'var(--color-text-primary)' }}>
                      {m.text || (sending && m.id === 'streaming' ? '…' : '')}
                      {m.widget && m.widget.type === 'proposal' && (() => {
                        const actionId = m.widget.actionId;
                        return (
                          <ProposalCard
                            summary={m.text || 'A change was proposed.'}
                            initialStatus={m.widget.status}
                            onConfirm={() => confirmAction(actionId)}
                            onReject={() => rejectAction(actionId)}
                          />
                        );
                      })()}
                      {m.widget && m.widget.type === 'safe_to_spend' && (
                        <SafeToSpendWidget data={m.widget.data} />
                      )}
                      {m.widget && m.widget.type === 'savings_trend' && (
                        <SavingsTrendWidget data={m.widget.data} />
                      )}
                    </div>
                  )}
                </div>
              ))
            )}
            <div ref={bottomRef} />
          </div>

          {/* Suggested prompts */}
          <div className="grid grid-cols-2 gap-2">
            {SUGGESTED_PROMPTS.map((p) => (
              <button key={p.text} onClick={() => setInput(p.text)}
                className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs text-left cursor-pointer card-lift"
                style={{ background: 'var(--color-elevated)', border: '1px solid var(--color-border)', color: 'var(--color-text-secondary)' }}>
                <span className="shrink-0" style={{ color: 'var(--color-primary)' }}>{p.icon}</span>
                <span className="truncate">{p.text}</span>
              </button>
            ))}
          </div>

          {/* Input bar */}
          <form onSubmit={(e) => { e.preventDefault(); handleSend(input); }}
            className="flex items-center gap-1.5 p-2 rounded-full"
            style={{ background: 'var(--color-elevated)', border: '1px solid var(--color-border)' }}>
            <button type="button" disabled title="Attachments coming soon"
              className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 disabled:opacity-40"
              style={{ color: 'var(--color-text-muted)' }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21.44 11.05l-9.19 9.19a5 5 0 0 1-7.07-7.07l9.19-9.19a3.5 3.5 0 0 1 4.95 4.95L10.13 17.1a2 2 0 0 1-2.83-2.83l8.49-8.49"/></svg>
            </button>
            <input value={input} onChange={(e) => setInput(e.target.value)}
              placeholder="Ask anything, or tell me what to change…"
              className="flex-1 bg-transparent outline-none text-sm px-1 min-w-0" />
            <button type="button" disabled title="Voice input coming soon"
              className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 disabled:opacity-40"
              style={{ color: 'var(--color-text-muted)' }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3Z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2M12 19v4"/></svg>
            </button>
            <input type="month" value={month} onChange={(e) => setMonth(e.target.value)}
              className="text-xs bg-transparent outline-none px-2 py-1 rounded-full shrink-0"
              style={{ border: '1px solid var(--color-border)' }} title={monthLabel(month)} />
            <button type="submit" disabled={sending || !input.trim()}
              className="btn-gold w-9 h-9 rounded-full flex items-center justify-center cursor-pointer disabled:opacity-40 shrink-0">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 19V5M5 12l7-7 7 7"/></svg>
            </button>
          </form>
          <p className="text-[10px] text-center" style={{ color: 'var(--color-text-muted)' }}>
            Cofre can make mistakes. Changes always need your confirmation first.
          </p>
        </div>

        {/* Right column: financial snapshot */}
        <aside className="hidden lg:flex flex-col w-80 shrink-0 border-l overflow-y-auto p-6"
          style={{ borderColor: 'var(--color-border)' }}>
          <FinancialSnapshotPanel />
        </aside>
      </main>
    </div>
  );
}
