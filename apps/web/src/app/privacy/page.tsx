import LegalPageShell from '@/components/LegalPageShell';

export const metadata = {
  title: 'Privacy Policy',
  description: 'How Cofre collects, uses, and protects your data, including Gmail and bank account data.',
};

function H2({ children }: { children: React.ReactNode }) {
  return <h2 className="text-lg font-bold mt-2" style={{ color: 'var(--color-text-primary)' }}>{children}</h2>;
}

export default function PrivacyPolicyPage() {
  return (
    <LegalPageShell title="Privacy Policy" updated="October 5, 2026">
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
      <p><strong style={{ color: 'var(--color-text-primary)' }}>Ask Cofre (AI assistant)</strong> — when you use
        Ask Cofre, your question and the data it looks up to answer it (transactions, categories, budgets, accounts,
        debts and your net-worth goal) are sent to Anthropic, which provides the Claude model that writes the reply.
        Your conversations are saved in your Cofre account so you can return to them. Ask Cofre can only propose
        changes, which you must confirm; it cannot move money.</p>
      <p><strong style={{ color: 'var(--color-text-primary)' }}>Payments (Stripe)</strong> — if you subscribe to a
        paid plan, Stripe processes the payment. Your card details go directly to Stripe; Cofre never sees or stores
        your card number. We keep your Stripe customer id and subscription status.</p>
      <p><strong style={{ color: 'var(--color-text-primary)' }}>Gmail data</strong> — if you connect Gmail, Cofre
        requests read-only access (<code>gmail.readonly</code>) to search for receipt, order-confirmation, and
        invoice emails whose subject line looks like a receipt, order confirmation, or invoice — regardless of
        sender — limited to the last 90 days. We read the matching email&rsquo;s subject and body to extract
        the merchant, order number, date, total, and line items. That extraction happens entirely on Cofre&rsquo;s
        own server — the email content is never sent to any third-party AI or analysis service.
        <strong style={{ color: 'var(--color-text-primary)' }}> We do not store the raw email body or attachments</strong> —
        only the resulting structured receipt (merchant, items, total, and the subject line) is saved to your
        account. Your Gmail OAuth tokens are encrypted at rest (AES-256-GCM) and are only used to fetch the emails
        matching that search — never to send email, read unrelated messages, or access anything outside that scope.</p>
      <p><strong style={{ color: 'var(--color-text-primary)' }}>Problem reports</strong> — when you use &ldquo;Report a
        problem&rdquo;, we store your description, the page you were on, your screen size and browser, and the
        screenshot you chose to send (which may show your own balances). Only you and Cofre&rsquo;s support team can
        open it. Screenshots are deleted 90 days after the report is resolved; the description stays with your
        account so you can see what was answered.</p>

      <H2>2. Google user data &amp; Limited Use</H2>
      <p>
        Cofre&rsquo;s use and transfer of information received from Google APIs to any other app will adhere to the{' '}
        <a href="https://developers.google.com/terms/api-services-user-data-policy" style={{ color: 'var(--color-primary)' }}>
          Google API Services User Data Policy
        </a>, including the Limited Use requirements. We do not use Gmail data for advertising, and we do not sell
        or share Gmail data with any third party.
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
        <li><strong style={{ color: 'var(--color-text-primary)' }}>Anthropic</strong> — provides the AI model behind
          Ask Cofre, as described above.</li>
        <li><strong style={{ color: 'var(--color-text-primary)' }}>Stripe</strong> — subscription payments and
          billing.</li>
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

      <H2>6. Cookies and local storage</H2>
      <p>Cofre uses one essential cookie, <code>access_token</code>, to keep you signed in. It is
        <code> httpOnly</code>, so scripts on the page can&rsquo;t read it. Your browser&rsquo;s local storage keeps
        display preferences such as your chosen theme. We don&rsquo;t use advertising cookies or third-party ad
        trackers. Our own page-view counter keeps, with each view, a country and city derived from your network
        address at the moment of the visit (the address itself is not kept), your device type, browser and
        operating system family, your browser&rsquo;s language, your screen width, and any campaign tags
        (<code>utm_source</code> and similar) on the link you arrived from. Those are kept for 90 days and are never
        joined to an account or across days.</p>

            <p>To know how many people use Cofre, we count page views ourselves, without cookies and without
        any third-party analytics service. Each view records the page, the site you came from, and a
        one-way hash of your network address and browser that changes every day, so it cannot identify you
        or follow you from one day to the next. These counts are kept for 90 days.</p>
<H2>7. Data retention and deletion</H2>
      <p>We keep your data for as long as your account is open. You can erase your financial data at any time from
        Settings → Data &amp; Privacy. When you ask us to delete your account, we delete your account and its data from our
        production database within 30 days. Copies in encrypted backups expire on their normal schedule. Payment
        records held by Stripe are kept as required by tax and accounting law. Disconnecting Gmail or a bank revokes
        our access token immediately. Screenshots attached to problem reports are deleted 90 days after the report
        is resolved.</p>

      <H2>8. Security</H2>
      <p>Passwords are hashed with bcrypt and never stored in plain text. OAuth tokens for Gmail and bank
        connections are encrypted at rest with AES-256-GCM. All traffic to Cofre is encrypted in transit (HTTPS).
        No security measure is perfect, and we cannot guarantee absolute security.</p>

      <H2>9. Children&rsquo;s privacy</H2>
      <p>Cofre is for adults (18+) and is not directed to children. We do not knowingly collect data from
        children under 13.</p>

      <H2>10. Changes to this policy</H2>
      <p>We may update this policy as Cofre changes. We&rsquo;ll update the &ldquo;Last updated&rdquo; date above
        when we do.</p>

      <H2>11. Contact</H2>
      <p>Questions about this policy or your data? Email{' '}
        <a href="mailto:support@budgetcofre.com" style={{ color: 'var(--color-primary)' }}>support@budgetcofre.com</a>.</p>
    </LegalPageShell>
  );
}
