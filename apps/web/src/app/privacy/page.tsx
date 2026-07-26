import LegalPageShell from '@/components/LegalPageShell';

export const metadata = {
  title: 'Privacy Policy — Cofre',
  description: 'How Cofre collects, uses, and protects your data, including Gmail and bank account data.',
};

function H2({ children }: { children: React.ReactNode }) {
  return <h2 className="text-lg font-bold mt-2" style={{ color: 'var(--color-text-primary)' }}>{children}</h2>;
}

export default function PrivacyPolicyPage() {
  return (
    <LegalPageShell title="Privacy Policy" updated="July 23, 2026">
      <p>
        <strong style={{ color: 'var(--color-text-primary)' }}>Draft notice:</strong> this is a first-draft privacy
        policy describing what Cofre actually collects and does with your data today. It has not yet been reviewed
        by a lawyer — treat it as accurate but not final.
      </p>

      <p>
        Cofre (&ldquo;Cofre&rdquo;, &ldquo;we&rdquo;, &ldquo;us&rdquo;) is a personal budget tracker operated by
        Osmio Services. This policy explains what information we collect when you use the Cofre web app, why we
        collect it, and how you can control or delete it.
      </p>

      <H2>1. Information we collect</H2>
      <p><strong style={{ color: 'var(--color-text-primary)' }}>Account information</strong> — your email address,
        name, and password (stored as a one-way bcrypt hash, never in plain text) or, if you sign in with Google,
        your Google account id and profile photo.</p>
      <p><strong style={{ color: 'var(--color-text-primary)' }}>Financial data you enter</strong> — transactions,
        budgets, categories, projects, debts, assets, and savings goals you create manually inside Cofre.</p>
      <p><strong style={{ color: 'var(--color-text-primary)' }}>Bank account data (Plaid)</strong> — if you connect a
        bank account, we receive your account name, type, balance, currency, and up to 90 days of transaction
        history from Plaid. The access token Plaid issues us is encrypted at rest (AES-256-GCM) and is never shown
        to us in readable form.</p>
      <p><strong style={{ color: 'var(--color-text-primary)' }}>Gmail data</strong> — if you connect Gmail, Cofre
        requests read-only access (<code>gmail.readonly</code>) to search for receipt, order-confirmation, and
        invoice emails from a known set of merchant senders, limited to the last 90 days. We read the matching
        email&rsquo;s subject and body to extract the merchant, order number, date, total, and line items.
        That extraction happens entirely on Cofre&rsquo;s own server — the email content is never sent to any
        third-party AI or analysis service.
        <strong style={{ color: 'var(--color-text-primary)' }}> We do not store the raw email body or attachments</strong> —
        only the resulting structured receipt (merchant, items, total, and the subject line) is saved to your
        account. Your Gmail OAuth tokens are encrypted at rest (AES-256-GCM) and are only used to fetch the emails
        matching that search — never to send email, read unrelated messages, or access anything outside that scope.</p>

      <H2>2. Google user data &amp; Limited Use</H2>
      <p>
        Cofre&rsquo;s use and transfer of information received from Google APIs to any other app will adhere to the{' '}
        <a href="https://developers.google.com/terms/api-services-user-data-policy" style={{ color: 'var(--color-primary)' }}>
          Google API Services User Data Policy
        </a>, including the Limited Use requirements. We do not use Gmail data for advertising, and we do not sell
        or share Gmail data with third parties other than the AI provider used solely to parse receipt content, as
        described above.
      </p>

      <H2>3. How we use your data</H2>
      <p>We use the information above to show your dashboard, categorize spending, track budgets and debts, and
        automatically surface receipts you can import as transactions. We do not sell your data, and we do not use
        it for advertising or ad targeting.</p>

      <H2>4. Third parties we work with</H2>
      <p>To operate Cofre, some data is processed by service providers acting on our behalf, under their own
        confidentiality and security obligations:</p>
      <ul className="list-disc pl-5 flex flex-col gap-1.5">
        <li><strong style={{ color: 'var(--color-text-primary)' }}>Plaid</strong> — bank account linking and
          transaction data.</li>
        <li><strong style={{ color: 'var(--color-text-primary)' }}>Google</strong> — Gmail and Google Sign-In, as
          described above.</li>
        <li><strong style={{ color: 'var(--color-text-primary)' }}>Resend</strong> — delivers transactional email
          (verification, password reset).</li>
        <li><strong style={{ color: 'var(--color-text-primary)' }}>Google Cloud</strong> — hosts our application and
          database infrastructure.</li>
      </ul>

      <H2>5. Your controls</H2>
      <p>You can disconnect Gmail or a bank account at any time from Settings → Integrations — this revokes our
        access token immediately. To delete your account and all associated data, contact us at the email below.</p>

      <H2>6. Security</H2>
      <p>Passwords are hashed with bcrypt and never stored in plain text. OAuth tokens for Gmail and bank
        connections are encrypted at rest with AES-256-GCM. All traffic to Cofre is encrypted in transit (HTTPS).
        No security measure is perfect, and we cannot guarantee absolute security.</p>

      <H2>7. Children&rsquo;s privacy</H2>
      <p>Cofre is not directed to children under 13, and we do not knowingly collect data from them.</p>

      <H2>8. Changes to this policy</H2>
      <p>We may update this policy as Cofre changes. We&rsquo;ll update the &ldquo;Last updated&rdquo; date above
        when we do.</p>

      <H2>9. Contact</H2>
      <p>Questions about this policy or your data? Email{' '}
        <a href="mailto:support@cofre.app" style={{ color: 'var(--color-primary)' }}>support@cofre.app</a>.</p>
    </LegalPageShell>
  );
}
