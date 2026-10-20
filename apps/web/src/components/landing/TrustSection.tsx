import { container, glassCard } from './landing-styles';

// Every line here is in the spec's "Allowed claims" — don't add one that isn't.
const POINTS = [
  { title: 'Bank passwords never reach us', body: 'Banks connect through Plaid. Cofre never sees or stores your bank login.' },
  { title: 'Encrypted', body: 'Bank and Gmail access tokens are encrypted at rest (AES-256-GCM), and all traffic uses HTTPS.' },
  { title: 'Your data isn’t for sale', body: 'We don’t sell your data or use it for advertising.' },
  { title: 'You stay in control', body: 'Disconnect a bank or Gmail any time from Settings. The AI only suggests changes — you confirm them.' },
];

export default function TrustSection() {
  return (
    <section aria-labelledby="trust-heading" className="landing-lines">
      <div className={`${container} py-16 sm:py-24`}>
        <div className="max-w-2xl mx-auto text-center">
          <span className="landing-eyebrow">Security</span>
          <h2 id="trust-heading" className="landing-display mt-3 text-[36px] sm:text-[48px]" style={{ color: 'var(--color-text-primary)' }}>
            Built to be trusted with your money data
          </h2>
        </div>
        <div className="mt-12 grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {POINTS.map((p) => (
            <div key={p.title} className="rounded-2xl p-5 sm:p-6" style={glassCard}>
              <h3 className="font-semibold text-[15px]" style={{ color: 'var(--color-text-primary)' }}>{p.title}</h3>
              <p className="mt-2 text-sm leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>{p.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
