'use client';

import PageHeader from '@/components/PageHeader';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import PlaidLauncher from '@/components/PlaidLauncher';
import TotalUtilization from './components/TotalUtilization';
import StatTiles from './components/StatTiles';
import CardDeck from './components/CardDeck';
import SelectedCardPanel from './components/SelectedCardPanel';
import StrategyPanel from './components/StrategyPanel';
import ComingSoonPanel from './components/ComingSoonPanel';
import CardDetailDrawer from './components/CardDetailDrawer';
import CardProfileForm from './components/CardProfileForm';
import type { CardView, DebitView } from '@/lib/cards/types';
import { itemsNeedingFirstSync } from '@/lib/cards/first-sync';
import { buildDeck, deckSubtitle, selectionIndex, wrapIndex } from '@/lib/cards/deck';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3333/api';

function localToday(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export default function CardsPage() {
  const [cards, setCards] = useState<CardView[]>([]);
  const [debit, setDebit] = useState<DebitView[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<CardView | null>(null);
  const [linkToken, setLinkToken] = useState<string | null>(null);
  const [consentItemId, setConsentItemId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [direction, setDirection] = useState<1 | -1>(1);

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

  // Debit cards are a secondary view: a failure here just leaves them out of the deck.
  useEffect(() => {
    fetch(`${API}/cards/debit`, { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => setDebit(Array.isArray(d) ? d : []))
      .catch(() => undefined);
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


  const today = localToday();
  const deck = useMemo(() => buildDeck(cards, debit), [cards, debit]);
  const index = selectionIndex(deck, selectedId);
  const selected = deck[index] ?? null;

  /* Picking a card: remember which way the user went so the detail slides the same way.
     Across the loop seam (last → first) the shortest way wins. */
  const select = useCallback((next: number) => {
    const n = deck.length;
    if (n === 0) return;
    const i = wrapIndex(next, n);
    if (i !== index) {
      const forward = ((i - index) + n) % n;
      setDirection(forward <= n / 2 ? 1 : -1);
    }
    setSelectedId(deck[i].id);
  }, [deck, index]);

  return (
    <div className="contents">
      <main className="flex-1 overflow-y-auto pt-14 md:pt-0">
        <div className="p-4 sm:p-6 flex flex-col gap-5">
          <PageHeader title="Cards" subtitle={loading ? 'Loading your cards…' : `${deckSubtitle(deck)} · one place`} />

          {error && <p className="text-sm" style={{ color: 'var(--color-rose)' }} role="alert">{error}</p>}

          {!loading && deck.length === 0 && !error && (
            <div className="rounded-2xl p-6 text-sm" style={{ background: 'var(--color-surface)', border: 'var(--glass-border)' }}>
              No cards yet. Connect your bank or add a credit card or checking account in{' '}
              <a href="/settings" className="font-semibold underline" style={{ color: 'var(--color-primary)' }}>Settings</a>.
            </div>
          )}

          {!loading && deck.length > 0 && (
            <div className="flex flex-col gap-5">
              {/* One column at every width: the deck across the top, the picked card's detail under it, then the summary. */}
              <div className="min-w-0">
                <CardDeck deck={deck} index={index} onSelect={select} />
              </div>
              {selected && (
                <SelectedCardPanel entry={selected} direction={direction} onEdit={setEditing} onEnable={enable} />
              )}
              {cards.length > 0 && (
                <div className="grid grid-cols-1 xl:grid-cols-5 gap-4">
                  <TotalUtilization cards={cards} />
                  <StatTiles cards={cards} today={today} />
                </div>
              )}
            </div>
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

        {linkToken && <PlaidLauncher token={linkToken} onSuccess={onSuccess} onExit={clearHandoff} />}
        <CardDetailDrawer card={editing} onClose={() => setEditing(null)}
          onSaved={(updated) => setCards((prev) => prev.map((c) => (c.accountId === updated.accountId ? updated : c)))} />
      </main>
    </div>
  );
}
