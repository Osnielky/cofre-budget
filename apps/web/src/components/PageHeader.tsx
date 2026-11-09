'use client';

import type { CSSProperties, ReactNode } from 'react';
import Link from 'next/link';

/* The one page header. Every app page used to draw its own: titles ran from
   20px to a 48px clamp, some had a subtitle and some did not, actions sat
   top-right on most pages and in a second row on Transactions, the Dashboard
   used uppercase pills and everything else sentence case. This renders the
   same frame everywhere:

     ┌ title (22px phones / 28px from sm) + optional badge     actions ┐
     │ one-line subtitle                                                │
     │ period control (its own full row on phones, beside the title    │
     │ from sm)                                                        │
     └ children: anything the header pins under the title row ─────────┘

   `sticky` pins it as a glass bar at the top of <main> ('md' from the
   tablet breakpoint, 'always' when a tab strip inside it must stay put on
   phones too). Actions are HeaderAction buttons: one `primary`, the rest
   neutral. The period slot still takes each page's own control until the
   shared PeriodPicker lands. */

export default function PageHeader({
  title, subtitle, badge, icon, period, actions, sticky, phoneSubtitle = true, children, className = '',
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

  return (
    <header className={`${frame} ${className}`.trim()} style={glass}>
      <div className="flex flex-wrap items-center gap-x-4 sm:gap-x-6 gap-y-3">
        {/* The title block takes the free space and shrinks first (a long subtitle wraps
            rather than pushing the controls to a second row); the period and the actions
            keep their natural width on its right. */}
        <div className="order-1 flex-1 min-w-[10rem] flex items-center gap-2.5 sm:gap-3">
          {icon}
          <div className="min-w-0">
            <div className="flex items-center gap-2 min-w-0">
              <h1 className="text-[22px] sm:text-[28px] font-bold tracking-tight leading-tight text-balance">{title}</h1>
              {badge}
            </div>
            {subtitle && (
              <p className={`text-sm mt-0.5 ${phoneSubtitle ? '' : 'hidden sm:block'}`} style={{ color: 'var(--color-text-secondary)' }}>
                {subtitle}
              </p>
            )}
          </div>
        </div>
        {actions && (
          <div className="order-2 sm:order-3 ml-auto sm:ml-0 flex items-center justify-end gap-2 shrink-0 flex-wrap">{actions}</div>
        )}
        {period && (
          <div className="order-3 sm:order-2 basis-full sm:basis-auto flex items-center gap-2 min-w-0">{period}</div>
        )}
      </div>
      {children && <div className="mt-3 sm:mt-4 flex flex-col gap-3 sm:gap-4">{children}</div>}
    </header>
  );
}

/** A header button or link. `primary` is the page's one main action (`.btn-gold`);
    everything else is the neutral elevated style. `shortLabel` is what phones show
    in place of `label` — `null` keeps only the icon there. */
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
  const cls = `inline-flex items-center justify-center gap-2 px-3 sm:px-3.5 py-2 text-sm font-semibold rounded-xl transition-all whitespace-nowrap no-underline cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${primary ? 'btn-gold' : 'hover:brightness-110'} ${className}`;
  const style: CSSProperties | undefined = primary
    ? undefined
    : { background: 'var(--color-elevated)', border: '1px solid var(--color-border)', color: 'var(--color-text-primary)' };
  const text = shortLabel === undefined
    ? <span>{label}</span>
    : <>
        {shortLabel !== null && <span className="sm:hidden">{shortLabel}</span>}
        <span className="hidden sm:inline">{label}</span>
      </>;
  const a11y = ariaLabel ?? (shortLabel === null && typeof label === 'string' ? label : undefined);

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
