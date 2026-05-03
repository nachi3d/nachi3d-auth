import { NextRequest, NextResponse } from "next/server";
import {
  AdminGuardError,
  adminGuardStatus,
  requireAdmin,
} from "@/lib/auth/admin-guard";
import {
  deletePhoto,
  PieceServerError,
  uploadPhoto,
} from "@/lib/server/pieces";

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

  const formData = await req.formData();
  const pieceId = formData.get("piece_id");
  const file = formData.get("file");

  if (typeof pieceId !== "string" || !pieceId) {
    return NextResponse.json(
      { error: "validation_error", message: "piece_id is required" },
      { status: 400 },
    );
  }
  if (!(file instanceof File)) {
    return NextResponse.json(
      { error: "validation_error", message: "file is required" },
      { status: 400 },
    );
  }

  try {
    const result = await uploadPhoto(pieceId, file);
    return NextResponse.json(result, { status: 201 });
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

export async function DELETE(req: NextRequest) {
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

  let body: { piece_id?: string; url?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  if (!body.piece_id || !body.url) {
    return NextResponse.json(
      { error: "validation_error", message: "piece_id and url are required" },
      { status: 400 },
    );
  }

  try {
    await deletePhoto(body.piece_id, body.url);
    return NextResponse.json({ ok: true });
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
