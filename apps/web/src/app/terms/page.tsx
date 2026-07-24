import LegalPageShell from '@/components/LegalPageShell';

export const metadata = {
  title: 'Terms of Service — Cofre',
  description: 'The terms that govern your use of Cofre.',
};

function H2({ children }: { children: React.ReactNode }) {
  return <h2 className="text-lg font-bold mt-2" style={{ color: 'var(--color-text-primary)' }}>{children}</h2>;
}

export default function TermsOfServicePage() {
  return (
    <LegalPageShell title="Terms of Service" updated="July 23, 2026">
      <p>
        <strong style={{ color: 'var(--color-text-primary)' }}>Draft notice:</strong> this is a first-draft terms of
        service. It has not yet been reviewed by a lawyer — treat it as a reasonable starting point, not a final
        legal document.
      </p>

      <p>
        These terms govern your use of Cofre, a personal budget tracker operated by Osmio Services
        (&ldquo;Cofre&rdquo;, &ldquo;we&rdquo;, &ldquo;us&rdquo;). By creating an account, you agree to these terms.
      </p>

      <H2>1. What Cofre is — and isn&rsquo;t</H2>
      <p>Cofre helps you track spending, budgets, debts, and assets, and can optionally import transactions from
        connected bank accounts (via Plaid) or receipts found in your Gmail. Cofre does not provide financial,
        investment, tax, or legal advice, and nothing in the app should be treated as such. You are responsible for
        decisions you make based on the information Cofre shows you.</p>

      <H2>2. Your account</H2>
      <p>You&rsquo;re responsible for keeping your login credentials secure and for all activity under your account.
        Tell us immediately if you suspect unauthorized access.</p>

      <H2>3. Connected services</H2>
      <p>When you connect Gmail or a bank account, you authorize Cofre to access the specific, limited data
        described in our <a href="/privacy" style={{ color: 'var(--color-primary)' }}>Privacy Policy</a>. You can
        revoke that access at any time from Settings → Integrations. We are not responsible for the accuracy,
        availability, or acts of third-party services like Google, Plaid, or your bank.</p>

      <H2>4. Acceptable use</H2>
      <p>Don&rsquo;t use Cofre to store or process data you don&rsquo;t have the right to, attempt to access other
        users&rsquo; accounts or data, interfere with or reverse-engineer the service, or use it for any unlawful
        purpose.</p>

      <H2>5. Plans</H2>
      <p>Cofre offers free and paid (&ldquo;Pro&rdquo;) plans. Paid-plan features and pricing may change; we&rsquo;ll
        give notice of material changes affecting existing subscribers.</p>

      <H2>6. Disclaimer of warranties</H2>
      <p>Cofre is provided &ldquo;as is,&rdquo; without warranties of any kind. We don&rsquo;t guarantee the service
        will be uninterrupted, error-free, or that imported financial data will always be complete or accurate —
        always verify against your actual bank records.</p>

      <H2>7. Limitation of liability</H2>
      <p>To the maximum extent permitted by law, Cofre and Osmio Services are not liable for indirect, incidental,
        or consequential damages arising from your use of the service, including financial decisions made based on
        data shown in the app.</p>

      <H2>8. Termination</H2>
      <p>You can delete your account at any time by contacting us. We may suspend or terminate accounts that violate
        these terms.</p>

      <H2>9. Changes to these terms</H2>
      <p>We may update these terms as Cofre evolves. We&rsquo;ll update the &ldquo;Last updated&rdquo; date above
        when we do.</p>

      <H2>10. Contact</H2>
      <p>Questions about these terms? Email{' '}
        <a href="mailto:support@cofre.app" style={{ color: 'var(--color-primary)' }}>support@cofre.app</a>.</p>
    </LegalPageShell>
  );
}
