/**
 * @repo/legal — configuration model for the legal content.
 *
 * The policy/terms components are parameterised entirely by this config so the
 * same jurisdiction-agnostic templates serve any app: you change the data, not
 * the prose. Nothing here is country-specific — the wording is written to be
 * GDPR / CCPA / PIPA-aware in general terms (see the components), and the owner
 * fills in their own entity, contact, and the real list of sub-processors.
 *
 * IMPORTANT: this is a STARTER TEMPLATE, not legal advice. The owner must review
 * and adapt it with a qualified professional for their jurisdiction(s) and data
 * flows before relying on it. See {@link LEGAL_DISCLAIMER}.
 */

/**
 * A third party that processes personal data on the app's behalf. Listing these
 * (name, country, purpose) is a core GDPR Art. 28 / CCPA service-provider
 * transparency obligation.
 */
export type SubProcessor = {
  /** Vendor / service name (e.g. "Turso"). */
  readonly name: string;
  /** Primary country/region of processing (e.g. "United States"). */
  readonly country: string;
  /** What it is used for (e.g. "Managed database hosting"). */
  readonly purpose: string;
  /** Optional link to the vendor's own privacy policy / DPA. */
  readonly url?: string;
};

/** The configuration the legal content renders against. */
export type LegalConfig = {
  /** Product / application name shown throughout the documents. */
  readonly appName: string;
  /**
   * Legal entity that operates the app (company or individual). Defaults to
   * `appName` when omitted.
   */
  readonly entityName?: string;
  /** Contact email for privacy / data-subject requests. */
  readonly contactEmail: string;
  /** Canonical site URL (e.g. `https://example.com`). */
  readonly websiteUrl: string;
  /** Governing-law jurisdiction phrase for the terms (kept generic). */
  readonly governingLaw?: string;
  /**
   * Sub-processors with access to personal data. Seed with the stack's real
   * processors; add to it as integrations (analytics, email, payments) are
   * wired in. See {@link defaultSubProcessors}.
   */
  readonly subProcessors: readonly SubProcessor[];
  /** ISO date (YYYY-MM-DD) the documents were last updated. */
  readonly lastUpdated: string;
};

/**
 * The processors this starter actually ships with today.
 *
 * The reference app stores all personal data (accounts, sessions, user content)
 * in libSQL — locally as a file, in production on **Turso** (US-hosted managed
 * libSQL). That is the one real sub-processor out of the box; analytics, email,
 * and payment providers are added to this list as they are integrated.
 */
export const defaultSubProcessors: readonly SubProcessor[] = [
  {
    name: "Turso",
    country: "United States",
    purpose:
      "Managed database hosting (libSQL) for account, session, and user content data.",
    url: "https://turso.tech/privacy-policy",
  },
];

/**
 * Sensible defaults so a consumer can render valid pages immediately and then
 * override only what differs. The placeholder values clearly need replacing.
 */
export const defaultLegalConfig: LegalConfig = {
  appName: "Shipwright",
  contactEmail: "privacy@example.com",
  websiteUrl: "https://example.com",
  governingLaw: "the laws applicable at the operator's principal place of business",
  subProcessors: defaultSubProcessors,
  lastUpdated: "2026-01-01",
};

/**
 * Standard "not legal advice" disclaimer, surfaced on both rendered documents.
 * Keep this visible — it is the line between a helpful template and a liability.
 */
export const LEGAL_DISCLAIMER =
  "This document is a template provided with the Shipwright starter and is NOT legal advice. " +
  "You are responsible for reviewing and adapting it with a qualified legal professional for " +
  "your jurisdiction(s) and actual data practices before publishing or relying on it.";

/** Merge a partial override onto the defaults, concatenating sub-processors is left to the caller. */
export function resolveLegalConfig(
  overrides: Partial<LegalConfig> = {},
): LegalConfig {
  return { ...defaultLegalConfig, ...overrides };
}
