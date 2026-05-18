import createMiddleware from "next-intl/middleware";
import { routing } from "./i18n/routing";

export default createMiddleware(routing);

export const config = {
  matcher: [
    // `auth` is excluded so the Supabase magic-link callback at
    // /auth/callback bypasses locale enforcement. Without it,
    // localePrefix:'always' redirects /auth/callback → /<locale>/auth/callback,
    // which has no matching route file and 404s.
    "/((?!api|_next|_vercel|auth|.*\\..*).*)",
  ],
};
