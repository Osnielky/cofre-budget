'use client';

import { useEffect, useRef, type CSSProperties, type ReactNode } from 'react';
import Link from 'next/link';
import { newPrimaryActionId, usePrimaryActionRegistry } from './shell/PrimaryAction';

/* The one page header. Every app page used to draw its own: titles ran from
   20px to a 48px clamp, some had a subtitle and some did not, actions sat
   top-right on most pages and in a second row on Transactions, the Dashboard
   used uppercase pills and everything else sentence case. This renders the
   same frame everywhere:

     ┌ title (28px from md) + optional badge                    actions ┐
     │ one-line subtitle                                                │
     │ period control (its own full row on phones, beside the title    │
     │ from sm)                                                        │
     └ children: anything the header pins under the title row ─────────┘

   Below md the phone top bar (components/PhoneTopBar.tsx) already names the
   page and carries its primary action, so the title row hides there (an
   sr-only h1 stays for assistive tech) and `<HeaderAction primary>` hides
   itself after registering with the shell. `phoneTitle` keeps the title row
   on phones for a title that is content, not a page name (the Dashboard
   greeting, the Goals headline).

   `sticky` pins it as a glass bar at the top of <main> ('md' from the
   tablet breakpoint, 'always' when a tab strip inside it must stay put on
   phones too). Actions are HeaderAction buttons: one `primary`, the rest
   neutral. The period slot takes the shared PeriodPicker. */

export default function PageHeader({
  title, subtitle, badge, icon, period, actions, sticky, phoneSubtitle = true, phoneTitle = false, children, className = '',
}: {
  title: ReactNode;
  /** One line under the title; `phoneSubtitle={false}` hides it below sm when the page needs the height. */
  subtitle?: ReactNode;
  /** Small pill beside the title (a plan badge, a BETA tag). */
  badge?: ReactNode;
  /** Leading visual before the title (the Ask Cofre mark). */
  icon?: ReactNode;
  /** The page's period control: month stepper, range strip, date inputs. */
  period?: ReactNode;
  /** HeaderAction buttons, menus and the like; one primary at most. */
  actions?: ReactNode;
  sticky?: 'md' | 'always';
  phoneSubtitle?: boolean;
  /** Keep the title row below md too (the top bar then shows the page name above it). */
  phoneTitle?: boolean;
  /** Rendered under the title row inside the same (sticky) frame. */
  children?: ReactNode;
  className?: string;
}) {
  const glass: CSSProperties | undefined = sticky
    ? { background: 'var(--header-bg)', backdropFilter: 'var(--glass-blur)', WebkitBackdropFilter: 'var(--glass-blur)', borderBottom: '1px solid var(--color-border)' }
    : undefined;
  const frame = sticky
    ? `${sticky === 'always' ? 'sticky top-0' : 'relative md:sticky md:top-0'} z-20 px-4 sm:px-6 pt-4 sm:pt-5 pb-4`
    : '';
  /* On phones the title block shows only when it has something to show there. */
  const blockOnPhone = phoneTitle || (!!subtitle && phoneSubtitle);
  const titleRow = phoneTitle ? 'flex' : 'hidden md:flex';

  return (
    <header className={`${frame} ${className}`.trim()} style={glass}>
      {!phoneTitle && <h1 className="sr-only md:hidden">{title}</h1>}
      <div className="flex flex-wrap items-center gap-x-4 sm:gap-x-6 gap-y-3">
        {/* The title block takes the free space and shrinks first (a long subtitle wraps
            rather than pushing the controls to a second row); the period and the actions
            keep their natural width on its right. */}
        <div className={`order-1 flex-1 min-w-[10rem] ${blockOnPhone ? 'flex' : 'hidden md:flex'} items-center gap-2.5 sm:gap-3`}>
          {icon && <span className={phoneTitle ? 'contents' : 'hidden md:contents'}>{icon}</span>}
          <div className="min-w-0">
            <div className={`${titleRow} items-center gap-2 min-w-0`}>
              <h1 className="text-[22px] sm:text-[28px] font-bold tracking-tight leading-tight text-balance">{title}</h1>
              {badge}
            </div>
            {subtitle && (
              <p className={`text-sm md:mt-0.5 ${phoneSubtitle ? '' : 'hidden sm:block'}`} style={{ color: 'var(--color-text-secondary)' }}>
                {subtitle}
              </p>
            )}
          </div>
        </div>
        {actions && (
          <div className="order-2 sm:order-3 ml-auto sm:ml-0 flex items-center justify-end gap-2 shrink-0 flex-wrap">{actions}</div>
        )}
        {/* Phones: the period gets its own row under the title; when the title row is
            hidden there (the top bar names the page) it shares the first row with the
            secondary actions instead, so no row holds a lone icon. */}
        {period && (
          <div className={`${blockOnPhone ? 'order-3 basis-full' : 'order-1 flex-1'} sm:order-2 sm:basis-auto sm:flex-initial flex items-center gap-2 min-w-0`}>{period}</div>
        )}
      </div>
      {children && <div className="mt-3 sm:mt-4 flex flex-col gap-3 sm:gap-4">{children}</div>}
    </header>
  );
}

