import {
  type LegalConfig,
  LEGAL_DISCLAIMER,
} from "./config";
import type { LegalContentProps } from "./privacy-policy";

/**
 * @repo/legal — Terms of Service content, parameterised by {@link LegalConfig}.
 *
 * Generic, jurisdiction-neutral terms suitable as a starting point for a SaaS
 * MVP: acceptance, accounts, acceptable use, IP, user content, disclaimers,
 * limitation of liability, termination, governing law, and changes. It is a
 * STARTER TEMPLATE — see {@link LEGAL_DISCLAIMER} — not legal advice.
 *
 * Pure Server Component returning semantic, design-system-styled markup.
 */

const heading = "text-foreground mt-8 text-xl font-semibold tracking-tight";
const para = "text-muted-foreground mt-3 text-sm leading-6";

export function TermsOfService({ config }: LegalContentProps) {
  const entity: LegalConfig["entityName"] =
    config.entityName ?? config.appName;

  return (
    <article aria-labelledby="terms-title">
      <h1
        id="terms-title"
        className="text-foreground text-3xl font-semibold tracking-tight"
      >
        Terms of Service
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

      <h2 className={heading}>1. Agreement to terms</h2>
      <p className={para}>
        These Terms of Service (the &ldquo;Terms&rdquo;) govern your access to
        and use of {config.appName} (the &ldquo;Service&rdquo;), operated by{" "}
        {entity}. By creating an account or using the Service, you agree to these
        Terms. If you do not agree, do not use the Service.
      </p>

      <h2 className={heading}>2. Accounts</h2>
      <p className={para}>
        You must provide accurate information when creating an account and are
        responsible for safeguarding your credentials and for all activity under
        your account. Notify us promptly of any unauthorised use. You must be old
        enough to form a binding contract in your jurisdiction to use the
        Service.
      </p>

      <h2 className={heading}>3. Acceptable use</h2>
      <p className={para}>
        You agree not to misuse the Service: no unlawful, infringing, or abusive
        activity; no attempts to breach security, disrupt, or reverse-engineer
        the Service; and no use that violates the rights of others or applicable
        law. We may suspend access to protect the Service or other users.
      </p>

      <h2 className={heading}>4. Your content</h2>
      <p className={para}>
        You retain ownership of the content you submit to the Service. You grant
        us a limited licence to host, store, and process that content solely to
        operate and provide the Service to you. You are responsible for your
        content and for having the rights necessary to submit it.
      </p>

      <h2 className={heading}>5. Intellectual property</h2>
      <p className={para}>
        The Service, including its software, design, and trademarks, is owned by{" "}
        {entity} or its licensors and is protected by applicable laws. These
        Terms grant you no rights to our intellectual property except the limited
        right to use the Service as permitted here.
      </p>

      <h2 className={heading}>6. Disclaimers</h2>
      <p className={para}>
        The Service is provided &ldquo;as is&rdquo; and &ldquo;as
        available,&rdquo; without warranties of any kind to the maximum extent
        permitted by law. We do not warrant that the Service will be
        uninterrupted, error-free, or secure.
      </p>

      <h2 className={heading}>7. Limitation of liability</h2>
      <p className={para}>
        To the maximum extent permitted by law, {entity} will not be liable for
        any indirect, incidental, special, consequential, or punitive damages,
        or for any loss of data, profits, or revenue, arising from your use of
        the Service. Nothing in these Terms excludes liability that cannot be
        excluded under applicable law.
      </p>

      <h2 className={heading}>8. Termination</h2>
      <p className={para}>
        You may stop using the Service at any time. We may suspend or terminate
        access if you breach these Terms or to comply with law. Upon termination,
        the rights granted to you here end; provisions that by their nature
        should survive will survive.
      </p>

      <h2 className={heading}>9. Governing law</h2>
      <p className={para}>
        These Terms are governed by {config.governingLaw}, without regard to
        conflict-of-laws rules, except where mandatory consumer-protection law in
        your place of residence applies.
      </p>

      <h2 className={heading}>10. Changes</h2>
      <p className={para}>
        We may update these Terms from time to time. If we make material changes,
        we will take reasonable steps to notify you. Your continued use of the
        Service after changes take effect constitutes acceptance of the revised
        Terms.
      </p>

      <h2 className={heading}>11. Contact</h2>
      <p className={para}>
        Questions about these Terms? Contact us at{" "}
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
