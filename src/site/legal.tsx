/**
 * The two legal documents — Privacy Policy and Terms of Use.
 *
 * Both are transcriptions of the PDFs delivered for them (`landing/`), and the
 * wording is theirs rather than this file's. That is the whole rule here: a
 * privacy policy is a binding statement about what a company does with people's
 * data, and paraphrasing one to fit a layout changes what was promised. Where a
 * clause reads awkwardly on screen it still reads exactly as written.
 *
 * **The body stays in English in every language.** Everything else on this site
 * lives in `i18n/` and is translated five ways, and these deliberately are not:
 * a machine-translated liability cap or GDPR legal basis is a different
 * document from the one the company signed, and the reader has no way to tell
 * which they are looking at. The *chrome* — titles, the effective date line, the
 * note explaining this — is translated, so the page still speaks the reader's
 * language about what it is holding. That split is the honest arrangement, and
 * it is what a translated set of documents would replace when one exists.
 *
 * Section ids are prefixed `privacy-` / `terms-` because both pages are long
 * enough to want a table of contents, and `ANCHOR_ROUTES` in `router.ts` needs
 * the prefix or every jump inside the document resolves to the landing page —
 * dropping a reader onto marketing copy from the middle of a clause.
 */
import { useCopy } from './i18n/context';

/* ─────────────────────────────────────────────────────────── primitives ── */

