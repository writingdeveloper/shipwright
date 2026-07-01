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
 * @repo/email — the transactional "payment failed" (dunning) email.
 *
 * Sent from the Stripe `invoice.payment_failed` webhook so a customer whose
 * renewal charge bounced can fix their payment method BEFORE the subscription
 * lapses. Presentation-only (pure, no env/network) like the other templates;
 * the decision to send + the graceful no-op live in `./send`.
 */
export type PaymentFailedEmailProps = {
  /** Absolute URL of the page where the user can manage billing. */
  readonly billingUrl: string;
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

export function PaymentFailedEmail({
  billingUrl,
  appName = "our app",
}: PaymentFailedEmailProps) {
  return (
    <Html>
      <Head />
      <Preview>Your {appName} payment failed — please update your card</Preview>
      <Body style={main}>
        <Container style={container}>
          <Heading style={heading}>Your payment failed</Heading>
          <Text style={paragraph}>
            We could not charge your card for your {appName} subscription. We
            will retry automatically over the next few days, but to keep your
            access uninterrupted, please update your payment method now.
          </Text>
          <Section style={{ textAlign: "center", margin: "24px 0" }}>
            <Button style={button} href={billingUrl}>
              Update payment method
            </Button>
          </Section>
          <Text style={paragraph}>
            If you have already updated your card, you can ignore this email —
            the next retry will pick it up.
          </Text>
          <Hr style={hr} />
          <Text style={footer}>
            You are receiving this because your {appName} subscription renewal
            could not be charged.
          </Text>
        </Container>
      </Body>
    </Html>
  );
}

export default PaymentFailedEmail;
