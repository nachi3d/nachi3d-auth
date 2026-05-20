import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { routing } from "@/i18n/routing";

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
 *
 * Login-magic-link path: when `next` is exactly `/<locale>/me`, the
 * collector default for the /login magic-link flow, we look up
 * profiles.is_admin and reroute admins to `/<locale>/admin`. Claim and
 * transfer handler URLs are honored as-is because those surfaces have
 * their own access checks the user must hit.
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

  const destination = await resolveDestination(supabase, next);
  return NextResponse.redirect(new URL(destination, url.origin));
}

async function resolveDestination(
  supabase: Awaited<ReturnType<typeof createClient>>,
  next: string,
): Promise<string> {
  const meMatch = matchMePath(next);
  if (!meMatch) return next;

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return next;

  const { data: profile } = await supabase
    .from("profiles")
    .select("is_admin")
    .eq("id", user.id)
    .maybeSingle();

  return profile?.is_admin ? `/${meMatch}/admin` : next;
}

function matchMePath(path: string): string | null {
  for (const locale of routing.locales) {
    if (path === `/${locale}/me`) return locale;
  }
  return null;
}
