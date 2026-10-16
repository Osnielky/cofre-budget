'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { usePlaidLink } from 'react-plaid-link';
import Sidebar from '@/components/Sidebar';
import TotalUtilization from './components/TotalUtilization';
import StatTiles from './components/StatTiles';
import CardTile from './components/CardTile';
import DebitTile from './components/DebitTile';
import StrategyPanel from './components/StrategyPanel';
import ComingSoonPanel from './components/ComingSoonPanel';
import { CARD_ACCENTS } from './components/panel';
import CardDetailDrawer from './components/CardDetailDrawer';
import CardProfileForm from './components/CardProfileForm';
import type { CardView, DebitView } from '@/lib/cards/types';
import { itemsNeedingFirstSync } from '@/lib/cards/first-sync';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3333/api';

type Tab = 'credit' | 'debit' | 'all';

function localToday(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export default function CardsPage() {
  const [cards, setCards] = useState<CardView[]>([]);
  const [debit, setDebit] = useState<DebitView[]>([]);
  const [tab, setTab] = useState<Tab>('credit');
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<CardView | null>(null);
  const [linkToken, setLinkToken] = useState<string | null>(null);
  const [consentItemId, setConsentItemId] = useState<string | null>(null);
  const [error, setError] = useState('');

  const firstSynced = useRef<Set<string>>(new Set());

  const fetchCards = useCallback(
    () => fetch(`${API}/cards`, { credentials: 'include' })
      .then((r) => { if (!r.ok) throw new Error(); return r.json(); })
      .then((d): CardView[] => (Array.isArray(d) ? d : [])),
    [],
  );

  const load = useCallback(() => {
    fetchCards()
      .then(async (list) => {
        setCards(list);
        // Items linked before card details existed never synced; do it once per visit, best effort.
        const todo = itemsNeedingFirstSync(list).filter((id) => !firstSynced.current.has(id));
        if (todo.length === 0) return;
        todo.forEach((id) => firstSynced.current.add(id));
        await Promise.all(todo.map((id) =>
          fetch(`${API}/plaid/liabilities/${id}/complete`, { method: 'POST', credentials: 'include' }).catch(() => null)));
        const fresh = await fetchCards().catch(() => null);
        if (fresh) setCards(fresh);
      })
      .catch(() => setError('Could not load your cards.'))
      .finally(() => setLoading(false));
  }, [fetchCards]);
  useEffect(() => { load(); }, [load]);

  // Debit cards are a secondary view: a failure here just leaves the tab empty.
  useEffect(() => {
    fetch(`${API}/cards/debit`, { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => setDebit(Array.isArray(d) ? d : []))
      .catch(() => {});
  }, []);

  const clearHandoff = () => {
    setLinkToken(null); setConsentItemId(null);
    sessionStorage.removeItem('plaidLinkToken');
    sessionStorage.removeItem('plaidLinkMode');
    sessionStorage.removeItem('plaidReconnectItemId');
  };

  async function enable(card: CardView) {
    if (!card.plaidItemId) return;
    setError('');
    const res = await fetch(`${API}/plaid/liabilities-token/${card.plaidItemId}`, { method: 'POST', credentials: 'include' }).catch(() => null);
    if (!res?.ok) { setError('Could not open your bank. Try again in a moment.'); return; }
    const { link_token } = await res.json();
    // Survives the OAuth round trip; see settings/plaid-oauth-redirect.
    sessionStorage.setItem('plaidLinkToken', link_token);
    sessionStorage.setItem('plaidLinkMode', 'liabilities');
    sessionStorage.setItem('plaidReconnectItemId', card.plaidItemId);
    setConsentItemId(card.plaidItemId);
    setLinkToken(link_token);
  }

  const onSuccess = useCallback(async () => {
    if (consentItemId) {
      await fetch(`${API}/plaid/liabilities/${consentItemId}/complete`, { method: 'POST', credentials: 'include' }).catch(() => null);
    }
    clearHandoff();
    load();
  }, [consentItemId, load]);

  const { open, ready } = usePlaidLink({ token: linkToken ?? '', onSuccess, onExit: clearHandoff });
  useEffect(() => { if (linkToken && ready) open(); }, [linkToken, ready, open]);

  const today = localToday();
  const showCredit = tab !== 'debit';
  const showDebit = tab !== 'credit';
  const TABS: { id: Tab; label: string; count: number }[] = [
    { id: 'credit', label: 'Credit', count: cards.length },
    { id: 'debit', label: 'Debit', count: debit.length },
    { id: 'all', label: 'All', count: cards.length + debit.length },
  ];

  return (
    <div className="flex h-dvh overflow-hidden">
      <Sidebar />
      <main className="flex-1 overflow-y-auto pt-14 md:pt-0">
        <div className="p-4 sm:p-6 flex flex-col gap-5">
          <div>
            <h1 className="font-bold tracking-tight" style={{ fontSize: 'clamp(24px, 3vw, 34px)' }}>Cards</h1>
            <p className="mt-1 text-sm" style={{ color: 'var(--color-text-secondary)' }}>Balances, APRs, limits and due dates for every card you have</p>
          </div>

          {error && <p className="text-sm" style={{ color: 'var(--color-rose)' }} role="alert">{error}</p>}

          {!loading && cards.length > 0 && (
            <div className="grid grid-cols-1 xl:grid-cols-5 gap-4">
              <TotalUtilization cards={cards} />
              <StatTiles cards={cards} today={today} />
            </div>
          )}

          <div className="flex items-center justify-between gap-3 flex-wrap">
            <h2 className="text-lg font-semibold">Your cards</h2>
            <div role="tablist" aria-label="Card type" className="flex gap-1 p-1 rounded-xl overflow-x-auto"
              style={{ background: 'var(--color-elevated)', border: '1px solid var(--color-border)' }}>
              {TABS.map((t) => (
                <button key={t.id} role="tab" aria-selected={tab === t.id} onClick={() => setTab(t.id)}
                  className="px-3.5 py-1.5 rounded-lg text-sm font-semibold whitespace-nowrap transition-colors"
                  style={tab === t.id
                    ? { background: 'var(--color-primary)', color: 'white' }
                    : { color: 'var(--color-text-secondary)' }}>
                  {t.label} <span className="ml-1 text-xs opacity-80 tabular-nums">{t.count}</span>
                </button>
              ))}
            </div>
          </div>

          {loading ? (
            <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>Loading cards…</p>
          ) : (
            <>
              {showCredit && cards.length === 0 && !error && (
                <div className="rounded-2xl p-6 text-sm" style={{ background: 'var(--color-surface)', border: 'var(--glass-border)' }}>
                  No credit cards yet. Connect your card’s bank or add a credit card account in{' '}
                  <a href="/settings" className="font-semibold underline" style={{ color: 'var(--color-primary)' }}>Settings</a>.
                </div>
              )}
              {showDebit && debit.length === 0 && tab === 'debit' && (
                <div className="rounded-2xl p-6 text-sm" style={{ background: 'var(--color-surface)', border: 'var(--glass-border)' }}>
                  No checking accounts yet. Connect your bank or add a checking account in{' '}
                  <a href="/settings" className="font-semibold underline" style={{ color: 'var(--color-primary)' }}>Settings</a>.
                </div>
              )}
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {showCredit && cards.map((c, i) => (
                  <CardTile key={c.accountId} card={c} accent={CARD_ACCENTS[i % CARD_ACCENTS.length]}
                    onOpen={() => setEditing(c)} onEnable={() => enable(c)} />
                ))}
                {showDebit && debit.map((d, i) => (
                  <DebitTile key={d.accountId} account={d} accent={CARD_ACCENTS[(cards.length + i) % CARD_ACCENTS.length]} />
                ))}
              </div>
            </>
          )}

          {!loading && cards.length > 0 && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <StrategyPanel cards={cards} today={today} />
              <ComingSoonPanel title="Utilization trend"
                body="Your utilization month by month. This needs a history of your card balances, which Cofre will start keeping in an upcoming update." />
              <ComingSoonPanel title="Rewards & opportunities"
                body="Rewards earned per card and where you could earn more. Plaid doesn’t report rewards — this arrives with Cofre’s card catalog." />
            </div>
          )}

          <CardProfileForm />
        </div>

        {editing && (
          <CardDetailDrawer card={editing} onClose={() => setEditing(null)}
            onSaved={(updated) => setCards((prev) => prev.map((c) => (c.accountId === updated.accountId ? updated : c)))} />
        )}
      </main>
    </div>
  );
}
