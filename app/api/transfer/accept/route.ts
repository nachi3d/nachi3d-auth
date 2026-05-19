import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { acceptTransfer } from "@/lib/server/transfers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/transfer/accept { token }
 *
 * Authenticated recipient confirms acceptance of a pending transfer.
 * Delegates to the atomic accept_transfer(...) RPC which re-locks the
 * piece + transfer rows and verifies the email match server-side.
 */
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  let body: { token?: string };
  try {
    body = (await req.json()) as { token?: string };
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  if (!body.token || typeof body.token !== "string") {
    return NextResponse.json(
      { error: "validation_error" },
      { status: 400 },
    );
  }

  const result = await acceptTransfer({
    token: body.token,
    user_id: user.id,
  });
  if (!result.ok) {
    return NextResponse.json(
      { error: result.error },
      { status: result.error === "invalid_token" ? 404 : 409 },
    );
  }
  return NextResponse.json({ ok: true, piece_id: result.piece_id });
}
