import { createElement, type ReactElement } from "react";
import { render } from "@react-email/components";
import { Resend } from "resend";
import { env } from "@repo/env";

import { WelcomeEmail } from "./welcome-email";

/**
 * @repo/email — the server-side send helpers.
 *
 * This module is server-only by contract (it reads the secret `RESEND_API_KEY`
 * from `@repo/env`, whose server vars are typed server-only). Do NOT import it
 * into a client component; call it from a Server Action, a Route Handler, or —
 * as wired here — a Better Auth `databaseHooks` callback.
 *
 * GRACEFUL DEGRADATION (the core requirement): the app, its tests, and CI must
 * run with NO email account. So if `RESEND_API_KEY` or `EMAIL_FROM` is absent,
 * every send becomes a no-op that LOGS A SINGLE WARNING and returns a
 * `{ skipped: true }` result WITHOUT throwing — it never blocks the request
 * (e.g. a sign-up) it was called from. A real failure from Resend WHEN
 * configured is caught and returned too, so a transient email outage can never
 * turn a successful sign-up into a 500.
 */

/** Result of a send attempt. Discriminated on `skipped` so callers can branch. */
export type SendResult =
  | { readonly skipped: true; readonly reason: string }
  | { readonly skipped: false; readonly id: string | null }
  | { readonly skipped: false; readonly error: string };

/** Arguments for the low-level {@link sendEmail}. */
export type SendEmailArgs = {
  /** Recipient address(es). */
  readonly to: string | string[];
  /** Subject line. */
  readonly subject: string;
  /** A React Email element to render to HTML for the body. */
  readonly react: ReactElement;
  /**
   * Optional override of the `From` address. Defaults to `EMAIL_FROM` from
   * `@repo/env`; required (here or there) for an actual send.
   */
  readonly from?: string;
  /** Optional `Reply-To` address for the message. */
  readonly replyTo?: string;
};

// Lazily-constructed singleton so we build the Resend client at most once, and
// only when a key actually exists. Module-level (not per-call) to avoid leaking
// a new client on every email.
let resendClient: Resend | undefined;

function getResend(apiKey: string): Resend {
  if (!resendClient) {
    resendClient = new Resend(apiKey);
  }
  return resendClient;
}

// One-time warning latch: when email is unconfigured we warn ONCE per process,
// not on every sign-up, so the logs stay clean in tests/CI/local dev.
let warnedMissingConfig = false;

function warnOnce(message: string): void {
  if (!warnedMissingConfig) {
    warnedMissingConfig = true;
    console.warn(`[@repo/email] ${message}`);
  }
}

/**
 * Render a React Email element and send it via Resend.
 *
 * No-ops (returns `{ skipped: true }`) when `RESEND_API_KEY`/`EMAIL_FROM` are
 * not configured. Never throws: a Resend error is caught and returned as
 * `{ skipped: false, error }`.
 */
export async function sendEmail(args: SendEmailArgs): Promise<SendResult> {
  const apiKey = env.RESEND_API_KEY;
  const from = args.from ?? env.EMAIL_FROM;

  // Graceful degrade: missing key and/or From ⇒ skip, warn once, do not throw.
  if (!apiKey || !from) {
    const reason = !apiKey
      ? "RESEND_API_KEY is not set"
      : "EMAIL_FROM is not set";
    warnOnce(
      `${reason}; skipping email send. Set RESEND_API_KEY and EMAIL_FROM to enable transactional email.`,
    );
    return { skipped: true, reason };
  }

  try {
    const html = await render(args.react);
    const text = await render(args.react, { plainText: true });

    const { data, error } = await getResend(apiKey).emails.send({
      from,
      to: args.to,
      subject: args.subject,
      html,
      text,
      ...(args.replyTo ? { replyTo: args.replyTo } : {}),
    });

    if (error) {
      // Resend returned an API error: surface it WITHOUT throwing so the caller
      // (e.g. the sign-up flow) is never broken by an email failure.
      console.error(`[@repo/email] Resend error: ${error.message}`);
      return { skipped: false, error: error.message };
    }

    return { skipped: false, id: data?.id ?? null };
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : String(cause);
    console.error(`[@repo/email] Failed to send email: ${message}`);
    return { skipped: false, error: message };
  }
}

/** Arguments for {@link sendWelcomeEmail}. */
export type SendWelcomeEmailArgs = {
  /** Recipient address. */
  readonly to: string;
  /** The new user's name, for the greeting. */
  readonly name?: string;
  /** Product name shown in the email. Defaults to "Shipwright". */
  readonly appName?: string;
  /** Optional CTA URL (e.g. the app's sign-in/dashboard URL). */
  readonly actionUrl?: string;
};

/**
 * Send the {@link WelcomeEmail} to a freshly-registered user.
 *
 * Same graceful-degradation contract as {@link sendEmail}: with no Resend
 * config it no-ops and returns `{ skipped: true }`, so it is safe to call
 * (and `await`/fire-and-forget) directly from the sign-up path or a Better Auth
 * `user.create.after` hook without any try/catch at the call site.
 */
export function sendWelcomeEmail(
  args: SendWelcomeEmailArgs,
): Promise<SendResult> {
  const { to, name, appName = "Shipwright", actionUrl } = args;
  return sendEmail({
    to,
    subject: `Welcome to ${appName}`,
    react: createElement(WelcomeEmail, { name, appName, actionUrl }),
  });
}
