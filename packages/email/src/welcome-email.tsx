import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Preview,
  Section,
  Text,
} from "@react-email/components";

/**
 * @repo/email — the transactional "welcome" email template.
 *
 * A React Email component, so the same JSX renders to the HTML Resend sends AND
 * is previewable/testable in isolation (it is pure — no env, no network — so a
 * unit test can render it to a string). Parameterised by recipient `name` and
 * `appName` so it is reusable across the apps this starter spins up; nothing
 * here is hardcoded to one product.
 *
 * Keep this presentation-only: the decision to send (and the graceful no-op when
 * Resend is not configured) lives in `./send`, not in the template.
 */

/** Props for {@link WelcomeEmail}. */
export type WelcomeEmailProps = {
  /** The new user's name, shown in the greeting. Falls back to "there". */
  readonly name?: string;
  /** The product name shown in the copy. Defaults to "our app". */
  readonly appName?: string;
  /** Optional absolute URL for the primary call-to-action button. */
  readonly actionUrl?: string;
};

// Inline styles: email clients have famously poor and inconsistent support for
// <style>/external CSS, so React Email's convention is inline style objects.
const main = {
  backgroundColor: "#f6f9fc",
  fontFamily:
    '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
};

const container = {
  backgroundColor: "#ffffff",
  margin: "0 auto",
  padding: "24px",
  maxWidth: "560px",
  borderRadius: "8px",
};

const heading = {
  fontSize: "22px",
  fontWeight: 600 as const,
  color: "#111827",
};

const paragraph = {
  fontSize: "15px",
  lineHeight: "24px",
  color: "#374151",
};

const button = {
  backgroundColor: "#111827",
  borderRadius: "6px",
  color: "#ffffff",
  fontSize: "15px",
  fontWeight: 600 as const,
  textDecoration: "none",
  textAlign: "center" as const,
  display: "inline-block",
  padding: "12px 20px",
};

const hr = {
  borderColor: "#e5e7eb",
  margin: "20px 0",
};

const footer = {
  fontSize: "12px",
  lineHeight: "18px",
  color: "#9ca3af",
};

/**
 * The welcome email body. Rendered to HTML by `./send` (via
 * `@react-email/render`) for delivery, and directly in tests for snapshotting.
 */
export function WelcomeEmail({
  name = "there",
  appName = "our app",
  actionUrl,
}: WelcomeEmailProps) {
  const previewText = `Welcome to ${appName}`;

  return (
    <Html>
      <Head />
      <Preview>{previewText}</Preview>
      <Body style={main}>
        <Container style={container}>
          <Heading style={heading}>Welcome to {appName}, {name}!</Heading>
          <Text style={paragraph}>
            Thanks for signing up. Your account is ready — you can sign in any
            time and start where you left off.
          </Text>
          {actionUrl ? (
            <Section style={{ textAlign: "center", margin: "24px 0" }}>
              <Button style={button} href={actionUrl}>
                Open {appName}
              </Button>
            </Section>
          ) : null}
          <Text style={paragraph}>
            If you did not create this account, you can safely ignore this
            email.
          </Text>
          <Hr style={hr} />
          <Text style={footer}>
            You are receiving this email because an account was created with this
            address on {appName}.
          </Text>
        </Container>
      </Body>
    </Html>
  );
}

export default WelcomeEmail;