/** The key-value block both documents open with. */
function Meta({ rows }: { rows: Array<[string, string]> }) {
  return (
    <dl className="legal-meta">
      {rows.map(([term, value]) => (
        <div key={term}>
          <dt>{term}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  );
}

/**
 * A data table.
 *
 * Wrapped in its own scroll container: four columns of retention periods do not
 * fit a phone, and the rule the whole sheet follows is that the page body never
 * scrolls sideways — the table does.
 */
function Table({ head, rows }: { head: string[]; rows: string[][] }) {
  return (
    <div className="legal-table-wrap">
      <table className="legal-table">
        <thead>
          <tr>
            {head.map((cell) => (
              <th key={cell}>{cell}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row[0]}>
              {row.map((cell, index) => (
                <td key={index}>{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** The boxed notices both documents use for the things that are easy to miss. */
function Notice({ children }: { children: React.ReactNode }) {
  return <div className="legal-notice">{children}</div>;
}

function Section({
  id,
  n,
  title,
  children,
}: {
  id: string;
  n: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="legal-section" id={id}>
      <h2>
        <span className="legal-n">{n}</span>
        {title}
      </h2>
      {children}
    </section>
  );
}

/** The shell: title, effective date, the English-only note, and a contents list. */
function Doc({
  title,
  version,
  contents,
  children,
}: {
  title: string;
  version: string;
  contents: Array<[id: string, label: string]>;
  children: React.ReactNode;
}) {
  const copy = useCopy();

  return (
    <main className="legal">
      <div className="legal-inner">
        <header className="legal-head">
          <h1>{title}</h1>
          <p className="legal-version">{version}</p>
          <p className="legal-english">{copy.legal.english}</p>
        </header>

        <nav className="legal-toc" aria-label={copy.legal.contents}>
          <h2>{copy.legal.contents}</h2>
          <ol>
            {contents.map(([id, label]) => (
              <li key={id}>
                <a href={`#${id}`}>{label}</a>
              </li>
            ))}
          </ol>
        </nav>

        <div className="legal-body">{children}</div>
      </div>
    </main>
  );
}

/* ══════════════════════════════════════════════════════ privacy policy ══ */

const PRIVACY_CONTENTS: Array<[string, string]> = [
  ['privacy-1', 'Who We Are'],
  ['privacy-2', 'What Data We Collect and Why'],
  ['privacy-3', 'Special Categories of Data'],
  ['privacy-4', 'How We Share Your Data'],
  ['privacy-5', 'International Data Transfers'],
  ['privacy-6', 'Your Rights Under GDPR'],
  ['privacy-7', 'Cookies and Local Storage'],
  ['privacy-8', 'Data Security'],
  ['privacy-9', "Children's Data"],
  ['privacy-10', 'Changes to This Privacy Policy'],
  ['privacy-11', 'Contact & Data Controller Details'],
];

export function PrivacyPage() {
  const copy = useCopy();

  return (
    <Doc
      title={copy.footer.privacy}
      version={copy.legal.privacyVersion}
      contents={PRIVACY_CONTENTS}
    >
      <Meta
        rows={[
          ['Data Controller', 'Paylez Sp. z o.o.'],
          ['Contact', 'usepaylez@gmail.com'],
          ['Governing Law', 'Regulation (EU) 2016/679 (GDPR) · Polish Personal Data Protection Act'],
          ['Supervisory Authority', 'Urząd Ochrony Danych Osobowych (UODO) · www.uodo.gov.pl'],
        ]}
      />

      <Section id="privacy-1" n="1." title="Who We Are">
        <p>
          Paylez is operated by Paylez Sp. z o.o., a company registered in Poland. We provide a
          guidebook and services discovery platform for expatriates, international students, and
          newcomers in Poland, connecting them with trusted local service providers.
        </p>
        <p>
          We act as the Data Controller for all personal data collected through our platform,
          mobile application, and website (www.pay-lez.com).
        </p>
      </Section>

      <Section id="privacy-2" n="2." title="What Data We Collect and Why">
        <p>
          We collect only the data necessary to provide and improve our services. Below is a
          complete description of every category of data we process, the legal basis for doing so,
          and how long we retain it.
        </p>

        <h3>2.1 Identity &amp; Authentication Data</h3>
        <Table
          head={['Data Type', 'Purpose', 'Legal Basis', 'Retention']}
          rows={[
            ['Email address', 'Account creation, login, communications', 'Contract (Art. 6(1)(b))', 'Duration of account + 3 years'],
            ['Full name', 'Account identification', 'Contract (Art. 6(1)(b))', 'Duration of account + 3 years'],
            ['Display name', 'Public profile personalisation', 'Contract (Art. 6(1)(b))', 'Duration of account'],
            ['Role (user/admin)', 'Access control and permissions', 'Legitimate interest (Art. 6(1)(f))', 'Duration of account'],
            ['Profile completion status', 'Onboarding experience', 'Legitimate interest (Art. 6(1)(f))', 'Duration of account'],
          ]}
        />

        <h3>2.2 Profile Data</h3>
        <Table
          head={['Data Type', 'Purpose', 'Legal Basis', 'Retention']}
          rows={[
            ['Country & city of residence', 'Localised service recommendations', 'Consent (Art. 6(1)(a))', 'Until withdrawn + 1 year'],
            ['Bio and work description', 'Profile personalisation', 'Consent (Art. 6(1)(a))', 'Until withdrawn'],
            ['Languages spoken, interests', 'Personalised content delivery', 'Consent (Art. 6(1)(a))', 'Until withdrawn'],
            ['WhatsApp number', 'Optional contact feature', 'Consent (Art. 6(1)(a))', 'Until withdrawn'],
            ['Telegram username', 'Optional contact feature', 'Consent (Art. 6(1)(a))', 'Until withdrawn'],
            ['Profile visibility preference', 'Privacy control', 'Contract (Art. 6(1)(b))', 'Duration of account'],
          ]}
        />

        <h3>2.3 Financial Data (Inactive — Future Feature)</h3>
        <Notice>
          <p>
            <strong>IMPORTANT NOTICE:</strong> The international money transfer feature is not
            currently operational. The data fields listed below exist in our system architecture but
            NO financial transactions are processed, NO real money moves, and NO payment data is
            actively collected at this stage. This section documents future data processing
            intentions only. We will update this Privacy Policy and obtain appropriate consents
            before activating this feature.
          </p>
        </Notice>
        <p>When the feature becomes active, the following data will be processed:</p>
        <Table
          head={['Data Type', 'Purpose', 'Legal Basis', 'Retention']}
          rows={[
            ['Transaction amounts, exchange rates, fees', 'Processing transfers', 'Contract (Art. 6(1)(b))', '7 years (legal obligation)'],
            ['Payment method details (masked card, IBAN last 4)', 'Payment processing', 'Contract (Art. 6(1)(b))', '7 years (legal obligation)'],
            ['Recipient name, phone, bank details', 'Transfer execution', 'Contract (Art. 6(1)(b))', '7 years (legal obligation)'],
            ['Blockchain transaction hash', 'Crypto transfer verification', 'Contract (Art. 6(1)(b))', '7 years (legal obligation)'],
            ['Stripe payment method ID', 'Secure payment tokenisation', 'Contract (Art. 6(1)(b))', 'Duration of relationship'],
            ['EUR & USDT wallet balances', 'Wallet management', 'Contract (Art. 6(1)(b))', '7 years (legal obligation)'],
          ]}
        />

        <h3>2.4 Gamification &amp; Behavioural Data</h3>
        <Table
          head={['Data Type', 'Purpose', 'Legal Basis', 'Retention']}
          rows={[
            ['Quiz answers and scores', 'Game functionality and progress', 'Contract (Art. 6(1)(b))', 'Duration of account'],
            ['Streaks and lives', 'Gamification mechanics', 'Contract (Art. 6(1)(b))', 'Duration of account'],
            ['Score history (brain, flag, capital games)', 'Leaderboards and progress tracking', 'Legitimate interest (Art. 6(1)(f))', 'Duration of account'],
            ['Difficulty level progression', 'Personalised game experience', 'Legitimate interest (Art. 6(1)(f))', 'Duration of account'],
            ['Last played timestamps', 'Streak calculation and notifications', 'Legitimate interest (Art. 6(1)(f))', 'Duration of account'],
          ]}
        />

        <h3>2.5 Rewards, Vouchers &amp; Referrals</h3>
        <Table
          head={['Data Type', 'Purpose', 'Legal Basis', 'Retention']}
          rows={[
            ['Referral code and referrer identity', 'Referral programme management', 'Contract (Art. 6(1)(b))', 'Duration of account + 2 years'],
            ['Points earned and redeemed', 'Loyalty programme tracking', 'Contract (Art. 6(1)(b))', 'Duration of account + 2 years'],
            ['Voucher codes and discount amounts', 'Voucher issuance and validation', 'Contract (Art. 6(1)(b))', '2 years after expiry'],
            ['Voucher usage status', 'Fraud prevention', 'Legitimate interest (Art. 6(1)(f))', '2 years after use'],
            ['QR code scan timestamps', 'Voucher verification', 'Contract (Art. 6(1)(b))', '2 years'],
            ['Device info at QR scan (user agent)', 'Fraud detection and security', 'Legitimate interest (Art. 6(1)(f))', '1 year'],
            ['Cheque amounts at voucher redemption', 'Partner billing and audit', 'Legitimate interest (Art. 6(1)(f))', '3 years'],
          ]}
        />

        <h3>2.6 Analytics &amp; Interaction Data</h3>
        <Table
          head={['Data Type', 'Purpose', 'Legal Basis', 'Retention']}
          rows={[
            ['Clicks on partner services (Maps, website, phone, Instagram)', 'Platform analytics and partner reporting', 'Legitimate interest (Art. 6(1)(f))', '2 years (aggregated after 90 days)'],
            ['User language at time of click', 'Localisation improvement', 'Legitimate interest (Art. 6(1)(f))', '2 years (aggregated after 90 days)'],
            ['Country and city of service interaction', 'Geographic analytics', 'Legitimate interest (Art. 6(1)(f))', '2 years (aggregated after 90 days)'],
            ['Loyalty scan timestamps and service visited', 'Partner performance reporting', 'Legitimate interest (Art. 6(1)(f))', '2 years'],
          ]}
        />

        <h3>2.7 Support &amp; User-Generated Content</h3>
        <Table
          head={['Data Type', 'Purpose', 'Legal Basis', 'Retention']}
          rows={[
            ['Feedback comments and star ratings', 'Service improvement', 'Legitimate interest (Art. 6(1)(f))', '3 years'],
            ['Feedback category', 'Support classification', 'Legitimate interest (Art. 6(1)(f))', '3 years'],
            ['Name and email on feedback submissions', 'Support response', 'Contract (Art. 6(1)(b))', '3 years'],
            ['Business recommendations submitted by users', 'Platform content improvement', 'Consent (Art. 6(1)(a))', 'Until withdrawn or 3 years'],
          ]}
        />

        <h3>2.8 Technical &amp; Implicit Data</h3>
        <Table
          head={['Data Type', 'Purpose', 'Legal Basis', 'Retention']}
          rows={[
            ['IP address (processed by our servers and web server logs)', 'Security, fraud prevention, legal compliance', 'Legitimate interest (Art. 6(1)(f))', '90 days'],
            ['User agent / device info (captured on QR scans)', 'Security and fraud detection', 'Legitimate interest (Art. 6(1)(f))', '1 year'],
            ['Session tokens (issued and stored by us)', 'Authentication and session management', 'Contract (Art. 6(1)(b))', 'Duration of session'],
            ['Google account identifier and verified email (only if you sign in with Google)', 'Authentication', 'Contract (Art. 6(1)(b))', 'Duration of account'],
            ['localStorage — theme preference and language choice', 'User experience personalisation', 'Legitimate interest (Art. 6(1)(f))', 'Until cleared by user'],
            ['localStorage — signed-in session and session token', 'Keeping you signed in between visits', 'Contract (Art. 6(1)(b))', 'Until sign-out or cleared'],
            ['localStorage — game progress state', 'Ensuring quiz questions are not repeated', 'Legitimate interest (Art. 6(1)(f))', 'Until cleared by user'],
          ]}
        />
        <h3>2.9 Website Traffic Measurement</h3>
        <p>
          We measure how the website is used with our own software, running on our own servers. We
          do not use Google Analytics or any other third-party analytics service, and we set no
          analytics cookie and no visitor identifier of any kind. A visit is counted using a value
          derived from the connection that changes every day and is never stored as an identifier,
          which means returning anonymous visitors are deliberately not measurable to us.
        </p>
      </Section>

      <Section id="privacy-3" n="3." title="Special Categories of Data">
        <p>
          We do not intentionally collect special categories of personal data as defined under
          Article 9 GDPR (including health data, racial or ethnic origin, political opinions,
          religious beliefs, or biometric data).
        </p>
        <p>
          We note that nationality data (country of residence) collected in your profile may in
          certain contexts be considered ethnically sensitive. We process this data solely for the
          purpose of providing localised service recommendations and do not use it for any
          discriminatory profiling. You may remove this data from your profile at any time.
        </p>
      </Section>

      <Section id="privacy-4" n="4." title="How We Share Your Data">
        <p>We do not sell your personal data. We share data only in the following circumstances:</p>

        <h3>4.1 Service Partners (Listed Businesses)</h3>
        <p>
          When you interact with a partner's listing (click, visit, redeem a voucher), we share
          aggregated and anonymised analytics with that partner. We share individual-level data with
          partners only where:
        </p>
        <ul>
          <li>You explicitly submit an inquiry or lead form directed at that partner</li>
          <li>A voucher redemption requires verification of your account</li>
          <li>You have consented to a specific partner receiving your contact details</li>
        </ul>

        <h3>4.2 Technology Subprocessors</h3>
        <Table
          head={['Subprocessor', 'Purpose', 'Location', 'Safeguard']}
          rows={[
            ['IONOS SE', 'Server hosting, database infrastructure and application delivery', 'Frankfurt, Germany (EEA)', 'Data Processing Agreement'],
            ['Google Ireland Limited', 'Sign in with Google — identity verification only, for users who choose it', 'Ireland (EEA)', 'Data Processing Agreement'],
            ['Stripe (future)', 'Payment processing (inactive)', 'USA', 'Standard Contractual Clauses (SCCs)'],
          ]}
        />
        <p>
          We host our own application and database. Authentication, session management and all
          user data are handled on infrastructure we operate, and no third party stores or
          processes account data on our behalf other than as listed above.
        </p>

        <h3>4.3 Legal Requirements</h3>
        <p>
          We may disclose personal data to law enforcement or regulatory authorities (including
          UODO) where required by applicable law, court order, or to protect the legal rights of the
          platform or its users.
        </p>
      </Section>

      <Section id="privacy-5" n="5." title="International Data Transfers">
        <p>
          All of our current data processing occurs within the European Economic Area (EEA). Our
          servers and database are hosted in Frankfurt, Germany, and the only other active
          subprocessor is Google Ireland Limited. No personal data is currently transferred outside
          the EEA.
        </p>
        <p>
          Should data be transferred outside the EEA in future (for example, if the payment
          processing described in section 2.3 is activated), we will ensure appropriate safeguards
          are in place, including:
        </p>
        <ul>
          <li>Standard Contractual Clauses (SCCs) approved by the European Commission</li>
          <li>Adequacy decisions where applicable</li>
          <li>Data Processing Agreements with all subprocessors</li>
        </ul>
        <p>
          <strong>Users located in Uzbekistan:</strong> We operate under Polish and EU law as our
          governing framework. Where Uzbek law applies to your specific circumstances, we encourage
          you to seek independent legal advice.
        </p>
      </Section>

      <Section id="privacy-6" n="6." title="Your Rights Under GDPR">
        <p>
          As a data subject under GDPR, you have the following rights. To exercise any of these
          rights, contact us at usepaylez@gmail.com. We will respond within 30 days.
        </p>
        <Table
          head={['Right', 'What It Means', 'How to Exercise']}
          rows={[
            ['Right of Access (Art. 15)', 'Request a copy of all data we hold about you', "Email usepaylez@gmail.com with subject: 'Data Access Request'"],
            ['Right to Rectification (Art. 16)', 'Correct inaccurate or incomplete data', 'Update in app settings or email us'],
            ['Right to Erasure (Art. 17)', "Request deletion of your data ('right to be forgotten')", "Email usepaylez@gmail.com with subject: 'Erasure Request'"],
            ['Right to Restrict Processing (Art. 18)', 'Limit how we use your data in certain circumstances', 'Email usepaylez@gmail.com'],
            ['Right to Data Portability (Art. 20)', 'Receive your data in a machine-readable format', "Email usepaylez@gmail.com with subject: 'Portability Request'"],
            ['Right to Object (Art. 21)', 'Object to processing based on legitimate interests', 'Email usepaylez@gmail.com'],
            ['Right to Withdraw Consent', 'Withdraw consent at any time for consent-based processing', 'App settings or email us'],
            ['Right to Lodge a Complaint', 'Complain to the Polish supervisory authority', 'www.uodo.gov.pl'],
          ]}
        />
      </Section>

      <Section id="privacy-7" n="7." title="Cookies and Local Storage">
        <p>
          <strong>We use no cookies.</strong> We store the following on your device using
          localStorage:
        </p>
        <ul>
          <li>Theme preference (light/dark mode) — never sent to our servers</li>
          <li>Language choice — to preserve your language setting between sessions</li>
          <li>Your signed-in session and session token — so you stay signed in between visits</li>
          <li>Game progress state — so quiz questions are not repeated to you</li>
          <li>Whether the site's opening animation has already played</li>
        </ul>
        <p>
          None of these is an advertising or tracking identifier, none is shared with a third party,
          and the first two and the last are never sent to our servers at all. The session values
          are removed when you sign out. You can clear localStorage at any time through your browser
          or device settings.
        </p>
        <p>
          If we introduce cookies or any third-party analytics or advertising technology in the
          future, we will update this policy and implement a cookie consent mechanism before doing
          so.
        </p>
      </Section>

      <Section id="privacy-8" n="8." title="Data Security">
        <p>
          We implement appropriate technical and organisational measures to protect your personal
          data against unauthorised access, alteration, disclosure, or destruction. These measures
          include:
        </p>
        <ul>
          <li>Encrypted data transmission (HTTPS/TLS) on all connections</li>
          <li>Passwords stored only as salted scrypt hashes, never in readable form</li>
          <li>Signed, expiring session tokens, invalidated on sign-out</li>
          <li>Access controls limiting data access to authorised personnel only</li>
          <li>Regular security reviews of our infrastructure and subprocessors</li>
          <li>Masked storage of sensitive financial identifiers (last 4 digits only for cards and IBAN)</li>
        </ul>
        <p>
          In the event of a personal data breach that poses a risk to your rights and freedoms, we
          will notify the relevant supervisory authority within 72 hours and affected users without
          undue delay, as required by Article 33-34 GDPR.
        </p>
      </Section>

      <Section id="privacy-9" n="9." title="Children's Data">
        <p>
          Our platform is not directed at children under the age of 16. We do not knowingly collect
          personal data from children. If you believe a child has provided us with personal data
          without appropriate consent, please contact us at usepaylez@gmail.com, and we will delete
          the data promptly.
        </p>
      </Section>

      <Section id="privacy-10" n="10." title="Changes to This Privacy Policy">
        <p>
          We may update this Privacy Policy from time to time. When we make material changes, we
          will notify you by:
        </p>
        <ul>
          <li>Email to your registered address</li>
          <li>In-app notification</li>
          <li>Prominent notice on our website</li>
        </ul>
        <p>
          The updated policy will be effective 30 days after notification, giving you time to review
          the changes and, where consent is the legal basis, to withdraw consent if you do not
          agree.
        </p>
      </Section>

      <Section id="privacy-11" n="11." title="Contact & Data Controller Details">
        <Meta
          rows={[
            ['Data Controller', 'Paylez Sp. z o.o.'],
            ['Email', 'usepaylez@gmail.com'],
            ['Website', 'www.pay-lez.com'],
            ['Supervisory Authority', 'Urząd Ochrony Danych Osobowych (UODO)'],
            ['UODO Website', 'www.uodo.gov.pl'],
            ['UODO Address', 'ul. Stawki 2, 00-193 Warsaw, Poland'],
          ]}
        />
      </Section>
    </Doc>
  );
}

/* ══════════════════════════════════════════════════════ terms of use ══ */

const TERMS_CONTENTS: Array<[string, string]> = [
  ['terms-1', 'About the Platform'],
  ['terms-2', 'Eligibility and Account Registration'],
  ['terms-3', 'User Conduct'],
  ['terms-4', 'Points and Voucher System'],
  ['terms-5', 'Referral Programme'],
  ['terms-6', 'Partner Listings and Content'],
  ['terms-7', 'Gamification'],
  ['terms-8', 'International Money Transfer (Inactive Feature)'],
  ['terms-9', 'Intellectual Property'],
  ['terms-10', 'Disclaimers and Limitation of Liability'],
  ['terms-11', 'Account Suspension and Termination'],
  ['terms-12', 'Changes to These Terms'],
  ['terms-13', 'Governing Law and Dispute Resolution'],
  ['terms-14', 'Contact'],
];

export function TermsPage() {
  const copy = useCopy();

  return (
    <Doc
      title={copy.footer.terms}
      version={copy.legal.termsVersion}
      contents={TERMS_CONTENTS}
    >
      <Meta
        rows={[
          ['Operator', 'Paylez Sp. z o.o.'],
          ['Contact', 'usepaylez@gmail.com'],
          ['Website', 'www.pay-lez.com'],
          ['Governing Law', 'Polish law · Jurisdiction: Polish courts'],
        ]}
      />

      <p className="legal-lede">
        Please read these Terms of Use carefully before using the Paylez platform. By creating an
        account or using our services, you agree to be bound by these Terms. If you do not agree, do
        not use the platform.
      </p>

      <Section id="terms-1" n="1." title="About the Platform">
        <p>
          Paylez is a digital guidebook and services discovery platform operated by Paylez Sp. z
          o.o.. We connect expatriates, international students, and newcomers in Poland with trusted
          local service providers across categories, including dining, healthcare, legalisation,
          education, and lifestyle services.
        </p>
        <p>The platform includes:</p>
        <ul>
          <li>A curated directory of partner businesses and service providers</li>
          <li>Practical guidebook content covering life in Poland</li>
          <li>A gamification system including educational mini-games</li>
          <li>A loyalty points and voucher rewards programme</li>
          <li>A referral programme</li>
          <li>
            Future functionality, including international money transfer (currently inactive — see
            Section 8)
          </li>
        </ul>
      </Section>

      <Section id="terms-2" n="2." title="Eligibility and Account Registration">
        <h3>2.1 Eligibility</h3>
        <p>You may use the platform if you are:</p>
        <ul>
          <li>At least 16 years of age</li>
          <li>Legally capable of entering into a binding agreement</li>
          <li>Not previously banned or suspended from the platform</li>
        </ul>

        <h3>2.2 Account Creation</h3>
        <p>To access full platform features, you must register for an account. You agree to:</p>
        <ul>
          <li>Provide accurate, complete, and current information</li>
          <li>Maintain the security of your account credentials</li>
          <li>Notify us immediately of any unauthorised access to your account</li>
          <li>Accept responsibility for all activity that occurs under your account</li>
        </ul>
        <p>
          We reserve the right to refuse registration or suspend accounts at our discretion,
          including where we have reason to believe information provided is false, misleading, or in
          violation of these Terms.
        </p>
      </Section>

      <Section id="terms-3" n="3." title="User Conduct">
        <p>By using the platform, you agree not to:</p>
        <ul>
          <li>Use the platform for any unlawful purpose or in violation of applicable Polish or EU law</li>
          <li>Create fake accounts or misrepresent your identity</li>
          <li>Attempt to gain unauthorised access to any part of the platform or its infrastructure</li>
          <li>Scrape, copy, or reproduce platform content without our express written permission</li>
          <li>Post or transmit harmful, offensive, defamatory, or fraudulent content</li>
          <li>Manipulate or abuse the points, voucher, or referral systems</li>
          <li>Interfere with the proper functioning of the platform</li>
          <li>Use automated tools to interact with the platform without our prior written consent</li>
        </ul>
      </Section>

      <Section id="terms-4" n="4." title="Points and Voucher System">
        <h3>4.1 Points</h3>
        <p>
          The Paylez loyalty points system allows users to earn points through platform activities,
          including:
        </p>
        <ul>
          <li>Playing mini-games and maintaining streaks</li>
          <li>Visiting and interacting with partner businesses (Tier 2 partners only)</li>
          <li>Completing profile and onboarding tasks</li>
          <li>Referring new users to the platform</li>
        </ul>
        <Notice>
          <p>
            <strong>IMPORTANT:</strong> Points have no monetary value and cannot be exchanged for
            cash. Points are a loyalty mechanism only and may not be transferred, sold, gifted, or
            used outside the platform. Points expire 12 months after the date they were earned
            unless redeemed.
          </p>
        </Notice>

        <h3>4.2 Vouchers</h3>
        <p>
          Points may be redeemed for discount vouchers valid at participating partner businesses.
          The following conditions apply:
        </p>
        <ul>
          <li>Vouchers are valid only at the specific partner location stated on the voucher</li>
          <li>Vouchers have an expiry date stated at the time of issuance — expired vouchers cannot be redeemed</li>
          <li>Vouchers may not be combined with other promotional offers unless explicitly stated</li>
          <li>The discount value is funded by the partner business — Paylez is not the provider of the discount</li>
          <li>Vouchers may not be sold, transferred, or exchanged for cash</li>
          <li>We reserve the right to cancel vouchers in cases of suspected fraud or abuse</li>
        </ul>

        <h3>4.3 Platform as Intermediary</h3>
        <p>
          Paylez operates as a technology intermediary between users and partner businesses. We are
          not party to any transaction between a user and a partner. Voucher redemption disputes,
          service quality complaints, and refund requests must be directed to the relevant partner
          business. We will use reasonable efforts to mediate disputes where appropriate, but accept
          no liability for partner service quality or fulfilment.
        </p>
      </Section>

      <Section id="terms-5" n="5." title="Referral Programme">
        <p>
          Users may refer new users to the platform using a personal referral code. Referral points
          are awarded when the referred user:
        </p>
        <ul>
          <li>Creates a verified account using the referral code</li>
          <li>Completes the minimum onboarding requirements specified in the app</li>
        </ul>
        <p>
          We reserve the right to modify, suspend, or terminate the referral programme at any time.
          Referral points awarded in error or through fraudulent activity will be reversed.
          Self-referrals (referring yourself through a second account) are strictly prohibited and
          will result in account suspension.
        </p>
      </Section>

      <Section id="terms-6" n="6." title="Partner Listings and Content">
        <h3>6.1 Partner Accuracy</h3>
        <p>
          Partner listings on the platform are provided by third-party businesses. While we make
          reasonable efforts to verify partner information, we do not guarantee the accuracy,
          completeness, or currency of partner listings, including opening hours, pricing, services
          offered, or contact details. Always confirm details directly with the partner before
          visiting.
        </p>

        <h3>6.2 Partner Relationships</h3>
        <p>
          Certain partners are featured at different visibility tiers based on their subscription
          level with Paylez. The existence of a paid partnership does not influence our editorial
          guidebook content or our user safety standards. Paid placements are clearly identifiable
          as featured or sponsored.
        </p>

        <h3>6.3 User-Submitted Recommendations</h3>
        <p>
          Users may submit business recommendations to the platform. By submitting a recommendation,
          you grant us a non-exclusive, royalty-free licence to use, publish, and display the
          submitted content on the platform. You confirm the submission is accurate to the best of
          your knowledge and does not infringe any third-party rights.
        </p>
      </Section>

      <Section id="terms-7" n="7." title="Gamification">
        <p>
          The platform includes educational mini-games covering geography, languages, and general
          knowledge. Game mechanics include:
        </p>
        <ul>
          <li>Points and scoring systems</li>
          <li>Streak tracking (consecutive days of activity)</li>
          <li>Lives system (limited attempts per session)</li>
          <li>Leaderboards displaying top scores</li>
        </ul>
        <p>
          We reserve the right to modify, reset, or discontinue any gamification element at any
          time. High scores and streaks do not constitute property rights and may be adjusted in
          cases of technical error, abuse, or platform redesign.
        </p>
      </Section>

      <Section id="terms-8" n="8." title="International Money Transfer (Inactive Feature)">
        <Notice>
          <p>
            The international money transfer functionality is NOT currently operational. No
            financial transactions can be initiated, processed, or completed through the platform at
            this time. The interface exists for demonstration and development purposes only. By
            using the platform, you acknowledge and agree that you will not attempt to use this
            feature to initiate real financial transactions. We will notify users and update these
            Terms before activating this feature.
          </p>
        </Notice>
        <p>
          When activated, money transfer services will be subject to additional terms, applicable
          financial regulations, and KYC/AML compliance requirements. Activation will not occur
          without prior user notification and updated Terms of Use.
        </p>
      </Section>

      <Section id="terms-9" n="9." title="Intellectual Property">
        <h3>9.1 Platform Content</h3>
        <p>
          All content on the platform — including guidebook articles, design, logos, software, and
          original text — is the intellectual property of Paylez Sp. z o.o. or its licensors. You
          may not copy, reproduce, distribute, or create derivative works from platform content
          without our express written permission.
        </p>

        <h3>9.2 User Content</h3>
        <p>
          You retain ownership of content you submit (feedback, recommendations, profile
          information). By submitting content, you grant Paylez a worldwide, non-exclusive,
          royalty-free licence to use, display, and distribute that content solely for the purpose
          of operating and improving the platform. This licence ends when you delete the content or
          close your account, subject to any legal retention requirements.
        </p>
      </Section>

      <Section id="terms-10" n="10." title="Disclaimers and Limitation of Liability">
        <p>
          The platform is provided 'as is' and 'as available.' To the maximum extent permitted by
          applicable law:
        </p>
        <ul>
          <li>We do not warrant that the platform will be uninterrupted, error-free, or secure at all times</li>
          <li>We are not liable for the quality, safety, or legality of services provided by partner businesses</li>
          <li>We are not liable for any indirect, incidental, or consequential damages arising from your use of the platform</li>
          <li>Our total liability for any claim arising from these Terms shall not exceed the amount you paid us in the 3 months preceding the claim</li>
        </ul>
        <p>
          Nothing in these Terms limits our liability for death, personal injury caused by
          negligence, fraud, or any other liability that cannot be excluded under Polish or EU law.
        </p>
      </Section>

      <Section id="terms-11" n="11." title="Account Suspension and Termination">
        <h3>11.1 By You</h3>
        <p>
          You may close your account at any time by contacting us at usepaylez@gmail.com. On
          closure, your profile data will be deleted within 30 days, subject to any data we are
          required to retain by law. Unused points and unredeemed vouchers will be forfeited upon
          account closure.
        </p>

        <h3>11.2 By Us</h3>
        <p>We may suspend or terminate your account immediately and without notice if you:</p>
        <ul>
          <li>Violate any provision of these Terms</li>
          <li>Engage in fraudulent activity, including the manipulation of the points or referral system</li>
          <li>Provide false identity information</li>
          <li>Create multiple accounts to circumvent restrictions</li>
        </ul>
        <p>
          We may also suspend the platform or specific features for maintenance, legal compliance,
          or business reasons, with reasonable notice where possible.
        </p>
      </Section>

      <Section id="terms-12" n="12." title="Changes to These Terms">
        <p>We may update these Terms from time to time. We will notify you of material changes by:</p>
        <ul>
          <li>Email to your registered address at least 14 days before the change takes effect</li>
          <li>In-app notification</li>
        </ul>
        <p>
          Your continued use of the platform after the effective date of updated Terms constitutes
          acceptance. If you do not agree to the updated Terms, you must stop using the platform and
          may close your account.
        </p>
      </Section>

      <Section id="terms-13" n="13." title="Governing Law and Dispute Resolution">
        <p>
          These Terms are governed by the laws of Poland. Any dispute arising from these Terms or
          your use of the platform shall first be subject to good-faith negotiation between the
          parties. If negotiation fails, disputes shall be subject to the exclusive jurisdiction of
          the competent courts in Poland.
        </p>
        <p>
          If you are a consumer resident in the EU, you also have the right to use the EU Online
          Dispute Resolution platform at:{' '}
          <a href="https://ec.europa.eu/consumers/odr" target="_blank" rel="noreferrer noopener">
            https://ec.europa.eu/consumers/odr
          </a>
        </p>
      </Section>

      <Section id="terms-14" n="14." title="Contact">
        <Meta
          rows={[
            ['Operator', 'Paylez Sp. z o.o.'],
            ['Email', 'usepaylez@gmail.com'],
            ['Website', 'www.pay-lez.com'],
          ]}
        />
        <p>For data protection enquiries, see our Privacy Policy.</p>
      </Section>
    </Doc>
  );
}
