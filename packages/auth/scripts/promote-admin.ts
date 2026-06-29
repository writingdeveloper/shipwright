import { db, eq, schema } from "@repo/db";

/**
 * Idempotently set role "admin" for an existing user, by email. The documented
 * way to mint the very first admin on a DB that already has the user (the
 * ADMIN_EMAILS create-hook only promotes NEW sign-ups).
 *
 *   pnpm --filter @repo/auth promote-admin you@example.com
 *
 * Run it with the same DATABASE_URL the app uses. Exits non-zero with a clear
 * message on bad usage or when no user has that email.
 */
async function main(): Promise<void> {
  const email = process.argv[2]?.trim().toLowerCase();
  if (!email) {
    console.error("Usage: promote-admin <email>");
    process.exit(1);
  }

  const rows = await db
    .update(schema.user)
    .set({ role: "admin" })
    .where(eq(schema.user.email, email))
    .returning({ id: schema.user.id });

  if (rows.length === 0) {
    console.error(`No user with email ${email}. Sign up first, then re-run.`);
    process.exit(1);
  }

  console.log(`Promoted ${email} to role "admin".`);
  process.exit(0);
}

void main();
