'use client';

/* The page's one primary action, shared with the phone top bar.

   Every page renders its primary action as `<HeaderAction primary>` inside its
   PageHeader. Below `md` that button hides itself and the phone top bar shows
   it beside the page title instead, so the action is always in the same place
   on a phone. HeaderAction registers here on mount; the top bar reads the
   newest registration. Nothing else needs to know.

   Two contexts: the registry (stable functions, consumed by HeaderAction) and
   the current action (state, consumed by the top bar), so a page re-rendering
   never re-renders itself through the shell. The shown fields are compared one
   by one before the state changes — a fresh onClick closure or icon element on
   every render is expected and never publishes; the handler is read from the
   ref at click time. */

import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';

export interface PrimaryActionSpec {
  label: ReactNode;
  /** Phone label; `null` keeps only the icon. */
  shortLabel?: ReactNode | null;
  icon?: ReactNode;
  href?: string;
  onClick?: () => void;
  disabled?: boolean;
  ariaLabel?: string;
}

interface Registered extends PrimaryActionSpec { id: number }

interface Shown {
  id: number;
  label: ReactNode;
  shortLabel?: ReactNode | null;
  icon?: ReactNode;
  href?: string;
  disabled: boolean;
  ariaLabel?: string;
}

export interface CurrentPrimaryAction extends Shown { invoke: () => void }

interface Registry {
  register: (id: number, spec: PrimaryActionSpec) => void;
  unregister: (id: number) => void;
}

const RegistryContext = createContext<Registry | null>(null);
const CurrentContext = createContext<CurrentPrimaryAction | null>(null);

let nextId = 1;
export function newPrimaryActionId() { return nextId++; }

/* Icon elements and handlers are rebuilt on every render; only what changes the drawn
   button counts. */
function sameShown(a: Shown, b: Registered): boolean {
  return a.id === b.id && a.label === b.label && a.shortLabel === b.shortLabel
    && a.href === b.href && a.disabled === !!b.disabled && a.ariaLabel === b.ariaLabel;
}

function snapshot(r: Registered): Shown {
  return { id: r.id, label: r.label, shortLabel: r.shortLabel, icon: r.icon, href: r.href, disabled: !!r.disabled, ariaLabel: r.ariaLabel };
}

export function PrimaryActionProvider({ children }: { children: ReactNode }) {
  /* Every mounted primary action, newest last; the newest is the one shown. */
  const all = useRef<Registered[]>([]);
  const [current, setCurrent] = useState<Shown | null>(null);

  const publish = useCallback(() => {
    const newest = all.current[all.current.length - 1];
    if (!newest) { setCurrent((prev) => (prev === null ? prev : null)); return; }
    setCurrent((prev) => (prev && sameShown(prev, newest) ? prev : snapshot(newest)));
  }, []);

  const registry = useMemo<Registry>(() => ({
    register(id, spec) {
      const i = all.current.findIndex((r) => r.id === id);
      const entry = { id, ...spec };
      if (i === -1) all.current.push(entry); else all.current[i] = entry;
      publish();
    },
    unregister(id) {
      all.current = all.current.filter((r) => r.id !== id);
      publish();
    },
  }), [publish]);

  const invoke = useCallback(() => { all.current[all.current.length - 1]?.onClick?.(); }, []);
  const value = useMemo<CurrentPrimaryAction | null>(() => (current ? { ...current, invoke } : null), [current, invoke]);

  return (
    <RegistryContext.Provider value={registry}>
      <CurrentContext.Provider value={value}>{children}</CurrentContext.Provider>
    </RegistryContext.Provider>
  );
}

/** The registry, or null outside the app shell (marketing pages, tests). */
export function usePrimaryActionRegistry() {
  return useContext(RegistryContext);
}

/** The newest registered primary action, or null when the page has none. */
export function usePrimaryAction() {
  return useContext(CurrentContext);
}
