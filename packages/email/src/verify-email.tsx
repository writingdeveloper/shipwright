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
 * @repo/email — the transactional "verify email" message.
 *
 * Presentation-only (pure) like {@link WelcomeEmail}; `./send` owns the send +
 * graceful no-op. Better Auth supplies the tokenised `url`.
 */
export type VerifyEmailProps = {
  /** Absolute verification URL (Better Auth supplies it with the token). */
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

export function VerifyEmail({ url, appName = "our app" }: VerifyEmailProps) {
  return (
    <Html>
      <Head />
      <Preview>Verify your {appName} email</Preview>
      <Body style={main}>
        <Container style={container}>
          <Heading style={heading}>Verify your email</Heading>
          <Text style={paragraph}>
            Confirm this address to finish setting up your {appName} account.
          </Text>
          <Section style={{ textAlign: "center", margin: "24px 0" }}>
            <Button style={button} href={url}>
              Verify email
            </Button>
          </Section>
          <Text style={paragraph}>
            If you did not create this account, you can ignore this email.
          </Text>
          <Hr style={hr} />
          <Text style={footer}>
            This link was sent to confirm your address on {appName}.
          </Text>
        </Container>
      </Body>
    </Html>
  );
}

export default VerifyEmail;
