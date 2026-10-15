'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { usePlaidLink } from 'react-plaid-link';
import Sidebar from '@/components/Sidebar';
import TotalUtilization from './components/TotalUtilization';
import CardTile from './components/CardTile';
import CardDetailDrawer from './components/CardDetailDrawer';
import CardProfileForm from './components/CardProfileForm';
import type { CardView } from '@/lib/cards/types';
import { itemsNeedingFirstSync } from '@/lib/cards/first-sync';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3333/api';

export default function CardsPage() {
  const [cards, setCards] = useState<CardView[]>([]);
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

  return (
    <div className="flex h-dvh overflow-hidden">
      <Sidebar />
      <main className="flex-1 overflow-y-auto pt-14 md:pt-0">
        <div className="p-4 sm:p-6 flex flex-col gap-5">
          <div>
            <h1 className="font-bold tracking-tight" style={{ fontSize: 'clamp(24px, 3vw, 34px)' }}>Credit Cards</h1>
            <p className="mt-1 text-sm" style={{ color: 'var(--color-text-secondary)' }}>APRs, limits and due dates for every card you have</p>
          </div>

          {error && <p className="text-sm" style={{ color: 'var(--color-rose)' }} role="alert">{error}</p>}

          {!loading && cards.length > 0 && <TotalUtilization cards={cards} />}

          {loading ? (
            <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>Loading cards…</p>
          ) : cards.length === 0 ? (
            error ? null :
            <div className="rounded-2xl p-6 text-sm" style={{ background: 'var(--color-surface)', border: 'var(--glass-border)' }}>
              No credit cards yet. Connect your card’s bank or add a credit card account in{' '}
              <a href="/settings" className="font-semibold underline" style={{ color: 'var(--color-primary)' }}>Settings</a>.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {cards.map((c) => (
                <CardTile key={c.accountId} card={c} onOpen={() => setEditing(c)} onEnable={() => enable(c)} />
              ))}
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
