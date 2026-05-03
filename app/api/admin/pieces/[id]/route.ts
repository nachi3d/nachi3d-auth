import { NextRequest, NextResponse } from "next/server";
import {
  AdminGuardError,
  adminGuardStatus,
  requireAdmin,
} from "@/lib/auth/admin-guard";
import {
  getPieceById,
  PieceServerError,
  updatePiece,
} from "@/lib/server/pieces";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Ctx {
  params: Promise<{ id: string }>;
}

export async function GET(_req: NextRequest, ctx: Ctx) {
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

  const { id } = await ctx.params;
  try {
    const piece = await getPieceById(id);
    if (!piece) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    return NextResponse.json({ piece });
  } catch (e) {
    if (e instanceof PieceServerError) {
      return NextResponse.json(
        { error: e.code, message: e.message },
        { status: e.status },
      );
    }
    throw e;
  }
}

export async function PATCH(req: NextRequest, ctx: Ctx) {
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

  const { id } = await ctx.params;
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  try {
    const piece = await updatePiece(id, body);
    return NextResponse.json({ piece });
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
