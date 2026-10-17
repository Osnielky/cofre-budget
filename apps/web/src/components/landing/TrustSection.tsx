import { glassCard } from './landing-styles';

// Every line here is in the spec's "Allowed claims" — don't add one that isn't.
const POINTS = [
  { title: 'Bank passwords never reach us', body: 'Banks connect through Plaid. Cofre never sees or stores your bank login.' },
  { title: 'Encrypted', body: 'Bank and Gmail access tokens are encrypted at rest (AES-256-GCM), and all traffic uses HTTPS.' },
  { title: 'Your data isn’t for sale', body: 'We don’t sell your data or use it for advertising.' },
  { title: 'You stay in control', body: 'Disconnect a bank or Gmail any time from Settings. The AI only suggests changes — you confirm them.' },
];

export default function TrustSection() {
  return (
    <section aria-labelledby="trust-heading" className="max-w-6xl mx-auto px-4 sm:px-6 py-12 sm:py-16">
      <h2 id="trust-heading" className="text-3xl sm:text-4xl font-bold tracking-tight text-center" style={{ color: 'var(--color-text-primary)' }}>
        Built to be trusted with your money data
      </h2>
      <div className="mt-10 grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {POINTS.map((p) => (
          <div key={p.title} className="rounded-[var(--radius-card)] p-5" style={glassCard}>
            <h3 className="font-semibold" style={{ color: 'var(--color-text-primary)' }}>{p.title}</h3>
            <p className="mt-2 text-sm" style={{ color: 'var(--color-text-secondary)' }}>{p.body}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
