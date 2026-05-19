import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /auth/callback?code=...&next=/[locale]/claim/<token>
 *
 * Supabase Auth magic-link redirect target. We exchange the ?code= query
 * param for a cookie session via @supabase/ssr, then forward to ?next.
 *
 * `next` is sanitized to start with a single slash so it can't redirect
 * off-site (open-redirect guard). On exchange failure we send the user
 * to /[locale]/login with an error code so the magic-link UX never
 * stalls on a blank page.
 */
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const rawNext = url.searchParams.get("next") ?? "/";
  const next = rawNext.startsWith("/") && !rawNext.startsWith("//")
    ? rawNext
    : "/";

  if (!code) {
    return NextResponse.redirect(new URL(next, url.origin));
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    const fallback = new URL("/en/login", url.origin);
    fallback.searchParams.set("error", "magic_link_failed");
    return NextResponse.redirect(fallback);
  }

  return NextResponse.redirect(new URL(next, url.origin));
}
