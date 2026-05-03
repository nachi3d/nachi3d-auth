import { NextRequest, NextResponse } from "next/server";
import {
  AdminGuardError,
  adminGuardStatus,
  requireAdmin,
} from "@/lib/auth/admin-guard";
import { createPiece, PieceServerError } from "@/lib/server/pieces";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    await requireAdmin();
  } catch (e) {
    if (e instanceof AdminGuardError) {
      return NextResponse.json(
        { error: e.reason },
        { status: adminGuardStatus(e.reason) },
      );
    }
    throw e;
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  try {
    const piece = await createPiece(body);
    return NextResponse.json({ piece }, { status: 201 });
  } catch (e) {
    if (e instanceof PieceServerError) {
      return NextResponse.json(
        { error: e.code, message: e.message, fields: e.fields ?? null },
        { status: e.status },
      );
    }
    throw e;
  }
}
