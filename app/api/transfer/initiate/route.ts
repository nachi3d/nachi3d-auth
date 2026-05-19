import { NextRequest, NextResponse } from "next/server";
import { createClient as createServerSbClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  createTransfer,
  getPieceOwnedBy,
} from "@/lib/server/transfers";
import { transferInitiateSchema } from "@/lib/validation/transfer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/transfer/initiate { piece_id, to_email, note?, locale }
 *
 * Authenticated owners only. Creates a transfers row (status='pending',
 * 7-day expiry) and asks Supabase Auth to email the recipient a magic
 * link that redirects to `/auth/callback?next=/[locale]/transfer/<token>`.
 *
 * Like /api/claim/initiate, the signInWithOtp call is suppressed in
 * test mode (E2E_TEST_LOGIN_ENABLED=1) and the token + next URL are
 * returned in the JSON response so the spec can drive the accept
 * handler directly.
 */
export async function POST(req: NextRequest) {
  const supabase = await createServerSbClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const parsed = transferInitiateSchema.safeParse(body);
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

  // Guard against transferring to your own email (would be a no-op).
  if (user.email && user.email.toLowerCase() === input.to_email) {
    return NextResponse.json({ error: "self_transfer" }, { status: 400 });
  }

  const piece = await getPieceOwnedBy(input.piece_id, user.id);
  if (!piece) {
    return NextResponse.json({ error: "not_owner" }, { status: 403 });
  }

  // Block double-pending: if there's already a pending transfer for
  // this piece, the owner must revoke it before issuing another.
  const sb = createAdminClient();
  const { data: existing } = await sb
    .from("transfers")
    .select("id")
    .eq("piece_id", input.piece_id)
    .eq("status", "pending")
    .maybeSingle();
  if (existing) {
    return NextResponse.json(
      { error: "pending_transfer_exists" },
      { status: 409 },
    );
  }

  const transfer = await createTransfer({
    piece_id: input.piece_id,
    from_owner_id: user.id,
    to_email: input.to_email,
    note: input.note,
  });

  // Derive the redirect base from the inbound request so a magic link
  // dispatched from a Vercel preview deploy lands back on that same
  // preview. Falling back to NEXT_PUBLIC_SITE_URL would pin every link
  // to https://verify.nachi3dlabs.com and 404 on preview-only routes.
  const origin = new URL(req.url).origin;
  const next = `/${input.locale}/transfer/${transfer.token}`;
  const emailRedirectTo = `${origin}/auth/callback?next=${encodeURIComponent(next)}`;

  const sendMagicLink = process.env.E2E_TEST_LOGIN_ENABLED !== "1";

  if (sendMagicLink) {
    const { error } = await supabase.auth.signInWithOtp({
      email: input.to_email,
      options: {
        emailRedirectTo,
        shouldCreateUser: true,
      },
    });
    if (error) {
      console.error(
        "transfer/initiate: signInWithOtp failed:",
        error.message,
      );
      return NextResponse.json(
        { error: "email_failed", message: error.message },
        { status: 502 },
      );
    }
  }

  return NextResponse.json({
    ok: true,
    transfer_id: transfer.id,
    expires_in_days: 7,
    ...(sendMagicLink
      ? {}
      : { token: transfer.token, next, email_redirect_to: emailRedirectTo }),
  });
}
