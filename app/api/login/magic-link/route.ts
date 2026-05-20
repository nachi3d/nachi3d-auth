import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { magicLinkInitiateSchema } from "@/lib/validation/magic-link";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/login/magic-link { email, locale }
 *
 * Send a passwordless sign-in link to the supplied email. Anyone can hit
 * this — Supabase Auth handles unknown emails the same way as known ones
 * (no enumeration leak). On success the user receives an email whose
 * link points at `/auth/callback?next=/[locale]/me`; the callback flips
 * admins to `/[locale]/admin` after exchanging the code.
 *
 * Test mode: when E2E_TEST_LOGIN_ENABLED=1 we skip the signInWithOtp
 * call so Playwright doesn't burn real email sends, and we return
 * `next` + `email_redirect_to` in the response so the spec can drive
 * the callback directly with a synthesized session.
 */
export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const parsed = magicLinkInitiateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "validation_error",
        fields: parsed.error.flatten().fieldErrors,
      },
      { status: 400 },
    );
  }
  const { email, locale } = parsed.data;

  const origin = new URL(req.url).origin;
  const next = `/${locale}/me`;
  const emailRedirectTo = `${origin}/auth/callback?next=${encodeURIComponent(next)}`;

  const sendMagicLink = process.env.E2E_TEST_LOGIN_ENABLED !== "1";

  if (sendMagicLink) {
    const supabase = await createClient();
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo,
        shouldCreateUser: true,
      },
    });
    if (error) {
      if (error.status === 429) {
        return NextResponse.json({ error: "rate_limit" }, { status: 429 });
      }
      console.error("login/magic-link: signInWithOtp failed:", error.message);
      return NextResponse.json(
        { error: "email_failed", message: error.message },
        { status: 502 },
      );
    }
  }

  return NextResponse.json({
    ok: true,
    ...(sendMagicLink ? {} : { next, email_redirect_to: emailRedirectTo }),
  });
}
