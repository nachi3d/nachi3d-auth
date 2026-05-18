import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { revokeTransfer } from "@/lib/server/transfers";
import { transferRevokeSchema } from "@/lib/validation/transfer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/transfer/revoke { transfer_id }
 *
 * Authenticated owner-initiated revoke of a pending transfer. The
 * revokeTransfer helper double-checks status='pending' under the
 * update so a race against an accept can't flip an already-accepted
 * row back to revoked.
 */
export async function POST(req: NextRequest) {
  const supabase = await createClient();
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

  const parsed = transferRevokeSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "validation_error" },
      { status: 400 },
    );
  }

  const ok = await revokeTransfer({
    transfer_id: parsed.data.transfer_id,
    requester_id: user.id,
  });
  if (!ok) {
    return NextResponse.json(
      { error: "not_revocable" },
      { status: 409 },
    );
  }
  return NextResponse.json({ ok: true });
}
