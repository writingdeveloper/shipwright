import { headers } from "next/headers";
import { getLocale } from "next-intl/server";
import { auth } from "@repo/auth/server";

import { redirect } from "../../../i18n/navigation";
import { SignUpForm } from "./sign-up-form";

/**
 * Server gate for the sign-up page: an authenticated user visiting /sign-up
 * is bounced to the dashboard (mirrors /sign-in). The form itself is the
 * client component next door.
 */
export default async function SignUpPage() {
  const [session, locale] = await Promise.all([
    auth.api.getSession({ headers: await headers() }),
    getLocale(),
  ]);

  if (session) {
    redirect({ href: "/dashboard", locale });
  }

  return <SignUpForm />;
}
