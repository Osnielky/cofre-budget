'use client';

import { QUESTIONS, isQuestionActive, type ReportState, type Question } from '@/lib/reports/state';

/**
 * Plain-language entry points. Each chip only changes what the page shows
 * (tab, grouping, sort) and keeps the period and account the user picked, so
 * a report is one tap away without learning the controls.
 */
export default function QuestionChips({ state, onPick }: { state: ReportState; onPick: (q: Question) => void }) {
  return (
    <div className="flex gap-2 overflow-x-auto [scrollbar-width:none] -mx-4 px-4 sm:mx-0 sm:px-0 sm:flex-wrap" role="group" aria-label="Quick questions">
      {QUESTIONS.map((q) => {
        const on = isQuestionActive(state, q);
        return (
          <button key={q.id} type="button" onClick={() => onPick(q)} aria-pressed={on}
            className="shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-colors cursor-pointer"
            style={on
              ? { background: 'color-mix(in srgb, var(--color-primary) 20%, transparent)', color: 'var(--color-primary)', border: '1px solid color-mix(in srgb, var(--color-primary) 40%, transparent)' }
              : { background: 'var(--color-elevated)', color: 'var(--color-text-secondary)', border: '1px solid var(--color-border)' }}>
            {q.label}
          </button>
        );
      })}
    </div>
  );
}
