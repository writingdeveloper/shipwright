import { type LegalConfig, LEGAL_DISCLAIMER } from "./config";

/**
 * @repo/legal — Privacy Policy content, parameterised by {@link LegalConfig}.
 *
 * Jurisdiction-agnostic by design: the wording reflects principles common to
 * GDPR, CCPA/CPRA, and PIPA (lawful basis / purpose limitation, the right to
 * access-correct-delete-port, opt-out of "sale"/"sharing", sub-processor
 * transparency, international-transfer notice) without naming or hardcoding one
 * country's regime. It is a STARTER TEMPLATE — see {@link LEGAL_DISCLAIMER}.
 *
 * A pure Server Component returning semantic markup styled with the design
 * system's tokens; the consuming app wraps it in its own page chrome and SEO
 * metadata.
 */

const heading = "text-foreground mt-8 text-xl font-semibold tracking-tight";
const para = "text-muted-foreground mt-3 text-sm leading-6";
const list = "text-muted-foreground mt-3 flex list-disc flex-col gap-2 pl-6 text-sm leading-6";

export type LegalContentProps = {
  readonly config: LegalConfig;
};

export function PrivacyPolicy({ config }: LegalContentProps) {
  const entity = config.entityName ?? config.appName;

  return (
    <article aria-labelledby="privacy-title">
      <h1
        id="privacy-title"
        className="text-foreground text-3xl font-semibold tracking-tight"
      >
        Privacy Policy
      </h1>
      <p className="text-muted-foreground mt-2 text-sm">
        Last updated: {config.lastUpdated}
      </p>

      <div
        role="note"
        className="border-border bg-muted/40 text-muted-foreground mt-6 rounded-lg border border-dashed p-4 text-xs leading-5"
      >
        {LEGAL_DISCLAIMER}
      </div>

      <h2 className={heading}>1. Who we are</h2>
      <p className={para}>
        {entity} (&ldquo;we&rdquo;, &ldquo;us&rdquo;) operates {config.appName}{" "}
        (the &ldquo;Service&rdquo;), available at {config.websiteUrl}. This
        policy explains what personal data we process, why, and the choices and
        rights you have. We act as the controller of personal data processed
        through the Service.
      </p>

      <h2 className={heading}>2. Data we process</h2>
      <p className={para}>
        We process only what the Service needs to function:
      </p>
      <ul className={list}>
        <li>
          <strong className="text-foreground font-medium">
            Account data
          </strong>{" "}
          — your name, email address, and a securely hashed password, used to
          create and secure your account.
        </li>
        <li>
          <strong className="text-foreground font-medium">
            Authentication &amp; session data
          </strong>{" "}
          — session identifiers and strictly necessary cookies used to keep you
          signed in and protect against cross-site request forgery.
        </li>
        <li>
          <strong className="text-foreground font-medium">Content</strong> —
          the data you create in the Service (for example, your tasks),
          processed to provide the product to you.
        </li>
        <li>
          <strong className="text-foreground font-medium">
            Technical data
          </strong>{" "}
          — limited server logs (such as IP address and request metadata) needed
          for security and reliability.
        </li>
      </ul>

      <h2 className={heading}>3. Why we process it (purpose &amp; basis)</h2>
      <p className={para}>
        We process personal data to provide and secure the Service, to
        authenticate you, to operate and improve core functionality, and to
        comply with legal obligations. Depending on your location, our lawful
        basis is the performance of our contract with you, your consent (for any
        optional cookies), and our legitimate interest in keeping the Service
        secure and reliable. We do not sell your personal data, and we do not
        &ldquo;share&rdquo; it for cross-context behavioural advertising.
      </p>

      <h2 className={heading}>4. Cookies &amp; consent</h2>
      <p className={para}>
        We use strictly necessary cookies to operate the Service (authentication
        and security); these do not require consent. Any non-essential cookies
        (for example, analytics) are loaded only after you opt in through our
        cookie banner, and you can change or withdraw your choice at any time.
        Until you opt in, non-essential cookies are not set.
      </p>

      <h2 className={heading}>5. Sub-processors</h2>
      <p className={para}>
        We use the following third parties to process personal data on our
        behalf, under appropriate data-processing terms. Others are added to
        this list as additional integrations are enabled.
      </p>
      <ul className={list}>
        {config.subProcessors.map((sp) => (
          <li key={sp.name}>
            <strong className="text-foreground font-medium">{sp.name}</strong>{" "}
            ({sp.country}) — {sp.purpose}
            {sp.url ? (
              <>
                {" "}
                <a href={sp.url} className="text-primary hover:underline">
                  Privacy details
                </a>
              </>
            ) : null}
          </li>
        ))}
      </ul>

      <h2 className={heading}>6. International transfers</h2>
      <p className={para}>
        Some sub-processors are located outside your country, including in the
        United States. Where personal data is transferred internationally, we
        rely on appropriate safeguards (such as standard contractual clauses or
        an equivalent recognised transfer mechanism) as required by applicable
        law.
      </p>

      <h2 className={heading}>7. Retention</h2>
      <p className={para}>
        We keep personal data only as long as needed to provide the Service and
        for legitimate legal, security, or accounting purposes. When you delete
        your account, we delete or anonymise the associated personal data within
        a reasonable period, except where retention is legally required.
      </p>

      <h2 className={heading}>8. Your rights</h2>
      <p className={para}>
        Subject to your jurisdiction, you may have the right to access, correct,
        delete, restrict, or port your personal data, to object to certain
        processing, to withdraw consent, and to opt out of any &ldquo;sale&rdquo;
        or &ldquo;sharing&rdquo; of personal data. You may also have the right to
        lodge a complaint with your local data-protection authority. We do not
        discriminate against you for exercising these rights.
      </p>

      <h2 className={heading}>9. Contact</h2>
      <p className={para}>
        To exercise any right or ask a question about this policy, contact us at{" "}
        <a
          href={`mailto:${config.contactEmail}`}
          className="text-primary hover:underline"
        >
          {config.contactEmail}
        </a>
        .
      </p>
    </article>
  );
}
