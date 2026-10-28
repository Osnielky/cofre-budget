'use client';

import { useState, useEffect, useCallback, useMemo, useRef, Fragment, FormEvent, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { createPortal } from 'react-dom';
import { usePlaidLink } from 'react-plaid-link';
import Sidebar from '@/components/Sidebar';
import CsvImportModal from '@/components/CsvImportModal';
import CategoryManager from '@/components/CategoryManager';
import RulesManager from '@/components/RulesManager';
import RecurringManager from '@/components/RecurringManager';
import ProjectCategoryManager from '@/components/ProjectCategoryManager';
import AccountSettings from '@/components/AccountSettings';
import BankSelect, { BANKS } from '@/components/BankSelect';
import AccountTypeIcon from '@/components/AccountTypeIcon';
import DataResetModal from '@/components/DataResetModal';
import PlaidMergeReviewModal, { PreviewExchangeResult } from '@/components/PlaidMergeReviewModal';
import IntegrationsTab from '@/components/IntegrationsTab';
import BillingTab from '@/components/BillingTab';
import { useTheme } from '@/components/ThemeProvider';
import { THEMES } from '@/lib/theme';
import { ACCOUNT_TYPES, ACCOUNT_GROUPS, isLiability } from '@/lib/accountTypes';
import { connectBankError, InstitutionLimitError } from '@/lib/connect-bank-error';
import MyTicketsList from '@/components/support/MyTicketsList';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3333/api';

type AccountType = string;
type Tab = 'account' | 'banks' | 'categories' | 'recurring' | 'rules' | 'projects' | 'appearance' | 'integrations' | 'billing' | 'help' | 'data';

interface BankAccount {
  id: string;
  bankName: string;
  accountName: string;
  accountType: AccountType;
  balance: number;
  currency: string;
  color: string;
  provider: string;
  plaidItemId: string | null;
  plaidStatus?: string | null;
  last4?: string | null;
  txCount?: number;
}

const TYPE_META: Record<string, { label: string; accent: string; icon: string }> = Object.fromEntries(
  ACCOUNT_TYPES.map((t) => [t.value, { label: t.label, accent: t.accent, icon: t.icon }]),
);

const PRESET_COLORS = ['#9B6DFF', '#4FBF7F', '#F07A3E', '#F5C842', '#4BA8D8', '#E879A0'];

interface CardDesign { id: string; name: string; gradient: string; color: string; brand: 'VISA' | 'MC' | 'AMEX' | '' }

const CARD_DESIGNS: Record<string, CardDesign[]> = {
  'Bank of America': [
    /* Customized Cash Rewards — deep faceted red, diagonal geometric planes, VISA Signature */
    { id: 'boa-cash',    name: 'Cash Rewards',    gradient: 'linear-gradient(145deg,#D91A2A 0%,#9B0F1A 22%,#C81828 40%,#7D0A15 62%,#B51522 80%,#D41A2E 100%)', color: '#C81828', brand: 'VISA' },
    /* Travel Rewards — navy blue with lighter blue diagonal planes */
    { id: 'boa-travel',  name: 'Travel Rewards',  gradient: 'linear-gradient(145deg,#003580 0%,#002060 22%,#1B4FA0 42%,#001540 62%,#1B5FB0 82%,#003087 100%)', color: '#003087', brand: 'VISA' },
    /* Premium Rewards — dark charcoal with subtle geometric planes */
    { id: 'boa-premium', name: 'Premium Rewards', gradient: 'linear-gradient(145deg,#2C2C2C 0%,#141414 25%,#383838 48%,#0A0A0A 68%,#282828 85%,#1A1A1A 100%)', color: '#1A1A1A', brand: 'VISA' },
    /* BankAmericard — silver/gray geometric planes */
    { id: 'boa-bank',    name: 'BankAmericard',   gradient: 'linear-gradient(145deg,#A0A0A0 0%,#6E6E6E 25%,#BABABA 48%,#585858 68%,#969696 85%,#7B7B7B 100%)', color: '#7B7B7B', brand: 'VISA' },
    /* Checking debit — standard BofA red, no brand mark */
    { id: 'boa-check',   name: 'Checking',        gradient: 'linear-gradient(145deg,#D91A2A 0%,#9B0F1A 22%,#C81828 40%,#7D0A15 62%,#B51522 80%,#D41A2E 100%)', color: '#C81828', brand: '' },
  ],
  'Chase': [
    { id: 'ch-sap-p',  name: 'Sapphire Preferred', gradient: 'linear-gradient(135deg,#1C3F6E 0%,#2471A3 100%)', color: '#1C3F6E', brand: 'VISA' },
    { id: 'ch-sap-r',  name: 'Sapphire Reserve',   gradient: 'linear-gradient(135deg,#212121 0%,#424242 100%)', color: '#212121', brand: 'VISA' },
    { id: 'ch-freedom',name: 'Freedom',             gradient: 'linear-gradient(135deg,#0070BA 0%,#00A8E0 100%)', color: '#0070BA', brand: 'VISA' },
    { id: 'ch-ink',    name: 'Ink Business',        gradient: 'linear-gradient(135deg,#1A1A1A 0%,#333 100%)',    color: '#1A1A1A', brand: 'VISA' },
    { id: 'ch-check',  name: 'Checking',            gradient: 'linear-gradient(135deg,#117ACA 0%,#0A5E9E 100%)', color: '#117ACA', brand: '' },
  ],
  'Wells Fargo': [
    { id: 'wf-active',    name: 'Active Cash',  gradient: 'linear-gradient(135deg,#CC0000 0%,#990000 100%)', color: '#CC0000', brand: 'VISA' },
    { id: 'wf-autograph', name: 'Autograph',    gradient: 'linear-gradient(135deg,#8B0000 0%,#CC3333 100%)', color: '#8B0000', brand: 'VISA' },
    { id: 'wf-check',     name: 'Checking',     gradient: 'linear-gradient(135deg,#CC0000 0%,#B8860B 60%)',  color: '#CC0000', brand: '' },
  ],
  'Citibank': [
    { id: 'citi-double', name: 'Double Cash',  gradient: 'linear-gradient(135deg,#003B70 0%,#1A5276 100%)', color: '#003B70', brand: 'MC' },
    { id: 'citi-custom', name: 'Custom Cash',  gradient: 'linear-gradient(135deg,#1A3A6B 0%,#E67E22 100%)', color: '#1A3A6B', brand: 'MC' },
    { id: 'citi-check',  name: 'Checking',     gradient: 'linear-gradient(135deg,#003B70 0%,#0055A0 100%)', color: '#003B70', brand: '' },
  ],
  'Capital One': [
    { id: 'c1-venture',  name: 'Venture X',     gradient: 'linear-gradient(135deg,#1A1A1A 0%,#3D3D3D 100%)', color: '#2D2D2D', brand: 'VISA' },
    { id: 'c1-quick',    name: 'Quicksilver',   gradient: 'linear-gradient(135deg,#8A8A8A 0%,#C0C0C0 100%)', color: '#8A8A8A', brand: 'MC' },
    { id: 'c1-savor',    name: 'Savor',         gradient: 'linear-gradient(135deg,#D03027 0%,#AA1010 100%)', color: '#D03027', brand: 'MC' },
    { id: 'c1-check',    name: 'Checking',      gradient: 'linear-gradient(135deg,#D03027 0%,#B01020 100%)', color: '#D03027', brand: '' },
  ],
  'U.S. Bank': [
    { id: 'usb-altitude', name: 'Altitude Go', gradient: 'linear-gradient(135deg,#0C2074 0%,#1A3899 100%)', color: '#0C2074', brand: 'VISA' },
    { id: 'usb-cash',     name: 'Cash+',       gradient: 'linear-gradient(135deg,#0C2074 0%,#3D5AF1 100%)', color: '#1A3899', brand: 'VISA' },
    { id: 'usb-check',    name: 'Checking',    gradient: 'linear-gradient(135deg,#0C2074 0%,#1A3899 100%)', color: '#0C2074', brand: '' },
  ],
  'Truist': [
    { id: 'tr-check', name: 'Checking',   gradient: 'linear-gradient(135deg,#6B2C91 0%,#4A1E6B 100%)', color: '#6B2C91', brand: '' },
    { id: 'tr-cash',  name: 'Enjoy Cash', gradient: 'linear-gradient(135deg,#4A1E6B 0%,#7B35A5 100%)', color: '#4A1E6B', brand: 'VISA' },
  ],
  'PNC Bank': [
    { id: 'pnc-check', name: 'Checking',     gradient: 'linear-gradient(135deg,#FF6600 0%,#CC5200 100%)', color: '#FF6600', brand: '' },
    { id: 'pnc-cash',  name: 'Cash Rewards', gradient: 'linear-gradient(135deg,#FF6600 0%,#003087 100%)', color: '#FF6600', brand: 'VISA' },
  ],
  'TD Bank': [
    { id: 'td-check',  name: 'Checking',   gradient: 'linear-gradient(135deg,#34B233 0%,#27892B 100%)', color: '#34B233', brand: '' },
    { id: 'td-cash',   name: 'Cash Back',  gradient: 'linear-gradient(135deg,#27892B 0%,#34B233 100%)', color: '#34B233', brand: 'VISA' },
  ],
  'Goldman Sachs': [
    { id: 'gs-marcus', name: 'Marcus',     gradient: 'linear-gradient(135deg,#2E4D3A 0%,#4A7B5E 100%)', color: '#2E4D3A', brand: '' },
    { id: 'gs-apple',  name: 'Apple Card', gradient: 'linear-gradient(135deg,#1C1C1C 0%,#3D3D3D 100%)', color: '#1C1C1C', brand: 'MC' },
  ],
};

const glass: React.CSSProperties = {
  background: 'var(--color-surface)',
  backdropFilter: 'var(--glass-blur)',
  WebkitBackdropFilter: 'var(--glass-blur)',
  border: 'var(--glass-border)',
  boxShadow: 'var(--glass-shadow)',
};

const inputStyle: React.CSSProperties = {
  background: 'var(--color-elevated)',
  border: '1px solid var(--color-border)',
  borderRadius: 'var(--radius-input)',
  color: 'var(--color-text-primary)',
};

/** `short` is the label below 2xl, where ten full labels no longer fit beside the sidebar. */
const TABS: { id: Tab; label: string; short?: string; icon: React.ReactNode }[] = [
  {
    id: 'account',
    label: 'Account',
    icon: (
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="8" r="4"/><path d="M4 21v-1a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6v1"/>
      </svg>
    ),
  },
  {
    id: 'banks',
    label: 'Bank Accounts',
    icon: (
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="9" width="18" height="12" rx="2"/><path d="M8 9V5a2 2 0 0 1 4 0v4"/><path d="M3 9h18"/>
      </svg>
    ),
  },
  {
    id: 'categories',
    label: 'Categories',
    icon: (
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z"/>
      </svg>
    ),
  },
  {
    id: 'recurring',
    label: 'Recurring Payments',
    short: 'Recurring',
    icon: (
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M17 2l4 4-4 4"/><path d="M3 11v-1a4 4 0 0 1 4-4h14"/>
        <path d="M7 22l-4-4 4-4"/><path d="M21 13v1a4 4 0 0 1-4 4H3"/>
      </svg>
    ),
  },
  {
    id: 'rules',
    label: 'Categorization Rules',
    short: 'Rules',
    icon: (
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 17v5"/><path d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a3 3 0 0 0-6 0Z"/>
      </svg>
    ),
  },
  {
    id: 'projects',
    label: 'Project Categories',
    short: 'Projects',
    icon: (
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M2 20h20M5 20V8l7-5 7 5v12"/><path d="M9 20v-5h6v5"/>
      </svg>
    ),
  },
  {
    id: 'integrations',
    label: 'Integrations',
    icon: (
      <svg width="15" height="15" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
      </svg>
    ),
  },
  {
    id: 'billing',
    label: 'Billing',
    icon: (
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="1" y="4" width="22" height="16" rx="2"/><line x1="1" y1="10" x2="23" y2="10"/>
      </svg>
    ),
  },
  {
    id: 'appearance',
    label: 'Appearance',
    icon: (
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="3"/><path d="M12 2v2m0 16v2M4.93 4.93l1.41 1.41m11.32 11.32 1.41 1.41M2 12h2m16 0h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/>
      </svg>
    ),
  },
  {
    id: 'help',
    label: 'Help & Feedback',
    short: 'Help',
    icon: (
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="4"/>
        <path d="M4.93 4.93l4.24 4.24M14.83 14.83l4.24 4.24M14.83 9.17l4.24-4.24M9.17 14.83l-4.24 4.24"/>
      </svg>
    ),
  },
  {
    id: 'data',
    label: 'Data & Privacy',
    short: 'Data',
    icon: (
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/>
        <path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/>
      </svg>
    ),
  },
];

function SettingsPageInner() {
  const searchParams = useSearchParams();
  const [activeTab, setActiveTab] = useState<Tab>('banks');
  const [gmailStatus, setGmailStatus] = useState<{ connected: boolean; email?: string; connectedAt?: string } | null>(null);
  const [gmailLoading, setGmailLoading] = useState(false);
  const { theme: activeTheme, setTheme } = useTheme();
  const [accounts, setAccounts] = useState<BankAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [showManualForm, setShowManualForm] = useState(false);
  const [editingAccount, setEditingAccount] = useState<BankAccount | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<BankAccount | null>(null);
  const [deleteTxToo, setDeleteTxToo] = useState(false);
  const [deleteTxCount, setDeleteTxCount] = useState<number | null>(null);
  const [syncingId, setSyncingId] = useState<string | null>(null);
  const [importAccount, setImportAccount] = useState<BankAccount | null>(null);
  /* Phones: the account whose action chips are open (the row is a toggle). */
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [linkToken, setLinkToken] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [linkMode, setLinkMode] = useState<'connect' | 'reconnect'>('connect');
  const [reconnectItemId, setReconnectItemId] = useState<string | null>(null);
  const [mergeReview, setMergeReview] = useState<PreviewExchangeResult | null>(null);
  const [error, setError] = useState('');
  const [upgradeNotice, setUpgradeNotice] = useState('');
  const [typeOpen, setTypeOpen] = useState(false);
  const typeDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (typeDropdownRef.current && !typeDropdownRef.current.contains(e.target as Node)) {
        setTypeOpen(false);
      }
    }
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, []);

  useEffect(() => {
    if (searchParams.get('checkout') === 'success') {
      // Stripe Checkout's success_url lands here — always show the new plan,
      // regardless of any ?tab= param also present.
      setActiveTab('billing');
      return;
    }
    const tab = searchParams.get('tab') as Tab | null;
    if (tab && ['account', 'banks', 'categories', 'rules', 'projects', 'appearance', 'integrations', 'billing', 'help'].includes(tab)) {
      setActiveTab(tab);
    }
    // Re-run whenever the query string actually changes (e.g. clicking "Upgrade" while
    // already on /settings only changes the URL — Next.js's App Router does not remount
    // this client component for a query-only navigation, so a mount-only effect here
    // would never see the new ?tab= value).
  }, [searchParams]);

  /* Pick up state handed off by /settings/plaid-oauth-redirect — that page is a
     lightweight Link landing page for banks requiring Plaid's OAuth redirect
     (e.g. Charles Schwab) and doesn't carry the manual-account list this page
     needs to render PlaidMergeReviewModal, so it stashes the preview (or a
     failure message) in sessionStorage instead of showing it directly. */
  useEffect(() => {
    const pendingError = sessionStorage.getItem('plaidPendingError');
    if (pendingError) {
      setError(pendingError);
      sessionStorage.removeItem('plaidPendingError');
    }
    const pendingMerge = sessionStorage.getItem('plaidPendingMergeReview');
    if (pendingMerge) {
      try { setMergeReview(JSON.parse(pendingMerge)); } catch { /* malformed — ignore */ }
      sessionStorage.removeItem('plaidPendingMergeReview');
    }
  }, []);

  useEffect(() => {
    if (activeTab !== 'integrations') return;
    setGmailLoading(true);
    fetch(`${API}/gmail/status`, { credentials: 'include' })
      .then((r) => r.json())
      .then(setGmailStatus)
      .catch(() => setGmailStatus({ connected: false }))
      .finally(() => setGmailLoading(false));
  }, [activeTab]);

  const [form, setForm] = useState({
    bankName: '', accountName: '', accountType: 'checking' as AccountType,
    balance: '', currency: 'USD', color: PRESET_COLORS[0], last4: '',
  });

  const [showResetModal, setShowResetModal] = useState(false);

  useEffect(() => {
    fetch(`${API}/bank-accounts`, { credentials: 'include' })
      .then((r) => r.json()).then(setAccounts)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const openPlaidLink = async () => {
    setConnecting(true);
    setLinkMode('connect');
    setUpgradeNotice('');
    try {
      const res = await fetch(`${API}/plaid/link-token`, { method: 'POST', credentials: 'include' });
      if (!res.ok) {
        const failure = connectBankError(res.status, await res.json().catch(() => null));
        if (failure.upgrade) setUpgradeNotice(failure.message);
        else setError(failure.message);
        setConnecting(false);
        return;
      }
      const { link_token } = await res.json();
      sessionStorage.setItem('plaidLinkToken', link_token);
      sessionStorage.setItem('plaidLinkMode', 'connect');
      setLinkToken(link_token);
    } catch {
      setError(connectBankError(0, null).message);
      setConnecting(false);
    }
  };

  const openReconnect = async (account: BankAccount) => {
    if (!account.plaidItemId) return;
    setConnecting(true);
    setLinkMode('reconnect');
    setReconnectItemId(account.plaidItemId);
    try {
      const res = await fetch(`${API}/plaid/reconnect-token/${account.plaidItemId}`, { method: 'POST', credentials: 'include' });
      if (!res.ok) throw new Error();
      const { link_token } = await res.json();
      sessionStorage.setItem('plaidLinkToken', link_token);
      sessionStorage.setItem('plaidLinkMode', 'reconnect');
      sessionStorage.setItem('plaidReconnectItemId', account.plaidItemId);
      setLinkToken(link_token);
    } catch {
      setError('Could not open bank reconnection.');
      setConnecting(false);
    }
  };

  const onPlaidSuccess = useCallback(async (publicToken: string, metadata: any) => {
    setConnecting(true);
    try {
      if (linkMode === 'reconnect' && reconnectItemId) {
        const completeRes = await fetch(`${API}/plaid/reconnect/${reconnectItemId}/complete`, { method: 'POST', credentials: 'include' });
        if (!completeRes.ok) throw new Error();
        const { status } = await completeRes.json();
        if (status !== 'active') throw new Error();
        const res = await fetch(`${API}/bank-accounts`, { credentials: 'include' });
        const data = await res.json();
        setAccounts(Array.isArray(data) ? data : []);
      } else {
        const res = await fetch(`${API}/plaid/exchange/preview`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
          body: JSON.stringify({
            public_token: publicToken,
            institution_id: metadata.institution?.institution_id ?? '',
            institution_name: metadata.institution?.name ?? 'Unknown Bank',
          }),
        });
        if (!res.ok) {
          const body = await res.json().catch(() => null);
          if (body?.code === 'INSTITUTION_LIMIT_REACHED') {
            throw new InstitutionLimitError(body.message);
          }
          throw new Error();
        }
        const preview: PreviewExchangeResult = await res.json();

        if (preview.hasManualAccounts) {
          /* Let the user match to an existing manual account before creating anything —
             handled by the modal itself, which calls /plaid/exchange/confirm on submit. */
          setMergeReview(preview);
        } else {
          const confirmRes = await fetch(`${API}/plaid/exchange/confirm`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
            body: JSON.stringify({
              plaid_item_id: preview.plaidItemId,
              decisions: preview.accounts.map((a) => ({ plaidAccountId: a.plaidAccountId, action: 'new' })),
            }),
          });
          if (!confirmRes.ok) throw new Error();
          const newAccounts: BankAccount[] = await confirmRes.json();
          setAccounts((prev) => {
            const ids = new Set(newAccounts.map((a) => a.id));
            return [...prev.filter((a) => !ids.has(a.id)), ...newAccounts];
          });
        }
      }
    } catch (err) {
      if (err instanceof InstitutionLimitError) {
        setError(err.message);
      } else {
        setError(linkMode === 'reconnect' ? 'Reconnected, but refresh failed. Try syncing manually.' : 'Bank connected but account import failed. Try syncing manually.');
      }
    } finally {
      setLinkToken(null); setConnecting(false); setReconnectItemId(null);
      sessionStorage.removeItem('plaidLinkToken');
      sessionStorage.removeItem('plaidLinkMode');
      sessionStorage.removeItem('plaidReconnectItemId');
    }
  }, [linkMode, reconnectItemId]);

  const { open: openLink, ready: linkReady } = usePlaidLink({
    token: linkToken ?? '', onSuccess: onPlaidSuccess,
    onExit: () => {
      setLinkToken(null); setConnecting(false); setReconnectItemId(null);
      sessionStorage.removeItem('plaidLinkToken');
      sessionStorage.removeItem('plaidLinkMode');
      sessionStorage.removeItem('plaidReconnectItemId');
    },
  });

  useEffect(() => { if (linkToken && linkReady) openLink(); }, [linkToken, linkReady, openLink]);

  async function handleGmailDisconnect() {
    if (!confirm('Disconnect Gmail? Cached receipts will remain.')) return;
    await fetch(`${API}/gmail/disconnect`, { method: 'DELETE', credentials: 'include' });
    setGmailStatus({ connected: false });
  }

  async function handleAdd(e: FormEvent) {
    e.preventDefault(); setSubmitting(true); setError('');
    try {
      const res = await fetch(`${API}/bank-accounts`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify({ ...form, balance: parseFloat(form.balance) || 0, last4: form.last4.trim() || null }),
      });
      if (!res.ok) throw new Error();
      const created = await res.json();
      setAccounts((prev) => [...prev, created]);
      setShowManualForm(false);
      setForm({ bankName: '', accountName: '', accountType: 'checking', balance: '', currency: 'USD', color: PRESET_COLORS[0], last4: '' });
    } catch { setError('Could not add account. Please try again.'); }
    finally { setSubmitting(false); }
  }

  function openEdit(account: BankAccount) {
    setForm({
      bankName: account.bankName,
      accountName: account.accountName,
      accountType: account.accountType as AccountType,
      balance: String(account.balance),
      currency: account.currency,
      color: account.color || PRESET_COLORS[0],
      last4: account.last4 ?? '',
    });
    setEditingAccount(account);
    setShowManualForm(true);
    setError('');
  }

  async function handleUpdate(e: FormEvent) {
    e.preventDefault();
    if (!editingAccount) return;
    setSubmitting(true); setError('');
    try {
      const res = await fetch(`${API}/bank-accounts/${editingAccount.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify({ ...form, balance: parseFloat(form.balance) || 0, last4: form.last4.trim() || null }),
      });
      if (!res.ok) throw new Error();
      const updated = await res.json();
      setAccounts((prev) => prev.map((a) => (a.id === updated.id ? updated : a)));
      setShowManualForm(false);
      setEditingAccount(null);
      setForm({ bankName: '', accountName: '', accountType: 'checking', balance: '', currency: 'USD', color: PRESET_COLORS[0], last4: '' });
    } catch { setError('Could not update account. Please try again.'); }
    finally { setSubmitting(false); }
  }

  function openDeleteConfirm(account: BankAccount) {
    setConfirmDelete(account);
    setDeleteTxToo(false);
    // Seed from the count that came with the accounts list (reliable, already loaded).
    setDeleteTxCount(typeof account.txCount === 'number' ? account.txCount : null);
    // Refresh from the dedicated endpoint, but only overwrite on success — never
    // fall back to a misleading 0 if the request fails.
    fetch(`${API}/bank-accounts/${account.id}/transaction-count`, { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d && typeof d.count === 'number') setDeleteTxCount(d.count); })
      .catch(() => {});
  }

  async function confirmDeleteAccount() {
    if (!confirmDelete) return;
    const id = confirmDelete.id;
    setDeletingId(id);
    try {
      const qs = deleteTxToo ? '?deleteTransactions=true' : '';
      await fetch(`${API}/bank-accounts/${id}${qs}`, { method: 'DELETE', credentials: 'include' });
      setAccounts((prev) => prev.filter((a) => a.id !== id));
      setConfirmDelete(null);
    } finally { setDeletingId(null); }
  }

  async function handleSync(account: BankAccount) {
    if (!account.plaidItemId) return;
    setSyncingId(account.id);
    try {
      await fetch(`${API}/plaid/sync/${account.plaidItemId}`, { method: 'POST', credentials: 'include' });
      const res = await fetch(`${API}/bank-accounts`, { credentials: 'include' });
      const data = await res.json();
      setAccounts(Array.isArray(data) ? data : []);
    } finally { setSyncingId(null); }
  }

  /* One group per bank, shared by the phone list and the desktop grid. */
  const bankGroups = useMemo(() => {
    const m = new Map<string, BankAccount[]>();
    for (const a of accounts) { const l = m.get(a.bankName); if (l) l.push(a); else m.set(a.bankName, [a]); }
    return Array.from(m, ([bankName, list]) => {
      const first = list[0];
      const color = first.color || (TYPE_META[first.accountType] ?? TYPE_META.checking).accent;
      const connected = list.filter((a) => a.provider === 'plaid');
      const broken = connected.find((a) => a.plaidStatus === 'error') ?? null;
      const syncable = connected.filter((a) => a.plaidItemId && a.plaidStatus !== 'error');
      return { bankName, list, first, color, connected, broken, syncable };
    });
  }, [accounts]);

  /* Summary strip. USD only — a non-USD account is listed but not summed. */
  const totals = useMemo(() => {
    let assets = 0, owed = 0;
    for (const a of accounts) {
      if (a.currency !== 'USD') continue;
      const b = Number(a.balance);
      if (isLiability(a.accountType)) { if (b > 0) owed += b; } else assets += b;
    }
    return {
      assets, owed, net: assets - owed,
      synced: accounts.filter((a) => a.provider === 'plaid' && a.plaidStatus !== 'error').length,
      broken: accounts.filter((a) => a.plaidStatus === 'error').length,
    };
  }, [accounts]);

  /* Keep the active tab in view on narrow screens where the strip scrolls, and
     fade whichever edge still has tabs hidden behind it. */
  const tabStripRef = useRef<HTMLDivElement>(null);
  const [tabFade, setTabFade] = useState({ left: false, right: false });
  useEffect(() => {
    const el = tabStripRef.current;
    if (!el) return;
    const measure = () => setTabFade({
      left: el.scrollLeft > 4,
      right: el.scrollLeft + el.clientWidth < el.scrollWidth - 4,
    });
    measure();
    el.addEventListener('scroll', measure, { passive: true });
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => { el.removeEventListener('scroll', measure); ro.disconnect(); };
  }, []);
  useEffect(() => {
    document.querySelector<HTMLElement>(`[data-settings-tab="${activeTab}"]`)
      ?.scrollIntoView({ block: 'nearest', inline: 'center' });
  }, [activeTab]);

  return (
    <div className="flex h-dvh overflow-hidden">
      <Sidebar />

      <main className="flex-1 overflow-y-auto pt-14 md:pt-0">
        {/* Page header */}
        {/* top-0, not top-14: <main> already pads for the phone top bar, and a
            scroll container's padding is excluded from the sticky box, so a 56px
            offset here would double up and hide the first rows of every tab. */}
        <div className="sticky top-0 z-10 px-4 sm:px-6 pt-4 sm:pt-5"
          style={{ background: 'var(--header-bg)', backdropFilter: 'var(--glass-blur)', WebkitBackdropFilter: 'var(--glass-blur)', borderBottom: '1px solid var(--color-border)' }}>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight mb-2 sm:mb-3">Settings</h1>

          {/* Tab strip: underline tabs, one row that scrolls sideways when it must
              (phones, the icon rail) and spreads out when it can. The destructive
              Delete action sits apart on the right, icon-only below sm. */}
          <nav aria-label="Settings sections" className="relative -mx-4 sm:-mx-6">
            {tabFade.left && <div aria-hidden="true" className="pointer-events-none absolute inset-y-0 left-0 w-10 z-10" style={{ background: 'linear-gradient(90deg, var(--header-bg), transparent)' }} />}
            {tabFade.right && <div aria-hidden="true" className="pointer-events-none absolute inset-y-0 right-0 w-14 z-10" style={{ background: 'linear-gradient(270deg, var(--header-bg), transparent)' }} />}
            <div ref={tabStripRef} className="overflow-x-auto px-4 sm:px-6" style={{ scrollbarWidth: 'none' }}>
              <div className="flex items-stretch gap-0.5 min-w-max">
                {TABS.map((tab) => {
                  const active = activeTab === tab.id;
                  const danger = tab.id === 'data';
                  return (
                    <Fragment key={tab.id}>
                      {danger && <div className="ml-auto w-px self-center h-5 mx-1.5 shrink-0" style={{ background: 'var(--color-border)' }} />}
                      <button
                        type="button"
                        data-settings-tab={tab.id}
                        aria-current={active ? 'page' : undefined}
                        aria-label={danger ? tab.label : undefined}
                        title={danger ? tab.label : undefined}
                        onClick={() => danger ? setShowResetModal(true) : setActiveTab(tab.id)}
                        className="relative flex items-center gap-1.5 px-2.5 lg:px-3 pt-1.5 pb-2.5 text-[12.5px] lg:text-[13px] font-semibold whitespace-nowrap rounded-t-lg transition-colors hover:bg-[color-mix(in_srgb,var(--color-text-primary)_5%,transparent)]"
                        style={{ color: danger ? 'var(--color-rose)' : active ? 'var(--color-primary)' : 'var(--color-text-secondary)' }}>
                        <span className={active ? '' : 'opacity-75'}>{tab.icon}</span>
                        {tab.short ? (
                          <>
                            <span className="2xl:hidden">{tab.short}</span>
                            <span className="hidden 2xl:inline">{tab.label}</span>
                          </>
                        ) : (
                          <span className={danger ? 'hidden sm:inline' : ''}>{tab.label}</span>
                        )}
                        {active && (
                          <span aria-hidden="true" className="absolute left-2 right-2 -bottom-px h-[2px] rounded-full"
                            style={{ background: 'var(--color-primary)', boxShadow: '0 0 10px color-mix(in srgb, var(--color-primary) 70%, transparent)' }} />
                        )}
                      </button>
                    </Fragment>
                  );
                })}
              </div>
            </div>
          </nav>
        </div>

        <div className="p-4 sm:p-6">

          {/* ── BANK ACCOUNTS TAB ── */}
          {activeTab === 'banks' && (
            <div className="flex flex-col gap-5"><>
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <p className="text-sm max-w-2xl" style={{ color: 'var(--color-text-muted)' }}>
                  Connect a US bank for automatic updates, or add accounts manually and import CSV exports from any bank.
                </p>
                <div className="flex gap-2 shrink-0">
                  <button onClick={openPlaidLink} disabled={connecting}
                    className="px-4 py-2 text-sm font-semibold text-white rounded-xl transition-all hover:brightness-110 disabled:opacity-60 flex items-center gap-2"
                    style={{ background: 'var(--color-card-green)' }}>
                    <LinkIcon />
                    {connecting ? 'Connecting…' : 'Connect Bank'}
                  </button>
                  <button onClick={() => setShowManualForm(true)}
                    className="px-4 py-2 text-sm font-semibold rounded-xl transition-all hover:text-[var(--color-text-primary)]"
                    style={{ color: 'var(--color-text-secondary)', border: '1px solid var(--color-border)' }}>
                    + Manual
                  </button>
                </div>
              </div>

              {/* Connect/reconnect error — shown here so it's visible regardless of which
                  flow set it (popup Link, OAuth-redirect hand-off, or reconnect) */}
              {error && !showManualForm && (
                <div className="px-4 py-3 rounded-xl flex items-start gap-3 text-sm"
                  style={{ background: 'color-mix(in srgb, var(--color-rose) 8%, transparent)', border: '1px solid color-mix(in srgb, var(--color-rose) 25%, transparent)' }}>
                  <span className="mt-0.5">⚠️</span>
                  <p className="flex-1" style={{ color: 'var(--color-rose)' }}>{error}</p>
                  <button onClick={() => setError('')}
                    className="text-xs font-semibold shrink-0" style={{ color: 'var(--color-text-muted)' }}>
                    ✕
                  </button>
                </div>
              )}

              {/* Plan gate (free plan, or Pro's institution limit): point at Billing, not at Plaid */}
              {upgradeNotice && (
                <div className="px-4 py-3 rounded-xl flex flex-wrap items-center gap-3 text-sm"
                  style={{ background: 'color-mix(in srgb, var(--color-primary) 8%, transparent)', border: '1px solid color-mix(in srgb, var(--color-primary) 30%, transparent)' }}>
                  <span>✨</span>
                  <p className="flex-1 min-w-[200px]" style={{ color: 'var(--color-text-primary)' }}>{upgradeNotice}</p>
                  <button onClick={() => { setUpgradeNotice(''); setActiveTab('billing'); }}
                    className="btn-gold py-2 px-4 text-xs font-semibold shrink-0 cursor-pointer" style={{ borderRadius: 12 }}>
                    See plans
                  </button>
                  <button onClick={() => setUpgradeNotice('')} aria-label="Dismiss"
                    className="text-xs font-semibold shrink-0" style={{ color: 'var(--color-text-muted)' }}>
                    ✕
                  </button>
                </div>
              )}

              {/* Summary strip — only once there is something to sum. */}
              {!loading && accounts.length > 0 && (
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                  {[
                    { label: 'Assets', value: money(totals.assets), color: 'var(--color-green)', sub: 'cash, checking, savings, investments' },
                    { label: 'Owed', value: money(totals.owed), color: 'var(--color-rose)', sub: 'cards, loans, mortgages' },
                    { label: 'Net', value: money(totals.net), color: totals.net < 0 ? 'var(--color-rose)' : 'var(--color-primary)', sub: 'assets minus what you owe' },
                    {
                      label: 'Connections',
                      value: `${bankGroups.length} bank${bankGroups.length === 1 ? '' : 's'}`,
                      color: totals.broken ? 'var(--color-rose)' : 'var(--color-text-primary)',
                      sub: totals.broken
                        ? `${totals.broken} account${totals.broken === 1 ? '' : 's'} need${totals.broken === 1 ? 's' : ''} reconnect`
                        : `${totals.synced} synced · ${accounts.length - totals.synced} manual`,
                    },
                  ].map((t) => (
                    <div key={t.label} className="px-4 py-3 rounded-2xl min-w-0" style={{ ...glass, borderRadius: 'var(--radius-card)' }}>
                      <p className="text-[10.5px] font-bold uppercase tracking-[0.14em]" style={{ color: 'var(--color-text-muted)' }}>{t.label}</p>
                      <p className="mt-1 text-lg sm:text-xl font-black tabular-nums truncate" style={{ color: t.color }}>{t.value}</p>
                      <p className="text-[11px] truncate" style={{ color: 'var(--color-text-muted)' }}>{t.sub}</p>
                    </div>
                  ))}
                </div>
              )}

              {/* Plaid note */}
              <p className="text-xs flex items-center gap-2" style={{ color: 'var(--color-text-muted)' }}>
                <span aria-hidden="true">🔒</span>
                <span>
                  Bank connections use <span className="font-semibold" style={{ color: 'var(--color-text-secondary)' }}>Plaid</span>, a read-only, bank-grade secure link. Cofre never stores your bank credentials.
                </span>
              </p>

              {/* Add account modal */}
              {showManualForm && createPortal(
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
                  style={{ background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(6px)' }}
                  onMouseDown={(e) => { if (e.target === e.currentTarget) { setShowManualForm(false); setEditingAccount(null); setError(''); } }}>

                  <form onSubmit={editingAccount ? handleUpdate : handleAdd}
                    className="w-full max-w-md flex flex-col rounded-2xl overflow-hidden"
                    style={{ background: 'var(--color-elevated)', border: 'var(--glass-border)', boxShadow: 'var(--glass-shadow)' }}>

                    {/* Header */}
                    <div className="flex items-center justify-between px-6 py-5"
                      style={{ borderBottom: '1px solid var(--color-border)' }}>
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-xl flex items-center justify-center text-lg shrink-0"
                          style={{ background: `${TYPE_META[form.accountType]?.accent ?? 'var(--color-primary)'}22`, color: TYPE_META[form.accountType]?.accent ?? 'var(--color-primary)' }}>
                          {TYPE_META[form.accountType]?.icon}
                        </div>
                        <div>
                          <p className="font-bold text-sm" style={{ color: 'var(--color-text-primary)' }}>
                            {editingAccount ? 'Edit Account' : 'New Account'}
                          </p>
                          <p className="text-xs mt-0.5" style={{ color: 'var(--color-text-muted)' }}>
                            {TYPE_META[form.accountType]?.label} · {form.currency}
                          </p>
                        </div>
                      </div>
                      <button type="button" onClick={() => { setShowManualForm(false); setEditingAccount(null); setError(''); }}
                        className="w-8 h-8 rounded-lg flex items-center justify-center transition-colors hover:bg-[var(--color-elevated)]"
                        style={{ color: 'var(--color-text-muted)' }}>
                        <CloseIcon />
                      </button>
                    </div>

                    <div className="flex flex-col gap-4 px-6 py-5">

                      {/* Row 1: Account Type + Currency */}
                      <div className="flex gap-3">
                        <div className="flex flex-col gap-1.5 flex-1 min-w-0" ref={typeDropdownRef} style={{ position: 'relative' }}>
                          <label className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: 'var(--color-text-muted)' }}>Type</label>
                          <button type="button" onClick={() => setTypeOpen((o) => !o)}
                            className="px-3 py-2.5 text-sm outline-none w-full flex items-center justify-between gap-2 rounded-xl"
                            style={inputStyle}>
                            <span className="flex items-center gap-2">
                              <span>{TYPE_META[form.accountType]?.icon}</span>
                              <span style={{ color: 'var(--color-text-primary)' }}>{TYPE_META[form.accountType]?.label}</span>
                            </span>
                            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" style={{ opacity: 0.4, flexShrink: 0, transition: 'transform .15s', transform: typeOpen ? 'rotate(180deg)' : undefined }}>
                              <path d="M2 4l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                            </svg>
                          </button>
                          {typeOpen && (
                            <div style={{
                              position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, zIndex: 100,
                              background: 'var(--popover-bg)',
                              border: 'var(--glass-border)',
                              borderRadius: '0.75rem', overflowY: 'auto', maxHeight: '280px',
                              boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
                            }}>
                              {ACCOUNT_GROUPS.map((grp) => (
                                <div key={grp.group}>
                                  <p className="px-3 pt-2.5 pb-1 text-[10px] font-bold uppercase tracking-widest"
                                    style={{ color: 'var(--color-text-muted)' }}>{grp.label}</p>
                                  {grp.types.map((meta) => {
                                    const val = meta.value;
                                    return (
                                      <button key={val} type="button"
                                        onClick={() => { setForm((f) => ({ ...f, accountType: val, bankName: val === 'cash' ? 'Personal' : f.bankName, accountName: val === 'cash' && !f.accountName ? 'My Cash' : f.accountName })); setTypeOpen(false); }}
                                        className="w-full px-3 py-2.5 text-sm text-left flex items-center gap-2.5 transition-colors"
                                        style={{ color: form.accountType === val ? meta.accent : 'var(--color-text-primary)', background: form.accountType === val ? `${meta.accent}18` : 'transparent' }}
                                        onMouseEnter={(e) => (e.currentTarget.style.background = `${meta.accent}15`)}
                                        onMouseLeave={(e) => (e.currentTarget.style.background = form.accountType === val ? `${meta.accent}18` : 'transparent')}>
                                        <AccountTypeIcon type={val} size={16} /><span>{meta.label}</span>
                                      </button>
                                    );
                                  })}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                        <div className="flex flex-col gap-1.5 shrink-0" style={{ width: 90 }}>
                          <label className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: 'var(--color-text-muted)' }}>Currency</label>
                          <select value={form.currency} onChange={(e) => setForm((f) => ({ ...f, currency: e.target.value }))}
                            className="px-3 py-2.5 text-sm outline-none appearance-none w-full rounded-xl" style={inputStyle}>
                            {['USD', 'EUR', 'GBP', 'BRL', 'CUP', 'MXN', 'CAD'].map((c) => (
                              <option key={c} value={c}>{c}</option>
                            ))}
                          </select>
                        </div>
                      </div>

                      {/* Bank — hidden for cash */}
                      {form.accountType !== 'cash' && (
                      <div className="flex flex-col gap-1.5">
                        <label className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: 'var(--color-text-muted)' }}>
                          {form.accountType === 'loan' ? 'Institution or Person' : 'Bank'}
                        </label>
                        {form.accountType === 'loan' ? (
                          <input required placeholder="e.g. John Smith" value={form.bankName}
                            onChange={(e) => setForm((f) => ({ ...f, bankName: e.target.value }))}
                            className="px-3 py-2.5 text-sm outline-none rounded-xl w-full" style={inputStyle} />
                        ) : (
                          <BankSelect value={form.bankName} onChange={(v: string) => {
                            const firstCard = CARD_DESIGNS[v]?.[0];
                            setForm((f) => ({ ...f, bankName: v, color: firstCard ? firstCard.color : PRESET_COLORS[0] }));
                          }} inputStyle={{ ...inputStyle, borderRadius: '0.75rem' }} />
                        )}
                      </div>
                      )}

                      {/* Account Name + Last 4 */}
                      <div className="flex gap-3">
                        <div className="flex flex-col gap-1.5 flex-1 min-w-0">
                          <label className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: 'var(--color-text-muted)' }}>
                            {form.accountType === 'loan' ? 'Description' : 'Account Name'}
                          </label>
                          <input required
                            placeholder={form.accountType === 'loan' ? 'e.g. Personal Loan' : 'e.g. Main Checking'}
                            value={form.accountName}
                            onChange={(e) => setForm((f) => ({ ...f, accountName: e.target.value }))}
                            className="px-3 py-2.5 text-sm outline-none rounded-xl" style={inputStyle} />
                        </div>
                        {form.accountType !== 'cash' && (
                        <div className="flex flex-col gap-1.5 shrink-0" style={{ width: 84 }}>
                          <label className="text-[11px] font-semibold uppercase tracking-wider flex items-center gap-1" style={{ color: 'var(--color-text-muted)' }}>
                            Last 4
                            <span className="relative group" style={{ lineHeight: 0 }}>
                              <svg width="12" height="12" viewBox="0 0 16 16" fill="none" style={{ cursor: 'pointer', color: 'var(--color-text-muted)', opacity: 0.6 }}>
                                <circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1.5"/>
                                <path d="M8 7v5M8 5.5v.01" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                              </svg>
                              <span className="absolute bottom-full right-0 mb-2 w-48 text-[11px] leading-relaxed font-normal normal-case tracking-normal rounded-lg px-3 py-2.5 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity z-50"
                                style={{ background: 'var(--color-elevated)', border: 'var(--glass-border)', color: 'var(--color-text-secondary)', boxShadow: 'var(--glass-shadow)', whiteSpace: 'normal' }}>
                                Last 4 digits of your card or account number. Used to detect if a CSV file belongs to this account on import.
                                <span className="absolute top-full right-2 -mt-px" style={{ width: 0, height: 0, borderLeft: '5px solid transparent', borderRight: '5px solid transparent', borderTop: '5px solid var(--color-border)' }} />
                              </span>
                            </span>
                          </label>
                          <input placeholder="···· " maxLength={4} value={form.last4}
                            onChange={(e) => setForm((f) => ({ ...f, last4: e.target.value.replace(/\D/g, '').slice(0, 4) }))}
                            className="px-3 py-2.5 text-sm outline-none text-center tracking-[0.3em] rounded-xl" style={inputStyle} />
                        </div>
                        )}
                      </div>

                      {/* Balance */}
                      <div className="flex flex-col gap-1.5">
                        <label className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: 'var(--color-text-muted)' }}>
                          {form.accountType === 'loan' ? 'Amount Owed' : isLiability(form.accountType) ? 'Current Debt' : 'Balance'}
                        </label>
                        <div className="flex rounded-xl overflow-hidden" style={{ border: '1px solid var(--color-border)' }}>
                          <span className="flex items-center px-3 text-xs font-semibold shrink-0"
                            style={{ background: 'var(--color-surface)', color: 'var(--color-text-muted)', borderRight: '1px solid var(--color-border)' }}>
                            {form.currency}
                          </span>
                          <input type="number" step="0.01" placeholder="0.00" value={form.balance}
                            onChange={(e) => setForm((f) => ({ ...f, balance: e.target.value }))}
                            className="flex-1 px-3 py-2.5 text-sm outline-none min-w-0"
                            style={{ background: 'var(--color-elevated)', color: 'var(--color-text-primary)' }} />
                        </div>
                      </div>

                      {/* Card Design / Color picker */}
                      {(() => {
                        const bankCards = CARD_DESIGNS[form.bankName] ?? [];
                        if (bankCards.length > 0) {
                          return (
                            <div className="flex flex-col gap-2">
                              <label className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: 'var(--color-text-muted)' }}>
                                Card Design
                              </label>
                              <div className="grid grid-cols-5 gap-2.5 p-3 rounded-xl" style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
                                {bankCards.map((design) => {
                                  const sel = form.color === design.color;
                                  return (
                                    <button key={design.id} type="button"
                                      onClick={() => setForm((f) => ({ ...f, color: design.color }))}
                                      className="flex flex-col gap-1 items-center group outline-none"
                                      title={design.name}>
                                      {/* Card thumbnail */}
                                      <div className="relative transition-transform hover:scale-105 duration-150"
                                        style={{
                                          width: 72, height: 45, borderRadius: 6,
                                          background: design.gradient,
                                          border: sel ? '2px solid var(--color-text-primary)' : '2px solid transparent',
                                          boxShadow: sel
                                            ? `0 0 0 2px ${design.color}, 0 6px 20px rgba(0,0,0,0.4)`
                                            : '0 2px 8px rgba(0,0,0,0.25)',
                                          overflow: 'hidden',
                                          flexShrink: 0,
                                        }}>
                                        {/* EMV chip */}
                                        <div className="absolute" style={{ top: 7, left: 8, width: 20, height: 14, borderRadius: 3, background: 'linear-gradient(135deg,#D4AF37 0%,#F5E06B 50%,#D4AF37 100%)' }} />
                                        {/* Brand mark */}
                                        {design.brand === 'VISA' && (
                                          <span className="absolute font-black italic" style={{ bottom: 4, right: 5, fontSize: 8, color: 'var(--color-text-primary)', letterSpacing: 0.5 }}>VISA</span>
                                        )}
                                        {design.brand === 'MC' && (
                                          <div className="absolute flex" style={{ bottom: 4, right: 5 }}>
                                            <div className="w-3.5 h-3.5 rounded-full opacity-85" style={{ background: '#EB001B' }} />
                                            <div className="w-3.5 h-3.5 rounded-full -ml-1.5 opacity-85" style={{ background: '#F79E1B' }} />
                                          </div>
                                        )}
                                        {design.brand === 'AMEX' && (
                                          <span className="absolute font-black" style={{ bottom: 4, right: 5, fontSize: 7, color: 'var(--color-text-primary)' }}>AMEX</span>
                                        )}
                                        {/* Shimmer */}
                                        <div className="absolute inset-0" style={{ background: 'linear-gradient(135deg,rgba(255,255,255,0.25) 0%,transparent 50%)', pointerEvents: 'none' }} />
                                      </div>
                                      {/* Card name */}
                                      <p className="text-center leading-tight" style={{ fontSize: 9, width: 72, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: sel ? 'var(--color-text-primary)' : 'var(--color-text-muted)' }}>
                                        {design.name}
                                      </p>
                                    </button>
                                  );
                                })}
                              </div>
                            </div>
                          );
                        }
                        return (
                          <div className="flex flex-col gap-1.5">
                            <label className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: 'var(--color-text-muted)' }}>Color</label>
                            <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl" style={{ ...inputStyle }}>
                              {PRESET_COLORS.map((c) => (
                                <button key={c} type="button" onClick={() => setForm((f) => ({ ...f, color: c }))}
                                  className="w-5 h-5 rounded-full transition-all hover:scale-110 shrink-0"
                                  style={{ background: c, boxShadow: form.color === c ? `0 0 0 2px rgba(0,0,0,0.6), 0 0 0 4px ${c}` : 'none' }} />
                              ))}
                            </div>
                          </div>
                        );
                      })()}

                    </div>

                    {/* Footer */}
                    <div className="flex items-center justify-between px-6 py-4"
                      style={{ borderTop: '1px solid var(--color-border)' }}>
                      {error
                        ? <p className="text-xs" style={{ color: 'var(--color-card-orange)' }}>{error}</p>
                        : <span />}
                      <div className="flex gap-2">
                        <button type="button" onClick={() => { setShowManualForm(false); setEditingAccount(null); setError(''); }}
                          className="px-4 py-2 text-sm font-medium rounded-xl transition-colors hover:bg-[var(--color-elevated)]"
                          style={{ color: 'var(--color-text-secondary)' }}>
                          Cancel
                        </button>
                        <button type="submit" disabled={submitting}
                          className="px-5 py-2 text-sm font-semibold text-white rounded-xl hover:brightness-110 disabled:opacity-60 transition-all"
                          style={{ background: TYPE_META[form.accountType]?.accent ?? 'var(--color-card-violet)' }}>
                          {submitting ? 'Saving…' : editingAccount ? 'Save Changes' : 'Add Account'}
                        </button>
                      </div>
                    </div>
                  </form>
                </div>,
                document.body
              )}

              {/* Account list */}
              {loading ? (
                <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>Loading accounts…</p>
              ) : accounts.length === 0 && !showManualForm ? (
                <div className="p-10 flex flex-col items-center gap-3 text-center" style={{ ...glass, borderRadius: 'var(--radius-card)' }}>
                  <span className="text-4xl">🏦</span>
                  <p className="font-medium">No accounts yet</p>
                  <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
                    Connect a US bank for automatic updates, or add an account manually and import a CSV from any bank.
                  </p>
                </div>
              ) : (
                <>
                {/* ── Phones: one card per bank — header (logo, name, status, sync), then a slim
                    row per account that expands on tap to show its actions. ── */}
                <div className="sm:hidden flex flex-col gap-3">
                  {bankGroups.map(({ bankName, list, first, color, connected, broken, syncable }) => {
                    const syncingGroup = list.some((a) => a.id === syncingId);
                    const statusColor = broken ? 'var(--color-rose)' : connected.length ? 'var(--color-green)' : 'var(--color-text-muted)';
                    return (
                      <div key={bankName} className="rounded-2xl overflow-hidden"
                        style={{ background: 'var(--color-elevated)', border: `1px solid ${color}28`, borderLeft: `3px solid ${color}` }}>
                        <div className="flex items-center gap-3 px-3 py-2.5" style={{ borderBottom: '1px solid var(--color-border)' }}>
                          <AccountVisual account={first} color={color} compact />
                          <div className="flex-1 min-w-0">
                            <p className="font-bold text-sm truncate" style={{ color: 'var(--color-text-primary)' }}>{bankName}</p>
                            <p className="text-[10.5px] font-semibold flex items-center gap-1.5" style={{ color: statusColor }}>
                              <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: 'currentColor' }} />
                              {list.length} account{list.length === 1 ? '' : 's'} · {broken ? 'Needs reconnect' : connected.length ? 'Synced' : 'Manual'}
                            </p>
                          </div>
                          {broken ? (
                            <button onClick={() => openReconnect(broken)} disabled={connecting}
                              className="px-2.5 h-8 rounded-lg text-[11px] font-semibold disabled:opacity-40"
                              style={{ color: 'var(--color-rose)', border: '1px solid color-mix(in srgb, var(--color-rose) 35%, transparent)' }}>
                              Reconnect
                            </button>
                          ) : syncable.length > 0 && (
                            <button disabled={syncingGroup} aria-label={`Sync ${bankName} now`} title="Sync now"
                              onClick={async () => {
                                const seen = new Set<string>();
                                for (const a of syncable) { if (seen.has(a.plaidItemId!)) continue; seen.add(a.plaidItemId!); await handleSync(a); }
                              }}
                              className="w-8 h-8 rounded-lg flex items-center justify-center disabled:opacity-40"
                              style={{ color: syncingGroup ? 'var(--color-text-muted)' : 'var(--color-green)', border: '1px solid var(--color-border)' }}>
                              <SyncIcon spinning={syncingGroup} />
                            </button>
                          )}
                        </div>
                        {list.map((account, i) => {
                          const meta = TYPE_META[account.accountType as AccountType] ?? TYPE_META.checking;
                          const balance = Number(account.balance);
                          const owed = isLiability(account.accountType) && balance > 0;
                          const open = expandedId === account.id;
                          const isConnected = account.provider === 'plaid';
                          const isCash = account.accountType === 'cash';
                          const unsetCash = isCash && balance === 0 && (account.txCount ?? 0) === 0;
                          const chip = 'flex items-center gap-1.5 px-3 h-9 rounded-xl text-xs font-semibold disabled:opacity-40';
                          return (
                            <div key={account.id} style={i > 0 ? { borderTop: '1px solid var(--color-border)' } : undefined}>
                              <button type="button" onClick={() => setExpandedId(open ? null : account.id)} aria-expanded={open}
                                className="w-full flex items-center gap-3 px-3 py-2.5 text-left">
                                <span className="w-1 h-8 rounded-full shrink-0" style={{ background: meta.accent }} />
                                <div className="flex-1 min-w-0">
                                  <p className="font-semibold text-[13px] truncate" style={{ color: 'var(--color-text-primary)' }}>{account.accountName}</p>
                                  <p className="text-[10.5px] truncate" style={{ color: 'var(--color-text-muted)' }}>
                                    {meta.label}{account.last4 ? ` ···${account.last4}` : ''}{account.currency !== 'USD' ? ` · ${account.currency}` : ''}
                                    {isConnected && account.plaidStatus === 'error' && <span style={{ color: 'var(--color-rose)' }}> · Needs reconnect</span>}
                                    {!isConnected && !isCash && connected.length > 0 && ' · Manual'}
                                  </p>
                                  {unsetCash && (
                                    <p className="text-[10.5px] font-semibold mt-0.5" style={{ color: 'var(--color-amber)' }}>Set how much cash you have → tap, then Edit</p>
                                  )}
                                </div>
                                <div className="text-right shrink-0">
                                  <p className="font-black text-sm tabular-nums" style={{ color: owed ? 'var(--color-rose)' : 'var(--color-text-primary)' }}>
                                    {owed ? '−' : ''}{account.currency === 'USD' ? '$' : `${account.currency} `}{Math.abs(balance).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                                  </p>
                                  {owed && <p className="text-[10px] font-semibold" style={{ color: 'color-mix(in srgb, var(--color-rose) 60%, transparent)' }}>owed</p>}
                                </div>
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
                                  className={`shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} style={{ color: 'var(--color-text-muted)' }}>
                                  <path d="M6 9l6 6 6-6" />
                                </svg>
                              </button>
                              {open && (
                                <div className="flex flex-wrap gap-2 px-3 pb-3">
                                  <button onClick={() => openEdit(account)} className={chip}
                                    style={{ color: 'var(--color-text-secondary)', border: '1px solid var(--color-border)' }}><EditIcon /> Edit</button>
                                  <button onClick={() => setImportAccount(account)} className={chip}
                                    style={{ color: 'var(--color-text-secondary)', border: '1px solid var(--color-border)' }}><UploadIcon /> Import CSV</button>
                                  {isConnected && (account.plaidStatus === 'error' ? (
                                    <button onClick={() => openReconnect(account)} disabled={connecting} className={chip}
                                      style={{ color: 'var(--color-rose)', border: '1px solid color-mix(in srgb, var(--color-rose) 35%, transparent)' }}>Reconnect</button>
                                  ) : (
                                    <button onClick={() => handleSync(account)} disabled={syncingId === account.id} className={chip}
                                      style={{ color: 'var(--color-green)', border: '1px solid color-mix(in srgb, var(--color-green) 35%, transparent)' }}>
                                      <SyncIcon spinning={syncingId === account.id} /> Sync now
                                    </button>
                                  ))}
                                  <button onClick={() => openDeleteConfirm(account)} disabled={deletingId === account.id} className={`${chip} ml-auto`}
                                    style={{ color: 'var(--color-rose)', border: '1px solid color-mix(in srgb, var(--color-rose) 35%, transparent)' }}>
                                    {deletingId === account.id ? '…' : <><TrashIcon /> Remove</>}
                                  </button>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    );
                  })}
                </div>

                {/* ── Desktop: one card per bank in a grid that fills the width —
                    header (logo, name, status, net, bank-level sync / reconnect), then
                    a ledger row per account with its actions. ── */}
                <div className="hidden sm:grid gap-4 grid-cols-1 xl:grid-cols-2 2xl:grid-cols-3 items-start">
                  {bankGroups.map(({ bankName, list, first, color, connected, broken, syncable }) => {
                    const syncingGroup = list.some((a) => a.id === syncingId);
                    const allUsd = list.every((a) => a.currency === 'USD');
                    const groupNet = list.reduce((sum, a) => sum + (isLiability(a.accountType) ? -Number(a.balance) : Number(a.balance)), 0);
                    const status = broken
                      ? { label: 'Needs reconnect', color: 'var(--color-rose)' }
                      : connected.length ? { label: 'Synced', color: 'var(--color-green)' } : { label: 'Manual', color: 'var(--color-text-muted)' };
                    return (
                      <section key={bankName} aria-label={bankName} className="flex flex-col overflow-hidden"
                        style={{ ...glass, borderRadius: 'var(--radius-card)' }}>
                        <div className="flex items-center gap-3 px-4 py-3"
                          style={{ borderBottom: '1px solid var(--color-border)', background: `linear-gradient(90deg, ${color}24, transparent 65%)` }}>
                          <AccountVisual account={first} color={color} compact />
                          <div className="flex-1 min-w-0">
                            <p className="font-bold text-sm truncate" style={{ color: 'var(--color-text-primary)' }}>{bankName}</p>
                            <p className="text-[11px] font-semibold flex items-center gap-1.5" style={{ color: status.color }}>
                              <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: 'currentColor' }} />
                              {list.length} account{list.length === 1 ? '' : 's'} · {status.label}
                            </p>
                          </div>
                          {allUsd && list.length > 1 && (
                            <div className="text-right shrink-0 pr-1">
                              <p className="text-[10px] font-bold uppercase tracking-[0.14em]" style={{ color: 'var(--color-text-muted)' }}>Net</p>
                              <p className="font-black text-sm tabular-nums" style={{ color: groupNet < 0 ? 'var(--color-rose)' : 'var(--color-text-primary)' }}>{money(groupNet)}</p>
                            </div>
                          )}
                          {broken ? (
                            <button onClick={() => openReconnect(broken)} disabled={connecting}
                              className="px-3 h-8 rounded-lg text-[11px] font-semibold disabled:opacity-40 transition-colors hover:brightness-110"
                              style={{ color: 'var(--color-rose)', border: '1px solid color-mix(in srgb, var(--color-rose) 35%, transparent)', background: 'color-mix(in srgb, var(--color-rose) 10%, transparent)' }}>
                              Reconnect
                            </button>
                          ) : syncable.length > 0 && (
                            <button disabled={syncingGroup} aria-label={`Sync ${bankName} now`} title="Sync now"
                              onClick={async () => {
                                const seen = new Set<string>();
                                for (const a of syncable) { if (seen.has(a.plaidItemId!)) continue; seen.add(a.plaidItemId!); await handleSync(a); }
                              }}
                              className="w-8 h-8 rounded-lg flex items-center justify-center disabled:opacity-40 transition-colors hover:bg-[color-mix(in_srgb,var(--color-green)_12%,transparent)]"
                              style={{ color: syncingGroup ? 'var(--color-text-muted)' : 'var(--color-green)', border: '1px solid var(--color-border)' }}>
                              <SyncIcon spinning={syncingGroup} />
                            </button>
                          )}
                        </div>

                        <ul className="flex flex-col">
                          {list.map((account, i) => {
                            const meta = TYPE_META[account.accountType as AccountType] ?? TYPE_META.checking;
                            const balance = Number(account.balance);
                            const owed = isLiability(account.accountType) && balance > 0;
                            const isConnected = account.provider === 'plaid';
                            const isCash = account.accountType === 'cash';
                            const unsetCash = isCash && balance === 0 && (account.txCount ?? 0) === 0;
                            const iconBtn = 'w-7 h-7 rounded-lg flex items-center justify-center transition-colors disabled:opacity-40';
                            return (
                              <li key={account.id} className="group flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-[color-mix(in_srgb,var(--color-text-primary)_3%,transparent)]"
                                style={i > 0 ? { borderTop: '1px solid var(--color-border)' } : undefined}>
                                <span className="w-1 h-9 rounded-full shrink-0" style={{ background: meta.accent }} />
                                <div className="flex-1 min-w-0">
                                  <p className="font-semibold text-[13px] truncate" style={{ color: 'var(--color-text-primary)' }}>{account.accountName}</p>
                                  <p className="text-[11px] truncate flex items-center gap-1.5" style={{ color: 'var(--color-text-muted)' }}>
                                    <span className="font-bold" style={{ color: meta.accent }}>{meta.label}</span>
                                    {account.last4 && <span className="tabular-nums">···{account.last4}</span>}
                                    {account.currency !== 'USD' && <span>· {account.currency}</span>}
                                    {isConnected && account.plaidStatus === 'error' && <span style={{ color: 'var(--color-rose)' }}>· Needs reconnect</span>}
                                    {!isConnected && !isCash && connected.length > 0 && <span>· Manual</span>}
                                  </p>
                                  {unsetCash && (
                                    <button type="button" onClick={() => openEdit(account)}
                                      className="mt-1 text-[11px] font-semibold px-2 py-0.5 rounded-full cursor-pointer"
                                      style={{ background: 'color-mix(in srgb, var(--color-amber) 14%, transparent)', color: 'var(--color-amber)', border: '1px solid color-mix(in srgb, var(--color-amber) 35%, transparent)' }}>
                                      Set how much cash you have →
                                    </button>
                                  )}
                                </div>
                                <div className="text-right shrink-0">
                                  <p className="font-black text-[15px] tabular-nums" style={{ color: owed ? 'var(--color-rose)' : 'var(--color-text-primary)' }}>
                                    {owed ? '−' : ''}{money(Math.abs(balance), account.currency)}
                                  </p>
                                  {owed && <p className="text-[10px] font-semibold leading-none" style={{ color: 'color-mix(in srgb, var(--color-rose) 60%, transparent)' }}>owed</p>}
                                </div>
                                <div className="flex items-center gap-0.5 shrink-0 opacity-55 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
                                  <button onClick={() => openEdit(account)} className={`${iconBtn} hover:bg-[var(--color-elevated)]`}
                                    title="Edit account" aria-label={`Edit ${account.accountName}`} style={{ color: 'var(--color-text-secondary)' }}>
                                    <EditIcon />
                                  </button>
                                  <button onClick={() => setImportAccount(account)} className={`${iconBtn} hover:bg-[var(--color-elevated)]`}
                                    title="Import CSV" aria-label={`Import CSV into ${account.accountName}`} style={{ color: 'var(--color-text-secondary)' }}>
                                    <UploadIcon />
                                  </button>
                                  {isConnected && (account.plaidStatus === 'error' ? (
                                    <button onClick={() => openReconnect(account)} disabled={connecting}
                                      className="px-2 h-7 rounded-lg text-[11px] font-semibold disabled:opacity-40" style={{ color: 'var(--color-rose)' }} title="Reconnect bank">
                                      Reconnect
                                    </button>
                                  ) : (
                                    <button onClick={() => handleSync(account)} disabled={syncingId === account.id} className={`${iconBtn} hover:bg-[var(--color-elevated)]`}
                                      title="Sync now" aria-label={`Sync ${account.accountName} now`}
                                      style={{ color: syncingId === account.id ? 'var(--color-text-muted)' : 'var(--color-green)' }}>
                                      <SyncIcon spinning={syncingId === account.id} />
                                    </button>
                                  ))}
                                  <button onClick={() => openDeleteConfirm(account)} disabled={deletingId === account.id} className={`${iconBtn} hover:bg-red-500/20`}
                                    title="Remove account" aria-label={`Remove ${account.accountName}`}>
                                    {deletingId === account.id ? <span className="text-xs">…</span> : <TrashIcon />}
                                  </button>
                                </div>
                              </li>
                            );
                          })}
                        </ul>
                      </section>
                    );
                  })}
                </div>
                </>
              )}
            </></div>
          )}

          {/* ── ACCOUNT TAB ── */}
          {activeTab === 'account' && <AccountSettings />}

          {/* ── CATEGORIES TAB ── */}
          {activeTab === 'categories' && <CategoryManager />}
          {activeTab === 'recurring' && <RecurringManager />}
          {activeTab === 'rules' && <RulesManager />}

          {/* ── PROJECT CATEGORIES TAB ── */}
          {activeTab === 'projects' && <ProjectCategoryManager />}

          {/* ── INTEGRATIONS TAB ── */}
          {activeTab === 'integrations' && (
            <IntegrationsTab
              status={gmailStatus}
              loading={gmailLoading}
              onDisconnect={handleGmailDisconnect}
              onManageData={() => setShowResetModal(true)}
            />
          )}

          {/* ── BILLING TAB ── */}
          {activeTab === 'billing' && <BillingTab />}

          {/* ── APPEARANCE TAB ── */}
          {activeTab === 'help' && (
            <div className="max-w-2xl"><MyTicketsList /></div>
          )}
          {activeTab === 'appearance' && (
            <div className="flex flex-col gap-6 max-w-2xl">
              <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
                Choose a visual theme. Your preference is saved locally.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {THEMES.map((t) => {
                  const selected = activeTheme === t.id;
                  return (
                    <button
                      key={t.id}
                      onClick={() => setTheme(t.id)}
                      className="text-left flex flex-col gap-4 p-4 rounded-2xl transition-all hover:scale-[1.02]"
                      style={{
                        background: t.preview.bg,
                        border: selected ? `2px solid ${t.preview.accent}` : `2px solid ${t.preview.border}`,
                        boxShadow: selected
                          ? `0 0 0 3px ${t.preview.accent}33, 0 8px 32px rgba(0,0,0,0.30)`
                          : '0 2px 12px rgba(0,0,0,0.12)',
                      }}>

                      {/* Color swatches */}
                      <div className="flex items-center gap-2">
                        <div className="w-10 h-10 rounded-xl shrink-0"
                          style={{ background: t.preview.surface, border: `1px solid ${t.preview.border}` }} />
                        <div className="flex flex-col gap-1.5">
                          <div className="flex gap-1.5">
                            <div className="w-4 h-4 rounded-md" style={{ background: t.preview.accent }} />
                            <div className="w-4 h-4 rounded-md" style={{ background: t.preview.accent2 }} />
                            <div className="w-4 h-4 rounded-md opacity-50" style={{ background: t.preview.textDim }} />
                          </div>
                          <div className="h-1.5 rounded-full" style={{ background: t.preview.accent, width: 40, opacity: 0.7 }} />
                        </div>
                      </div>

                      {/* Name + description */}
                      <div className="flex items-center justify-between gap-2">
                        <div>
                          <p className="text-sm font-bold leading-tight" style={{ color: t.preview.text }}>{t.name}</p>
                          <p className="text-[11px] mt-0.5" style={{ color: t.preview.textDim }}>{t.description}</p>
                        </div>
                        {selected && (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0"
                            style={{ background: `${t.preview.accent}22`, color: t.preview.accent }}>
                            Active
                          </span>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

        </div>
      </main>

      {importAccount && (
        <CsvImportModal
          account={importAccount}
          onClose={() => setImportAccount(null)}
          onImported={() => setImportAccount(null)}
        />
      )}

      {confirmDelete && createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(6px)' }}
          onMouseDown={(e) => { if (e.target === e.currentTarget && deletingId !== confirmDelete.id) setConfirmDelete(null); }}>
          <div className="w-full max-w-md flex flex-col rounded-2xl overflow-hidden"
            style={{ background: 'var(--color-elevated)', border: 'var(--glass-border)', boxShadow: 'var(--glass-shadow)' }}>
            <div className="px-6 py-5" style={{ borderBottom: '1px solid var(--color-border)' }}>
              <p className="font-bold text-sm" style={{ color: 'var(--color-text-primary)' }}>Delete account</p>
              <p className="text-xs mt-1" style={{ color: 'var(--color-text-muted)' }}>
                Remove <strong style={{ color: 'var(--color-text-secondary)' }}>{confirmDelete.bankName} — {confirmDelete.accountName}</strong>? This can’t be undone.
              </p>
            </div>

            <div className="px-6 py-5 flex flex-col gap-3">
              <label className="flex items-start gap-3 p-3 rounded-xl cursor-pointer transition-colors"
                style={{
                  background: deleteTxToo ? 'color-mix(in srgb, var(--color-card-orange) 10%, transparent)' : 'var(--color-surface)',
                  border: `1px solid ${deleteTxToo ? 'color-mix(in srgb, var(--color-card-orange) 35%, transparent)' : 'var(--color-border)'}`,
                }}>
                <input type="checkbox" checked={deleteTxToo} onChange={(e) => setDeleteTxToo(e.target.checked)}
                  className="mt-0.5 accent-[var(--color-card-orange)]" style={{ width: 16, height: 16 }} />
                <span className="text-xs leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>
                  Also delete{' '}
                  <strong style={{ color: 'var(--color-text-primary)' }}>
                    {deleteTxCount === null ? 'the' : deleteTxCount} transaction{deleteTxCount === 1 ? '' : 's'}
                  </strong>{' '}in this account.
                  <span className="block mt-1" style={{ color: 'var(--color-text-muted)' }}>
                    If left unchecked, transactions are kept and shown under “Unknown Bank”.
                  </span>
                </span>
              </label>
            </div>

            <div className="flex items-center justify-end gap-2 px-6 py-4" style={{ borderTop: '1px solid var(--color-border)' }}>
              <button type="button" onClick={() => setConfirmDelete(null)} disabled={deletingId === confirmDelete.id}
                className="px-4 py-2 text-sm font-medium rounded-xl transition-colors hover:bg-[var(--color-surface)] disabled:opacity-50"
                style={{ color: 'var(--color-text-secondary)' }}>
                Cancel
              </button>
              <button type="button" onClick={confirmDeleteAccount} disabled={deletingId === confirmDelete.id}
                className="px-5 py-2 text-sm font-semibold text-white rounded-xl hover:brightness-110 disabled:opacity-50 transition-all"
                style={{ background: 'var(--color-card-orange)' }}>
                {deletingId === confirmDelete.id
                  ? 'Deleting…'
                  : deleteTxToo ? 'Delete account & transactions' : 'Delete account'}
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )}

      {mergeReview && (
        <PlaidMergeReviewModal
          plaidItemId={mergeReview.plaidItemId}
          institutionName={mergeReview.institutionName}
          plaidAccounts={mergeReview.accounts}
          manualAccounts={accounts.filter((a) => a.provider === 'manual')}
          onClose={() => setMergeReview(null)}
          onDone={(newAccounts: BankAccount[]) => {
            setMergeReview(null);
            const ids = new Set(newAccounts.map((a) => a.id));
            setAccounts((prev) => [...prev.filter((a) => !ids.has(a.id)), ...newAccounts]);
          }}
        />
      )}

      {showResetModal && (
        <DataResetModal
          accounts={accounts}
          onClose={() => setShowResetModal(false)}
          onDone={() => {
            setShowResetModal(false);
            /* Reload accounts in case they were deleted */
            fetch(`${API}/bank-accounts`, { credentials: 'include' })
              .then((r) => r.json()).then(setAccounts);
          }}
        />
      )}
    </div>
  );
}

export default function SettingsPage() {
  return (
    <Suspense fallback={null}>
      <SettingsPageInner />
    </Suspense>
  );
}

/** The bank logo (or cash / type icon) tile; `compact` is the smaller phone-header size without the last-4. */
function AccountVisual({ account, color, compact = false }: { account: BankAccount; color: string; compact?: boolean }) {
  const bankMeta = BANKS.find((b) => b.name === account.bankName);
  const isCash = account.accountType === 'cash';
  return (
    <div className={`shrink-0 ${compact ? 'w-10 h-9' : 'w-14 h-10'} rounded-xl flex flex-col items-center justify-center relative overflow-hidden`}
      style={{ background: `linear-gradient(135deg, ${color}55 0%, ${color}22 100%)`, border: `1px solid ${color}44` }}>
      {isCash ? (
        <span className={compact ? 'text-base' : 'text-xl'}>💵</span>
      ) : bankMeta ? (
        // eslint-disable-next-line @next/next/no-img-element -- third-party logo lookup by domain
        <img src={`https://logo.clearbit.com/${bankMeta.domain}`}
          alt={account.bankName} width={compact ? 22 : 28} height={compact ? 22 : 28}
          style={{ objectFit: 'contain', borderRadius: 4, background: 'white', padding: 2 }}
          onError={(e) => {
            const img = e.currentTarget;
            img.src = `https://www.google.com/s2/favicons?domain=${bankMeta.domain}&sz=64`;
            img.style.background = 'transparent';
            img.style.padding = '0';
          }} />
      ) : (
        <AccountTypeIcon type={account.accountType} size={compact ? 18 : 22} />
      )}
      {!compact && account.last4 && (
        <span className="text-[8px] font-bold tracking-widest leading-none mt-0.5" style={{ color: 'var(--color-text-secondary)' }}>
          ···{account.last4}
        </span>
      )}
    </div>
  );
}

function EditIcon() {
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>;
}
function UploadIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
      <polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
    </svg>
  );
}

function LinkIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
    </svg>
  );
}

function SyncIcon({ spinning }: { spinning: boolean }) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
      style={{ animation: spinning ? 'spin 1s linear infinite' : 'none' }}>
      <path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8"/>
      <path d="M21 3v5h-5"/>
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
      style={{ color: 'var(--color-text-muted)' }}>
      <polyline points="3 6 5 6 21 6"/>
      <path d="M19 6l-1 14H6L5 6"/>
      <path d="M10 11v6M14 11v6"/>
      <path d="M9 6V4h6v2"/>
    </svg>
  );
}

function CloseIcon() {
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>;
}

/** "$1,234.56" / "EUR 1,234.56"; a negative amount gets a true minus sign. */
function money(amount: number, currency = 'USD'): string {
  const abs = Math.abs(amount).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${amount < 0 ? '−' : ''}${currency === 'USD' ? '$' : `${currency} `}${abs}`;
}

function hexToRgb(hex: string) {
  const n = parseInt(hex.replace('#', ''), 16);
  return `${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}`;
}
