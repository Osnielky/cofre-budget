import { PANEL, MUTED } from './panel';

/* Placeholder for a panel whose data Cofre doesn't collect yet — never fake numbers. */
export default function ComingSoonPanel({ title, body }: { title: string; body: string }) {
  return (
    <section className="rounded-2xl p-5 flex flex-col gap-2 min-w-0" style={PANEL}>
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-semibold">{title}</h2>
        <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full"
          style={{ color: 'var(--color-violet)', background: 'color-mix(in srgb, var(--color-violet) 15%, transparent)' }}>Coming soon</span>
      </div>
      <p className="text-sm" style={MUTED}>{body}</p>
    </section>
  );
}
