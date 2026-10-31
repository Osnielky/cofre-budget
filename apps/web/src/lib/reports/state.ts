/* Report page state ⇄ URL query string, plus the question shortcuts.
   Keeping every control in the URL makes the back button work inside the
   page, lets a view be shared, and lets other pages deep-link to a report. */

import type { RangePreset } from './range';
import type { GroupBy } from './compute';

export type ReportTab = 'overview' | 'spending' | 'income' | 'merchants' | 'cashflow' | 'networth';
export type RowSort = 'amount' | 'change';

export interface ReportState {
  tab: ReportTab;
  preset: RangePreset;
  /** Only meaningful with preset 'custom'. */
  from: string;
  to: string;
  /** Bank account id, or null for every account. */
  account: string | null;
  view: GroupBy;
  sort: RowSort;
  /** Bucket id of the category row opened inline, if any. */
  open: string | null;
}

export const DEFAULT_STATE: ReportState = {
  tab: 'overview', preset: 'this-month', from: '', to: '', account: null, view: 'category', sort: 'amount', open: null,
};

const TABS = new Set<ReportTab>(['overview', 'spending', 'income', 'merchants', 'cashflow', 'networth']);
const PRESET_IDS = new Set<RangePreset>(['this-month', 'last-month', '3m', '6m', 'ytd', '12m', 'custom']);
const VIEWS = new Set<GroupBy>(['category', 'account', 'wantNeed', 'fixed']);
const YMD = /^\d{4}-\d{2}-\d{2}$/;

type ParamsLike = { get(name: string): string | null };

/** Unknown or malformed values fall back to the default rather than erroring. */
export function parseReportState(params: ParamsLike): ReportState {
  const tab = params.get('tab') as ReportTab | null;
  const preset = params.get('period') as RangePreset | null;
  const from = params.get('from') ?? '', to = params.get('to') ?? '';
  const view = params.get('by') as GroupBy | null;
  const sort = params.get('sort');
  const customOk = YMD.test(from) && YMD.test(to) && from <= to;
  return {
    tab: tab && TABS.has(tab) ? tab : DEFAULT_STATE.tab,
    preset: preset && PRESET_IDS.has(preset) ? (preset === 'custom' && !customOk ? DEFAULT_STATE.preset : preset) : DEFAULT_STATE.preset,
    from: customOk ? from : '',
    to: customOk ? to : '',
    account: params.get('account') || null,
    view: view && VIEWS.has(view) ? view : DEFAULT_STATE.view,
    sort: sort === 'change' ? 'change' : 'amount',
    open: params.get('open') || null,
  };
}

/** Only non-default values are written, so the plain /reports URL stays clean. */
export function serializeReportState(s: ReportState): string {
  const p = new URLSearchParams();
  if (s.tab !== DEFAULT_STATE.tab) p.set('tab', s.tab);
  if (s.preset !== DEFAULT_STATE.preset) p.set('period', s.preset);
  if (s.preset === 'custom') { if (s.from) p.set('from', s.from); if (s.to) p.set('to', s.to); }
  if (s.account) p.set('account', s.account);
  if (s.view !== DEFAULT_STATE.view) p.set('by', s.view);
  if (s.sort !== DEFAULT_STATE.sort) p.set('sort', s.sort);
  if (s.open) p.set('open', s.open);
  return p.toString();
}

/* ── Question shortcuts ──────────────────────────────────────────────── */

export interface Question { id: string; label: string; state: Partial<ReportState> }

export const QUESTIONS: Question[] = [
  { id: 'where',   label: 'Where did my money go?',  state: { tab: 'spending', view: 'category', sort: 'amount' } },
  { id: 'changed', label: 'What changed?',           state: { tab: 'spending', view: 'category', sort: 'change' } },
  { id: 'who',     label: 'Who do I pay the most?',  state: { tab: 'merchants' } },
  { id: 'needs',   label: 'Needs or wants?',         state: { tab: 'spending', view: 'wantNeed', sort: 'amount' } },
  { id: 'fixed',   label: 'Fixed or flexible?',      state: { tab: 'spending', view: 'fixed', sort: 'amount' } },
  { id: 'saving',  label: 'Am I saving?',            state: { tab: 'cashflow' } },
];

export function isQuestionActive(s: ReportState, q: Question): boolean {
  return (Object.keys(q.state) as (keyof ReportState)[]).every((k) => s[k] === q.state[k]);
}

/** A question changes what is shown, never the period or account the user picked. */
export function applyQuestion(s: ReportState, q: Question): ReportState {
  return { ...s, ...q.state, open: null };
}
