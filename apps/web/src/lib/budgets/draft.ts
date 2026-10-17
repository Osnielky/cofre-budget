import { applyPercent, type Cents } from './money';

/**
 * Draft scenario state. `originals` mirrors what the server has persisted;
 * `drafts` holds only rows whose value differs from it (so "modified" is just
 * "has a key"). `history` is a stack of earlier `drafts` snapshots for undo —
 * pushed on quick adjustments and at the start of each manual edit gesture
 * (`checkpoint`), never per slider tick.
 */
export interface DraftState {
  originals: Record<string, Cents>;
  drafts: Record<string, Cents>;
  history: Record<string, Cents>[];
}

export type DraftAction =
  | { type: 'load'; originals: Record<string, Cents> }
  | { type: 'rebase'; originals: Record<string, Cents> }
  | { type: 'set'; key: string; cents: Cents }
  | { type: 'checkpoint' }
  | { type: 'adjust'; pct: number; keys: string[] }
  | { type: 'resetRow'; key: string }
  | { type: 'undo' }
  | { type: 'resetAll' };

const HISTORY_LIMIT = 50;

export const emptyDraft: DraftState = { originals: {}, drafts: {}, history: [] };

function withValue(state: DraftState, drafts: Record<string, Cents>, key: string, cents: Cents) {
  const next = { ...drafts };
  if (cents === state.originals[key]) delete next[key];
  else next[key] = cents;
  return next;
}

function sameDrafts(a: Record<string, Cents>, b: Record<string, Cents>) {
  const ak = Object.keys(a);
  return ak.length === Object.keys(b).length && ak.every((k) => a[k] === b[k]);
}

function pushHistory(state: DraftState): Record<string, Cents>[] {
  const last = state.history[state.history.length - 1];
  if (last && sameDrafts(last, state.drafts)) return state.history;
  return [...state.history, state.drafts].slice(-HISTORY_LIMIT);
}

export function currentValue(state: DraftState, key: string): Cents {
  return state.drafts[key] ?? state.originals[key] ?? 0;
}

/** The drafts a percentage adjustment would produce — used for the preview
    and by the reducer, so what's shown is exactly what gets applied. Applies
    on top of current draft values, so manual edits are scaled, not discarded. */
export function previewAdjust(state: DraftState, pct: number, keys: string[]): Record<string, Cents> {
  let drafts = state.drafts;
  for (const key of keys) {
    if (!(key in state.originals)) continue;
    drafts = withValue(state, drafts, key, applyPercent(currentValue(state, key), pct));
  }
  return drafts;
}

export function draftReducer(state: DraftState, action: DraftAction): DraftState {
  switch (action.type) {
    case 'load':
      return { originals: action.originals, drafts: {}, history: [] };
    case 'rebase': {
      // Server data refreshed (save, modal edit, new budget): keep drafts for
      // rows that still exist and still differ; drafts the server now matches
      // (i.e. just saved) fall away on their own.
      const keep = (d: Record<string, Cents>) => {
        const out: Record<string, Cents> = {};
        for (const [k, v] of Object.entries(d)) if (k in action.originals && v !== action.originals[k]) out[k] = v;
        return out;
      };
      return { originals: action.originals, drafts: keep(state.drafts), history: state.history.map(keep) };
    }
    case 'set': {
      if (!(action.key in state.originals) || !Number.isInteger(action.cents) || action.cents < 0) return state;
      if (currentValue(state, action.key) === action.cents) return state;
      return { ...state, drafts: withValue(state, state.drafts, action.key, action.cents) };
    }
    case 'checkpoint': {
      const history = pushHistory(state);
      return history === state.history ? state : { ...state, history };
    }
    case 'adjust': {
      const drafts = previewAdjust(state, action.pct, action.keys);
      if (sameDrafts(drafts, state.drafts)) return state;
      return { ...state, drafts, history: pushHistory(state) };
    }
    case 'resetRow': {
      if (!(action.key in state.drafts)) return state;
      const drafts = { ...state.drafts };
      delete drafts[action.key];
      return { ...state, drafts, history: pushHistory(state) };
    }
    case 'undo': {
      // Skip snapshots identical to the present (e.g. a checkpoint with no edit after it).
      const history = [...state.history];
      while (history.length) {
        const prev = history.pop()!;
        if (!sameDrafts(prev, state.drafts)) return { ...state, drafts: prev, history };
      }
      return history.length === state.history.length ? state : { ...state, history };
    }
    case 'resetAll':
      if (Object.keys(state.drafts).length === 0) return state;
      return { ...state, drafts: {}, history: pushHistory(state) };
  }
}

export function canUndo(state: DraftState): boolean {
  return state.history.some((h) => !sameDrafts(h, state.drafts));
}
