import type { Metadata } from "next";
import { connection } from "next/server";
import "./globals.css";

export const metadata: Metadata = {
  title: "Admin",
  description: "Shipwright admin.",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Opt into dynamic rendering so the per-request CSP nonce minted in `proxy.ts`
  // is injected into Next's scripts (otherwise a statically prerendered page —
  // e.g. /sign-in — carries no nonce and the strict nonce CSP blocks all its
  // scripts, leaving the page unhydrated). Nonce CSP requires dynamic rendering.
  // See https://nextjs.org/docs/app/guides/content-security-policy.
  await connection();

  return (
    <html lang="en" suppressHydrationWarning>
      <body className="font-sans antialiased">{children}</body>
    </html>
  );
}
