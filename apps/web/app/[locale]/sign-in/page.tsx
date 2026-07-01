import { headers } from "next/headers";
import { getLocale } from "next-intl/server";
import { auth } from "@repo/auth/server";

import { redirect } from "../../../i18n/navigation";
import { SignInForm } from "./sign-in-form";

/**
 * Server gate for the sign-in page: a user who is ALREADY signed in has
 * nothing to do here, so bounce them straight to the dashboard instead of
 * showing a confusing second sign-in form. The form itself is the client
 * component next door.
 */
export default async function SignInPage() {
  const [session, locale] = await Promise.all([
    auth.api.getSession({ headers: await headers() }),
    getLocale(),
  ]);

  if (session) {
    redirect({ href: "/dashboard", locale });
  }

  return <SignInForm />;
}
