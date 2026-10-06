import LegalPageShell from '@/components/LegalPageShell';

export const metadata = {
  title: 'Terms of Service',
  description: 'The terms that govern your use of Cofre, including subscriptions, connected accounts, and Ask Cofre.',
};

function H2({ children }: { children: React.ReactNode }) {
  return <h2 className="text-lg font-bold mt-2" style={{ color: 'var(--color-text-primary)' }}>{children}</h2>;
}

function B({ children }: { children: React.ReactNode }) {
  return <strong style={{ color: 'var(--color-text-primary)' }}>{children}</strong>;
}

const linkStyle = { color: 'var(--color-primary)' };

export default function TermsOfServicePage() {
  return (
    <LegalPageShell title="Terms of Service" updated="October 5, 2026">
      <p>
        These Terms of Service (&ldquo;Terms&rdquo;) govern your use of Cofre, a personal budget tracker operated by
        Osmio Services (&ldquo;Cofre&rdquo;, &ldquo;we&rdquo;, &ldquo;us&rdquo;), available at budgetcofre.com. By
        creating an account or using Cofre, you agree to these Terms and to our{' '}
        <a href="/privacy" style={linkStyle}>Privacy Policy</a>. If you don&rsquo;t agree, don&rsquo;t use Cofre.
      </p>

      <H2>1. Eligibility</H2>
      <p>You must be at least 18 years old and able to form a binding contract to use Cofre. By using Cofre, you
        confirm that you meet these requirements.</p>

      <H2>2. What Cofre is — and isn&rsquo;t</H2>
      <p>Cofre helps you track spending, budgets, debts, assets, projects, and progress toward savings goals. It can
        import transactions from bank accounts you connect through Plaid and receipts it finds in your Gmail.</p>
      <p><B>Cofre is not a bank, financial advisor, tax advisor, or lawyer.</B> Nothing in Cofre — including
        dashboards, projections, goals, or Ask Cofre&rsquo;s answers — is financial, investment, tax, or legal advice.
        Cofre never holds or moves your money. You are responsible for the financial decisions you make.</p>

      <H2>3. Your account</H2>
      <p>Give us accurate information when you sign up and keep it up to date. You&rsquo;re responsible for keeping
        your login credentials secure and for all activity under your account. Tell us right away at{' '}
        <a href="mailto:support@budgetcofre.com" style={linkStyle}>support@budgetcofre.com</a> if you suspect
        unauthorized access.</p>

      <H2>4. Connected services</H2>
      <p>When you connect a bank account or Gmail, you authorize Cofre to access the specific, limited data described
        in our <a href="/privacy" style={linkStyle}>Privacy Policy</a>, and you confirm that you have the right to
        grant that access. Bank connections are provided by Plaid; by connecting one, you also agree to{' '}
        <a href="https://plaid.com/legal/#end-user-privacy-policy" style={linkStyle} target="_blank" rel="noopener noreferrer">
          Plaid&rsquo;s End User Privacy Policy
        </a>. You can disconnect any service at any time from Settings → Integrations.</p>
      <p>Cofre depends on third parties such as Plaid, Google, and your bank. We aren&rsquo;t responsible for their
        availability, for their acts, or for the accuracy of the data they send us. Imported data can be delayed,
        incomplete, or wrong, so always check it against your actual bank records.</p>

      <H2>5. Ask Cofre (AI assistant)</H2>
      <p>Ask Cofre uses an AI model to answer questions about your finances. AI-generated answers can be inaccurate or
        incomplete — check anything important before you act on it. Ask Cofre can only <em>propose</em> changes to your
        Cofre data (such as recategorizing a transaction); nothing changes unless you confirm it, and Ask Cofre can
        never move money.</p>

      <H2>6. Plans, trials, and billing</H2>
      <ul className="list-disc pl-5 flex flex-col gap-1.5">
        <li><B>Plans.</B> Cofre offers a free plan and paid plans (currently Pro and Elite), billed monthly or
          yearly. Current features and prices are listed on our <a href="/pricing" style={linkStyle}>pricing page</a>.</li>
        <li><B>Free trial.</B> Paid plans start with a 15-day free trial. Unless you cancel before the trial ends,
          your subscription begins automatically and the payment method you provided is charged.</li>
        <li><B>Automatic renewal.</B> Subscriptions renew automatically at the end of each billing period (monthly
          or yearly) at the then-current price, until you cancel.</li>
        <li><B>Cancellation.</B> You can cancel at any time from Settings. Cancellation stops future renewals; you
          keep paid features until the end of the period you&rsquo;ve already paid for, and then your account moves
          to the free plan.</li>
        <li><B>No refunds.</B> Payments are non-refundable, including for partially used billing periods, except
          where the law requires otherwise.</li>
        <li><B>Price changes.</B> We may change prices. We&rsquo;ll notify existing subscribers by email before a
          change takes effect, and it will apply from your next billing period.</li>
        <li><B>Payment processing.</B> Payments are processed by Stripe. If a payment fails, we may limit paid
          features until it goes through.</li>
      </ul>

      <H2>7. Acceptable use</H2>
      <p>Don&rsquo;t use Cofre to store or process data you don&rsquo;t have the right to; try to access other
        users&rsquo; accounts or data; probe, scan, or test the service&rsquo;s security without our written
        permission; interfere with, overload, scrape, or reverse-engineer the service; resell or sublicense it; or
        use it for anything unlawful.</p>

      <H2>8. Your data</H2>
      <p>You own the financial data you put into or connect to Cofre. You give us permission to store and process
        it only to run Cofre for you, as described in our <a href="/privacy" style={linkStyle}>Privacy Policy</a>.
        We don&rsquo;t sell your data.</p>

      <H2>9. Our intellectual property</H2>
      <p>Cofre — its software, design, logo, and name — belongs to Osmio Services. We give you a personal,
        non-exclusive, non-transferable right to use Cofre under these Terms. If you send us feedback or
        suggestions, we may use them without any obligation to you.</p>

      <H2>10. Disclaimer of warranties</H2>
      <p>Cofre is provided <B>&ldquo;as is&rdquo; and &ldquo;as available,&rdquo;</B> without warranties of any kind,
        express or implied, including merchantability, fitness for a particular purpose, and non-infringement. We
        don&rsquo;t guarantee that Cofre will be uninterrupted or error-free, or that any data, calculation,
        projection, or AI answer will be accurate or complete.</p>

      <H2>11. Limitation of liability</H2>
      <p>To the maximum extent permitted by law, Osmio Services is not liable for any indirect, incidental, special,
        consequential, or punitive damages, or for lost profits, lost data, or financial losses arising from
        decisions made based on information in Cofre. Our total liability for any claim relating to Cofre is limited
        to the greater of the amount you paid us in the 12 months before the claim arose or US$50.</p>

      <H2>12. Indemnification</H2>
      <p>You agree to indemnify and hold harmless Osmio Services from claims, losses, and expenses (including
        reasonable attorneys&rsquo; fees) arising from your misuse of Cofre or your violation of these Terms.</p>

      <H2>13. Termination</H2>
      <p>You can stop using Cofre at any time. To delete your account and its data, email{' '}
        <a href="mailto:support@budgetcofre.com" style={linkStyle}>support@budgetcofre.com</a>; cancel any paid
        subscription first. We may suspend or terminate your account if you violate these Terms or if we must to
        comply with the law. Sections 8 through 15 survive termination.</p>

      <H2>14. Governing law and disputes</H2>
      <p>These Terms are governed by the laws of the State of Florida, USA, without regard to its conflict-of-laws
        rules. Any dispute relating to these Terms or to Cofre will be resolved exclusively in the state or federal
        courts located in Florida, and you and we consent to their jurisdiction. Either of us may bring an
        individual claim in small-claims court if it qualifies. Before filing any claim, please contact us first —
        most issues can be resolved quickly by email.</p>

      <H2>15. General</H2>
      <p>These Terms and our Privacy Policy are the entire agreement between you and us about Cofre. If a provision
        is found unenforceable, the rest stays in effect. Our not enforcing a provision isn&rsquo;t a waiver of it.
        You may not transfer these Terms without our consent; we may transfer them as part of a merger, acquisition,
        or sale of assets.</p>

      <H2>16. Changes to these Terms</H2>
      <p>We may update these Terms as Cofre evolves. We&rsquo;ll update the &ldquo;Last updated&rdquo; date above,
        and for material changes we&rsquo;ll notify you by email or in the app before they take effect. Continuing
        to use Cofre after that means you accept the updated Terms.</p>

      <H2>17. Contact</H2>
      <p>Questions about these Terms? Email{' '}
        <a href="mailto:support@budgetcofre.com" style={linkStyle}>support@budgetcofre.com</a>.</p>
    </LegalPageShell>
  );
}
