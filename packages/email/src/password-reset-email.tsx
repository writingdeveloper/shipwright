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
 * @repo/email — the transactional "password reset" email.
 *
 * Presentation-only (pure, no env/network) like {@link WelcomeEmail}; the decision
 * to send + the graceful no-op live in `./send`. Better Auth supplies the tokenised
 * `url`.
 */
export type PasswordResetEmailProps = {
  /** Absolute reset URL (Better Auth supplies it with the token). */
  readonly url: string;
  /** Product name. Defaults to "our app". */
  readonly appName?: string;
};

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
const heading = { fontSize: "22px", fontWeight: 600 as const, color: "#111827" };
const paragraph = { fontSize: "15px", lineHeight: "24px", color: "#374151" };
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
const hr = { borderColor: "#e5e7eb", margin: "20px 0" };
const footer = { fontSize: "12px", lineHeight: "18px", color: "#9ca3af" };

export function PasswordResetEmail({
  url,
  appName = "our app",
}: PasswordResetEmailProps) {
  return (
    <Html>
      <Head />
      <Preview>Reset your {appName} password</Preview>
      <Body style={main}>
        <Container style={container}>
          <Heading style={heading}>Reset your password</Heading>
          <Text style={paragraph}>
            We received a request to reset your {appName} password. Click below to
            choose a new one. This link expires in 1 hour.
          </Text>
          <Section style={{ textAlign: "center", margin: "24px 0" }}>
            <Button style={button} href={url}>
              Reset password
            </Button>
          </Section>
          <Text style={paragraph}>
            If you did not request this, you can safely ignore this email — your
            password will not change.
          </Text>
          <Hr style={hr} />
          <Text style={footer}>
            This link was requested for your account on {appName}.
          </Text>
        </Container>
      </Body>
    </Html>
  );
}

export default PasswordResetEmail;