/** A header button or link. `primary` is the page's one main action (`.btn-gold`);
    everything else is the neutral elevated style. `shortLabel` is what phones show
    in place of `label` — `null` keeps only the icon there. Inside the app shell a
    primary action also registers with PhoneTopBar and hides itself below md. */
export function HeaderAction({
  label, shortLabel, icon, primary = false, href, onClick, disabled = false, title, ariaLabel, className = '', ...rest
}: {
  label: ReactNode;
  shortLabel?: ReactNode | null;
  icon?: ReactNode;
  primary?: boolean;
  href?: string;
  onClick?: () => void;
  disabled?: boolean;
  title?: string;
  ariaLabel?: string;
  className?: string;
  'aria-haspopup'?: 'menu' | 'dialog' | 'listbox' | boolean;
  'aria-expanded'?: boolean;
}) {
  const a11y = ariaLabel ?? (shortLabel === null && typeof label === 'string' ? label : undefined);

  const registry = usePrimaryActionRegistry();
  const idRef = useRef(0);
  if (idRef.current === 0) idRef.current = newPrimaryActionId();
  const shell = primary && !!registry;
  useEffect(() => {
    if (!shell) return;
    registry.register(idRef.current, { label, shortLabel, icon, href, onClick, disabled, ariaLabel: a11y });
  }, [shell, registry, label, shortLabel, icon, href, onClick, disabled, a11y]);
  useEffect(() => {
    if (!shell) return;
    const id = idRef.current;
    return () => registry.unregister(id);
  }, [shell, registry]);

  const cls = `${shell ? 'hidden md:inline-flex' : 'inline-flex'} items-center justify-center gap-2 px-3 sm:px-3.5 py-2 text-sm font-semibold rounded-xl transition-all whitespace-nowrap no-underline cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${primary ? 'btn-gold' : 'hover:brightness-110'} ${className}`;
  const style: CSSProperties | undefined = primary
    ? undefined
    : { background: 'var(--color-elevated)', border: '1px solid var(--color-border)', color: 'var(--color-text-primary)' };
  const text = shortLabel === undefined
    ? <span>{label}</span>
    : <>
        {shortLabel !== null && <span className="sm:hidden">{shortLabel}</span>}
        <span className="hidden sm:inline">{label}</span>
      </>;

  if (href) {
    return (
      <Link href={href} className={cls} style={style} title={title} aria-label={a11y}>
        {icon}{text}
      </Link>
    );
  }
  return (
    <button type="button" onClick={onClick} disabled={disabled} className={cls} style={style} title={title} aria-label={a11y} {...rest}>
      {icon}{text}
    </button>
  );
}
