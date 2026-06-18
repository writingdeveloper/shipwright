import type { Metadata } from "next";
import { connection } from "next/server";
import localFont from "next/font/local";
import "./globals.css";

const geistSans = localFont({
  src: "./fonts/GeistVF.woff",
  variable: "--font-geist-sans",
});
const geistMono = localFont({
  src: "./fonts/GeistMonoVF.woff",
  variable: "--font-geist-mono",
});

export const metadata: Metadata = {
  title: "Shipwright",
  description: "AI-native Next.js + Turborepo starter for shipping MVPs fast.",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Opt into dynamic rendering so the per-request CSP nonce minted in `proxy.ts`
  // is injected into Next's scripts/styles. Nonce-based CSP requires dynamic
  // rendering — a statically prerendered page is built before any request exists,
  // so it cannot carry that request's nonce, and `'strict-dynamic'` would then
  // block Next's own (un-nonced) bootstrap scripts. See
  // https://nextjs.org/docs/app/guides/content-security-policy.
  await connection();

  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable}`}
      suppressHydrationWarning
    >
      <body className="antialiased">{children}</body>
    </html>
  );
}
