import { NextRequest, NextResponse } from "next/server";
import { createClient as createServerSbClient } from "@/lib/supabase/server";
import {
  createClaim,
  findUnclaimedPublishedPiece,
} from "@/lib/server/claims";
import { claimInitiateSchema } from "@/lib/validation/claim";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/claim/initiate { piece_id, email, display_name, country, locale }
 *
 * Creates a claims row (with a one-time token + 1h expiry) and asks
 * Supabase Auth to email the requester a magic link that redirects to
 * `/auth/callback?next=/[locale]/claim/<token>`. After the user
 * clicks, the callback exchanges the OTP for a cookie session and
 * lands them on the claim handler page, which calls the atomic
 * `claim_piece(...)` RPC.
 *
 * No auth required — the verification URL is the only thing protecting
 * this surface. The piece must be in status='published' and
 * current_owner_id is null; both are enforced server-side here AND
 * inside `claim_piece(...)` for race safety.
 *
 * Test mode: when E2E_TEST_LOGIN_ENABLED=1, we still create the claim
 * row but skip the signInWithOtp call so Playwright doesn't burn
 * real email sends. The test runner posts directly to /api/claim/finalize
 * with the token.
 */
export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const parsed = claimInitiateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "validation_error",
        fields: parsed.error.flatten().fieldErrors,
      },
      { status: 400 },
    );
  }
  const input = parsed.data;

  const piece = await findUnclaimedPublishedPiece(input.piece_id);
  if (!piece) {
    return NextResponse.json({ error: "piece_not_found" }, { status: 404 });
  }
  if (piece.current_owner_id !== null) {
    return NextResponse.json({ error: "already_claimed" }, { status: 409 });
  }

  const claim = await createClaim({
    piece_id: input.piece_id,
    email: input.email,
    display_name: input.display_name,
    country: input.country,
  });

  // Derive the redirect base from the inbound request so a magic link
  // dispatched from a Vercel preview deploy lands back on that same
  // preview. Falling back to NEXT_PUBLIC_SITE_URL would pin every link
  // to https://verify.nachi3dlabs.com and 404 on preview-only routes.
  const origin = new URL(req.url).origin;
  const next = `/${input.locale}/claim/${claim.token}`;
  const emailRedirectTo = `${origin}/auth/callback?next=${encodeURIComponent(next)}`;

  // In e2e mode we never send a real email. The Playwright spec
  // already has a session cookie for the collector fixture and posts
  // directly to /api/claim/finalize with the returned token.
  const sendMagicLink = process.env.E2E_TEST_LOGIN_ENABLED !== "1";

  if (sendMagicLink) {
    const supabase = await createServerSbClient();
    const { error } = await supabase.auth.signInWithOtp({
      email: input.email,
      options: {
        emailRedirectTo,
        shouldCreateUser: true,
      },
    });
    if (error) {
      console.error("claim/initiate: signInWithOtp failed:", error.message);
      return NextResponse.json(
        { error: "email_failed", message: error.message },
        { status: 502 },
      );
    }
  }

  return NextResponse.json({
    ok: true,
    expires_in_minutes: 60,
    // The token is returned ONLY in test mode so the spec can drive
    // the finalize endpoint without going through email. In prod the
    // token is only ever delivered via the magic-link redirect.
    // email_redirect_to is surfaced alongside it so the spec can
    // assert the redirect host tracks the request, not NEXT_PUBLIC_SITE_URL.
    ...(sendMagicLink
      ? {}
      : { token: claim.token, next, email_redirect_to: emailRedirectTo }),
  });
}
