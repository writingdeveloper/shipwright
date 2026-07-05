import type { Metadata } from "next";
import { connection } from "next/server";
import "./globals.css";

// Read the public app name directly rather than importing the composed `env`:
// admin has no local .env, so pulling in @repo/env's SERVER-var validation here
// could throw at runtime. NOTE: admin sees this var only from ITS OWN build
// environment (shell/CI or an apps/admin/.env) — apps/web/.env does not reach
// this app; `pnpm rename` covers admin statically instead (docs/RENAMING.md).
// `?.trim() ||` mirrors @repo/env's emptyStringAsUndefined, so a set-but-empty
// var still falls back instead of rendering a blank name.
const appName = process.env.NEXT_PUBLIC_APP_NAME?.trim() || "Shipwright";

export const metadata: Metadata = {
  title: `${appName} Admin`,
  description: `${appName} admin.`,
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
