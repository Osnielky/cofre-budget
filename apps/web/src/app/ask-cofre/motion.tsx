import { useEffect, useState } from 'react';
import { motion, AnimatePresence, useReducedMotion, type Variants } from 'motion/react';

/* Motion for the Ask Cofre chat. No 'use client' directive on purpose: this file
   is only imported by client components, and the directive would make Next
   lint every function prop as a server action.

   Motion for the Ask Cofre chat. One shared spring so every element moves the
   same way; reduced-motion users get instant changes (motion/react reads the
   OS preference through useReducedMotion). */

export const chatSpring = { type: 'spring', stiffness: 420, damping: 34, mass: 0.8 } as const;

const messageVariants: Variants = {
  hidden: (role: 'user' | 'assistant') => ({ opacity: 0, y: 14, x: role === 'user' ? 18 : -18, scale: 0.98 }),
  show: { opacity: 1, y: 0, x: 0, scale: 1, transition: chatSpring },
  exit: { opacity: 0, transition: { duration: 0.12 } },
};

/** One chat row sliding in from its own side. */
export function MessageIn({ role, children, className }: { role: 'user' | 'assistant'; children: React.ReactNode; className?: string }) {
  const reduce = useReducedMotion();
  return (
    <motion.div layout="position" custom={role} variants={messageVariants}
      initial={reduce ? false : 'hidden'} animate="show" exit="exit" className={className}>
      {children}
    </motion.div>
  );
}

/** A card inside a reply (proposal, safe-to-spend…) popping in once the text has landed. */
export function WidgetIn({ children }: { children: React.ReactNode }) {
  const reduce = useReducedMotion();
  return (
    <motion.div initial={reduce ? false : { opacity: 0, scale: 0.94, y: 10 }} animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{ ...chatSpring, delay: 0.08 }}>
      {children}
    </motion.div>
  );
}

/** Children appear one after another (suggested prompts, history rows). */
export function Stagger({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <motion.div className={className} initial="hidden" animate="show"
      variants={{ hidden: {}, show: { transition: { staggerChildren: 0.05, delayChildren: 0.05 } } }}>
      {children}
    </motion.div>
  );
}
export function StaggerItem({ children, className, style, onClick }: { children: React.ReactNode; className?: string; style?: React.CSSProperties; onClick?: () => void }) {
  const reduce = useReducedMotion();
  return (
    <motion.button type="button" onClick={onClick} className={className} style={style}
      variants={{ hidden: reduce ? {} : { opacity: 0, y: 8 }, show: { opacity: 1, y: 0, transition: chatSpring } }}
      whileHover={reduce ? undefined : { y: -2 }} whileTap={reduce ? undefined : { scale: 0.98 }}>
      {children}
    </motion.button>
  );
}

const THINKING_STEPS = ['Thinking…', 'Reading your transactions…', 'Checking your budgets…', 'Looking at your accounts…', 'Putting it together…'];

/** Shown in place of the reply until the first streamed token arrives. */
export function ThinkingBubble() {
  const reduce = useReducedMotion();
  const [step, setStep] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setStep((s) => (s + 1) % THINKING_STEPS.length), 1900);
    return () => clearInterval(id);
  }, []);
  return (
    <div className="flex flex-col gap-1.5 pt-1" role="status" aria-live="polite">
      <div className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-2xl rounded-bl-md self-start"
        style={{ background: 'var(--color-elevated)', border: '1px solid var(--color-border)' }}>
        {[0, 1, 2].map((i) => (
          <motion.span key={i} className="block w-2 h-2 rounded-full" style={{ background: 'var(--color-primary)' }}
            animate={reduce ? { opacity: 0.6 } : { y: [0, -5, 0], opacity: [0.45, 1, 0.45] }}
            transition={{ duration: 0.9, repeat: Infinity, ease: 'easeInOut', delay: i * 0.15 }} />
        ))}
      </div>
      <AnimatePresence mode="wait" initial={false}>
        <motion.p key={step} className="text-[11px] pl-1" style={{ color: 'var(--color-text-muted)' }}
          initial={reduce ? false : { opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.22 }}>
          {THINKING_STEPS[step]}
        </motion.p>
      </AnimatePresence>
    </div>
  );
}

/** The Cofre avatar; glows and breathes while a reply is being written. */
export function AiAvatar({ busy = false }: { busy?: boolean }) {
  const reduce = useReducedMotion();
  return (
    <motion.span className="relative w-7 h-7 rounded-full shrink-0 flex items-center justify-center"
      animate={busy && !reduce ? { scale: [1, 1.08, 1] } : { scale: 1 }}
      transition={busy ? { duration: 1.6, repeat: Infinity, ease: 'easeInOut' } : { duration: 0.2 }}>
      {busy && !reduce && (
        <motion.span aria-hidden="true" className="absolute inset-0 rounded-full"
          style={{ boxShadow: '0 0 0 0 color-mix(in srgb, var(--color-primary) 55%, transparent)' }}
          animate={{ boxShadow: ['0 0 0 0px color-mix(in srgb, var(--color-primary) 55%, transparent)', '0 0 0 10px color-mix(in srgb, var(--color-primary) 0%, transparent)'] }}
          transition={{ duration: 1.6, repeat: Infinity, ease: 'easeOut' }} />
      )}
      {/* eslint-disable-next-line @next/next/no-img-element -- fixed-color brand asset, not a themed vector icon */}
      <img src="/ask-cofre-logo.png" alt="" width={28} height={28} className="rounded-full relative" style={{ objectFit: 'contain' }} />
    </motion.span>
  );
}

/** Send button: nudges on hover, spins while a reply is in flight. */
export function SendButton({ sending, disabled }: { sending: boolean; disabled: boolean }) {
  const reduce = useReducedMotion();
  return (
    <motion.button type="submit" disabled={disabled} aria-label={sending ? 'Sending' : 'Send'}
      className="btn-gold w-9 h-9 rounded-full flex items-center justify-center cursor-pointer disabled:opacity-40 shrink-0"
      whileHover={disabled || reduce ? undefined : { scale: 1.08, y: -1 }} whileTap={disabled || reduce ? undefined : { scale: 0.94 }}>
      {sending ? (
        <motion.span className="block w-4 h-4 rounded-full border-2 border-white/40" style={{ borderTopColor: '#fff' }}
          animate={reduce ? undefined : { rotate: 360 }} transition={{ duration: 0.8, repeat: Infinity, ease: 'linear' }} />
      ) : (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 19V5M5 12l7-7 7 7"/></svg>
      )}
    </motion.button>
  );
}

export { AnimatePresence };
